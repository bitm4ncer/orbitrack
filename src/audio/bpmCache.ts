/**
 * Persistent BPM cache — stores detected BPM values per loop path
 * in localStorage so they're instantly available on next load.
 */

const STORAGE_KEY = 'orbitrack-bpm-cache';

let cache: Record<string, number> | null = null;

function load(): Record<string, number> {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cache = raw ? JSON.parse(raw) : {};
  } catch {
    cache = {};
  }
  return cache!;
}

function save(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

/** Get cached BPM for a loop path. Returns 0 if not cached. */
export function getCachedBpm(path: string): number {
  return load()[path] ?? 0;
}

/** Store detected BPM for a loop path. */
export function setCachedBpm(path: string, bpm: number): void {
  if (bpm <= 0) return;
  load()[path] = Math.round(bpm * 10) / 10; // 1 decimal precision
  save();
}

/** Get the entire cache (for UI display). */
export function getAllCachedBpms(): Record<string, number> {
  return { ...load() };
}
