import { Queue } from "bullmq";
import { PROCESS_QUEUE, redisConnection, type ProcessVideoJob } from "@codecstream/shared";
import { env } from "./env";

export const processQueue = new Queue<ProcessVideoJob>(PROCESS_QUEUE, {
  connection: redisConnection(env.REDIS_URL),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});
processQueue.on("error", (err) => console.error("queue error:", err.message));

/** One job per video: the fixed jobId makes a double call a no-op. */
export async function enqueueProcessing(videoId: string, s3Key: string) {
  await processQueue.add("process", { videoId, s3Key }, { jobId: `video-${videoId}` });
}
