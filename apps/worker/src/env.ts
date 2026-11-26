import "dotenv/config";
import { tmpdir } from "node:os";
import { z } from "zod";

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

const schema = z.object({
  REDIS_URL: z.string().min(1),
  MONGODB_URI: z.string().min(1),
  AWS_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  KEY_ENCRYPTION_SECRET: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "must be 32 bytes, base64 (openssl rand -base64 32)"),
  PUBLIC_APP_URL: z.string().url().transform((v) => v.replace(/\/$/, "")),
  WORK_DIR: z.string().default(tmpdir()),
  FFMPEG_PRESET: z.string().default("veryfast"),
  TRANSCRIBE_LANGS: z.string().default("en-US,en-IN"),
});

export const env = schema.parse(process.env);
