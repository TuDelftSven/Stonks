import type { InstrumentMapping, MarketCache } from "@/lib/portfolio";

type Listing = {
  isin: string;
  currency: string;
  exchange: string;
  product: string;
};

type YahooSearchQuote = {
  symbol?: string;
  currency?: string;
  shortname?: string;
  longname?: string;
  exchange?: string;
  quoteType?: string;
};

function dateFromUnix(value: number) {
  return new Date(value * 1000).toISOString().slice(0, 10);
}

export async function discoverMapping(listing: Listing): Promise<InstrumentMapping | null> {
  const url = new URL("https://query2.finance.yahoo.com/v1/finance/search");
  url.searchParams.set("q", listing.isin);
  url.searchParams.set("quotesCount", "10");
  url.searchParams.set("newsCount", "0");
  const response = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 StonksPortfolio/2.0" },
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { quotes?: YahooSearchQuote[] };
  const quotes = (payload.quotes ?? []).filter(
    (quote) => quote.symbol && quote.quoteType !== "OPTION"
  );
  const selected =
    quotes.find((quote) => quote.currency?.toUpperCase() === listing.currency) ?? quotes[0];
  if (!selected?.symbol) return null;
  return {
    isin: listing.isin,
    exchange: listing.exchange,
    currency: listing.currency,
    symbol: selected.symbol,
    name: selected.longname || selected.shortname || listing.product,
    active: true,
  };
}

export async function fetchYahooSymbol(symbol: string) {
  const period1 = Math.floor(Date.UTC(2000, 0, 1) / 1000);
  const period2 = Math.floor(Date.now() / 1000) + 86_400;
  const url = new URL(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`
  );
  url.searchParams.set("period1", String(period1));
  url.searchParams.set("period2", String(period2));
  url.searchParams.set("interval", "1d");
  url.searchParams.set("events", "div,splits");
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "Mozilla/5.0 StonksPortfolio/2.0",
    },
  });
  if (!response.ok) throw new Error(`Yahoo Finance returned ${response.status}`);
  const payload = (await response.json()) as {
    chart?: {
      error?: { description?: string } | null;
      result?: Array<{
        meta?: {
          regularMarketPrice?: number;
          chartPreviousClose?: number;
          previousClose?: number;
          currency?: string;
        };
        timestamp?: number[];
        indicators?: { quote?: Array<{ close?: Array<number | null> }> };
      }>;
    };
  };
  if (payload.chart?.error) throw new Error(payload.chart.error.description || "Yahoo Finance error");
  const result = payload.chart?.result?.[0];
  if (!result) throw new Error("No market data returned");
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const timestamps = result.timestamp ?? [];
  const history: Record<string, number> = {};
  timestamps.forEach((timestamp, index) => {
    const close = closes[index];
    if (close != null && Number.isFinite(close)) history[dateFromUnix(timestamp)] = close;
  });
  const latestHistory = Object.values(history).at(-1);
  return {
    quote: {
      price: result.meta?.regularMarketPrice ?? latestHistory ?? 0,
      previous_close: result.meta?.chartPreviousClose ?? result.meta?.previousClose,
      currency: result.meta?.currency,
    },
    history,
  };
}

export async function refreshMarketCache(symbols: string[], previous: MarketCache) {
  const cache: MarketCache = {
    updated_at: new Date().toISOString(),
    quotes: { ...previous.quotes },
    history: { ...previous.history },
    errors: {},
  };
  const queue = [...new Set([...symbols, "EURUSD=X"])];
  const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length) {
      const symbol = queue.shift();
      if (!symbol) break;
      try {
        const result = await fetchYahooSymbol(symbol);
        cache.quotes[symbol] = result.quote;
        cache.history[symbol] = result.history;
      } catch (error) {
        cache.errors[symbol] = error instanceof Error ? error.message : "Market refresh failed";
      }
    }
  });
  await Promise.all(workers);
  return cache;
}
