import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { imports, mappings } from "@/db/schema";
import { authError, requireUser } from "@/lib/auth";
import { deleteObject, userFileKey, userMarketKey } from "@/lib/storage";

export async function DELETE(request: Request) {
  try {
    const user = await requireUser(request);
    await Promise.all([
      deleteObject(userFileKey(user.id, "portfolio")),
      deleteObject(userFileKey(user.id, "account")),
      deleteObject(userFileKey(user.id, "transactions")),
      deleteObject(userMarketKey(user.id)),
    ]);
    const db = getDb();
    await db.batch([
      db.delete(imports).where(eq(imports.userId, user.id)),
      db.delete(mappings).where(eq(mappings.userId, user.id)),
    ]);
    return Response.json({ deleted: true });
  } catch (error) {
    return authError(error);
  }
}
