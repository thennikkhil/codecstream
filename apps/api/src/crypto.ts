import { createDecipheriv } from "node:crypto";
import { env } from "./env";

const master = Buffer.from(env.KEY_ENCRYPTION_SECRET, "base64");

export function decryptKey(enc: string): Buffer {
  const [iv, tag, ct] = enc.split(".").map((s) => Buffer.from(s, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", master, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}
