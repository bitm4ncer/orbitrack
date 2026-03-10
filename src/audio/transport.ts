import * as Tone from 'tone';
import { useStore } from '../state/store';
import { triggerSuperdough, triggerLooperSlice } from './superdoughAdapter';
import { applyOrbitToneEffects } from './orbitEffects';
import { DEFAULT_LOOPER_PARAMS } from '../types/looper';
import type { Effect } from '../types/effects';

let schedulerId: number | null = null;
let effectSyncId: ReturnType<typeof setInterval> | null = null;

// Simple monotonic step counter — incremented exactly once per scheduleRepeat
// callback. Eliminates all floating-point time→step drift.
let _globalStep = 0;

// Per-instrument: last globalStep at which each hit index was triggered.
// Prevents double-fires even if the callback is invoked twice for the same step.
let _lastFired: Map<string, Map<number, number>> = new Map();

// Effect sync change detection — skip applyOrbitToneEffects when nothing changed.
// Zustand always creates a new array reference on write, so reference equality is valid.
const _lastApplied = new Map<string, { ref: unknown; bpm: number; degrade: number }>();

// Tick-level caches — recomputed only when instruments array reference changes.
let _instrRef: unknown = null;
let _maxLoopSize = 1;
let _anySolo = false;

// Position buffer — written by the audio tick (zero React involvement),
// read by the rAF sync loop which gates UI updates to ~60 fps.
const _pos = {
  progress: 0,
  currentStep: 0,
  instProgress: {} as Record<string, number>,
  dirty: false,
};
let _rafId: number | null = null;

function startUISync(): void {
  function sync(): void {
    if (_pos.dirty) {
      _pos.dirty = false;
      useStore.getState().setPlaybackUI(_pos.progress, _pos.currentStep, _pos.instProgress);
    }
    _rafId = requestAnimationFrame(sync);
  }
  _rafId = requestAnimationFrame(sync);
}

function stopUISync(): void {
  if (_rafId !== null) {
    cancelAnimationFrame(_rafId);
    _rafId = null;
  }
}

export function startTransport(): void {
  const transport = Tone.getTransport();
  const state = useStore.getState();

  transport.bpm.value = state.bpm;
  transport.timeSignature = 4;
  _globalStep = 0;
  _lastFired.clear();

  if (schedulerId !== null) {
    transport.clear(schedulerId);
  }

  schedulerId = transport.scheduleRepeat((time) => {
    tick(time);
  }, '16n');

  transport.start();
  useStore.getState().setPlaying(true);
  startUISync();
  startEffectSync();
}

/** Sync orbit effect chains at ~25 Hz — outside the audio callback so the
 *  tick() stays lightweight.  This keeps continuous effects like Trance Gate
 *  running even when no notes are firing. */
function startEffectSync(): void {
  stopEffectSync();
  effectSyncId = setInterval(() => {
    try {
      const state = useStore.getState();
      for (const inst of state.instruments) {
        let effects = state.instrumentEffects[inst.id] ?? [];

        // Inject looper degrade as a synthetic bitcrusher effect on this orbit
        if (inst.type === 'looper') {
          const deg = inst.looperParams?.degrade ?? DEFAULT_LOOPER_PARAMS.degrade;
          if (deg > 0.01) {
            // bits: 16 → 1, downsample: 0 → 1, amount: 0 → 1
            const bits = Math.max(1, Math.round(16 - deg * 15));
            const downsample = Math.min(1, deg * deg);  // quadratic: subtle start, aggressive end
            const degradeEffect: Effect = {
              id: '__degrade__', type: 'bitcrusher', label: 'Degrade',
              enabled: true, collapsed: false,
              params: { bits, downsample, amount: Math.min(1, deg * 1.5) },
            };
            // Prepend so user-added bitcrusher can stack on top
            const hasUserBc = effects.some((e) => e.type === 'bitcrusher' && e.enabled);
            if (!hasUserBc) effects = [...effects, degradeEffect];
          }
        }

        // Skip if neither effects array, bpm, nor degrade changed since last apply.
        const curDegrade = inst.looperParams?.degrade ?? 0;
        const prev = _lastApplied.get(inst.id);
        const origEffects = state.instrumentEffects[inst.id] ?? [];
        if (prev?.ref === origEffects && prev?.bpm === state.bpm && prev?.degrade === curDegrade) continue;
        _lastApplied.set(inst.id, { ref: origEffects, bpm: state.bpm, degrade: curDegrade });
        applyOrbitToneEffects(inst.orbitIndex, effects, state.bpm);
      }
    } catch { /* safe to ignore */ }
  }, 40);
}

function stopEffectSync(): void {
  if (effectSyncId !== null) {
    clearInterval(effectSyncId);
    effectSyncId = null;
  }
}

