import { spawn } from "node:child_process";
import { join } from "node:path";

export interface ProbeResult {
  width: number;
  height: number;
  durationSec: number;
  hasAudio: boolean;
}

export function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`${cmd} exited ${code}: ${err.trim().slice(-500)}`));
    });
  });
}

export async function probe(file: string): Promise<ProbeResult> {
  const out = await run("ffprobe", [
    "-v", "error",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    file,
  ]);
  const j = JSON.parse(out);
  const streams: any[] = j.streams ?? [];
  const v = streams.find((s) => s.codec_type === "video" && s.width && s.height);
  if (!v) throw new Error("no video stream found");
  const durationSec = Number(j.format?.duration ?? v.duration);
  if (!Number.isFinite(durationSec) || durationSec <= 0) throw new Error("could not read duration");
  return {
    width: Number(v.width),
    height: Number(v.height),
    durationSec,
    hasAudio: streams.some((s) => s.codec_type === "audio"),
  };
}

export interface TranscodeOptions {
  input: string;
  outDir: string;
  keyInfo: string;
  height: number;
  videoKbps: number;
  audioKbps: number;
  hasAudio: boolean;
  preset: string;
  durationSec: number;
  onProgress: (fraction: number) => void;
}

/**
 * One FFmpeg run per rung: scaled H.264/AAC, 4-second segments cut on forced
 * keyframes (so every rung's segment boundaries line up), AES-128 encrypted as
 * it is written via -hls_key_info_file.
 */
export function transcodeRendition(o: TranscodeOptions): Promise<void> {
  const args = [
    "-y", "-hide_banner", "-loglevel", "error", "-nostats",
    "-progress", "pipe:1",
    "-i", o.input,
    "-map", "0:v:0",
    ...(o.hasAudio ? ["-map", "0:a:0"] : []),
    "-vf", `scale=-2:${o.height}`,
    "-c:v", "libx264",
    "-preset", o.preset,
    "-profile:v", "high",
    "-pix_fmt", "yuv420p",
    "-b:v", `${o.videoKbps}k`,
    "-maxrate", `${Math.round(o.videoKbps * 1.1)}k`,
    "-bufsize", `${o.videoKbps * 2}k`,
    "-force_key_frames", "expr:gte(t,n_forced*4)",
    "-sc_threshold", "0",
    ...(o.hasAudio ? ["-c:a", "aac", "-b:a", `${o.audioKbps}k`, "-ac", "2"] : ["-an"]),
    "-f", "hls",
    "-hls_time", "4",
    "-hls_playlist_type", "vod",
    "-hls_key_info_file", o.keyInfo,
    "-hls_segment_filename", join(o.outDir, "seg_%05d.ts"),
    join(o.outDir, "index.m3u8"),
  ];

  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    let buf = "";
    p.stderr.on("data", (d) => (err += d));
    p.stdout.on("data", (d) => {
      buf += d;
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        // ffmpeg reports microseconds in out_time_us (and, confusingly, out_time_ms)
        const m = /^out_time_(?:us|ms)=(\d+)/.exec(line);
        if (m) o.onProgress(Math.min(1, Number(m[1]) / 1e6 / o.durationSec));
      }
    });
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${err.trim().slice(-500)}`));
    });
  });
}

export async function thumbnail(input: string, out: string, atSec: number) {
  await run("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-ss", atSec.toFixed(2),
    "-i", input,
    "-frames:v", "1",
    "-vf", "scale=640:-2",
    "-q:v", "4",
    out,
  ]);
}
