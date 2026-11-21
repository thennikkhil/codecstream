import { createCipheriv, randomBytes } from "node:crypto";
import { env } from "./env";

const master = Buffer.from(env.KEY_ENCRYPTION_SECRET, "base64");

/** AES-256-GCM: the video's 16-byte AES-128 key is stored encrypted under the master secret. */
export function encryptKey(plain: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", master, iv);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  return [iv, cipher.getAuthTag(), ct].map((b) => b.toString("base64")).join(".");
}
