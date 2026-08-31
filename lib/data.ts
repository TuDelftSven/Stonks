import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { imports, mappings } from "@/db/schema";
import type { CsvBundle, FileType, InstrumentMapping, MarketCache } from "@/lib/portfolio";
import { emptyMarketCache } from "@/lib/portfolio";
import { getText, userMarketKey } from "@/lib/storage";

export async function loadBundle(userId: string): Promise<CsvBundle> {
  const db = getDb();
  const records = await db
    .select({ fileType: imports.fileType, objectKey: imports.objectKey })
    .from(imports)
    .where(eq(imports.userId, userId));
  const bundle: CsvBundle = {};
  await Promise.all(
    records.map(async (record) => {
      const text = await getText(record.objectKey);
      if (text && ["portfolio", "account", "transactions"].includes(record.fileType)) {
        bundle[record.fileType as FileType] = text;
      }
    })
  );
  return bundle;
}

export async function loadMappings(userId: string): Promise<InstrumentMapping[]> {
  const db = getDb();
  const records = await db
    .select()
    .from(mappings)
    .where(eq(mappings.userId, userId));
  return records.map((record) => ({
    isin: record.isin,
    exchange: record.exchange,
    currency: record.currency,
    symbol: record.symbol,
    name: record.name,
    active: record.active,
  }));
}

export async function upsertMapping(userId: string, mapping: InstrumentMapping) {
  const db = getDb();
  const now = new Date();
  const existing = await db
    .select({ id: mappings.id })
    .from(mappings)
    .where(
      and(
        eq(mappings.userId, userId),
        eq(mappings.isin, mapping.isin),
        eq(mappings.exchange, mapping.exchange),
        eq(mappings.currency, mapping.currency)
      )
    )
    .limit(1);
  if (existing.length) {
    await db
      .update(mappings)
      .set({
        symbol: mapping.symbol,
        name: mapping.name,
        active: mapping.active,
        updatedAt: now,
      })
      .where(eq(mappings.id, existing[0].id));
  } else {
    await db.insert(mappings).values({
      userId,
      isin: mapping.isin,
      exchange: mapping.exchange,
      currency: mapping.currency,
      symbol: mapping.symbol,
      name: mapping.name,
      active: mapping.active,
      updatedAt: now,
    });
  }
}

export async function replaceMappings(userId: string, values: InstrumentMapping[]) {
  const db = getDb();
  await db.delete(mappings).where(eq(mappings.userId, userId));
  if (!values.length) return;
  const now = new Date();
  await db.insert(mappings).values(
    values.map((mapping) => ({
      userId,
      isin: mapping.isin,
      exchange: mapping.exchange,
      currency: mapping.currency,
      symbol: mapping.symbol,
      name: mapping.name,
      active: mapping.active,
      updatedAt: now,
    }))
  );
}

export async function loadMarketCache(userId: string): Promise<MarketCache> {
  const text = await getText(userMarketKey(userId));
  if (!text) return emptyMarketCache();
  try {
    const parsed = JSON.parse(text) as Partial<MarketCache>;
    return {
      updated_at: parsed.updated_at,
      quotes: parsed.quotes ?? {},
      history: parsed.history ?? {},
      errors: parsed.errors ?? {},
    };
  } catch {
    return emptyMarketCache();
  }
}
