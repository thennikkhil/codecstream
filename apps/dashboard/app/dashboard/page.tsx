"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { fmtDuration, isBusy, statusBadge, type VideoDto } from "@/lib/types";

type VideoFilter = "all" | "ready" | "processing";

const badgeStyles: Record<VideoDto["status"], string> = {
  uploading: "bg-[#D8EAFD] text-[#0E4E9F]",
  uploaded: "bg-[#EDF4FD] text-[#4A5874]",
  processing: "bg-[#f4f0e7] text-[#7a6740]",
  ready: "bg-[#edf4ef] text-[#486451]",
  failed: "bg-[#f6eceb] text-[#89534f]",
};

export default function LibraryPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [videos, setVideos] = useState<VideoDto[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<VideoFilter>("all");

  useEffect(() => {
    if (!isPending && !session) router.push("/login");
  }, [isPending, session, router]);

  const busy = videos?.some((video) => isBusy(video.status)) ?? false;
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await api<{ videos: VideoDto[] }>("GET", "/videos");
        if (!cancelled) {
          setVideos(res.videos);
          setError("");
        }
      } catch {
        if (!cancelled) setError("Could not load your videos.");
      }
    };
    void load();
    if (!busy) return () => void (cancelled = true);
    const timer = setInterval(load, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [session, busy]);

  const filters: { key: VideoFilter; label: string }[] = [
    { key: "all", label: "All videos" },
    { key: "ready", label: "Ready" },
    { key: "processing", label: "In progress" },
  ];
  const shown = videos?.filter((video) => {
    if (filter === "ready") return video.status === "ready";
    if (filter === "processing") return isBusy(video.status);
    return true;
  });

  return (
    <DashboardShell>
      <main className="mx-auto w-full max-w-[1180px] px-5 pb-28 pt-10 sm:px-8 sm:pt-14">
        <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#4A5874]">
              Workspace
            </p>
            <h1 className="text-[30px] font-semibold tracking-[-0.035em] text-[#0B1022] sm:text-[36px]">
              Video library
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[#4A5874]">
              Manage, protect, and monitor all of your video content.
            </p>
          </div>
          <Link
            href="/upload"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0E4E9F] px-4 text-sm font-medium text-white shadow-sm hover:bg-[#0b4288]"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Upload video
          </Link>
        </header>

        <div className="mt-9 flex items-center justify-between border-b border-[#D7E4F6]">
          <div className="flex gap-6" role="tablist" aria-label="Filter videos">
            {filters.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={filter === key}
                onClick={() => setFilter(key)}
                className={`border-b-2 pb-3 text-sm font-medium transition ${
                  filter === key
                    ? "border-[#0E4E9F] text-[#0B1022]"
                    : "border-transparent text-[#4A5874] hover:text-[#0B1022]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="hidden pb-3 text-xs text-[#4A5874] sm:block">
            {shown?.length ?? 0} videos
          </p>
        </div>

        {error && (
          <p role="alert" className="mt-5 rounded-xl border border-[#ead8d5] bg-[#faf1f0] px-4 py-3 text-sm text-[#80514c]">
            {error}
          </p>
        )}

        {videos && shown?.length === 0 && (
          <div className="mt-6 rounded-2xl border border-dashed border-[#D7E4F6] bg-[#FAFBFE] px-6 py-16 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#EDF4FD] text-[#0E4E9F]">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-6 w-6">
                <rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.7" />
                <path d="m10 9 5 3-5 3V9Z" fill="currentColor" />
              </svg>
            </div>
            <h2 className="mt-4 font-semibold text-[#0B1022]">
              {filter === "all" ? "No videos yet" : "No videos in this view"}
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#4A5874]">
              Upload a video to begin secure processing and playback.
            </p>
            <Link
              href="/upload"
              className="mt-5 inline-flex h-10 items-center justify-center rounded-xl bg-[#0E4E9F] px-4 text-sm font-medium text-white hover:bg-[#0b4288]"
            >
              Upload video
            </Link>
          </div>
        )}

        {!videos && !error && (
          <div aria-label="Loading videos" className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="overflow-hidden rounded-2xl border border-[#D7E4F6] bg-[#FAFBFE]">
                <div className="aspect-video animate-pulse bg-[#D8EAFD]" />
                <div className="space-y-3 p-4">
                  <div className="h-3 w-3/4 animate-pulse rounded bg-[#D7E4F6]" />
                  <div className="h-5 w-20 animate-pulse rounded-full bg-[#EDF4FD]" />
                </div>
              </div>
            ))}
          </div>
        )}

        {shown && shown.length > 0 && (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((video) => {
              const badge = statusBadge(video);
              const content = (
                <div className="overflow-hidden rounded-2xl border border-[#D7E4F6] bg-[#FAFBFE] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_35px_rgba(37,38,43,0.07)]">
                  <div className="relative aspect-video overflow-hidden bg-gradient-to-br from-[#D8EAFD] to-[#EAF4FE]">
                    {video.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={video.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <>
                        <div className="absolute -right-[8%] -top-[30%] h-[110%] w-[65%] rotate-12 rounded-[45%] bg-white/40" />
                        <div className="absolute bottom-[12%] left-[8%] h-[32%] w-[52%] rounded-sm border border-white/50 bg-[#0E4E9F]/50 shadow-xl" />
                        <span className="absolute left-1/2 top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-[#0B1022] shadow-lg">
                          <svg aria-hidden="true" viewBox="0 0 24 24" className="ml-0.5 h-4 w-4">
                            <path d="M8 5v14l11-7L8 5Z" fill="currentColor" />
                          </svg>
                        </span>
                      </>
                    )}
                    <span className={`absolute left-3 top-3 inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${badgeStyles[video.status]}`}>
                      {badge.text}
                    </span>
                    {video.durationSec != null && (
                      <span className="absolute bottom-3 right-3 rounded-md bg-[#0B1022]/75 px-1.5 py-0.5 text-[10px] font-medium text-white">
                        {fmtDuration(video.durationSec)}
                      </span>
                    )}
                  </div>
                  {(video.status === "processing" || video.status === "uploading" || video.status === "uploaded") && (
                    <div className="h-1 overflow-hidden bg-[#D7E4F6]">
                      <div className="h-full bg-[#0E4E9F] transition-all" style={{ width: `${video.progress}%` }} />
                    </div>
                  )}
                  <div className="p-4">
                    <h2 className="truncate text-sm font-semibold tracking-[-0.01em] text-[#0B1022]">
                      {video.title}
                    </h2>
                    {video.error && <p className="mt-2 text-xs text-[#89534f]">{video.error}</p>}
                    <p className="mt-2 text-xs text-[#4A5874]">
                      {video.status === "ready" ? "Ready to play" : "Video status"}
                    </p>
                  </div>
                </div>
              );
              return video.status === "ready" ? (
                <Link key={video.id} href={`/videos/${video.id}`} className="block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E4E9F]">
                  {content}
                </Link>
              ) : (
                <div key={video.id}>{content}</div>
              );
            })}
          </div>
        )}
      </main>
    </DashboardShell>
  );
}
