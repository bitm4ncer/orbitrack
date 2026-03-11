/**
 * Auto-persists the current session (instruments, effects, BPM, grid, etc.)
 * to IndexedDB so it survives page refresh.
 *
 * Uses the existing `sets` IDB store with a reserved autosave ID.
 * Custom sample blobs are stored separately in the `samples` store.
 */

import { useStore, setOrbitCounter } from '../state/store';
import { put, get } from './idb';
import type { Instrument } from '../types/instrument';
import type { Effect } from '../types/effects';
import type { InstrumentScene } from '../types/scene';
import { base64ToBlob } from './serializer';
import { registerSampleForPlayback } from '../audio/engine';
import { loadSample } from '../audio/sampler';
import { generateName } from '../utils/nameGenerator';

const AUTOSAVE_ID = '__autosave__';
const DEBOUNCE_MS = 1000;

interface AutosaveData {
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
  /** Custom sample blobs stored inline for autosave (avoids extra IDB reads on restore) */
  customSampleBlobs?: { key: string; name: string; mimeType: string; base64: string }[];
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Convert a blob URL to base64 + mimeType.
 */
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

async function saveSession(): Promise<void> {
  const s = useStore.getState();

  // Convert custom sample blob URLs to base64 for persistence
  let customSampleBlobs: AutosaveData['customSampleBlobs'];
  if (s.customSamples.length > 0) {
    try {
      customSampleBlobs = await Promise.all(
        s.customSamples.map(async (cs) => {
          const { base64, mimeType } = await blobUrlToBase64(cs.url);
          return { key: cs.key, name: cs.name, mimeType, base64 };
        }),
      );
    } catch {
      // If blob URLs are stale, skip custom samples
      customSampleBlobs = undefined;
    }
  }

  const data: AutosaveData = {
    id: AUTOSAVE_ID,
    version: 1,
    meta: {
      id: AUTOSAVE_ID,
      name: s.currentSetName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    bpm: s.bpm,
    masterVolume: s.masterVolume,
    instruments: s.instruments,
    gridNotes: s.gridNotes,
    gridGlide: s.gridGlide,
    gridLengths: s.gridLengths,
    instrumentEffects: s.instrumentEffects,
    masterEffects: s.masterEffects,
    scenes: s.scenes,
    sceneEffects: s.sceneEffects,
    gridResolution: s.gridResolution,
    scaleRoot: s.scaleRoot,
    scaleType: s.scaleType,
    trackMode: s.trackMode,
    arrangement: s.arrangement,
    customSampleBlobs,
  };

  await put('sets', data);
}

function debouncedSave(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    saveSession().catch(console.error);
  }, DEBOUNCE_MS);
}

/**
 * Try to restore the autosaved session. Returns true if restored.
 */
export async function restoreAutosave(): Promise<boolean> {
  try {
    const data = await get<AutosaveData>('sets', AUTOSAVE_ID);
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
        const isCustom = customSamples.some((c) => c.key === inst.samplePath);
        const url = isCustom
          ? customSamples.find((c) => c.key === inst.samplePath)!.url
          : inst.samplePath.startsWith('blob:') || inst.samplePath.startsWith('http')
            ? inst.samplePath
            : baseUrl + inst.samplePath;
        try {
          // Tone.js may not be started yet at autosave restore, use plain AudioContext
          const ctx = new AudioContext();
          fetch(url)
            .then((r) => r.arrayBuffer())
            .then((buf) => ctx.decodeAudioData(buf))
            .then((decoded) => useStore.getState().initLooperEditor(inst.id, decoded))
            .catch((e) => console.error('[autosave] looper decode failed:', e));
        } catch (e) {
          console.error('[autosave] looper re-init failed:', e);
        }
      }
    }

    return true;
  } catch (err) {
    console.error('Failed to restore autosave:', err);
    return false;
  }
}

/**
 * Subscribe to store changes and auto-save on mutations.
 * Call once on app startup.
 */
export function initSessionAutosave(): void {
  // Watch the relevant slices of state
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
