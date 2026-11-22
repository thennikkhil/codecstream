"use client";
import { api } from "@/lib/api";
import type { VideoDto } from "@/lib/types";

export function SecuritySettings({ video, onChange }: { video: VideoDto; onChange: (v: VideoDto) => void }) {
  async function toggle(k: "watermark" | "deviceLimit") {
    const settings = { ...video.settings, [k]: !video.settings[k] };
    await api("PATCH", `/videos/${video.id}/settings`, settings);
    onChange({ ...video, settings });
  }
  const row = (k: "watermark" | "deviceLimit", title: string, text: string) => (
    <label className="flex cursor-pointer items-center gap-4 py-4">
      <span className="flex-1">
        <span className="block text-sm font-medium text-[#0B1022]">{title}</span>
        <span className="mt-1 block text-[11px] text-[#4A5874]">{text}</span>
      </span>
      <span className="relative inline-flex shrink-0 items-center">
        <input
          type="checkbox"
          checked={video.settings[k]}
          onChange={() => void toggle(k)}
          className="peer sr-only"
        />
        <span className="h-6 w-11 rounded-full bg-[#D7E4F6] transition peer-checked:bg-[#0E4E9F] peer-focus-visible:ring-2 peer-focus-visible:ring-[#0E4E9F] peer-focus-visible:ring-offset-2" />
        <span className="pointer-events-none absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
  return (
    <section className="rounded-2xl border border-[#D7E4F6] bg-[#FAFBFE] p-5">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-lg bg-[#D8EAFD] text-[#0E4E9F]">
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
            <path d="M12 3 19 6v5c0 4.5-2.7 8-7 10-4.3-2-7-5.5-7-10V6l7-3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          </svg>
        </span>
        <h2 className="text-sm font-semibold text-[#0B1022]">Playback security</h2>
      </div>
      <p className="mt-2 text-xs leading-5 text-[#4A5874]">Changes apply the next time the video is opened.</p>
      <div className="mt-5 divide-y divide-[#D7E4F6] border-y border-[#D7E4F6]">
        {row("watermark", "Viewer watermark", "Shows a moving viewer watermark during playback")}
        {row("deviceLimit", "One-device limit", "Allow one device at a time")}
      </div>
    </section>
  );
}
