import type { ObjectId } from "mongodb";
import { db } from "./db";

export interface VideoDoc {
  _id: ObjectId;
  ownerId: string;
  title: string;
  filename: string;
  status: "uploading" | "uploaded" | "processing" | "ready" | "failed";
  sizeBytes: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UploadDoc {
  _id: ObjectId;
  videoId: ObjectId;
  ownerId: string;
  s3Key: string;
  s3UploadId: string;
  contentType: string;
  size: number;
  partSize: number;
  totalParts: number;
  status: "in_progress" | "completed" | "aborted";
  createdAt: Date;
  expiresAt?: Date;
}

export const videos = db.collection<VideoDoc>("videos");
export const uploads = db.collection<UploadDoc>("uploads");

export async function ensureIndexes() {
  await videos.createIndex({ ownerId: 1, createdAt: -1 });
  await uploads.createIndex({ videoId: 1 });
  await uploads.createIndex({ ownerId: 1, createdAt: -1 });
  // TTL: abandoned uploads disappear after expiresAt (completed ones have it unset)
  await uploads.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}
