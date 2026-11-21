import { Router, type Response } from "express";
import { ObjectId } from "mongodb";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  ListPartsCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { CreateUploadBody, ObjectIdString, PartsBody } from "@codecstream/shared";
import { env } from "../env";
import { s3 } from "../s3";
import { uploads, videos, type UploadDoc } from "../collections";
import { requireAuth } from "../middleware/requireAuth";
import { limitsFor } from "../limits";
import { enqueueProcessing } from "../queue";

const PART_SIZE = 16 * 1024 * 1024; // S3 minimum is 5 MiB, maximum 10,000 parts
const URL_TTL_SECONDS = 60 * 60; // short on purpose; the client asks again on resume
const UPLOAD_TTL_MS = 3 * 24 * 60 * 60 * 1000; // matches the bucket's abort-incomplete rule

export const uploadsRouter = Router();
uploadsRouter.use(requireAuth);

type AuthUser = { id: string; email: string };

function fail(res: Response, status: number, error: string, extra: object = {}) {
  res.status(status).json({ error, ...extra });
}

// Ownership is derived from the session, never from the request body.
async function loadUpload(id: string, ownerId: string) {
  if (!ObjectIdString.safeParse(id).success) return null;
  return uploads.findOne({ _id: new ObjectId(id), ownerId });
}

async function listAllParts(up: UploadDoc) {
  const parts: { partNumber: number; etag: string; size: number }[] = [];
  let marker: string | undefined;
  do {
    const out = await s3.send(
      new ListPartsCommand({
        Bucket: env.S3_BUCKET,
        Key: up.s3Key,
        UploadId: up.s3UploadId,
        PartNumberMarker: marker,
        MaxParts: 1000,
      }),
    );
    for (const p of out.Parts ?? []) {
      parts.push({ partNumber: p.PartNumber!, etag: p.ETag!, size: p.Size! });
    }
    marker = out.IsTruncated ? String(out.NextPartNumberMarker) : undefined;
  } while (marker);
  return parts.sort((a, b) => a.partNumber - b.partNumber);
}

// POST /uploads  -> create the video, start the S3 multipart upload
uploadsRouter.post("/", async (req, res) => {
  const user = res.locals.user as AuthUser;
  const parsed = CreateUploadBody.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "invalid_body", { details: parsed.error.flatten() });
  const { filename, contentType, size, title } = parsed.data;

  const limits = limitsFor(user.email);
  if (size > limits.maxBytes) return fail(res, 413, "file_too_large", { maxBytes: limits.maxBytes });

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [today, active] = await Promise.all([
    uploads.countDocuments({ ownerId: user.id, createdAt: { $gte: since } }),
    uploads.countDocuments({ ownerId: user.id, status: "in_progress" }),
  ]);
  if (today >= limits.maxPerDay) return fail(res, 429, "daily_upload_limit");
  if (active >= limits.maxActive) return fail(res, 429, "too_many_active_uploads");

  const videoId = new ObjectId();
  const ext =
    (filename.split(".").pop() ?? "mp4").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "mp4";
  const s3Key = `originals/${videoId.toHexString()}/source.${ext}`;

  const created = await s3.send(
    new CreateMultipartUploadCommand({ Bucket: env.S3_BUCKET, Key: s3Key, ContentType: contentType }),
  );
  if (!created.UploadId) return fail(res, 502, "s3_error");

  const now = new Date();
  const uploadId = new ObjectId();
  const totalParts = Math.ceil(size / PART_SIZE);

  await videos.insertOne({
    _id: videoId,
    ownerId: user.id,
    title: title ?? filename,
    filename,
    status: "uploading",
    sizeBytes: size,
    createdAt: now,
    updatedAt: now,
  });
  await uploads.insertOne({
    _id: uploadId,
    videoId,
    ownerId: user.id,
    s3Key,
    s3UploadId: created.UploadId,
    contentType,
    size,
    partSize: PART_SIZE,
    totalParts,
    status: "in_progress",
    createdAt: now,
    expiresAt: new Date(now.getTime() + UPLOAD_TTL_MS),
  });

  res.status(201).json({
    uploadId: uploadId.toHexString(),
    videoId: videoId.toHexString(),
    partSize: PART_SIZE,
    totalParts,
  });
});

