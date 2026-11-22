"use client";
import { api } from "@/lib/api";
import type { VideoDto } from "@/lib/types";

export function SecuritySettings({ video, onChange }: { video: VideoDto; onChange: (v: VideoDto) => void }) {
  async function toggle(k: "watermark" | "deviceLimit") {
    const settings = { ...video.settings, [k]: !video.settings[k] };
    await api("PATCH", `/videos/${video.id}/settings`, settings);
    onChange({ ...video, settings });
  }
  const row = (k: "watermark" | "deviceLimit", label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={video.settings[k]} onChange={() => toggle(k)} />
      {label}
    </label>
  );
  return (
    <section className="space-y-2 rounded-lg border border-neutral-500/40 p-4">
      <h2 className="font-medium">Security</h2>
      {row("watermark", "Show a moving viewer watermark")}
      {row("deviceLimit", "Allow one device at a time")}
      <p className="text-xs opacity-60">Changes apply the next time the video is opened.</p>
    </section>
  );
}
