export type Tab = "overview" | "performance" | "holdings" | "income" | "activity" | "data";

export type Mapping = {
  isin: string;
  exchange: string;
  currency: string;
  symbol: string;
  name: string;
  active: boolean;
};

export type Holding = {
  product: string;
  isin: string;
  symbol: string;
  exchange: string;
  quantity: number;
  currency: string;
  price: number;
  value_eur: number;
  open_cost_eur: number;
  total_result_eur: number;
  total_return_pct: number | null;
  daily_change_eur: number;
  weight_pct: number;
  is_cash: boolean;
};

export type HistoricalInstrument = {
  isin: string;
  currency: string;
  exchange: string;
  symbol: string;
  product: string;
  first_trade: string;
  last_trade: string;
  current_quantity: number;
  status: string;
  price_change_pct: number | null;
  cagr_pct: number | null;
  history_points: number;
  market_status: string;
};

export type Snapshot = {
  generated_at: string;
  market_updated_at: string | null;
  market_errors: Record<string, string>;
  overview: Record<string, number | null>;
  holdings: Holding[];
  historical_instruments: HistoricalInstrument[];
  annual_performance: Array<Record<string, number | string | boolean | null>>;
  monthly_series: Array<{ date: string; portfolio: number; net_deposits: number; estimated: boolean }>;
  income_costs: Record<string, number>;
  activity: Array<Record<string, string | number>>;
  mappings: Mapping[];
  quality: {
    warnings: string[];
    unmapped: string[];
    portfolio_rows: number;
    account_rows: number;
    transaction_rows: number;
    date_from: string | null;
    date_to: string | null;
  };
};

export type InstrumentDetail = {
  instrument: { product: string; symbol: string; isin: string; currency: string; exchange: string };
  summary: Record<string, number | string | null>;
  price_series: Array<{ date: string; price: number; change_pct: number }>;
  personal_series: Array<Record<string, number | string>>;
  transactions: Array<Record<string, number | string | boolean>>;
};

export type ImportRecord = {
  fileType: string;
  originalName: string;
  bytes: number;
  rowCount: number;
  updatedAt: string;
};

export const money = new Intl.NumberFormat("en-NL", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export const moneyPrecise = new Intl.NumberFormat("en-NL", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

export const number = new Intl.NumberFormat("en-NL", { maximumFractionDigits: 3 });

export function pct(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`
    : "–";
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}
