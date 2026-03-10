import { loadBuffer, getAudioContext as getSdAudioContext } from 'superdough';
import { registerSampleForPlayback } from './engine';
import type { SampleEntry } from './sampleApi';

const MAX_CACHE = 50;
const loaded = new Set<string>();

function evictIfNeeded(): void {
  if (loaded.size >= MAX_CACHE) {
    const oldest = loaded.values().next().value as string;
    loaded.delete(oldest);
  }
}

/**
 * DFS through the sample tree to find all file-type siblings of `currentPath`
 * (i.e., all files in the same parent folder). Falls back to root-level files
 * if the path has no parent folder in the tree.
 */
export function findSiblings(currentPath: string, tree: SampleEntry[]): SampleEntry[] {
  if (!currentPath) return [];

  function walk(entries: SampleEntry[]): SampleEntry[] | null {
    for (const entry of entries) {
      if (entry.type === 'folder' && entry.children) {
        const hasDirectChild = entry.children.some(
          (c) => c.type === 'file' && c.path === currentPath
        );
        if (hasDirectChild) {
          return entry.children.filter((c) => c.type === 'file');
        }
        const found = walk(entry.children);
        if (found !== null) return found;
      }
    }
    return null;
  }

  const siblings = walk(tree);
  if (!siblings) {
    // Fallback: root-level files
    return tree.filter((e) => e.type === 'file');
  }
  return siblings;
}

/**
 * Register and pre-decode a sample into superdough's buffer cache.
 * Skips silently if already loaded. Fire-and-forget safe.
 */
export async function preloadSample(path: string): Promise<void> {
  if (loaded.has(path)) return;
  evictIfNeeded();
  loaded.add(path);
  try {
    const sdKey = registerSampleForPlayback(path);
    const ac = getSdAudioContext();
    if (!ac) { loaded.delete(path); return; }
    const base = window.location.origin + import.meta.env.BASE_URL;
    await loadBuffer(`${base}${path}`, ac, sdKey, 0);
  } catch {
    loaded.delete(path); // don't count failed loads
  }
}

/**
 * Pre-decode a custom sample (blob URL) into superdough's buffer cache.
 * Key must already be registered in superdough's soundMap before calling this.
 */
export async function preloadCustomSample(key: string, blobUrl: string): Promise<void> {
  if (loaded.has(key)) return;
  loaded.add(key);
  try {
    const ac = getSdAudioContext();
    if (!ac) { loaded.delete(key); return; }
    await loadBuffer(blobUrl, ac, key, 0);
  } catch {
    loaded.delete(key);
  }
}

/**
 * Fire-and-forget: preload `count` siblings before and after `currentPath`
 * so that scroll-browsing feels instantaneous.
 */
export function preloadNeighbors(
  currentPath: string,
  tree: SampleEntry[],
  count = 5
): void {
  const siblings = findSiblings(currentPath, tree);
  const idx = siblings.findIndex((s) => s.path === currentPath);
  if (idx === -1) return;

  for (let i = 1; i <= count; i++) {
    if (idx + i < siblings.length) preloadSample(siblings[idx + i].path);
    if (idx - i >= 0) preloadSample(siblings[idx - i].path);
  }
}
