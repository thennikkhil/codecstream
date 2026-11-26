import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import {
  DeleteTranscriptionJobCommand,
  GetTranscriptionJobCommand,
  StartTranscriptionJobCommand,
  TranscribeClient,
  type LanguageCode,
} from "@aws-sdk/client-transcribe";
import { ObjectId } from "mongodb";
import { chunks, videos } from "./db";
import { env } from "./env";
import { run } from "./ffmpeg";
import { putToS3, s3 } from "./s3";

const transcribe = new TranscribeClient({ region: env.AWS_REGION });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Item {
  type: "pronunciation" | "punctuation";
  start_time?: string;
  end_time?: string;
  alternatives: { content: string }[];
}

/** Turn Amazon Transcribe's word list into 30-60 second chunks, keeping each word's start time. */
export function chunkItems(items: Item[], min = 30, max = 60) {
  const out: { startSec: number; endSec: number; text: string; words: { t: number; w: string }[] }[] = [];
  let ws: { t: number; w: string }[] = [];
  let start = 0;
  let end = 0;
  const flush = () => {
    if (ws.length) out.push({ startSec: start, endSec: end, text: ws.map((x) => x.w).join(" "), words: ws });
    ws = [];
  };
  for (const it of items) {
    const w = it.alternatives[0]?.content ?? "";
    if (it.type === "pronunciation") {
      if (!ws.length) start = Number(it.start_time);
      ws.push({ t: Number(it.start_time), w });
      end = Number(it.end_time);
    } else if (ws.length) {
      ws[ws.length - 1].w += w; // attach punctuation to the previous word
      if (end - start >= min && /[.!?]/.test(w)) flush();
    }
    if (ws.length && end - start >= max) flush();
  }
  flush();
  return out;
}

/**
 * Runs after the video is already Ready. Failures here never fail the video
 * (and never re-run the encode); they only set transcriptStatus.
 */
export async function runAiStage(o: { videoId: string; input: string; dir: string; prefix: string }) {
  const _id = new ObjectId(o.videoId);
  const set = (f: Record<string, unknown>) => videos.updateOne({ _id }, { $set: { ...f, updatedAt: new Date() } });
  const audioKey = `tmp/${o.videoId}/audio.mp3`; // private: CloudFront only serves hls/*
  const jobName = `cs-${o.videoId}-${Date.now()}`;
  const t0 = Date.now();
  await set({ transcriptStatus: "processing", transcriptError: null });
  try {
    const audio = join(o.dir, "audio.mp3");
    await run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", o.input, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k", audio]);
    if ((await stat(audio)).size < 2000) throw new Error("no audio track in this video");
    await putToS3(audioKey, await readFile(audio), "audio/mpeg", "no-store");

    await transcribe.send(
      new StartTranscriptionJobCommand({
        TranscriptionJobName: jobName,
        Media: { MediaFileUri: `s3://${env.S3_BUCKET}/${audioKey}` },
        MediaFormat: "mp3",
        IdentifyLanguage: true,
        LanguageOptions: env.TRANSCRIBE_LANGS.split(",") as LanguageCode[],
      }),
    );

    let uri: string | undefined;
    let language: string | undefined;
    for (let i = 0; i < 240 && !uri; i++) {
      await sleep(5000);
      const { TranscriptionJob: j } = await transcribe.send(new GetTranscriptionJobCommand({ TranscriptionJobName: jobName }));
      if (j?.TranscriptionJobStatus === "COMPLETED") {
        uri = j.Transcript?.TranscriptFileUri;
        language = j.LanguageCode;
      } else if (j?.TranscriptionJobStatus === "FAILED") {
        throw new Error(`Transcribe failed: ${j.FailureReason ?? "unknown"}`);
      }
    }
    if (!uri) throw new Error("transcription timed out");

    const res = await fetch(uri);
    if (!res.ok) throw new Error(`could not download transcript (${res.status})`);
    const json = (await res.json()) as { results: { items: Item[] } };
    const parts = chunkItems(json.results.items);
    if (!parts.length) throw new Error("no speech found in this video");

    await chunks.deleteMany({ videoId: o.videoId }); // safe to re-run
    await chunks.insertMany(parts.map((p) => ({ videoId: o.videoId, ...p })));
    await set({ transcriptStatus: "ready", language, transcriptSec: Math.round((Date.now() - t0) / 100) / 10 });
    console.log(`[${o.videoId}] transcript ready: ${parts.length} chunks in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[${o.videoId}] transcript failed: ${msg}`);
    await set({ transcriptStatus: "failed", transcriptError: msg.slice(0, 200) });
  } finally {
    await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: audioKey })).catch(() => {});
    await transcribe.send(new DeleteTranscriptionJobCommand({ TranscriptionJobName: jobName })).catch(() => {});
  }
}
