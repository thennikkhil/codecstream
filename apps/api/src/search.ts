export interface Word { t: number; w: string }
export interface ChunkRow { startSec: number; endSec: number; text: string; words?: Word[] }
export interface Match { t: number; before: string; match: string; after: string }

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
// Exact match, or a shared prefix covering 80% of the shorter word ("opportunity" ~ "opportunities").
const same = (a: string, b: string) => {
  if (a === b) return true;
  const m = Math.min(a.length, b.length);
  if (m < 4) return false;
  let k = 0;
  while (k < m && a[k] === b[k]) k++;
  return k >= Math.ceil(m * 0.8);
};

/** Find the exact words in a transcript. Phrase first; if none, any single term. */
export function findMatches(chunks: ChunkRow[], query: string, limit = 8, context = 7): Match[] {
  const terms = query.split(/\s+/).map(norm).filter(Boolean);
  if (!terms.length) return [];

  const all: Word[] = [];
  for (const c of chunks) {
    // Older transcripts have no per-word times: estimate them across the chunk.
    const ws = c.words?.length
      ? c.words
      : c.text.split(/\s+/).filter(Boolean).map((w, i, a) => ({ w, t: c.startSec + (i / a.length) * (c.endSec - c.startSec) }));
    all.push(...ws);
  }
  const keys = all.map((x) => norm(x.w));

  const hits: { i: number; len: number }[] = [];
  for (let i = 0; i < keys.length; i++) {
    if (terms.every((t, j) => keys[i + j] !== undefined && same(keys[i + j], t))) hits.push({ i, len: terms.length });
  }
  if (!hits.length && terms.length > 1) {
    for (let i = 0; i < keys.length; i++) if (terms.some((t) => same(keys[i], t))) hits.push({ i, len: 1 });
  }

  const join = (a: number, b: number) => all.slice(Math.max(0, a), b).map((x) => x.w).join(" ");
  return hits.slice(0, limit).map(({ i, len }) => ({
    t: all[i].t,
    before: join(i - context, i),
    match: join(i, i + len),
    after: join(i + len, i + len + context),
  }));
}
