import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";

type RuntimeEnv = {
  DEV_USER_EMAIL?: string;
};

export type CurrentUser = {
  id: string;
  email: string;
};

function normaliseEmail(value: string) {
  return value.trim().toLowerCase();
}

async function userIdFor(email: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(email)
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function getCurrentUser(request: Request): Promise<CurrentUser | null> {
  const runtime = env as unknown as RuntimeEnv;
  const accessEmail = request.headers.get("cf-access-authenticated-user-email");
  const email = normaliseEmail(accessEmail || runtime.DEV_USER_EMAIL || "");
  if (!email || !email.includes("@")) return null;

  const id = await userIdFor(email);
  const now = new Date();
  const db = getDb();
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
  if (existing.length) {
    await db.update(users).set({ lastSeenAt: now }).where(eq(users.id, id));
  } else {
    await db.insert(users).values({ id, email, createdAt: now, lastSeenAt: now });
  }
  return { id, email };
}

export async function requireUser(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) {
    throw new Response(
      JSON.stringify({ error: "Authentication required" }),
      { status: 401, headers: { "content-type": "application/json" } }
    );
  }
  return user;
}

export function authError(error: unknown) {
  return error instanceof Response
    ? error
    : Response.json(
        { error: error instanceof Error ? error.message : "Unexpected error" },
        { status: 500 }
      );
}
