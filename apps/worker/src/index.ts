import { UnrecoverableError, Worker } from "bullmq";
import { ObjectId } from "mongodb";
import { PROCESS_QUEUE, redisConnection, type ProcessVideoJob } from "@codecstream/shared";
import { mongo, videos } from "./db";
import { env } from "./env";
import { processVideo } from "./process";

const worker = new Worker<ProcessVideoJob>(PROCESS_QUEUE, processVideo, {
  connection: redisConnection(env.REDIS_URL),
  concurrency: 1, // FFmpeg is CPU-bound; scale by running more worker processes
});

worker.on("active", (job) => console.log(`[${job.data.videoId}] started (attempt ${job.attemptsMade + 1})`));
worker.on("error", (err) => console.error("worker error:", err.message));
worker.on("failed", async (job, err) => {
  console.error(`[${job?.data.videoId}] failed: ${err.message}`);
  if (!job) return;
  const lastAttempt = err instanceof UnrecoverableError || job.attemptsMade >= (job.opts.attempts ?? 1);
  if (lastAttempt) {
    await videos.updateOne(
      { _id: new ObjectId(job.data.videoId) },
      { $set: { status: "failed", error: err.message.slice(0, 300), updatedAt: new Date() } },
    );
  }
});

console.log("worker waiting for jobs");

async function shutdown() {
  console.log("shutting down");
  await worker.close();
  await mongo.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