export function stopTransport(): void {
  const transport = Tone.getTransport();
  stopUISync();
  stopEffectSync();
  transport.stop();
  transport.position = 0;
  _globalStep = 0;
  _lastFired.clear();
  _lastApplied.clear();
  _instrRef = null;

  if (schedulerId !== null) {
    transport.clear(schedulerId);
    schedulerId = null;
  }

  useStore.getState().setPlaying(false);
  useStore.getState().setCurrentStep(-1);
  useStore.getState().setTransportProgress(0);
}

export function toggleTransport(): void {
  const { isPlaying } = useStore.getState();
  if (isPlaying) {
    stopTransport();
  } else {
    startTransport();
  }
}

export function setBpm(bpm: number): void {
  Tone.getTransport().bpm.value = bpm;
  useStore.getState().setBpm(bpm);
}

function tick(time: number): void {
  try {
    _tick(time);
  } catch (e) {
    console.warn('[transport] tick error:', e);
  }
}

function _tick(time: number): void {
  const state = useStore.getState();
  const globalStep = _globalStep++;

  const secondsPer16th = 60 / state.bpm / 4;

  // Recompute derived instrument stats only when the instruments array changes.
  if (state.instruments !== _instrRef) {
    _instrRef    = state.instruments;
    _maxLoopSize = state.instruments.reduce((m, i) => Math.max(m, i.loopSize), 1);
    _anySolo     = state.instruments.some((i) => i.solo);
  }

  // UI position — use globalStep (not transport.seconds) for consistency
  const progress = (globalStep % _maxLoopSize) / _maxLoopSize;
  const currentStep = globalStep % _maxLoopSize;

  // Per-instrument progress
  const instProgress: Record<string, number> = {};

  for (const instrument of state.instruments) {
    const loopSize = instrument.loopSize;

    // Per-instrument progress (0-1) within its own loop
    instProgress[instrument.id] = (globalStep % loopSize) / loopSize;

    if (_anySolo && !instrument.solo) continue;
    if (instrument.muted && !instrument.solo) continue;

    const { hitPositions, hits } = instrument;
    if (hits === 0 || hitPositions.length === 0) continue;

    if (!_lastFired.has(instrument.id)) {
      _lastFired.set(instrument.id, new Map());
    }
    const fired = _lastFired.get(instrument.id)!;

    // Apply loop start offset for looper instruments
    const startOffset = instrument.type === 'looper' ? (instrument.looperParams?.startOffset ?? 0) : 0;
    const offsetSteps = Math.round(startOffset * loopSize);
    const instStep = (globalStep + offsetSteps) % loopSize;

    // Lazily built on first looper hit that fires this step; null = not built yet.
    let sortedHitsCache: number[] | null = null;

    for (let i = 0; i < hitPositions.length; i++) {
      const hitPos = hitPositions[i];
      const hitStep = Math.round(hitPos * loopSize) % loopSize;

      if (hitStep === instStep) {
        // Skip if this exact hit was already fired on this globalStep
        if (fired.get(i) === globalStep) continue;
        fired.set(i, globalStep);

        if (instrument.type === 'looper') {
          // Filter hits to loop region if loopIn/loopOut are set
          const editorState = state.looperEditors[instrument.id];
          const loopIn = editorState?.loopIn ?? 0;
          const loopOut = editorState?.loopOut ?? 1;
          const hasLoopRegion = loopIn > 0 || loopOut < 1;

          // Skip hits outside the loop region
          if (hasLoopRegion && (hitPos < loopIn - 0.001 || hitPos > loopOut + 0.001)) continue;

          // Build sortedHits once per instrument per tick (lazy, shared by all hits that fire)
          if (sortedHitsCache === null) {
            sortedHitsCache = [...hitPositions]
              .filter((h) => !hasLoopRegion || (h >= loopIn - 0.001 && h <= loopOut + 0.001))
              .sort((a, b) => a - b);
          }
          const sortedHits = sortedHitsCache;
          const sortedIdx = sortedHits.indexOf(hitPos);
          if (sortedIdx >= 0) {
            triggerLooperSlice(instrument, sortedIdx, sortedHits, secondsPer16th, time, state);
          }
        } else {
          const notes = state.gridNotes[instrument.id]?.[i];
          if (notes && notes.length > 0) {
            const glide = state.gridGlide[instrument.id]?.[i] ?? false;
            const noteLength = state.gridLengths[instrument.id]?.[i] ?? 1;
            const noteDuration = secondsPer16th * noteLength * 0.9;

            for (const midiNote of notes) {
              triggerSuperdough(instrument, midiNote, noteDuration, time, glide, state);
            }
          }
        }
      }
    }
  }

  // Write position to buffer — the rAF loop will flush to Zustand at ~60 fps.
  _pos.progress = progress;
  _pos.currentStep = currentStep;
  _pos.instProgress = instProgress;
  _pos.dirty = true;
}
