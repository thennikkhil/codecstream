import { Router } from "express";
import { ObjectId } from "mongodb";
import { ObjectIdString } from "@codecstream/shared";
import { decryptKey } from "../crypto";
import { videos } from "../collections";
import { requireAuth } from "../middleware/requireAuth";

export const keysRouter = Router();

// GET /keys/:videoId  -> the 16-byte AES key. This endpoint is the real gate:
// the segments are public ciphertext, the key is only given to an authorised viewer.
// (Saturday: logged-in owner. Sunday: replaced by short-lived playback tokens.)
keysRouter.get("/:videoId", requireAuth, async (req, res) => {
  const user = res.locals.user as { id: string };
  const id = String(req.params.videoId);
  if (!ObjectIdString.safeParse(id).success) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const v = await videos.findOne({ _id: new ObjectId(id), ownerId: user.id, status: "ready" });
  if (!v?.keyEnc) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.set({ "Content-Type": "application/octet-stream", "Cache-Control": "no-store" });
  res.send(decryptKey(v.keyEnc));
});
