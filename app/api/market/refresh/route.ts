import { authError, requireUser } from "@/lib/auth";
import { loadBundle, loadMappings, loadMarketCache, upsertMapping } from "@/lib/data";
import { discoverMapping, refreshMarketCache } from "@/lib/market";
import { listingKeys } from "@/lib/portfolio";
import { putText, userMarketKey } from "@/lib/storage";

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const bundle = await loadBundle(user.id);
    const listings = listingKeys(bundle);
    let mappings = await loadMappings(user.id);
    const discovered = [];
    for (const listing of listings) {
      const exists = mappings.some((item) => item.isin === listing.isin && item.currency === listing.currency && (!item.exchange || item.exchange === listing.exchange));
      if (exists) continue;
      const mapping = await discoverMapping(listing);
      if (mapping) {
        await upsertMapping(user.id, mapping);
        mappings = [...mappings, mapping];
        discovered.push(mapping);
      }
    }
    const symbols = mappings.filter((item) => item.active).map((item) => item.symbol);
    const cache = await refreshMarketCache(symbols, await loadMarketCache(user.id));
    await putText(userMarketKey(user.id), JSON.stringify(cache), "application/json");
    return Response.json({ updated_at: cache.updated_at, symbols: symbols.length + 1, discovered, errors: cache.errors });
  } catch (error) {
    return authError(error);
  }
}
