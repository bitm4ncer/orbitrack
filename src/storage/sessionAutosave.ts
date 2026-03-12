/**
 * Auto-persists the current session to IndexedDB.
 *
 * Conditional: only runs after the user has saved manually at least once
 * (currentSetId is set). Writes directly to the real set ID, updating
 * or appending an autosave version entry.
 *
 * Settings stored in localStorage:
 *   orbeat:autosave:enabled  — "true" | "false" (default: "true")
 *   orbeat:autosave:interval — ms string (default: "3000")
 */

import { useStore, setOrbitCounter } from '../state/store';
import { put, get, del } from './idb';
import type { Instrument } from '../types/instrument';
import type { Effect } from '../types/effects';
import type { InstrumentScene } from '../types/scene';
import type { OrbeatSet, SetVersionEntry } from '../types/storage';
import { base64ToBlob, serializeSet } from './serializer';
import { registerSampleForPlayback } from '../audio/engine';
import { loadSample } from '../audio/sampler';
import { generateName } from '../utils/nameGenerator';
import { gzipAsync, toBase64Url, strToU8 } from './compressionUtils';

// Legacy autosave ID — used for migration only
const LEGACY_AUTOSAVE_ID = '__autosave__';

const MAX_VERSIONS = 50;

// ── localStorage helpers ────────────────────────────────────────────────────

export function getAutosaveEnabled(): boolean {
  return localStorage.getItem('orbeat:autosave:enabled') !== 'false';
}

export function setAutosaveEnabled(enabled: boolean): void {
  localStorage.setItem('orbeat:autosave:enabled', String(enabled));
}

export function getAutosaveInterval(): number {
  const raw = localStorage.getItem('orbeat:autosave:interval');
  const ms = raw ? parseInt(raw, 10) : 3000;
  return isNaN(ms) ? 3000 : ms;
}

export function setAutosaveInterval(ms: number): void {
  localStorage.setItem('orbeat:autosave:interval', String(ms));
}

export function getLastSetId(): string | null {
  return localStorage.getItem('orbeat:lastSetId');
}

export function setLastSetId(id: string | null): void {
  if (id) localStorage.setItem('orbeat:lastSetId', id);
  else localStorage.removeItem('orbeat:lastSetId');
}

// ── Legacy autosave data (for migration) ────────────────────────────────────

interface LegacyAutosaveData {
  id: string;
  version: 1;
  meta: { id: string; name: string; createdAt: number; updatedAt: number };
  bpm: number;
  masterVolume: number;
  instruments: Instrument[];
  gridNotes: Record<string, number[][]>;
  gridGlide: Record<string, boolean[]>;
  gridLengths: Record<string, number[]>;
  instrumentEffects: Record<string, Effect[]>;
  masterEffects?: Effect[];
  scenes?: InstrumentScene[];
  sceneEffects?: Record<string, Effect[]>;
  gridResolution?: number;
  scaleRoot?: number;
  scaleType?: string;
  trackMode?: boolean;
  arrangement?: { id: string; sceneId: string; bars: number }[];
  customSampleBlobs?: { key: string; name: string; mimeType: string; base64: string }[];
}

// ── Blob URL helpers ────────────────────────────────────────────────────────