// POST /uploads/:id/parts  -> presigned PUT URLs for the requested part numbers
uploadsRouter.post("/:id/parts", async (req, res) => {
  const user = res.locals.user as AuthUser;
  const up = await loadUpload(req.params.id, user.id);
  if (!up || up.status !== "in_progress") return fail(res, 404, "not_found");

  const parsed = PartsBody.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "invalid_body");
  if (parsed.data.partNumbers.some((n) => n > up.totalParts)) return fail(res, 400, "part_out_of_range");

  const urls = await Promise.all(
    parsed.data.partNumbers.map(async (partNumber) => ({
      partNumber,
      url: await getSignedUrl(
        s3,
        new UploadPartCommand({
          Bucket: env.S3_BUCKET,
          Key: up.s3Key,
          UploadId: up.s3UploadId,
          PartNumber: partNumber,
        }),
        { expiresIn: URL_TTL_SECONDS },
      ),
    })),
  );

  await uploads.updateOne({ _id: up._id }, { $set: { expiresAt: new Date(Date.now() + UPLOAD_TTL_MS) } });
  res.json({ urls, expiresInSeconds: URL_TTL_SECONDS });
});

// GET /uploads/:id  -> which parts S3 already has (this is what makes resume work)
uploadsRouter.get("/:id", async (req, res) => {
  const user = res.locals.user as AuthUser;
  const up = await loadUpload(req.params.id, user.id);
  if (!up) return fail(res, 404, "not_found");

  const parts = up.status === "in_progress" ? await listAllParts(up) : [];
  res.json({
    uploadId: up._id.toHexString(),
    videoId: up.videoId.toHexString(),
    status: up.status,
    size: up.size,
    partSize: up.partSize,
    totalParts: up.totalParts,
    parts,
  });
});

// POST /uploads/:id/complete  -> verify with S3, stitch the parts, queue processing
uploadsRouter.post("/:id/complete", async (req, res) => {
  const user = res.locals.user as AuthUser;
  const up = await loadUpload(req.params.id, user.id);
  if (!up) return fail(res, 404, "not_found");

  if (up.status === "completed") {
    // Retry-safe: if the first call died before queuing, queue now. Only for a video
    // still waiting ("uploaded"), so a finished video is never reprocessed.
    const v = await videos.findOne({ _id: up.videoId });
    if (v?.status === "uploaded") await enqueueProcessing(up.videoId.toHexString(), up.s3Key);
    res.json({ videoId: up.videoId.toHexString(), alreadyCompleted: true });
    return;
  }
  if (up.status !== "in_progress") return fail(res, 409, "not_in_progress");

  // Trust S3's list, not the client's claim.
  const parts = await listAllParts(up);
  const total = parts.reduce((sum, p) => sum + p.size, 0);
  if (parts.length !== up.totalParts || total !== up.size) {
    return fail(res, 409, "incomplete_upload", { have: parts.map((p) => p.partNumber) });
  }

  await s3.send(
    new CompleteMultipartUploadCommand({
      Bucket: env.S3_BUCKET,
      Key: up.s3Key,
      UploadId: up.s3UploadId,
      MultipartUpload: { Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })) },
    }),
  );

  await uploads.updateOne({ _id: up._id }, { $set: { status: "completed" }, $unset: { expiresAt: "" } });
  await videos.updateOne(
    { _id: up.videoId },
    { $set: { status: "uploaded", progress: 0, updatedAt: new Date() } },
  );
  await enqueueProcessing(up.videoId.toHexString(), up.s3Key);

  res.json({ videoId: up.videoId.toHexString(), status: "processing" });
});

// DELETE /uploads/:id  -> abort and clean up
uploadsRouter.delete("/:id", async (req, res) => {
  const user = res.locals.user as AuthUser;
  const up = await loadUpload(req.params.id, user.id);
  if (!up || up.status !== "in_progress") return fail(res, 404, "not_found");

  await s3.send(
    new AbortMultipartUploadCommand({ Bucket: env.S3_BUCKET, Key: up.s3Key, UploadId: up.s3UploadId }),
  );
  await uploads.updateOne(
    { _id: up._id },
    { $set: { status: "aborted", expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } },
  );
  await videos.deleteOne({ _id: up.videoId });
  res.json({ ok: true });
});
