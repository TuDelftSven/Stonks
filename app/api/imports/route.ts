import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { imports } from "@/db/schema";
import { authError, requireUser } from "@/lib/auth";
import { detectFileType, parseCsv } from "@/lib/portfolio";
import { putText, userFileKey } from "@/lib/storage";

const MAX_FILE_BYTES = 8 * 1024 * 1024;

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const records = await getDb()
      .select({
        fileType: imports.fileType,
        originalName: imports.originalName,
        bytes: imports.bytes,
        rowCount: imports.rowCount,
        updatedAt: imports.updatedAt,
      })
      .from(imports)
      .where(eq(imports.userId, user.id));
    return Response.json({ imports: records });
  } catch (error) {
    return authError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const form = await request.formData();
    const files = form.getAll("files").filter((entry): entry is File => entry instanceof File);
    if (!files.length || files.length > 3) {
      return Response.json({ error: "Select one to three DEGIRO CSV files" }, { status: 400 });
    }
    const prepared = [];
    for (const file of files) {
      if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
        return Response.json({ error: `${file.name} must be smaller than 8 MB` }, { status: 400 });
      }
      const text = await file.text();
      const fileType = detectFileType(text);
      prepared.push({ file, text, fileType, rowCount: Math.max(parseCsv(text).length - 1, 0) });
    }
    if (new Set(prepared.map((item) => item.fileType)).size !== prepared.length) {
      return Response.json({ error: "Only one file of each DEGIRO export type can be uploaded" }, { status: 400 });
    }
    const db = getDb();
    const now = new Date();
    for (const item of prepared) {
      const objectKey = userFileKey(user.id, item.fileType);
      await putText(objectKey, item.text, "text/csv; charset=utf-8");
      const current = await db
        .select({ id: imports.id })
        .from(imports)
        .where(and(eq(imports.userId, user.id), eq(imports.fileType, item.fileType)))
        .limit(1);
      if (current.length) {
        await db.update(imports).set({ originalName: item.file.name, objectKey, bytes: item.file.size, rowCount: item.rowCount, updatedAt: now }).where(eq(imports.id, current[0].id));
      } else {
        await db.insert(imports).values({ userId: user.id, fileType: item.fileType, originalName: item.file.name, objectKey, bytes: item.file.size, rowCount: item.rowCount, updatedAt: now });
      }
    }
    return Response.json({ imported: prepared.map((item) => ({ type: item.fileType, name: item.file.name, rows: item.rowCount })) });
  } catch (error) {
    return authError(error);
  }
}
