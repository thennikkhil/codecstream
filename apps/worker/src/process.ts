import { randomBytes } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { UnrecoverableError, type Job } from "bullmq";
import { ObjectId } from "mongodb";
import type { ProcessVideoJob } from "@codecstream/shared";
import { encryptKey } from "./crypto";
import { videos } from "./db";
import { env } from "./env";
import { runAiStage } from "./ai";
import { probe, thumbnail, transcodeRendition } from "./ffmpeg";
import { peakBandwidth, pickLadder, widthFor } from "./ladder";
import { downloadToFile, uploadOutputs } from "./s3";

export async function processVideo(job: Job<ProcessVideoJob>) {
  const { videoId, s3Key } = job.data;
  const _id = new ObjectId(videoId);
  const dir = join(env.WORK_DIR, "codecstream", videoId);
  const t0 = Date.now();

  // A retry starts from a clean directory.
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  let lastWrite = 0;
  const setProgress = async (p: number, force = false) => {
    const now = Date.now();
    if (!force && now - lastWrite < 2000) return;
    lastWrite = now;
    const value = Math.min(99, Math.round(p)); // 100 only once the video is Ready
    await job.updateProgress(value);
    await videos.updateOne({ _id }, { $set: { progress: value, updatedAt: new Date() } });
  };
  const quiet = (p: Promise<void>) => void p.catch(() => {});

  try {
    await videos.updateOne(
      { _id },
      { $set: { status: "processing", progress: 0, error: null, updatedAt: new Date() } },
    );

    // 1. download the original (0-5%)
    const input = join(dir, "source");
    await downloadToFile(s3Key, input);
    await setProgress(5, true);

    // 2. inspect it
    let info;
    try {
      info = await probe(input);
    } catch (e) {
      throw new UnrecoverableError(`Not a readable video: ${e instanceof Error ? e.message : e}`);
    }

    // 3. per-video AES-128 key and IV. The key info file tells FFmpeg what URL to
    //    write into the playlist and which local file holds the key.
    const key = randomBytes(16);
    const iv = randomBytes(16).toString("hex");
    const keyFile = join(dir, "enc.key");
    const keyInfo = join(dir, "enc.keyinfo");
    await writeFile(keyFile, key);
    await writeFile(keyInfo, `${env.PUBLIC_APP_URL}/api/keys/${videoId}\n${keyFile}\n${iv}\n`);

    // 4. the ladder, one rendition at a time (5-85%)
    const ladder = pickLadder(info.height);
    const outRoot = join(dir, "out");
    for (const [i, r] of ladder.entries()) {
      const outDir = join(outRoot, r.name);
      await mkdir(outDir, { recursive: true });
      await transcodeRendition({
        input,
        outDir,
        keyInfo,
        height: r.height,
        videoKbps: r.videoKbps,
        audioKbps: r.audioKbps,
        hasAudio: info.hasAudio,
        preset: env.FFMPEG_PRESET,
        durationSec: info.durationSec,
        onProgress: (f) => quiet(setProgress(5 + ((i + f) / ladder.length) * 80)),
      });
    }

    // 5. thumbnail and master playlist (lowest bandwidth first)
    const at = Math.min(Math.max(1, info.durationSec * 0.1), Math.max(0, info.durationSec - 0.5));
    await thumbnail(input, join(outRoot, "thumb.jpg"), at);
    const master = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      ...[...ladder].reverse().flatMap((r) => [
        `#EXT-X-STREAM-INF:BANDWIDTH=${peakBandwidth(r)},RESOLUTION=${widthFor(info.width, info.height, r.height)}x${r.height}`,
        `${r.name}/index.m3u8`,
      ]),
    ].join("\n");
    await writeFile(join(outRoot, "master.m3u8"), master + "\n");
    await setProgress(87, true);

    // 6. upload (87-99%)
    const prefix = `hls/${videoId}/`;
    await uploadOutputs(outRoot, prefix, undefined, (done, total) =>
      quiet(setProgress(87 + (done / total) * 12)),
    );

    // 7. mark Ready
    await videos.updateOne(
      { _id },
      {
        $set: {
          status: "ready",
          processingSec: Math.round((Date.now() - t0) / 100) / 10,
          progress: 100,
          durationSec: info.durationSec,
          width: info.width,
          height: info.height,
          renditions: ladder.map((r) => ({
            name: r.name,
            height: r.height,
            width: widthFor(info.width, info.height, r.height),
            bandwidth: peakBandwidth(r),
          })),
          masterKey: `${prefix}master.m3u8`,
          thumbnailKey: `${prefix}thumb.jpg`,
          keyEnc: encryptKey(key),
          processedAt: new Date(),
          error: null,
          updatedAt: new Date(),
        },
      },
    );

    const seconds = (Date.now() - t0) / 1000;
    console.log(
      `[${videoId}] ready: ${ladder.length} renditions, ${info.durationSec.toFixed(1)}s of video in ${seconds.toFixed(1)}s`,
    );
    await runAiStage({ videoId, input, dir, prefix }); // transcript and search index
    return { renditions: ladder.length, seconds };
  } finally {
    // Runs on success, failure and retry, so a failed job never leaves disk behind.
    await rm(dir, { recursive: true, force: true });
  }
}