async function blobUrlToBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  const resp = await fetch(url);
  const blob = await resp.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const [header, data] = dataUrl.split(',');
      const mimeType = header.match(/data:(.*?);/)?.[1] ?? 'audio/wav';
      resolve({ base64: data, mimeType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ── Snapshot helper ─────────────────────────────────────────────────────────

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function createSnapshot(set: OrbeatSet): Promise<string> {
  // Strip versions from the snapshot to avoid nesting
  const { versions: _, ...setWithoutVersions } = set;
  const json = JSON.stringify(setWithoutVersions);
  const compressed = await gzipAsync(strToU8(json));
  return toBase64Url(compressed);
}

// ── Core autosave ───────────────────────────────────────────────────────────

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

async function saveSession(): Promise<void> {
  const s = useStore.getState();
  let setId = s.currentSetId;

  // Auto-create a session ID so unsaved projects also persist across reloads
  if (!setId) {
    setId = '__session__' + uid();
    useStore.setState({ currentSetId: setId });
    setLastSetId(setId);
  }

  // Serialize current state
  let customSampleBlobs: { key: string; name: string; mimeType: string; base64: string }[] | undefined;
  if (s.customSamples.length > 0) {
    try {
      customSampleBlobs = await Promise.all(
        s.customSamples.map(async (cs) => {
          const { base64, mimeType } = await blobUrlToBase64(cs.url);
          return { key: cs.key, name: cs.name, mimeType, base64 };
        }),
      );
    } catch {
      customSampleBlobs = undefined;
    }
  }

  const serState = s.getSerializableState();
  const set = await serializeSet(serState, {
    name: s.currentSetName,
    embedSamples: true,
    includeInstruments: true,
    includeEffects: true,
    includeSynthParams: true,
  });

  // Override the set ID to match the existing saved set
  set.id = setId;
  set.meta.id = setId;

  // If custom samples were serialized via blobUrlToBase64, use those
  // (serializeSet may have failed to convert stale blob URLs)
  if (customSampleBlobs) {
    set.customSamples = customSampleBlobs;
  }

  // Load existing set to preserve its thumbnail and versions
  const existing = await get<OrbeatSet>('sets', setId);
  if (existing?.meta?.thumbnail) {
    set.meta.thumbnail = existing.meta.thumbnail;
  }
  const versions = existing?.versions ?? [];

  // Create autosave version entry
  const snapshot = await createSnapshot(set);
  const entry: SetVersionEntry = {
    versionId: uid(),
    timestamp: Date.now(),
    source: 'autosave',
    snapshot,
  };

  // If the latest version is an autosave, replace it; otherwise append
  if (versions.length > 0 && versions[0].source === 'autosave') {
    versions[0] = entry;
  } else {
    versions.unshift(entry);
  }

  // Cap versions
  if (versions.length > MAX_VERSIONS) {
    versions.length = MAX_VERSIONS;
  }

  set.versions = versions;
  set.meta.versionCount = versions.length;
  set.meta.updatedAt = Date.now();

  await put('sets', set);
}

function debouncedSave(): void {
  const enabled = getAutosaveEnabled();
  if (!enabled) return;

  if (debounceTimer) clearTimeout(debounceTimer);
  const interval = getAutosaveInterval();
  debounceTimer = setTimeout(() => {
    saveSession().catch((e) => console.error('[autosave] save failed:', e));
  }, interval);
}

// ── Restore ─────────────────────────────────────────────────────────────────

/**
 * Restore a saved set by ID from IndexedDB.
 * Used on app startup when lastSetId is available.
 */
export async function restoreFromSetId(setId: string): Promise<boolean> {
  try {
    const set = await get<OrbeatSet>('sets', setId);
    if (!set || !set.instruments || set.instruments.length === 0) return false;

    useStore.getState().loadSet(set);
    return true;
  } catch (err) {
    console.error('[autosave] restore from set ID failed:', err);
    return false;
  }
}

/**
 * Try to restore the legacy __autosave__ session (migration path).
 * Returns true if restored. Deletes the legacy entry after successful restore.
 */
export async function restoreLegacyAutosave(): Promise<boolean> {
  try {
    const data = await get<LegacyAutosaveData>('sets', LEGACY_AUTOSAVE_ID);
    if (!data || !data.instruments || data.instruments.length === 0) return false;

    // Reconstruct custom samples from stored blobs
    const customSamples: { key: string; url: string; name: string }[] = [];
    if (data.customSampleBlobs) {
      for (const cs of data.customSampleBlobs) {
        const blob = base64ToBlob(cs.base64, cs.mimeType);
        const url = URL.createObjectURL(blob);
        registerSampleForPlayback(cs.key, url);
        loadSample(cs.key, url);
        customSamples.push({ key: cs.key, url, name: cs.name });
      }
    }

    // Re-register non-custom samples referenced by instruments
    for (const inst of data.instruments) {
      if ((inst.type === 'sampler' || inst.type === 'looper') && inst.samplePath) {
        const isCustom = customSamples.some((c) => c.key === inst.samplePath);
        if (!isCustom) {
          registerSampleForPlayback(inst.samplePath);
          loadSample(inst.samplePath, inst.samplePath);
        }
      }
    }

    // Restore orbit counter
    const maxOrbit = data.instruments.reduce((max, i) => Math.max(max, i.orbitIndex + 1), 0);

    useStore.setState({
      bpm: data.bpm,
      masterVolume: data.masterVolume,
      instruments: data.instruments,
      gridNotes: data.gridNotes,
      gridGlide: data.gridGlide ?? {},
      gridLengths: data.gridLengths ?? {},
      instrumentEffects: data.instrumentEffects ?? {},
      masterEffects: data.masterEffects ?? [],
      scenes: data.scenes ?? [],
      sceneEffects: data.sceneEffects ?? {},
      gridResolution: data.gridResolution ?? 1,
      scaleRoot: data.scaleRoot ?? 0,
      scaleType: data.scaleType ?? 'chromatic',
      trackMode: data.trackMode ?? false,
      arrangement: data.arrangement ?? [],
      trackPosition: (data.trackMode && data.arrangement?.length) ? 0 : -1,
      customSamples,
      currentSetName: (data.meta?.name && data.meta.name !== 'Untitled') ? data.meta.name : generateName(),
      selectedInstrumentId: data.instruments[0]?.id ?? null,
    });

    setOrbitCounter(maxOrbit);

    // Re-init looper editors — async decode + BPM detection
    const baseUrl = ((import.meta.env.BASE_URL as string) ?? '/').replace(/\/$/, '') + '/';
    for (const inst of data.instruments) {
      if (inst.type === 'looper' && inst.samplePath) {
        const custom = customSamples.find((c) => c.key === inst.samplePath);
        let url: string | null;
        if (custom) {
          url = custom.url;
        } else if (inst.samplePath.startsWith('blob:') || inst.samplePath.startsWith('http')) {
          url = inst.samplePath;
        } else if (inst.samplePath.startsWith('__recorded_input__/') || inst.samplePath.startsWith('__imported__/')) {
          console.warn('[autosave] skipping looper without embedded audio:', inst.samplePath);
          url = null;
        } else {
          url = baseUrl + inst.samplePath;
        }
        if (!url) continue;
        try {
          const ctx = new AudioContext();
          fetch(url)
            .then((r) => {
              if (!r.ok) throw new Error(`fetch failed: ${r.status} ${r.statusText}`);
              const ct = r.headers.get('content-type') ?? '';
              if (ct.includes('text/html')) throw new Error('got HTML instead of audio');
              return r.arrayBuffer();
            })
            .then((buf) => {
              if (buf.byteLength === 0) throw new Error('empty response');
              return ctx.decodeAudioData(buf);
            })
            .then((decoded) => useStore.getState().initLooperEditor(inst.id, decoded))
            .catch((e) => console.error('[autosave] looper decode failed:', e));
        } catch (e) {
          console.error('[autosave] looper re-init failed:', e);
        }
      }
    }

    // Delete legacy autosave entry after successful restore
    await del('sets', LEGACY_AUTOSAVE_ID).catch(() => {});

    return true;
  } catch (err) {
    console.error('Failed to restore legacy autosave:', err);
    return false;
  }
}

// ── Init ────────────────────────────────────────────────────────────────────

/**
 * Subscribe to store changes and auto-save on mutations.
 * Call once on app startup.
 */
export function initSessionAutosave(): void {
  useStore.subscribe(
    (state, prevState) => {
      if (
        state.bpm !== prevState.bpm ||
        state.masterVolume !== prevState.masterVolume ||
        state.instruments !== prevState.instruments ||
        state.gridNotes !== prevState.gridNotes ||
        state.gridGlide !== prevState.gridGlide ||
        state.gridLengths !== prevState.gridLengths ||
        state.instrumentEffects !== prevState.instrumentEffects ||
        state.masterEffects !== prevState.masterEffects ||
        state.scenes !== prevState.scenes ||
        state.sceneEffects !== prevState.sceneEffects ||
        state.customSamples !== prevState.customSamples ||
        state.currentSetName !== prevState.currentSetName ||
        state.gridResolution !== prevState.gridResolution ||
        state.scaleRoot !== prevState.scaleRoot ||
        state.scaleType !== prevState.scaleType ||
        state.trackMode !== prevState.trackMode ||
        state.arrangement !== prevState.arrangement
      ) {
        debouncedSave();
      }
    },
  );
}
