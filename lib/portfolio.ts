export type FileType = "portfolio" | "account" | "transactions";

export type InstrumentMapping = {
  isin: string;
  exchange: string;
  currency: string;
  symbol: string;
  name: string;
  active: boolean;
};

export type MarketCache = {
  updated_at?: string;
  quotes: Record<string, { price: number; previous_close?: number; currency?: string }>;
  history: Record<string, Record<string, number>>;
  errors: Record<string, string>;
};

type PortfolioRow = {
  product: string;
  isin: string;
  quantity: number;
  closePrice: number;
  currency: string;
  localValue: number;
  valueEur: number;
  isCash: boolean;
};

type AccountRow = {
  date: string;
  time: string;
  product: string;
  isin: string;
  description: string;
  fx: number;
  mutationCurrency: string;
  mutation: number;
  balanceCurrency: string;
  balance: number;
  orderId: string;
  category: string;
};

type TransactionRow = {
  date: string;
  time: string;
  product: string;
  isin: string;
  exchange: string;
  executionVenue: string;
  quantity: number;
  price: number;
  priceCurrency: string;
  localValue: number;
  valueEur: number;
  exchangeRate: number;
  autoFxCost: number;
  feesEur: number;
  totalEur: number;
  orderId: string;
  corporateAction: boolean;
};

export type CsvBundle = Partial<Record<FileType, string>>;

export const emptyMarketCache = (): MarketCache => ({
  quotes: {},
  history: {},
  errors: {},
});

