'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { SearchResults, type Match } from './SearchResults';

interface Chunk {
  startSec: number;
  endSec: number;
  text: string;
}
interface Transcript {
  status: string;
  error: string | null;
  chunks: Chunk[];
}

const seek = (t: number) => window.dispatchEvent(new CustomEvent('cs-seek', { detail: t }));
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function AiPanel({ videoId }: { videoId: string }) {
  const [t, setT] = useState<Transcript | null>(null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Match[] | null>(null);

  // The transcript is built after the video is Ready, so poll until it finishes.
  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const r = await api<Transcript>('GET', `/videos/${videoId}/transcript`);
        if (stop) return;
        setT(r);
        if (r.status === 'processing' || r.status === 'none') setTimeout(load, 4000);
      } catch {
        /* leave the panel empty */
      }
    };
    void load();
    return () => void (stop = true);
  }, [videoId]);

  async function search() {
    if (q.trim().length < 2) return;
    try {
      setHits(
        (
          await api<{ results: Match[] }>(
            'GET',
            `/videos/${videoId}/search?q=${encodeURIComponent(q)}`,
          )
        ).results,
      );
    } catch {
      setHits([]);
    }
  }

  if (!t) return null;
  if (t.status !== 'ready') {
    return (
      <section className="rounded-lg border border-neutral-500/40 p-4 text-sm opacity-70">
        {t.status === 'failed'
          ? `Transcript failed: ${t.error ?? 'unknown error'}`
          : 'Preparing transcript…'}
      </section>
    );
  }
  return (
    <section className="space-y-4 rounded-lg border border-neutral-500/40 p-4 text-sm">
      <div className="space-y-2">
        <h2 className="font-medium">Search the transcript</h2>
        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="Where is … mentioned?"
            maxLength={200}
            className="flex-1 rounded border border-neutral-500/50 bg-transparent px-3 py-2"
          />
          <button onClick={search} className="rounded border px-3 py-2">
            Search
          </button>
        </div>
        {hits && <SearchResults hits={hits} />}
      </div>
      <details>
        <summary className="cursor-pointer font-medium">Full transcript</summary>
        <div className="mt-2 space-y-1">
          {t.chunks.map((c) => (
            <p key={c.startSec}>
              <button className="underline" onClick={() => seek(c.startSec)}>
                {mmss(c.startSec)}
              </button>{' '}
              {c.text}
            </p>
          ))}
        </div>
      </details>
    </section>
  );
}
