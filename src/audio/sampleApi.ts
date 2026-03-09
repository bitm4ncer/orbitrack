export interface SampleEntry {
  name: string;
  path: string;
  type: 'folder' | 'file';
  children?: SampleEntry[];
}

let cachedTree: SampleEntry[] | null = null;

export async function fetchSampleTree(): Promise<SampleEntry[]> {
  if (cachedTree) return cachedTree;

  const res = await fetch(import.meta.env.BASE_URL + 'samples.json');
  if (!res.ok) throw new Error('Failed to fetch sample tree');
  cachedTree = await res.json();
  return cachedTree!;
}

export function invalidateSampleCache(): void {
  cachedTree = null;
}
