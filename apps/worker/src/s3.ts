import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createWriteStream } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { env } from "./env";

export const s3 = new S3Client({ region: env.AWS_REGION, requestChecksumCalculation: "WHEN_REQUIRED" });

export async function downloadToFile(key: string, dest: string) {
  const res = await s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  await pipeline(res.Body as Readable, createWriteStream(dest));
}

// Only these file types ever leave the work directory. The key and key-info files are never uploaded.
const TYPES: Record<string, { type: string; cache: string }> = {
  ".m3u8": { type: "application/vnd.apple.mpegurl", cache: "public, max-age=60" },
  ".ts": { type: "video/mp2t", cache: "public, max-age=31536000, immutable" },
  ".jpg": { type: "image/jpeg", cache: "public, max-age=86400" },
};

export type PutFn = (key: string, body: Buffer, contentType: string, cacheControl: string) => Promise<void>;

export const putToS3: PutFn = async (Key, Body, ContentType, CacheControl) => {
  await s3.send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key, Body, ContentType, CacheControl }));
};

async function* walk(dir: string): AsyncGenerator<string> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  });
  await Promise.all(workers);
}

/**
 * Upload segments first, then variant playlists, then the master playlist last,
 * so a playlist is never visible before the files it points to.
 * Output paths are deterministic, so a retried job simply overwrites.
 */
export async function uploadOutputs(
  root: string,
  prefix: string,
  put: PutFn = putToS3,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const files: string[] = [];
  for await (const f of walk(root)) if (TYPES[extname(f)]) files.push(f);

  const phase = (f: string) => (f.endsWith("master.m3u8") ? 2 : f.endsWith(".m3u8") ? 1 : 0);
  let done = 0;
  for (const p of [0, 1, 2]) {
    const batch = files.filter((f) => phase(f) === p);
    await pool(batch, 8, async (f) => {
      const t = TYPES[extname(f)];
      const key = prefix + relative(root, f).split(sep).join("/");
      await put(key, await readFile(f), t.type, t.cache);
      onProgress?.(++done, files.length);
    });
  }
  return files.length;
}
