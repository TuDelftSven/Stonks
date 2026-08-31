import { authError, requireUser } from "@/lib/auth";
import { loadBundle, loadMappings, loadMarketCache } from "@/lib/data";
import { buildSnapshot } from "@/lib/portfolio";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const [bundle, mappings, cache] = await Promise.all([
      loadBundle(user.id),
      loadMappings(user.id),
      loadMarketCache(user.id),
    ]);
    return Response.json(buildSnapshot(bundle, mappings, cache));
  } catch (error) {
    return authError(error);
  }
}
