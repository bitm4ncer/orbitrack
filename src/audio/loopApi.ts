import type { SampleEntry } from './sampleApi';

let cachedTree: SampleEntry[] | null = null;

export async function fetchLoopTree(): Promise<SampleEntry[]> {
  if (cachedTree) return cachedTree;

  const res = await fetch(import.meta.env.BASE_URL + 'loops.json');
  if (!res.ok) throw new Error('Failed to fetch loop tree');
  cachedTree = await res.json();
  return cachedTree!;
}

export function invalidateLoopCache(): void {
  cachedTree = null;
}
