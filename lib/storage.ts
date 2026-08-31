import { env } from "cloudflare:workers";

type StorageEnv = {
  BUCKET: R2Bucket;
};

function bucket() {
  const runtime = env as unknown as StorageEnv;
  if (!runtime.BUCKET) throw new Error("Cloudflare R2 binding `BUCKET` is unavailable");
  return runtime.BUCKET;
}

export function userFileKey(userId: string, fileType: string) {
  return `users/${userId}/imports/${fileType}.csv`;
}

export function userMarketKey(userId: string) {
  return `users/${userId}/market.json`;
}

export async function putText(key: string, value: string, contentType: string) {
  await bucket().put(key, value, {
    httpMetadata: { contentType },
  });
}

export async function getText(key: string) {
  const object = await bucket().get(key);
  return object ? object.text() : null;
}

export async function deleteObject(key: string) {
  await bucket().delete(key);
}
