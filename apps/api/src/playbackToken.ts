import { createHmac } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";

// Derived key, so the token secret is not the raw auth secret.
const secret = createHmac("sha256", env.BETTER_AUTH_SECRET).update("codecstream-playback").digest();

export const signPlaybackToken = (c: { userId: string; videoId: string; deviceId: string }) =>
  new SignJWT({ vid: c.videoId, did: c.deviceId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(c.userId)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret);

export async function verifyPlaybackToken(token: string) {
  const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
  return { userId: String(payload.sub), videoId: String(payload.vid), deviceId: String(payload.did) };
}
