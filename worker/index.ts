/** Cloudflare Worker entry point for Stonks Portfolio. */
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  BUCKET: R2Bucket;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/dashboard/api/")) {
      url.pathname = url.pathname.replace("/dashboard/api/", "/api/");
      return handler.fetch(new Request(url, request), env, ctx);
    }
    if (url.pathname.startsWith("/api/")) return new Response("Not found", { status: 404 });
    return handler.fetch(request, env, ctx);
  },
};

export default worker;
