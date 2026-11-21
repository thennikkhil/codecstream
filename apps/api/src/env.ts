import "dotenv/config";
import { z } from "zod";

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  DASHBOARD_ORIGIN: z.string().url(),
  MONGODB_URI: z.string().min(1),
  REDIS_URL: z.string().min(1),
  AWS_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  OWNER_EMAIL: z.preprocess(emptyToUndefined, z.string().optional()),
  // 32 random bytes, base64. Must match the worker's value.
  KEY_ENCRYPTION_SECRET: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "must be 32 bytes, base64 (openssl rand -base64 32)"),
  // CloudFront domain that serves hls/*; leave unset until the distribution exists.
  CDN_BASE_URL: z.preprocess(
    emptyToUndefined,
    z.string().url().transform((v) => v.replace(/\/$/, "")).optional(),
  ),
});

export const env = schema.parse(process.env);
