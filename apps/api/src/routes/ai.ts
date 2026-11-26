import { Router } from "express";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { ObjectIdString } from "@codecstream/shared";
import { chunks, videos } from "../collections";
import { db } from "../db";
import { findMatches, type ChunkRow } from "../search";
import { requireAuth } from "../middleware/requireAuth";

export const aiRouter = Router();
const chunkRows = db.collection<ChunkRow & { videoId: string }>("transcriptChunks");
type U = { id: string };

// Same authorisation as playback: signed in, owns the video, video is Ready.
const loadReady = (id: string, ownerId: string) =>
  ObjectIdString.safeParse(id).success
    ? videos.findOne({ _id: new ObjectId(id), ownerId, status: "ready" })
    : Promise.resolve(null);

// GET /videos/:id/transcript -> status and timed chunks
aiRouter.get("/videos/:id/transcript", requireAuth, async (req, res) => {
  const user = res.locals.user as U;
  const v = await loadReady(String(req.params.id), user.id);
  if (!v) return void res.status(404).json({ error: "not_found" });
  const list =
    v.transcriptStatus === "ready"
      ? await chunks.find({ videoId: v._id.toHexString() }, { projection: { _id: 0, startSec: 1, endSec: 1, text: 1 } }).sort({ startSec: 1 }).toArray()
      : [];
  res.json({ status: v.transcriptStatus ?? "none", error: v.transcriptError ?? null, chunks: list });
});

// GET /videos/:id/search?q=...  -> timestamps of the best-matching chunks
aiRouter.get("/videos/:id/search", requireAuth, async (req, res) => {
  const user = res.locals.user as U;
  const q = z.string().trim().min(2).max(200).safeParse(req.query.q);
  const v = await loadReady(String(req.params.id), user.id);
  if (!q.success || !v) return void res.status(404).json({ error: "not_found" });
  if (v.transcriptStatus !== "ready") return void res.status(409).json({ error: "transcript_not_ready" });
  const t0 = Date.now();
  const rows = await chunkRows.find({ videoId: v._id.toHexString() }, { projection: { _id: 0, startSec: 1, endSec: 1, text: 1, words: 1 } }).sort({ startSec: 1 }).toArray();
  const results = findMatches(rows, q.data);
  res.json({ results, ms: Date.now() - t0 });
});
