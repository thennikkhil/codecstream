"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { api, ApiError } from "@/lib/api";
import { SecuritySettings } from "@/components/SecuritySettings";
import { Player } from "@/components/Player";
import { fmtDuration, isBusy, statusBadge, type VideoDto } from "@/lib/types";

export default function VideoPage() {
  return (
    <Suspense fallback={<main className="mx-auto mt-12 max-w-4xl p-4">Loading video…</main>}>
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
    <main className="mx-auto mt-12 max-w-4xl space-y-4 p-4">
      <Link href="/dashboard" className="text-sm underline">
        Back to library
      </Link>
      {error && <p className="text-red-500">{error}</p>}
      {video && badge && (
        <>
          <div className="flex items-center justify-between gap-3">
            <h1 className="truncate text-2xl font-semibold">{video.title}</h1>
            <span className={`shrink-0 rounded px-2 py-1 text-xs text-white ${badge.cls}`}>{badge.text}</span>
          </div>
          {video.playbackUrl ? (
            <>
              <Player src={video.playbackUrl} videoId={video.id} />
              <SecuritySettings video={video} onChange={setVideo} />
            </>
          ) : video.status === "ready" ? (
            <p className="text-amber-500">Ready, but the CDN address is not configured on the API yet.</p>
          ) : video.status === "failed" ? (
            <p className="text-red-500">Processing failed: {video.error ?? "unknown error"}</p>
          ) : (
            <p className="opacity-70">This video is still being prepared. It will appear here when it is ready.</p>
          )}
          <p className="text-sm opacity-70">
            {fmtDuration(video.durationSec)}
            {video.renditions.length > 0 && ` · ${video.renditions.map((r) => r.name).reverse().join(", ")}`}
          </p>
        </>
      )}
    </main>
  );
}
