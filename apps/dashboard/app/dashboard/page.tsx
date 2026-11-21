"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { fmtDuration, isBusy, statusBadge, type VideoDto } from "@/lib/types";

export default function LibraryPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [videos, setVideos] = useState<VideoDto[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isPending && !session) router.push("/login");
  }, [isPending, session, router]);

  // Load once, then poll every 2 seconds only while something is still in flight.
  const busy = videos?.some((v) => isBusy(v.status)) ?? false;
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
    const t = setInterval(load, 2000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [session, busy]);

  return (
    <main className="mx-auto mt-12 max-w-5xl space-y-6 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your videos</h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="opacity-70">{session?.user.email}</span>
          <Link href="/upload" className="rounded bg-blue-600 px-3 py-1 text-white">
            Upload
          </Link>
          <button
            className="rounded border px-3 py-1"
            onClick={() => authClient.signOut().then(() => router.push("/login"))}
          >
            Sign out
          </button>
        </div>
      </header>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {videos && videos.length === 0 && <p className="opacity-70">No videos yet. Upload your first one.</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {videos?.map((v) => {
          const b = statusBadge(v);
          const card = (
            <div className="overflow-hidden rounded-lg border border-neutral-500/40">
              <div className="relative aspect-video bg-neutral-500/20">
                {v.thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                )}
                <span className={`absolute left-2 top-2 rounded px-2 py-0.5 text-xs text-white ${b.cls}`}>
                  {b.text}
                </span>
                {v.durationSec != null && (
                  <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">
                    {fmtDuration(v.durationSec)}
                  </span>
                )}
              </div>
              {v.status === "processing" && (
                <div className="h-1 w-full bg-neutral-500/30">
                  <div className="h-full bg-blue-600 transition-all" style={{ width: `${v.progress}%` }} />
                </div>
              )}
              <div className="p-3">
                <p className="truncate font-medium">{v.title}</p>
                {v.error && <p className="mt-1 text-xs text-red-500">{v.error}</p>}
              </div>
            </div>
          );
          return v.status === "ready" ? (
            <Link key={v.id} href={`/videos/${v.id}`}>
              {card}
            </Link>
          ) : (
            <div key={v.id}>{card}</div>
          );
        })}
      </div>
    </main>
  );
}
