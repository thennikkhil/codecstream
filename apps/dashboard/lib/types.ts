export type VideoStatus = "uploading" | "uploaded" | "processing" | "ready" | "failed";

export interface VideoDto {
  id: string;
  title: string;
  status: VideoStatus;
  progress: number;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  createdAt: string;
  error: string | null;
  settings: { watermark: boolean; deviceLimit: boolean };
  renditions: { name: string; height: number; width: number }[];
  thumbnailUrl: string | null;
  playbackUrl: string | null;
}

export const isBusy = (s: VideoStatus) => s === "uploading" || s === "uploaded" || s === "processing";

export function fmtDuration(sec: number | null) {
  if (sec == null) return "";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function statusBadge(v: Pick<VideoDto, "status" | "progress">) {
  switch (v.status) {
    case "uploading":
      return { text: "Uploading", cls: "bg-blue-600" };
    case "uploaded":
      return { text: "Queued", cls: "bg-amber-600" };
    case "processing":
      return { text: `Processing ${v.progress}%`, cls: "bg-blue-600" };
    case "ready":
      return { text: "Ready", cls: "bg-green-600" };
    case "failed":
      return { text: "Failed", cls: "bg-red-600" };
  }
}
