import { z } from "zod";

export const MeResponse = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
});
export type MeResponse = z.infer<typeof MeResponse>;

export const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/x-matroska",
  "video/webm",
] as const;

export const CreateUploadBody = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.enum(ALLOWED_VIDEO_TYPES),
  size: z.number().int().positive(),
  title: z.string().min(1).max(200).optional(),
});
export type CreateUploadBody = z.infer<typeof CreateUploadBody>;

export const PartsBody = z.object({
  partNumbers: z.array(z.number().int().min(1).max(10000)).min(1).max(50),
});

export const ObjectIdString = z.string().regex(/^[a-f0-9]{24}$/);

// ---- processing queue (shared by the API and the worker) ----

export const PROCESS_QUEUE = "process-video";

export interface ProcessVideoJob {
  videoId: string;
  s3Key: string;
}

/** Turn redis://:password@host:6379 into BullMQ connection options. */
export function redisConnection(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
  };
}
