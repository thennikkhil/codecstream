import { Router } from "express";
import { ObjectId } from "mongodb";
import { ObjectIdString } from "@codecstream/shared";
import { decryptKey } from "../crypto";
import { settingsOf, videos } from "../collections";
import { verifyPlaybackToken } from "../playbackToken";
import { activeDevice } from "../redis";

export const keysRouter = Router();

// GET /keys/:videoId -> the AES key. The segments are public ciphertext; this is the gate.
// Needs a valid, unexpired playback token for THIS video, and the token's device must be the active one.
keysRouter.get("/:videoId", async (req, res) => {
  const deny = (status: number, error: string) => void res.status(status).json({ error });
  const bearer = /^Bearer (.+)$/.exec(req.get("authorization") ?? "")?.[1];
  if (!bearer) return deny(401, "token_required");
  let claims;
  try {
    claims = await verifyPlaybackToken(bearer);
  } catch {
    return deny(401, "token_invalid_or_expired");
  }
  const id = String(req.params.videoId);
  if (claims.videoId !== id || !ObjectIdString.safeParse(id).success) return deny(403, "wrong_video");

  const v = await videos.findOne({ _id: new ObjectId(id), ownerId: claims.userId, status: "ready" });
  if (!v?.keyEnc) return deny(404, "not_found");
  if (settingsOf(v).deviceLimit && (await activeDevice(claims.userId, id)) !== claims.deviceId) {
    return deny(403, "device_not_active");
  }
  res.set({ "Content-Type": "application/octet-stream", "Cache-Control": "no-store" });
  res.send(decryptKey(v.keyEnc));
});
