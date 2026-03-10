import * as Tone from 'tone';
import { useStore } from '../state/store';
import { triggerSuperdough, triggerLooperSlice } from './superdoughAdapter';
import { applyOrbitToneEffects } from './orbitEffects';

let schedulerId: number | null = null;
let effectSyncId: ReturnType<typeof setInterval> | null = null;

// Simple monotonic step counter — incremented exactly once per scheduleRepeat
// callback. Eliminates all floating-point time→step drift.
let _globalStep = 0;

// Per-instrument: last globalStep at which each hit index was triggered.
// Prevents double-fires even if the callback is invoked twice for the same step.
let _lastFired: Map<string, Map<number, number>> = new Map();

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
        const effects = state.instrumentEffects[inst.id] ?? [];
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

  // UI position — use globalStep (not transport.seconds) for consistency
  const maxLoopSize = state.instruments.reduce((m, i) => Math.max(m, i.loopSize), 1);
  const progress = (globalStep % maxLoopSize) / maxLoopSize;
  const currentStep = globalStep % maxLoopSize;

  // Per-instrument progress
  const instProgress: Record<string, number> = {};

  // Solo logic
  const anySolo = state.instruments.some((i) => i.solo);

  for (const instrument of state.instruments) {
    const loopSize = instrument.loopSize;

    // Per-instrument progress (0-1) within its own loop
    instProgress[instrument.id] = (globalStep % loopSize) / loopSize;

    if (anySolo && !instrument.solo) continue;
    if (instrument.muted && !instrument.solo) continue;

    const { hitPositions, hits } = instrument;
    if (hits === 0 || hitPositions.length === 0) continue;

    if (!_lastFired.has(instrument.id)) {
      _lastFired.set(instrument.id, new Map());
    }
    const fired = _lastFired.get(instrument.id)!;

    const instStep = globalStep % loopSize;

    for (let i = 0; i < hitPositions.length; i++) {
      const hitPos = hitPositions[i];
      const hitStep = Math.round(hitPos * loopSize) % loopSize;

      if (hitStep === instStep) {
        // Skip if this exact hit was already fired on this globalStep
        if (fired.get(i) === globalStep) continue;
        fired.set(i, globalStep);

        if (instrument.type === 'looper') {
          const sortedHits = [...hitPositions].sort((a, b) => a - b);
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
