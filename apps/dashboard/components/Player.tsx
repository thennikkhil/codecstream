"use client";
import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { api, ApiError } from "@/lib/api";

const deviceId = () => {
  let d = localStorage.getItem("cs-device");
  if (!d) localStorage.setItem("cs-device", (d = crypto.randomUUID()));
  return d;
};

interface TokenRes {
  token: string;
  watermark: string | null;
  resumeAt: number;
}

export function Player({ src, videoId }: { src: string; videoId: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const tokenRef = useRef("");
  const [levels, setLevels] = useState<{ index: number; label: string }[]>([]);
  const [selected, setSelected] = useState(-1);
  const [activeHeight, setActiveHeight] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [takeover, setTakeover] = useState(false);
  const [mark, setMark] = useState<string | null>(null);
  const [pos, setPos] = useState({ x: 10, y: 10 });

  useEffect(() => {
    const video = videoRef.current!;
    let dead = false;
    let beat: ReturnType<typeof setInterval> | undefined;
    let hls: Hls | undefined;
    (async () => {
      try {
        const t = await api<TokenRes>("POST", `/videos/${videoId}/playback-token`, {
          deviceId: deviceId(),
          takeover,
        });
        if (dead) return;
        setError("");
        setBlocked(false);
        tokenRef.current = t.token;
        setMark(t.watermark);
        if (!Hls.isSupported()) return setError("This browser cannot play protected video.");

        hls = new Hls({
          startPosition: t.resumeAt > 5 ? t.resumeAt : -1,
          // Playlists and segments come from the CDN. Only the key request carries the token.
          xhrSetup: (xhr, url) => {
            if (url.includes("/api/keys/")) xhr.setRequestHeader("Authorization", `Bearer ${tokenRef.current}`);
          },
        });
        hlsRef.current = hls;
        hls.on(Hls.Events.MANIFEST_PARSED, () =>
          setLevels(hls!.levels.map((l, i) => ({ index: i, label: `${l.height}p` })).reverse()),
        );
        hls.on(Hls.Events.LEVEL_SWITCHED, (_e, d) => setActiveHeight(hls!.levels[d.level]?.height ?? null));
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (!data.fatal) return;
          if (data.details === Hls.ErrorDetails.KEY_LOAD_ERROR) {
            setError("The key for this video was refused. It may be playing on another device, or you lack access.");
            hls!.destroy();
          } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls!.startLoad();
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls!.recoverMediaError();
          else {
            setError("Playback failed.");
            hls!.destroy();
          }
        });
        hls.loadSource(src);
        hls.attachMedia(video);

        // Heartbeat: keeps this device's claim alive, saves progress, refreshes the 5-minute token.
        beat = setInterval(async () => {
          try {
            const r = await api<{ token: string }>("POST", "/playback/heartbeat", {
              videoId,
              deviceId: deviceId(),
              positionSec: video.currentTime,
            });
            tokenRef.current = r.token;
          } catch (e) {
            if (e instanceof ApiError && e.status === 409) {
              video.pause();
              hls?.destroy();
              clearInterval(beat);
              setBlocked(true);
            }
          }
        }, 10_000);
      } catch (e) {
        if (dead) return;
        if (e instanceof ApiError && e.status === 409) setBlocked(true);
        else {
          setBlocked(false);
          setError("Could not start playback.");
        }
      }
    })();

    return () => {
      dead = true;
      clearInterval(beat);
      hls?.destroy();
      hlsRef.current = null;
    };
  }, [src, videoId, takeover]);

  // The watermark drifts to a new spot every few seconds.
  useEffect(() => {
    if (!mark) return;
    const t = setInterval(() => setPos({ x: 5 + Math.random() * 55, y: 8 + Math.random() * 78 }), 6000);
    return () => clearInterval(t);
  }, [mark]);

  return (
    <div className="space-y-2">
      {/* Fullscreen is on this box, not the <video>, so the watermark stays visible. */}
      <div ref={boxRef} className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-[0_20px_50px_rgba(11,16,34,0.16)]">
        <video
          ref={videoRef}
          controls
          playsInline
          controlsList="nofullscreen noremoteplayback"
          disablePictureInPicture
          className="h-full w-full"
        />
        {mark && !blocked && (
          <span
            className="pointer-events-none absolute select-none text-sm font-medium text-white/40 transition-all duration-[6000ms] ease-linear"
            style={{ left: `${pos.x}%`, top: `${pos.y}%`, textShadow: "0 0 4px rgba(0,0,0,.6)" }}
          >
            {mark}
          </span>
        )}
        {blocked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/90 p-4 text-center text-white">
            <p>This video is playing on another device.</p>
            <button className="rounded bg-blue-600 px-3 py-1" onClick={() => setTakeover(true)}>
              Play here instead
            </button>
          </div>
        )}
      </div>
      {error && <p className="rounded-xl border border-[#ead8d5] bg-[#faf1f0] px-4 py-3 text-sm text-[#80514c]">{error}</p>}
      <div className="flex items-center gap-3 text-sm text-[#4A5874]">
        {levels.length > 0 && (
          <>
            <label htmlFor="quality">Quality</label>
            <select
              id="quality"
              value={selected}
              onChange={(e) => {
                const i = Number(e.target.value);
                setSelected(i);
                if (hlsRef.current) hlsRef.current.currentLevel = i;
              }}
              className="rounded-lg border border-[#D7E4F6] bg-[#FAFBFE] px-2 py-1.5 text-xs"
            >
              <option value={-1}>Auto{selected === -1 && activeHeight ? ` (${activeHeight}p)` : ""}</option>
              {levels.map((l) => (
                <option key={l.index} value={l.index}>
                  {l.label}
                </option>
              ))}
            </select>
          </>
        )}
        <button className="rounded-lg border border-[#D7E4F6] bg-[#FAFBFE] px-3 py-1.5 text-xs" onClick={() => boxRef.current?.requestFullscreen()}>
          Fullscreen
        </button>
      </div>
    </div>
  );
}
