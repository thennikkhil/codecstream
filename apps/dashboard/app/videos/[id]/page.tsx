"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { authClient } from "@/lib/auth-client";
import { api, ApiError } from "@/lib/api";
import { SecuritySettings } from "@/components/SecuritySettings";
import { AiPanel } from "@/components/AiPanel";
import { Player } from "@/components/Player";
import { fmtDuration, isBusy, statusBadge, type VideoDto } from "@/lib/types";

export default function VideoPage() {
  return (
    <Suspense fallback={<main className="mx-auto mt-12 max-w-4xl p-4 text-sm text-[#4A5874]">Loading video...</main>}>
      <VideoDetails />
    </Suspense>
  );
}

function VideoDetails() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [video, setVideo] = useState<VideoDto | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isPending && !session) router.push("/login");
  }, [isPending, session, router]);

  const busy = video ? isBusy(video.status) : true;
  useEffect(() => {
    if (!session || !id) return;
    let cancelled = false;
    const load = async () => {
      try {
        const v = await api<VideoDto>("GET", `/videos/${id}`);
        if (!cancelled) setVideo(v);
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError && e.status === 404 ? "Video not found." : "Could not load this video.");
      }
    };
    void load();
    if (!busy) return () => void (cancelled = true);
    const t = setInterval(load, 2000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [session, id, busy]);

  const badge = video ? statusBadge(video) : null;

  return (
    <DashboardShell>
      <main className="mx-auto w-full max-w-[1180px] px-5 pb-28 pt-8 sm:px-8 sm:pt-10">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-xs font-medium text-[#4A5874] hover:text-[#0B1022]">
          <span aria-hidden="true">&larr;</span> Back to library
        </Link>
        {error && <p role="alert" className="mt-5 rounded-xl border border-[#ead8d5] bg-[#faf1f0] px-4 py-3 text-sm text-[#80514c]">{error}</p>}
        {video && badge && (
          <>
            <header className="mt-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <h1 className="text-2xl font-semibold tracking-[-0.035em] text-[#0B1022] sm:text-[30px]">{video.title}</h1>
                <div className="mt-3 flex items-center gap-3">
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${video.status === "ready" ? "bg-[#edf4ef] text-[#486451]" : "bg-[#EDF4FD] text-[#4A5874]"}`}>
                    {badge.text}
                  </span>
                  {video.durationSec != null && <span className="text-xs text-[#4A5874]">{fmtDuration(video.durationSec)}</span>}
                </div>
              </div>
            </header>
            <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_350px]">
              <div className="min-w-0">
                {video.playbackUrl ? (
                  <Player src={video.playbackUrl} videoId={video.id} />
                ) : video.status === "ready" ? (
                  <p className="rounded-2xl border border-[#D7E4F6] bg-[#FAFBFE] p-5 text-sm text-[#7a6740]">Ready, but the CDN address is not configured on the API yet.</p>
                ) : video.status === "failed" ? (
                  <p className="rounded-2xl border border-[#ead8d5] bg-[#faf1f0] p-5 text-sm text-[#80514c]">Processing failed: {video.error ?? "unknown error"}</p>
                ) : (
                  <p className="rounded-2xl border border-[#D7E4F6] bg-[#FAFBFE] p-5 text-sm text-[#4A5874]">This video is still being prepared. It will appear here when it is ready.</p>
                )}
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-[#D7E4F6] bg-[#FAFBFE] p-4">
                    <p className="text-[10px] uppercase tracking-wider text-[#4A5874]">Duration</p>
                    <p className="mt-2 text-sm font-semibold text-[#0B1022]">{fmtDuration(video.durationSec) || "Not available"}</p>
                  </div>
                  <div className="rounded-xl border border-[#D7E4F6] bg-[#FAFBFE] p-4">
                    <p className="text-[10px] uppercase tracking-wider text-[#4A5874]">Resolutions</p>
                    <p className="mt-2 text-sm font-semibold text-[#0B1022]">
                      {video.renditions.length > 0 ? video.renditions.map((rendition) => rendition.name).reverse().join(" · ") : "Preparing"}
                    </p>
                  </div>
                </div>
              </div>
              {video.playbackUrl && (
                <aside>
                  <SecuritySettings video={video} onChange={setVideo} />
                  <div className="mt-6">
                    <AiPanel videoId={video.id} />
                  </div>
                </aside>
              )}
            </div>
          </>
        )}
      </main>
    </DashboardShell>
  );
}
