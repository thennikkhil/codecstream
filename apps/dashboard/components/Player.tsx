"use client";
import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

interface LevelOption {
  index: number;
  label: string;
}

export function Player({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [levels, setLevels] = useState<LevelOption[]>([]);
  const [selected, setSelected] = useState(-1); // -1 = automatic
  const [activeHeight, setActiveHeight] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setError("");
    setLevels([]);
    setSelected(-1);

    if (Hls.isSupported()) {
      // Playlists and segments come from the CDN (plain GETs, no cookies).
      // The AES key URL inside the playlist points at our own origin, so the
      // browser sends the login cookie with it and the API decides who gets the key.
      const hls = new Hls();
      hlsRef.current = hls;

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLevels(hls.levels.map((l, i) => ({ index: i, label: `${l.height}p` })).reverse());
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, d) => setActiveHeight(hls.levels[d.level]?.height ?? null));
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        if (data.details === Hls.ErrorDetails.KEY_LOAD_ERROR) {
          setError("The key for this video was refused, so it cannot be played. You may not have access.");
          hls.destroy();
        } else if (data.type === Hls.ErrorType.NETWORK_ERROR) {
          hls.startLoad();
        } else if (data.type === Hls.ErrorType.MEDIA_ERROR) {
          hls.recoverMediaError();
        } else {
          setError("Playback failed.");
          hls.destroy();
        }
      });

      hls.loadSource(src);
      hls.attachMedia(video);
      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src; // native HLS fallback
    } else {
      setError("This browser cannot play HLS video.");
    }
  }, [src]);

  return (
    <div className="space-y-2">
      <video ref={videoRef} controls playsInline className="aspect-video w-full rounded bg-black" />
      {error && <p className="text-sm text-red-500">{error}</p>}
      {levels.length > 0 && (
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="quality">Quality</label>
          <select
            id="quality"
            value={selected}
            onChange={(e) => {
              const idx = Number(e.target.value);
              setSelected(idx);
              if (hlsRef.current) hlsRef.current.currentLevel = idx;
            }}
            className="rounded border border-neutral-500/50 bg-transparent px-2 py-1"
          >
            <option value={-1}>Auto{selected === -1 && activeHeight ? ` (${activeHeight}p)` : ""}</option>
            {levels.map((l) => (
              <option key={l.index} value={l.index}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
