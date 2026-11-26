"use client";

export interface Match { t: number; before: string; match: string; after: string }

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function SearchResults({ hits }: { hits: Match[] }) {
  if (!hits.length) return <p className="text-sm opacity-60">No matches.</p>;
  return (
    <ul className="space-y-1">
      {hits.map((h, i) => (
        <li key={i}>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("cs-seek", { detail: Math.max(0, h.t - 1) }))}
            className="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[#EDF4FD]"
          >
            <span className="mr-2 font-medium underline">{mmss(h.t)}</span>
            <span className="opacity-70">…{h.before} </span>
            <mark className="rounded bg-[#FFF1A8] px-0.5 text-inherit">{h.match}</mark>
            <span className="opacity-70"> {h.after}…</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