export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  const semicolonCount = (firstLine.match(/;/g) ?? []).length;
  const delimiter = semicolonCount > commaCount ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < clean.length; index += 1) {
    const character = clean[index];
    if (character === '"') {
      if (quoted && clean[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && clean[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function normaliseHeader(value: string) {
  return value
    .toLocaleLowerCase("en")
    .normalize("NFKD")
    .replace(/[^a-z0-9]/g, "");
}

export function detectFileType(text: string): FileType {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error("The CSV file is empty");
  const names = new Set(rows[0].filter(Boolean).map(normaliseHeader));
  const has = (...values: string[]) => values.every((value) => names.has(normaliseHeader(value)));
  if (has("Omschrijving", "Mutatie", "Saldo") || has("Description", "Change", "Balance")) {
    return "account";
  }
  if (
    has("Beurs", "Aantal", "Totaal EUR") ||
    has("Venue", "Quantity", "Total EUR") ||
    has("Exchange", "Quantity", "Total EUR")
  ) {
    return "transactions";
  }
  if (has("Product", "Aantal", "Slotkoers") || has("Product", "Number", "Closing price")) {
    return "portfolio";
  }
  throw new Error("This is not recognised as a DEGIRO Portfolio, Account, or Transactions export");
}

function column(header: string[], ...aliases: string[]) {
  const normalised = header.map(normaliseHeader);
  for (const alias of aliases) {
    const index = normalised.indexOf(normaliseHeader(alias));
    if (index >= 0) return index;
  }
  return -1;
}

function value(row: string[], index: number) {
  return index >= 0 && index < row.length ? row[index].trim() : "";
}

export function parseNumber(input: string | null | undefined) {
  let cleaned = String(input ?? "")
    .trim()
    .replace(/\u00a0|\s/g, "");
  if (!cleaned) return 0;
  const negative = cleaned.startsWith("(") && cleaned.endsWith(")");
  cleaned = cleaned.replace(/[()]/g, "");
  if (cleaned.includes(",")) cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  const result = Number(cleaned);
  if (!Number.isFinite(result)) throw new Error(`Cannot parse number: ${input}`);
  return negative ? -result : result;
}

export function parseDate(input: string) {
  const cleaned = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;
  const match = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(cleaned);
  if (!match) throw new Error(`Cannot parse date: ${input}`);
  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function classifyAccount(description: string, mutation: number) {
  const label = description.toLocaleLowerCase("en").trim();
  if (label === "ideal deposit" || label === "ideal storting") return "deposit";
  if (label.includes("terugstorting") && !label.includes("geweigerd") && mutation < 0) return "withdrawal";
  if (label === "dividend") return "dividend";
  if (label.includes("dividendbelasting") || label.includes("dividend tax")) return "dividend_tax";
  if (label.includes("transactiekosten") || label.includes("transaction fee")) return "transaction_fee";
  if (label.includes("aansluitingskosten") || label.includes("connectivity fee")) return "connectivity_fee";
  if (label.includes("autofx")) return "fx_fee";
  if (["flatex interest income", "rente", "interest"].includes(label) && mutation >= 0) return "interest_income";
  if (label.includes("interest") && mutation < 0) return "interest_cost";
  if (label.startsWith("koop ") || label.startsWith("buy ")) return "buy";
  if (label.startsWith("verkoop ") || label.startsWith("sell ")) return "sell";
  if (label.includes("split aanpassing") || label.includes("split adjustment")) return "corporate_action";
  if (label.includes("valuta ") || label.includes("currency ")) return "currency_conversion";
  if (label.includes("cash sweep") || label.startsWith("overboeking naar uw geldrekening") || label.startsWith("overboeking van uw geldrekening")) return "internal_transfer";
  if (label.includes("reservation ideal")) return "deposit_reservation";
  if (label.includes("terugstorting geweigerd")) return "rejected_transfer";
  return "other";
}

function readRows(text: string) {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error("The CSV file is empty");
  return { header: rows[0], rows: rows.slice(1) };
}

function readPortfolio(text: string): { rows: PortfolioRow[]; warnings: string[] } {
  const source = readRows(text);
  const product = column(source.header, "Product");
  const isin = column(source.header, "Symbool/ISIN", "Symbol/ISIN");
  const quantity = column(source.header, "Aantal", "Number", "Quantity");
  const close = column(source.header, "Slotkoers", "Closing price");
  const eur = column(source.header, "Waarde in EUR", "Value in EUR");
  const local = column(source.header, "Lokale waarde", "Local value");
  const warnings: string[] = [];
  const rows: PortfolioRow[] = [];
  source.rows.forEach((item, offset) => {
    try {
      const name = value(item, product);
      rows.push({
        product: name,
        isin: value(item, isin),
        quantity: parseNumber(value(item, quantity)),
        closePrice: parseNumber(value(item, close)),
        currency: (value(item, local) || "EUR").toUpperCase(),
        localValue: local >= 0 ? parseNumber(value(item, local + 1)) : parseNumber(value(item, eur)),
        valueEur: parseNumber(value(item, eur)),
        isCash: !value(item, isin) && name.toLocaleLowerCase("en").includes("cash"),
      });
    } catch (error) {
      warnings.push(`Portfolio row ${offset + 2}: ${error instanceof Error ? error.message : error}`);
    }
  });
  return { rows, warnings };
}

function readAccount(text: string): { rows: AccountRow[]; warnings: string[] } {
  const source = readRows(text);
  const date = column(source.header, "Datum", "Date");
  const time = column(source.header, "Tijd", "Time");
  const product = column(source.header, "Product");
  const isin = column(source.header, "ISIN");
  const description = column(source.header, "Omschrijving", "Description");
  const fx = column(source.header, "FX");
  const mutation = column(source.header, "Mutatie", "Change");
  const balance = column(source.header, "Saldo", "Balance");
  const order = column(source.header, "Order Id", "Order ID");
  const warnings: string[] = [];
  const rows: AccountRow[] = [];
  source.rows.forEach((item, offset) => {
    const rawDate = value(item, date);
    if (!rawDate) {
      warnings.push(`Account row ${offset + 2} has no date and was ignored`);
      return;
    }
    try {
      const mutationValue = mutation >= 0 ? parseNumber(value(item, mutation + 1)) : 0;
      const descriptionValue = value(item, description);
      rows.push({
        date: parseDate(rawDate),
        time: value(item, time),
        product: value(item, product),
        isin: value(item, isin),
        description: descriptionValue,
        fx: parseNumber(value(item, fx)),
        mutationCurrency: value(item, mutation).toUpperCase(),
        mutation: mutationValue,
        balanceCurrency: value(item, balance).toUpperCase(),
        balance: balance >= 0 ? parseNumber(value(item, balance + 1)) : 0,
        orderId: value(item, order),
        category: classifyAccount(descriptionValue, mutationValue),
      });
    } catch (error) {
      warnings.push(`Account row ${offset + 2}: ${error instanceof Error ? error.message : error}`);
    }
  });
  rows.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  return { rows, warnings };
}

function readTransactions(text: string): { rows: TransactionRow[]; warnings: string[] } {
  const source = readRows(text);
  const index = {
    date: column(source.header, "Datum", "Date"),
    time: column(source.header, "Tijd", "Time"),
    product: column(source.header, "Product"),
    isin: column(source.header, "ISIN"),
    exchange: column(source.header, "Beurs", "Venue", "Exchange"),
    execution: column(source.header, "Uitvoeringsplaats", "Execution venue"),
    quantity: column(source.header, "Aantal", "Quantity", "Number"),
    price: column(source.header, "Koers", "Price"),
    local: column(source.header, "Lokale waarde", "Local value"),
    eur: column(source.header, "Waarde EUR", "Value EUR"),
    exchangeRate: column(source.header, "Wisselkoers", "Exchange rate"),
    autoFx: column(source.header, "AutoFX Kosten", "AutoFX fee"),
    fees: column(source.header, "Transactiekosten en/of kosten van derden EUR", "Transaction and/or third-party fees EUR"),
    total: column(source.header, "Totaal EUR", "Total EUR"),
    order: column(source.header, "Order ID", "Order Id"),
  };
  const warnings: string[] = [];
  const rows: TransactionRow[] = [];
  source.rows.forEach((item, offset) => {
    const rawDate = value(item, index.date);
    const isinValue = value(item, index.isin);
    if (!rawDate || !isinValue) {
      if (value(item, index.product)) warnings.push(`Incomplete transaction row ${offset + 2} was ignored`);
      return;
    }
    try {
      rows.push({
        date: parseDate(rawDate),
        time: value(item, index.time),
        product: value(item, index.product),
        isin: isinValue,
        exchange: value(item, index.exchange).toUpperCase(),
        executionVenue: value(item, index.execution),
        quantity: parseNumber(value(item, index.quantity)),
        price: parseNumber(value(item, index.price)),
        priceCurrency: index.local >= 0 ? value(item, index.local - 1).toUpperCase() : "EUR",
        localValue: parseNumber(value(item, index.local)),
        valueEur: parseNumber(value(item, index.eur)),
        exchangeRate: parseNumber(value(item, index.exchangeRate)),
        autoFxCost: parseNumber(value(item, index.autoFx)),
        feesEur: parseNumber(value(item, index.fees)),
        totalEur: parseNumber(value(item, index.total)),
        orderId: value(item, index.order) || item.slice(16).find((entry) => entry.trim())?.trim() || "",
        corporateAction: false,
      });
    } catch (error) {
      warnings.push(`Transaction row ${offset + 2}: ${error instanceof Error ? error.message : error}`);
    }
  });
  const groups = new Map<string, TransactionRow[]>();
  rows.forEach((item) => {
    const key = `${item.date}|${item.time}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  });
  groups.forEach((group) => {
    const action =
      group.length >= 2 &&
      group.every((item) => !item.orderId && item.feesEur === 0) &&
      group.some((item) => item.quantity > 0) &&
      group.some((item) => item.quantity < 0);
    if (action) group.forEach((item) => (item.corporateAction = true));
  });
  rows.sort((a, b) => `${a.date} ${a.time} ${a.product}`.localeCompare(`${b.date} ${b.time} ${b.product}`));
  return { rows, warnings };
}

function accountAmountEur(item: AccountRow) {
  if (item.mutationCurrency === "USD" && item.fx > 0) return item.mutation / item.fx;
  if (["", "EUR", "USD"].includes(item.mutationCurrency)) return item.mutation;
  return null;
}

function investorCashFlow(item: AccountRow) {
  const amount = accountAmountEur(item);
  if (amount === null) return null;
  if (item.category === "deposit") return -Math.max(amount, 0);
  if (item.category === "withdrawal") return Math.max(-amount, 0);
  return null;
}

export function calculateMoneyWeightedReturn(cashFlows: Array<[string, number]>) {
  const totals = new Map<string, number>();
  cashFlows.forEach(([date, amount]) => totals.set(date, (totals.get(date) ?? 0) + amount));
  const ordered = [...totals.entries()].filter(([, amount]) => amount).sort((a, b) => a[0].localeCompare(b[0]));
  if (ordered.length < 2 || !ordered.some(([, amount]) => amount < 0) || !ordered.some(([, amount]) => amount > 0)) return null;
  const origin = Date.parse(`${ordered[0][0]}T00:00:00Z`);
  const fractions = ordered.map(([date]) => (Date.parse(`${date}T00:00:00Z`) - origin) / 86_400_000 / 365);
  const amounts = ordered.map(([, amount]) => amount);
  const scale = Math.max(amounts.reduce((sum, amount) => sum + Math.abs(amount), 0), 1);
  const tolerance = scale * 1e-12;
  const npv = (logRate: number) => amounts.reduce((sum, amount, index) => sum + amount * Math.exp(-logRate * fractions[index]), 0);
  const grid = Array.from({ length: 129 }, (_, index) => -16 + index * 0.25);
  const roots: number[] = [];
  const brackets: Array<[number, number, number]> = [];
  let previousPoint = grid[0];
  let previousValue = npv(previousPoint);
  if (Math.abs(previousValue) <= tolerance) roots.push(previousPoint);
  for (const point of grid.slice(1)) {
    const current = npv(point);
    if (Math.abs(current) <= tolerance) roots.push(point);
    else if ((previousValue > 0) !== (current > 0)) brackets.push([previousPoint, point, previousValue]);
    previousPoint = point;
    previousValue = current;
  }
  const guess = Math.log1p(0.1);
  let root: number;
  if (roots.length) root = roots.sort((a, b) => Math.abs(a - guess) - Math.abs(b - guess))[0];
  else if (brackets.length) {
    let [lower, upper, lowerValue] = brackets.sort((a, b) => Math.abs((a[0] + a[1]) / 2 - guess) - Math.abs((b[0] + b[1]) / 2 - guess))[0];
    root = (lower + upper) / 2;
    for (let index = 0; index < 100; index += 1) {
      root = (lower + upper) / 2;
      const current = npv(root);
      if (Math.abs(current) <= tolerance) break;
      if ((lowerValue > 0) === (current > 0)) {
        lower = root;
        lowerValue = current;
      } else upper = root;
    }
  } else return null;
  const result = Math.expm1(root);
  return Number.isFinite(result) && result > -1 ? result : null;
}

export function calculateCagr(startValue: number, endValue: number, startDate: string, endDate: string) {
  const elapsedDays = (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000;
  if (startValue <= 0 || endValue <= 0 || elapsedDays <= 0) return null;
  const result = Math.pow(endValue / startValue, 365 / elapsedDays) - 1;
  return Number.isFinite(result) && result > -1 ? result : null;
}

function mappingFor(mappings: InstrumentMapping[], isin: string, currency: string, exchange = "") {
  return (
    mappings.find((item) => item.isin === isin && item.currency === currency && exchange && item.exchange === exchange) ??
    mappings.find((item) => item.isin === isin && item.currency === currency && !item.exchange) ??
    mappings.find((item) => item.isin === isin && item.currency === currency)
  );
}

function historicalClose(cache: MarketCache, symbol: string, date: string) {
  const series = cache.history[symbol] ?? {};
  const eligible = Object.entries(series).filter(([day, price]) => day <= date && price != null);
  eligible.sort((a, b) => b[0].localeCompare(a[0]));
  return eligible[0]?.[1] ?? 0;
}

function fallbackPrice(transactions: TransactionRow[], isin: string, currency: string, exchange: string, date: string) {
  return [...transactions]
    .reverse()
    .find((item) => item.isin === isin && item.priceCurrency === currency && item.date <= date && (!exchange || item.exchange === exchange) && item.price > 0)?.price ?? 0;
}

function positionsAt(transactions: TransactionRow[], date: string) {
  const quantities = new Map<string, { isin: string; currency: string; exchange: string; quantity: number }>();
  transactions.filter((item) => item.date <= date).forEach((item) => {
    const key = `${item.isin}|${item.priceCurrency}|${item.exchange}`;
    const current = quantities.get(key) ?? { isin: item.isin, currency: item.priceCurrency, exchange: item.exchange, quantity: 0 };
    current.quantity += item.quantity;
    quantities.set(key, current);
  });
  return [...quantities.values()].filter((item) => Math.abs(item.quantity) > 0.000001);
}

function cashAt(account: AccountRow[], date: string, cache: MarketCache) {
  const balances = new Map<string, number>();
  account.filter((item) => item.date <= date).forEach((item) => {
    if (item.balanceCurrency) balances.set(item.balanceCurrency, item.balance);
  });
  const usd = balances.get("USD") ?? 0;
  return (balances.get("EUR") ?? 0) + usd / (historicalClose(cache, "EURUSD=X", date) || 1.1);
}

function historicalValue(account: AccountRow[], transactions: TransactionRow[], date: string, cache: MarketCache, mappings: InstrumentMapping[]) {
  let estimated = false;
  let amount = cashAt(account, date, cache);
  positionsAt(transactions, date).forEach((position) => {
    const mapping = mappingFor(mappings, position.isin, position.currency, position.exchange);
    let price = mapping ? historicalClose(cache, mapping.symbol, date) : 0;
    if (price <= 0) {
      price = fallbackPrice(transactions, position.isin, position.currency, position.exchange, date);
      estimated = true;
    }
    let local = position.quantity * price;
    if (position.currency === "USD") {
      const fx = historicalClose(cache, "EURUSD=X", date) ||
        [...transactions].reverse().find((item) => item.date <= date && item.priceCurrency === "USD" && item.exchangeRate > 0)?.exchangeRate || 1.1;
      local /= fx;
      if (!historicalClose(cache, "EURUSD=X", date)) estimated = true;
    }
    amount += local;
  });
  return { value: amount, estimated };
}

function costBasis(transactions: TransactionRow[]) {
  const state = new Map<string, { quantity: number; cost: number }>();
  const realisedByIsin = new Map<string, number>();
  const actionGroups = new Map<string, TransactionRow[]>();
  const timeline: Array<{ key: string; type: "normal" | "action"; rows: TransactionRow[] }> = [];
  transactions.forEach((item) => {
    if (item.corporateAction) {
      const key = `${item.date}|${item.time}`;
      actionGroups.set(key, [...(actionGroups.get(key) ?? []), item]);
    } else timeline.push({ key: `${item.date}|${item.time}`, type: "normal", rows: [item] });
  });
  actionGroups.forEach((rows, key) => timeline.push({ key, type: "action", rows }));
  timeline.sort((a, b) => a.key.localeCompare(b.key));
  timeline.forEach((event) => {
    if (event.type === "normal") {
      const item = event.rows[0];
      const key = `${item.isin}|${item.priceCurrency}`;
      const bucket = state.get(key) ?? { quantity: 0, cost: 0 };
      if (item.quantity > 0) {
        bucket.quantity += item.quantity;
        bucket.cost += Math.max(-item.totalEur, 0);
      } else if (item.quantity < 0 && bucket.quantity > 0) {
        const sold = Math.min(-item.quantity, bucket.quantity);
        const allocated = (bucket.cost / bucket.quantity) * sold;
        let proceeds = Math.max(item.totalEur, 0);
        if (sold < -item.quantity) proceeds *= sold / -item.quantity;
        realisedByIsin.set(item.isin, (realisedByIsin.get(item.isin) ?? 0) + proceeds - allocated);
        bucket.quantity -= sold;
        bucket.cost -= allocated;
      }
      state.set(key, bucket);
    } else {
      let removedCost = 0;
      const incoming: TransactionRow[] = [];
      event.rows.forEach((item) => {
        const key = `${item.isin}|${item.priceCurrency}`;
        const bucket = state.get(key) ?? { quantity: 0, cost: 0 };
        if (item.quantity < 0 && bucket.quantity > 0) {
          const removed = Math.min(-item.quantity, bucket.quantity);
          const cost = (bucket.cost / bucket.quantity) * removed;
          bucket.quantity -= removed;
          bucket.cost -= cost;
          removedCost += cost;
        } else if (item.quantity > 0) incoming.push(item);
        state.set(key, bucket);
      });
      const weightTotal = incoming.reduce((sum, item) => sum + Math.abs(item.valueEur), 0);
      incoming.forEach((item) => {
        const key = `${item.isin}|${item.priceCurrency}`;
        const bucket = state.get(key) ?? { quantity: 0, cost: 0 };
        const weight = weightTotal ? Math.abs(item.valueEur) / weightTotal : 1 / incoming.length;
        bucket.quantity += item.quantity;
        bucket.cost += removedCost * weight;
        state.set(key, bucket);
      });
    }
  });
  return { state, realisedByIsin };
}

function accountSummaries(account: AccountRow[]) {
  const totals: Record<string, number> = {};
  const yearly: Record<string, Record<string, number>> = {};
  account.forEach((item) => {
    const amount = accountAmountEur(item);
    if (amount === null) return;
    let calculated: number | null = null;
    if (item.category === "deposit") calculated = Math.max(amount, 0);
    else if (item.category === "withdrawal") calculated = Math.max(-amount, 0);
    else if (["dividend_tax", "transaction_fee", "connectivity_fee", "fx_fee", "interest_cost"].includes(item.category)) calculated = Math.abs(amount);
    else if (["dividend", "interest_income"].includes(item.category)) calculated = Math.max(amount, 0);
    if (calculated === null) return;
    totals[item.category] = (totals[item.category] ?? 0) + calculated;
    const year = item.date.slice(0, 4);
    yearly[year] ??= {};
    yearly[year][item.category] = (yearly[year][item.category] ?? 0) + calculated;
  });
  totals.net_deposits = (totals.deposit ?? 0) - (totals.withdrawal ?? 0);
  totals.net_dividends = (totals.dividend ?? 0) - (totals.dividend_tax ?? 0);
  totals.total_costs = (totals.transaction_fee ?? 0) + (totals.connectivity_fee ?? 0) + (totals.fx_fee ?? 0) + (totals.interest_cost ?? 0);
  return { totals, yearly };
}

function endOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function monthlySeries(account: AccountRow[], transactions: TransactionRow[], currentValue: number, cache: MarketCache, mappings: InstrumentMapping[], today: string) {
  const dates = [...account.map((item) => item.date), ...transactions.map((item) => item.date)];
  if (!dates.length) return [];
  const first = dates.sort()[0];
  const [firstYear, firstMonth] = first.split("-").map(Number);
  const [todayYear, todayMonth] = today.split("-").map(Number);
  const points = [];
  for (let year = firstYear, month = firstMonth; year < todayYear || (year === todayYear && month <= todayMonth); ) {
    const monthEnd = endOfMonth(year, month);
    const date = monthEnd > today ? today : monthEnd;
    const historical = date === today ? { value: currentValue, estimated: false } : historicalValue(account, transactions, date, cache, mappings);
    const deposits = account.filter((item) => item.date <= date && item.category === "deposit").reduce((sum, item) => sum + item.mutation, 0);
    const withdrawals = account.filter((item) => item.date <= date && item.category === "withdrawal").reduce((sum, item) => sum - item.mutation, 0);
    points.push({ date, portfolio: historical.value, net_deposits: deposits - withdrawals, estimated: historical.estimated });
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }
  return points;
}

function annualPerformance(account: AccountRow[], transactions: TransactionRow[], currentValue: number, summaries: ReturnType<typeof accountSummaries>, cache: MarketCache, mappings: InstrumentMapping[], today: string) {
  const dates = [...account.map((item) => item.date), ...transactions.map((item) => item.date)].sort();
  if (!dates.length) return [];
  const firstYear = Number(dates[0].slice(0, 4));
  const currentYear = Number(today.slice(0, 4));
  let previousClose = 0;
  const annual = [];
  for (let year = firstYear; year <= currentYear; year += 1) {
    const start = `${year}-01-01`;
    const end = year === currentYear ? today : `${year}-12-31`;
    const close = year === currentYear ? { value: currentValue, estimated: false } : historicalValue(account, transactions, end, cache, mappings);
    const summary = summaries.yearly[String(year)] ?? {};
    const deposits = summary.deposit ?? 0;
    const withdrawals = summary.withdrawal ?? 0;
    const result = close.value - previousClose - deposits + withdrawals;
    let weightedFlows = 0;
    const mwrrFlows: Array<[string, number]> = previousClose ? [[start, -previousClose]] : [];
    const duration = Math.max((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000, 1);
    account.filter((item) => item.date >= start && item.date <= end).forEach((item) => {
      const investor = investorCashFlow(item);
      if (investor === null) return;
      mwrrFlows.push([item.date, investor]);
      const remaining = Math.max((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${item.date}T00:00:00Z`)) / 86_400_000, 0);
      weightedFlows += -investor * remaining / duration;
    });
    const denominator = previousClose + weightedFlows;
    mwrrFlows.push([end, close.value]);
    const mwrr = calculateMoneyWeightedReturn(mwrrFlows);
    const grossDividend = summary.dividend ?? 0;
    const dividendTax = summary.dividend_tax ?? 0;
    const fees = (summary.transaction_fee ?? 0) + (summary.connectivity_fee ?? 0) + (summary.fx_fee ?? 0) + (summary.interest_cost ?? 0);
    annual.push({
      year,
      label: year === currentYear ? `${year} YTD` : year === firstYear && dates[0] > start ? `${year} partial` : String(year),
      opening_value: previousClose,
      deposits,
      withdrawals,
      closing_value: close.value,
      investment_result: result,
      return_pct: Math.abs(denominator) > 0.01 ? result / denominator * 100 : null,
      money_weighted_return_pct: mwrr === null ? null : mwrr * 100,
      gross_dividends: grossDividend,
      dividend_tax: dividendTax,
      net_dividends: grossDividend - dividendTax,
      fees,
      estimated: close.estimated,
    });
    previousClose = close.value;
  }
  return annual;
}

function instrumentCatalog(transactions: TransactionRow[], cache: MarketCache, mappings: InstrumentMapping[]) {
  const grouped = new Map<string, TransactionRow[]>();
  transactions.forEach((item) => {
    const key = `${item.isin}|${item.priceCurrency}|${item.exchange}`;
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  });
  return [...grouped.values()].map((items) => {
    const first = items[0];
    const last = items[items.length - 1];
    const mapping = mappingFor(mappings, first.isin, first.priceCurrency, first.exchange);
    const history = Object.entries(cache.history[mapping?.symbol ?? ""] ?? {}).filter(([date]) => date >= first.date).sort((a, b) => a[0].localeCompare(b[0]));
    const start = history[0];
    const end = history[history.length - 1];
    const cagr = start && end ? calculateCagr(start[1], end[1], start[0], end[0]) : null;
    const quantity = items.reduce((sum, item) => sum + item.quantity, 0);
    return {
      isin: first.isin,
      currency: first.priceCurrency,
      exchange: first.exchange,
      symbol: mapping?.symbol ?? "",
      product: mapping?.name || last.product,
      first_trade: first.date,
      last_trade: last.date,
      current_quantity: quantity,
      status: Math.abs(quantity) > 0.000001 ? "Open" : "Closed",
      price_change_pct: start && end && start[1] ? (end[1] / start[1] - 1) * 100 : null,
      cagr_pct: cagr === null ? null : cagr * 100,
      history_points: history.length,
      market_status: history.length ? "Ready" : mapping ? "Refresh prices" : "Mapping needed",
    };
  }).sort((a, b) => Number(a.status !== "Open") - Number(b.status !== "Open") || a.product.localeCompare(b.product));
}

export function buildSnapshot(bundle: CsvBundle, mappings: InstrumentMapping[], cache: MarketCache = emptyMarketCache()) {
  if (!bundle.portfolio || !bundle.account || !bundle.transactions) {
    throw new Error("Upload Portfolio.csv, Account.csv, and Transactions.csv to calculate the dashboard");
  }
  const portfolio = readPortfolio(bundle.portfolio);
  const account = readAccount(bundle.account);
  const transactions = readTransactions(bundle.transactions);
  const summaries = accountSummaries(account.rows);
  const costs = costBasis(transactions.rows);
  const dividends = new Map<string, number>();
  account.rows.forEach((item) => {
    const amount = item.mutationCurrency === "USD" && item.fx > 0 ? item.mutation / item.fx : item.mutation;
    if (item.category === "dividend") dividends.set(item.isin, (dividends.get(item.isin) ?? 0) + Math.max(amount, 0));
    else if (item.category === "dividend_tax") dividends.set(item.isin, (dividends.get(item.isin) ?? 0) - Math.abs(amount));
  });

  let currentValue = 0;
  let dailyChange = 0;
  const holdings = portfolio.rows.map((position) => {
    const mapping = mappingFor(mappings, position.isin, position.currency);
    const quote = mapping ? cache.quotes[mapping.symbol] : undefined;
    const fx = cache.quotes["EURUSD=X"]?.price ?? 0;
    const price = quote?.price ?? position.closePrice;
    let valueEur = position.valueEur;
    let source = "DEGIRO snapshot";
    if (quote?.price) {
      const local = position.quantity * quote.price;
      if (position.currency === "EUR") {
        valueEur = local;
        source = "Market quote";
      } else if (position.currency === "USD" && fx > 0) {
        valueEur = local / fx;
        source = "Market quote";
      }
    }
    currentValue += valueEur;
    if (quote?.previous_close && position.quantity) {
      const change = position.quantity * (price - quote.previous_close) / (position.currency === "USD" && fx > 0 ? fx : 1);
      dailyChange += change;
    }
    const cost = costs.state.get(`${position.isin}|${position.currency}`)?.cost ?? (position.isCash ? position.valueEur : 0);
    const realised = costs.realisedByIsin.get(position.isin) ?? 0;
    const netDividends = dividends.get(position.isin) ?? 0;
    const unrealised = position.isCash ? 0 : valueEur - cost;
    const totalResult = realised + unrealised + netDividends;
    return {
      product: position.product,
      isin: position.isin,
      symbol: mapping?.symbol ?? "",
      exchange: mapping?.exchange ?? "",
      quantity: position.quantity,
      currency: position.currency,
      price,
      value_eur: valueEur,
      snapshot_value_eur: position.valueEur,
      open_cost_eur: cost,
      average_cost_eur: position.quantity ? cost / position.quantity : 0,
      realised_eur: realised,
      unrealised_eur: unrealised,
      net_dividends_eur: netDividends,
      total_result_eur: totalResult,
      total_return_pct: cost > 0 ? totalResult / cost * 100 : null,
      daily_change_eur: quote?.previous_close ? position.quantity * (price - quote.previous_close) : 0,
      source,
      is_cash: position.isCash,
      weight_pct: 0,
    };
  });
  holdings.forEach((item) => (item.weight_pct = currentValue ? item.value_eur / currentValue * 100 : 0));
  holdings.sort((a, b) => b.value_eur - a.value_eur);

  const today = new Date().toISOString().slice(0, 10);
  const netDeposits = summaries.totals.net_deposits ?? 0;
  const investmentResult = currentValue - netDeposits;
  const mwrrFlows = account.rows.map((item) => [item.date, investorCashFlow(item)] as [string, number | null]).filter((item): item is [string, number] => item[1] !== null);
  mwrrFlows.push([today, currentValue]);
  const mwrr = calculateMoneyWeightedReturn(mwrrFlows);
  const annual = annualPerformance(account.rows, transactions.rows, currentValue, summaries, cache, mappings, today);
  const ytd = annual[annual.length - 1] ?? {};
  const warnings = [...portfolio.warnings, ...account.warnings, ...transactions.warnings];
  const unmapped = [...new Set(portfolio.rows.filter((item) => item.isin && !mappingFor(mappings, item.isin, item.currency)).map((item) => `${item.isin} (${item.currency})`))].sort();
  if (unmapped.length) warnings.push(`No market symbol for: ${unmapped.join(", ")}`);
  const allDates = [...account.rows.map((item) => item.date), ...transactions.rows.map((item) => item.date)].sort();
  const transactionHistory: Record<string, unknown[]> = {};
  [...transactions.rows].reverse().forEach((item) => {
    transactionHistory[item.isin] ??= [];
    transactionHistory[item.isin].push({
      date: item.date,
      product: item.product,
      exchange: item.exchange,
      quantity: item.quantity,
      price: item.price,
      currency: item.priceCurrency,
      total_eur: item.totalEur,
      fees_eur: Math.abs(item.feesEur),
      corporate_action: item.corporateAction,
    });
  });
  return {
    generated_at: new Date().toISOString(),
    market_updated_at: cache.updated_at ?? null,
    market_errors: cache.errors,
    overview: {
      current_value: currentValue,
      snapshot_value: portfolio.rows.reduce((sum, item) => sum + item.valueEur, 0),
      total_deposits: summaries.totals.deposit ?? 0,
      withdrawals: summaries.totals.withdrawal ?? 0,
      net_deposits: netDeposits,
      investment_result: investmentResult,
      since_inception_pct: netDeposits ? investmentResult / netDeposits * 100 : null,
      money_weighted_return_pct: mwrr === null ? null : mwrr * 100,
      daily_change: dailyChange,
      daily_change_pct: currentValue !== dailyChange ? dailyChange / (currentValue - dailyChange) * 100 : null,
      ytd_result: "investment_result" in ytd ? ytd.investment_result : null,
      ytd_return_pct: "return_pct" in ytd ? ytd.return_pct : null,
      cash: portfolio.rows.filter((item) => item.isCash).reduce((sum, item) => sum + item.valueEur, 0),
    },
    holdings,
    historical_instruments: instrumentCatalog(transactions.rows, cache, mappings),
    annual_performance: annual,
    monthly_series: monthlySeries(account.rows, transactions.rows, currentValue, cache, mappings, today),
    income_costs: summaries.totals,
    activity: [...account.rows].reverse().map((item) => ({
      date: item.date,
      time: item.time,
      product: item.product,
      isin: item.isin,
      description: item.description,
      category: item.category,
      currency: item.mutationCurrency,
      amount: item.mutation,
      amount_eur: item.mutationCurrency === "USD" && item.fx > 0 ? item.mutation / item.fx : item.mutation,
    })),
    transaction_history: transactionHistory,
    mappings,
    quality: {
      warnings,
      unmapped,
      portfolio_rows: portfolio.rows.length,
      account_rows: account.rows.length,
      transaction_rows: transactions.rows.length,
      corporate_action_rows: transactions.rows.filter((item) => item.corporateAction).length,
      date_from: allDates[0] ?? null,
      date_to: allDates[allDates.length - 1] ?? null,
    },
  };
}

export function buildInstrumentDetail(bundle: CsvBundle, mappings: InstrumentMapping[], cache: MarketCache, isin: string, currency: string, exchange: string) {
  if (!bundle.account || !bundle.transactions) throw new Error("Account.csv and Transactions.csv are required");
  const account = readAccount(bundle.account).rows;
  const transactions = readTransactions(bundle.transactions).rows.filter((item) => item.isin === isin && item.priceCurrency === currency && item.exchange === exchange);
  if (!transactions.length) throw new Error("No transactions were found for this listing");
  const mapping = mappingFor(mappings, isin, currency, exchange);
  const history = Object.entries(cache.history[mapping?.symbol ?? ""] ?? {}).filter(([date]) => date >= transactions[0].date).sort((a, b) => a[0].localeCompare(b[0]));
  const firstPrice = history[0];
  const lastPrice = history[history.length - 1];
  const cagr = firstPrice && lastPrice ? calculateCagr(firstPrice[1], lastPrice[1], firstPrice[0], lastPrice[0]) : null;
  let quantity = 0;
  let openCost = 0;
  let realised = 0;
  const personalSeries: Array<Record<string, number | string>> = [];
  const eventDates = [...new Set([...history.map(([date]) => date), ...transactions.map((item) => item.date)])].sort();
  eventDates.forEach((date) => {
    const dayGroups = new Map<string, TransactionRow[]>();
    transactions.filter((item) => item.date === date).forEach((item) => {
      dayGroups.set(item.time, [...(dayGroups.get(item.time) ?? []), item]);
    });
    [...dayGroups.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([, rows]) => {
      if (rows.every((item) => item.corporateAction)) {
        const eventQuantity = rows.reduce((sum, item) => sum + item.quantity, 0);
        const hasIncoming = rows.some((item) => item.quantity > 0);
        const hasOutgoing = rows.some((item) => item.quantity < 0);
        if (hasIncoming && hasOutgoing) quantity += eventQuantity;
        else if (eventQuantity < 0 && quantity > 0) {
          const removed = Math.min(-eventQuantity, quantity);
          openCost -= openCost * removed / quantity;
          quantity -= removed;
        } else quantity += eventQuantity;
        return;
      }
      rows.forEach((item) => {
        if (item.quantity > 0) {
          quantity += item.quantity;
          openCost += Math.max(-item.totalEur, 0);
        } else if (item.quantity < 0 && quantity > 0) {
          const sold = Math.min(-item.quantity, quantity);
          const allocated = openCost / quantity * sold;
          let proceeds = Math.max(item.totalEur, 0);
          if (sold < -item.quantity) proceeds *= sold / -item.quantity;
          realised += proceeds - allocated;
          quantity -= sold;
          openCost -= allocated;
        }
      });
    });
    const price = historicalClose(cache, mapping?.symbol ?? "", date) || fallbackPrice(transactions, isin, currency, exchange, date);
    const fx = currency === "USD" ? historicalClose(cache, "EURUSD=X", date) || 1.1 : 1;
    const marketValue = quantity * price / fx;
    personalSeries.push({ date, quantity, market_value_eur: marketValue, open_cost_eur: openCost, realised_eur: realised, personal_result_eur: realised + marketValue - openCost });
  });
  const dividends = account.filter((item) => item.isin === isin && ["dividend", "dividend_tax"].includes(item.category)).reduce((sum, item) => {
    const amount = accountAmountEur(item) ?? 0;
    return sum + (item.category === "dividend" ? Math.max(amount, 0) : -Math.abs(amount));
  }, 0);
  const lastPersonal = personalSeries[personalSeries.length - 1];
  return {
    instrument: { isin, currency, exchange, symbol: mapping?.symbol ?? "", product: mapping?.name || transactions[transactions.length - 1].product },
    summary: {
      status: Math.abs(quantity) > 0.000001 ? "Open" : "Closed",
      current_quantity: quantity,
      price_change_pct: firstPrice && lastPrice ? (lastPrice[1] / firstPrice[1] - 1) * 100 : null,
      cagr_pct: cagr === null ? null : cagr * 100,
      personal_result_eur: Number(lastPersonal?.personal_result_eur ?? realised),
      realised_eur: realised,
      open_cost_eur: openCost,
      net_dividends_eur: dividends,
    },
    price_series: history.map(([date, price]) => ({ date, price, change_pct: firstPrice ? (price / firstPrice[1] - 1) * 100 : 0 })),
    personal_series: personalSeries,
    transactions: [...transactions].reverse().map((item) => ({ date: item.date, product: item.product, exchange: item.exchange, quantity: item.quantity, price: item.price, currency: item.priceCurrency, total_eur: item.totalEur, fees_eur: Math.abs(item.feesEur), corporate_action: item.corporateAction })),
  };
}

export function listingKeys(bundle: CsvBundle) {
  if (!bundle.transactions) return [];
  const transactions = readTransactions(bundle.transactions).rows;
  return [...new Map(transactions.map((item) => [`${item.isin}|${item.priceCurrency}|${item.exchange}`, { isin: item.isin, currency: item.priceCurrency, exchange: item.exchange, product: item.product }])).values()];
}
