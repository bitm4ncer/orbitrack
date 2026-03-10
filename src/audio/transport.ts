import * as Tone from 'tone';
import { useStore } from '../state/store';
import { triggerSuperdough } from './superdoughAdapter';

let schedulerId: number | null = null;
let lastTriggered: Map<string, Set<number>> = new Map();

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
  lastTriggered.clear();

  if (schedulerId !== null) {
    transport.clear(schedulerId);
  }

  schedulerId = transport.scheduleRepeat((time) => {
    tick(time);
  }, '16n');

  transport.start();
  useStore.getState().setPlaying(true);
  startUISync();
}

export function stopTransport(): void {
  const transport = Tone.getTransport();
  stopUISync();
  transport.stop();
  transport.position = 0;
  lastTriggered.clear();

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
    // Swallow scheduling errors (e.g. InvalidAccessError from Tone.js internals)
    // so the transport loop is never silently killed.
    console.warn('[transport] tick error:', e);
  }
}

function _tick(time: number): void {
  const transport = Tone.getTransport();
  const state = useStore.getState();

  const secondsPer16th = 60 / state.bpm / 4;

  // AUDIO: Use the scheduled audio time to determine which step to trigger.
  // transport.seconds returns the current context time, which is behind the
  // scheduled `time` by the lookahead amount — using it here would cause hits
  // to be computed for the wrong step.
  const scheduledSec = transport.getSecondsAtTime(time);
  const globalStep = Math.floor(scheduledSec / secondsPer16th);

  // UI: Use current transport position (what the user hears right now), not the
  // scheduled position (which is lookahead ms ahead). This keeps the playhead
  // and step indicators in sync with what you actually hear.
  const uiSec = transport.seconds;
  const uiTotalSteps = uiSec / secondsPer16th;
  const maxLoopSize = state.instruments.reduce((m, i) => Math.max(m, i.loopSize), 1);
  const progress = (uiTotalSteps % maxLoopSize) / maxLoopSize;
  const currentStep = Math.floor(uiTotalSteps) % maxLoopSize;

  // Per-instrument progress
  const instProgress: Record<string, number> = {};

  // Solo logic
  const anySolo = state.instruments.some((i) => i.solo);

  for (const instrument of state.instruments) {
    const loopSize = instrument.loopSize;

    // Per-instrument progress (0-1) within its own loop — UI, uses current time
    instProgress[instrument.id] = (uiTotalSteps % loopSize) / loopSize;

    if (anySolo && !instrument.solo) continue;
    if (instrument.muted && !instrument.solo) continue;

    const { hitPositions, hits } = instrument;
    if (hits === 0 || hitPositions.length === 0) continue;

    if (!lastTriggered.has(instrument.id)) {
      lastTriggered.set(instrument.id, new Set());
    }
    const triggered = lastTriggered.get(instrument.id)!;

    const instStep = globalStep % loopSize;

    for (let i = 0; i < hitPositions.length; i++) {
      const hitPos = hitPositions[i];
      const hitStep = Math.round(hitPos * loopSize) % loopSize;

      if (hitStep === instStep) {
        if (triggered.has(i)) continue;
        triggered.add(i);

        const notes = state.gridNotes[instrument.id]?.[i];
        if (notes && notes.length > 0) {
          const glide = state.gridGlide[instrument.id]?.[i] ?? false;
          const noteLength = state.gridLengths[instrument.id]?.[i] ?? 1;
          const noteDuration = secondsPer16th * noteLength * 0.9;

          triggerSuperdough(instrument, notes[0], noteDuration, time, glide, state);
        }
      } else {
        triggered.delete(i);
      }
    }
  }

  // Write position to buffer — the rAF loop will flush to Zustand at ~60 fps.
  // No Zustand calls here keeps the audio scheduling callback free of React work.
  _pos.progress = progress;
  _pos.currentStep = currentStep;
  _pos.instProgress = instProgress;
  _pos.dirty = true;
}
