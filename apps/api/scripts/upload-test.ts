import { open, stat } from "node:fs/promises";
import { basename, extname } from "node:path";

const API = process.env.API_URL ?? "http://localhost:4000";
const ORIGIN = process.env.DASHBOARD_ORIGIN ?? "http://localhost:3000";
const args = process.argv.slice(2).filter((a) => a !== "--");
const file = args[0];
const flag = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const resumeId = flag("resume");
const stopAfter = flag("stop-after") ? Number(flag("stop-after")) : Infinity;
const TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm",
};

if (!file) throw new Error("usage: upload-test <file> [--stop-after N] [--resume <uploadId>]");

async function login() {
  const r = await fetch(`${API}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email: process.env.TEST_EMAIL, password: process.env.TEST_PASSWORD }),
  });
  if (!r.ok) throw new Error(`login failed: ${r.status} ${await r.text()}`);
  return r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

const cookie = await login();

async function call(method: string, path: string, body?: unknown) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { cookie, origin: ORIGIN, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(json)}`);
  return json;
}

const { size } = await stat(file);
let info: any;
if (resumeId) {
  info = await call("GET", `/uploads/${resumeId}`);
} else {
  const created = await call("POST", "/uploads", {
    filename: basename(file),
    contentType: TYPES[extname(file).toLowerCase()] ?? "video/mp4",
    size,
  });
  info = { ...created, parts: [] };
}

const { uploadId, partSize, totalParts } = info;
const done = new Set<number>(info.parts.map((p: any) => p.partNumber));
const missing = Array.from({ length: totalParts }, (_, i) => i + 1).filter((n) => !done.has(n));
console.log(`upload ${uploadId}: ${done.size}/${totalParts} parts already stored, ${missing.length} to go`);

const toSend = Number.isFinite(stopAfter) ? missing.slice(0, stopAfter) : missing;
const fh = await open(file, "r");

async function putPart(partNumber: number, url: string) {
  const start = (partNumber - 1) * partSize;
  const len = Math.min(partSize, size - start);
  const buf = Buffer.alloc(len);
  await fh.read(buf, 0, len, start);
  const r = await fetch(url, { method: "PUT", body: new Blob([buf]) });
  if (!r.ok) throw new Error(`part ${partNumber} failed: ${r.status} ${await r.text()}`);
  console.log(`  part ${partNumber}/${totalParts} ok (etag ${r.headers.get("etag")})`);
}

for (let i = 0; i < toSend.length; i += 50) {
  const batch = toSend.slice(i, i + 50);
  const { urls } = await call("POST", `/uploads/${uploadId}/parts`, { partNumbers: batch });
  let next = 0;
  const worker = async () => {
    while (next < urls.length) {
      const item = urls[next++];
      await putPart(item.partNumber, item.url);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker)); // 4 parts in parallel
}
await fh.close();

if (toSend.length < missing.length) {
  console.log(`stopped early. resume with: pnpm upload-test ${file} --resume ${uploadId}`);
} else {
  console.log("complete:", await call("POST", `/uploads/${uploadId}/complete`));
}
