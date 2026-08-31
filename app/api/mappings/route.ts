import { authError, requireUser } from "@/lib/auth";
import { loadMappings, replaceMappings } from "@/lib/data";
import type { InstrumentMapping } from "@/lib/portfolio";

function cleanMapping(value: Partial<InstrumentMapping>): InstrumentMapping {
  const mapping = {
    isin: String(value.isin ?? "").trim().toUpperCase(),
    exchange: String(value.exchange ?? "").trim().toUpperCase(),
    currency: String(value.currency ?? "").trim().toUpperCase(),
    symbol: String(value.symbol ?? "").trim(),
    name: String(value.name ?? "").trim(),
    active: value.active !== false,
  };
  if (!mapping.isin || !mapping.currency || !mapping.symbol) {
    throw new Error("Every mapping needs ISIN, currency, and Yahoo Finance symbol");
  }
  return mapping;
}

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return Response.json({ instruments: await loadMappings(user.id) });
  } catch (error) {
    return authError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireUser(request);
    const payload = (await request.json()) as { instruments?: Array<Partial<InstrumentMapping>> };
    const values = (payload.instruments ?? []).map(cleanMapping);
    await replaceMappings(user.id, values);
    return Response.json({ instruments: values });
  } catch (error) {
    return authError(error);
  }
}
