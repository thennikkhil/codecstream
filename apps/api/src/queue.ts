import { Queue } from "bullmq";
import { PROCESS_QUEUE, redisConnection, type ProcessVideoJob } from "@codecstream/shared";
import { env } from "./env";
import { uploads, videos, type UploadDoc } from "./collections";

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

export async function queueCompletedUpload(upload: Pick<UploadDoc, "videoId" | "s3Key">) {
  const video = await videos.findOneAndUpdate(
    { _id: upload.videoId, status: { $in: ["uploading", "uploaded"] } },
    { $set: { status: "uploaded", progress: 0, updatedAt: new Date() } },
    { projection: { _id: 1 } },
  );
  if (video) await enqueueProcessing(upload.videoId.toHexString(), upload.s3Key);
}

export function startUploadRecovery() {
  let running = false;
  const recover = async () => {
    if (running) return;
    running = true;
    try {
      const pending = videos.aggregate<Pick<UploadDoc, "videoId" | "s3Key">>([
        { $match: { status: { $in: ["uploading", "uploaded"] } } },
        {
          $lookup: {
            from: uploads.collectionName,
            localField: "_id",
            foreignField: "videoId",
            pipeline: [{ $match: { status: "completed" } }, { $limit: 1 }],
            as: "upload",
          },
        },
        { $unwind: "$upload" },
        { $project: { _id: 0, videoId: "$_id", s3Key: "$upload.s3Key" } },
      ]);
      for await (const upload of pending) await queueCompletedUpload(upload);
    } catch (error) {
      console.error("Could not recover completed uploads:", error);
    } finally {
      running = false;
    }
  };

  void recover();
  setInterval(() => void recover(), 60_000).unref();
}
