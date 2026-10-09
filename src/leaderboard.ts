/**
 * Local leaderboard stored in this browser (localStorage). GitHub Pages is
 * static hosting, so there is no server to share scores through. To make it
 * global, replace these functions with calls to a hosted backend (Supabase,
 * Firebase, a Cloudflare Worker...) keeping the same signatures.
 */
export interface Entry {
  name: string;
  time: number;
  best: number;
  place: number;
  date: number;
}

const KEY = 'junglegt.leaderboard.v1';
const NAME_KEY = 'junglegt.name';
const MAX = 20;

export function loadEntries(): Entry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as Entry[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Adds an entry and returns its 1-based rank, or 0 if it did not make the board. */
export function addEntry(e: Entry): number {
  const list = [...loadEntries(), e].sort((a, b) => a.time - b.time).slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable: score is simply not kept */
  }
  return list.indexOf(e) + 1;
}

export function clearEntries(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? 'PLAYER';
  } catch {
    return 'PLAYER';
  }
}

export function saveName(n: string): void {
  try {
    localStorage.setItem(NAME_KEY, n);
  } catch {
    /* ignore */
  }
}
