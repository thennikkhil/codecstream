import { Router } from "express";
import { ObjectId } from "mongodb";
import { ObjectIdString } from "@codecstream/shared";
import { env } from "../env";
import { settingsOf, videos, type VideoDoc } from "../collections";
import { requireAuth } from "../middleware/requireAuth";

export const videosRouter = Router();
videosRouter.use(requireAuth);

// Explicit allow-list: the encrypted key and storage paths never leave the server.
function toDto(v: VideoDoc) {
  const cdn = env.CDN_BASE_URL;
  const ready = v.status === "ready";
  return {
    id: v._id.toHexString(),
    title: v.title,
    status: v.status,
    progress: v.progress ?? 0,
    durationSec: v.durationSec ?? null,
    width: v.width ?? null,
    height: v.height ?? null,
    sizeBytes: v.sizeBytes,
    createdAt: v.createdAt,
    error: v.error ?? null,
    settings: settingsOf(v),
    renditions: (v.renditions ?? []).map((r) => ({ name: r.name, height: r.height, width: r.width })),
    thumbnailUrl: cdn && v.thumbnailKey ? `${cdn}/${v.thumbnailKey}` : null,
    playbackUrl: cdn && ready && v.masterKey ? `${cdn}/${v.masterKey}` : null,
  };
}

// GET /videos  -> the library (polled by the dashboard while anything is processing)
videosRouter.get("/", async (_req, res) => {
  const user = res.locals.user as { id: string };
  const list = await videos.find({ ownerId: user.id }).sort({ createdAt: -1 }).limit(100).toArray();
  res.json({ videos: list.map(toDto) });
});

// GET /videos/:id
videosRouter.get("/:id", async (req, res) => {
  const user = res.locals.user as { id: string };
  if (!ObjectIdString.safeParse(req.params.id).success) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const v = await videos.findOne({ _id: new ObjectId(req.params.id), ownerId: user.id });
  if (!v) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(toDto(v));
});
