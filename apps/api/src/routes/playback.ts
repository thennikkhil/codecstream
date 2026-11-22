import { Router } from "express";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { ObjectIdString } from "@codecstream/shared";
import { settingsOf, videos, watchProgress } from "../collections";
import { requireAuth } from "../middleware/requireAuth";
import { signPlaybackToken } from "../playbackToken";
import { claimDevice } from "../redis";

export const playbackRouter = Router();
type U = { id: string; email: string };

const TokenBody = z.object({ deviceId: z.string().min(8).max(64), takeover: z.boolean().optional() });
const BeatBody = z.object({
  videoId: ObjectIdString,
  deviceId: z.string().min(8).max(64),
  positionSec: z.number().min(0).max(1e6),
});
const SettingsBody = z.object({ watermark: z.boolean().optional(), deviceLimit: z.boolean().optional() });

const loadReady = (id: string, ownerId: string) =>
  ObjectIdString.safeParse(id).success
    ? videos.findOne({ _id: new ObjectId(id), ownerId, status: "ready" })
    : Promise.resolve(null);

// POST /videos/:id/playback-token -> short-lived token bound to video, viewer and device
playbackRouter.post("/videos/:id/playback-token", requireAuth, async (req, res) => {
  const user = res.locals.user as U;
  const body = TokenBody.safeParse(req.body);
  const v = await loadReady(String(req.params.id), user.id);
  if (!body.success || !v) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const s = settingsOf(v);
  const videoId = v._id.toHexString();
  if (s.deviceLimit && !(await claimDevice(user.id, videoId, body.data.deviceId, body.data.takeover))) {
    res.status(409).json({ error: "device_limit" });
    return;
  }
  const progress = await watchProgress.findOne({ userId: user.id, videoId });
  res.json({
    token: await signPlaybackToken({ userId: user.id, videoId, deviceId: body.data.deviceId }),
    expiresIn: 300,
    watermark: s.watermark ? user.email : null,
    resumeAt: progress?.positionSec ?? 0,
  });
});

// POST /playback/heartbeat -> keeps the device claim alive, saves progress, refreshes the token
playbackRouter.post("/playback/heartbeat", requireAuth, async (req, res) => {
  const user = res.locals.user as U;
  const body = BeatBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const { videoId, deviceId, positionSec } = body.data;
  const v = await loadReady(videoId, user.id);
  if (!v) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (settingsOf(v).deviceLimit && !(await claimDevice(user.id, videoId, deviceId))) {
    res.status(409).json({ error: "session_taken" });
    return;
  }
  await watchProgress.updateOne(
    { userId: user.id, videoId },
    { $set: { positionSec, updatedAt: new Date() } },
    { upsert: true },
  );
  res.json({ token: await signPlaybackToken({ userId: user.id, videoId, deviceId }) });
});

// PATCH /videos/:id/settings
playbackRouter.patch("/videos/:id/settings", requireAuth, async (req, res) => {
  const user = res.locals.user as U;
  const body = SettingsBody.safeParse(req.body);
  if (!body.success || !ObjectIdString.safeParse(String(req.params.id)).success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const $set = Object.fromEntries(Object.entries(body.data).map(([k, val]) => [`settings.${k}`, val]));
  const r = await videos.updateOne({ _id: new ObjectId(String(req.params.id)), ownerId: user.id }, { $set });
  if (!r.matchedCount) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ ok: true });
});
