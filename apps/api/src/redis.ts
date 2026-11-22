import { Redis } from "ioredis";
import { env } from "./env";

export const redis = new Redis(env.REDIS_URL);
redis.on("error", (e) => console.error("redis error:", e.message));

const TTL = 30; // seconds; the player's heartbeat (every 10s) keeps its claim alive
const key = (userId: string, videoId: string) => `play:${userId}:${videoId}`;

/** One active device per viewer+video. SET NX: two simultaneous claims have exactly one winner. */
export async function claimDevice(userId: string, videoId: string, deviceId: string, takeover = false) {
  const k = key(userId, videoId);
  if (takeover) {
    await redis.set(k, deviceId, "EX", TTL);
    return true;
  }
  if ((await redis.set(k, deviceId, "EX", TTL, "NX")) === "OK") return true;
  const cur = await redis.get(k);
  if (cur === deviceId) {
    await redis.expire(k, TTL);
    return true;
  }
  if (cur === null) return (await redis.set(k, deviceId, "EX", TTL, "NX")) === "OK"; // expired in between
  return false;
}

export const activeDevice = (userId: string, videoId: string) => redis.get(key(userId, videoId));
