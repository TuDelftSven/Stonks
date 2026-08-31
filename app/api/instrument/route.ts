import { authError, requireUser } from "@/lib/auth";
import { loadBundle, loadMappings, loadMarketCache } from "@/lib/data";
import { buildInstrumentDetail } from "@/lib/portfolio";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const url = new URL(request.url);
    const isin = (url.searchParams.get("isin") ?? "").trim().toUpperCase();
    const currency = (url.searchParams.get("currency") ?? "").trim().toUpperCase();
    const exchange = (url.searchParams.get("exchange") ?? "").trim().toUpperCase();
    if (!isin || !currency) return Response.json({ error: "ISIN and currency are required" }, { status: 400 });
    const [bundle, mappings, cache] = await Promise.all([
      loadBundle(user.id),
      loadMappings(user.id),
      loadMarketCache(user.id),
    ]);
    return Response.json(buildInstrumentDetail(bundle, mappings, cache, isin, currency, exchange));
  } catch (error) {
    return authError(error);
  }
}
