export interface Rung {
  name: string;
  height: number;
  videoKbps: number;
  audioKbps: number;
}

export const LADDER: Rung[] = [
  { name: "1080p", height: 1080, videoKbps: 5000, audioKbps: 128 },
  { name: "720p", height: 720, videoKbps: 2800, audioKbps: 128 },
  { name: "480p", height: 480, videoKbps: 1400, audioKbps: 96 },
  { name: "360p", height: 360, videoKbps: 800, audioKbps: 96 },
];

/** Never upscale: keep only rungs at or below the source height. */
export function pickLadder(srcHeight: number): Rung[] {
  const rungs = LADDER.filter((r) => r.height <= srcHeight);
  if (rungs.length) return rungs;
  const h = Math.max(2, Math.floor(srcHeight / 2) * 2);
  return [{ name: `${h}p`, height: h, videoKbps: 800, audioKbps: 96 }];
}

/** Width that `scale=-2:height` produces for this source (even number). */
export function widthFor(srcW: number, srcH: number, height: number) {
  return Math.max(2, Math.round((srcW * height) / srcH / 2) * 2);
}

/** Peak bandwidth advertised in the master playlist (video maxrate + audio). */
export function peakBandwidth(r: Rung) {
  return Math.ceil((r.videoKbps * 1.1 + r.audioKbps) * 1000);
}
