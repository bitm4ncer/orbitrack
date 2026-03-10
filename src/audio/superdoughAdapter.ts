import { superdough, getAudioContext } from 'superdough';
import type { Instrument } from '../types/instrument';
import type { StoreState } from '../state/store';
import { DEFAULT_SAMPLER_PARAMS } from '../types/superdough';
import { DEFAULT_LOOPER_PARAMS } from '../types/looper';
import { getSynthEngine } from './synthManager';

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

/** Clamp a scheduled time so it's never in the past (avoids superdough's
 *  "cannot schedule sounds in the past" error caused by Tone.js / native
 *  AudioContext clock drift). */
function safeTime(t: number): number {
  try {
    const now = getAudioContext().currentTime;
    return t < now ? now + 0.001 : t;
  } catch {
    return t;
  }
}

/**
 * Computes superdough effect parameter overrides from the instrument's own
 * effect chain (instrumentEffects[instrument.id]), applied in order.
 * Only the compressor is mapped here — all other effects are handled by the
 * per-orbit Web Audio chain in orbitEffects.ts (reverb, delay, distortion,
 * filter, phaser, eq3, chorus).
 */
function getEffectOverrides(
  instrument: Instrument,
  state: StoreState,
): Record<string, number> {
  const effects = state.instrumentEffects[instrument.id] ?? [];
  const overrides: Record<string, number> = {};

  for (const effect of effects) {
    if (!effect.enabled) continue;
    switch (effect.type) {
      case 'compressor':
        // superdough native: compressor = threshold; triggers the compressor node
        overrides.compressor = effect.params.threshold ?? -24;
        overrides.compressorRatio = effect.params.ratio ?? 4;
        overrides.compressorKnee = effect.params.knee ?? 6;
        overrides.compressorAttack = effect.params.attack ?? 0.003;
        overrides.compressorRelease = effect.params.release ?? 0.25;
        break;
      // All other effects handled via per-orbit Web Audio chain in orbitEffects.ts
    }
  }

  return overrides;
}

export function triggerSuperdough(
  instrument: Instrument,
  midiNote: number,
  noteDuration: number,
  audioTime: number,
  glide: boolean,
  state: StoreState,
): void {
  if (instrument.type === 'synth') {
    // Route through the custom SynthEngine — NOT superdough.
    // This fixes "sound supersaw not found" and enables poly, LFO, FM, unison.
    const engine = getSynthEngine(instrument.id, instrument.orbitIndex);
    const instGain = dbToLinear(instrument.volume);
    void glide; // portamentoSpeed is already in SynthParams
    engine.noteOn(midiNote, audioTime, noteDuration, instGain);

  } else if (instrument.type === 'sampler' && instrument.sampleName) {
    const instGain = dbToLinear(instrument.volume);
    const sp = instrument.samplerParams ?? DEFAULT_SAMPLER_PARAMS;
    const rootNote = sp.rootNote ?? 60;
    const speed = sp.speed * Math.pow(2, (midiNote - rootNote) / 12);
    const effectOverrides = getEffectOverrides(instrument, state);

    superdough({
      s: instrument.sampleName,
      gain: sp.gain * instGain,
      speed,
      begin: sp.begin,
      end: sp.end,
      attack: sp.attack,
      release: sp.release,
      cutoff: sp.cutoff,
      resonance: sp.resonance,
      pan: (sp.pan + 1) / 2,
      orbit: instrument.orbitIndex,
      ...effectOverrides,
    }, safeTime(audioTime), noteDuration);
  }
}

/**
 * Trigger a looper slice. Called from transport for looper instruments.
 * Computes slice begin/end from sorted hit positions and adjusts playback speed
 * so the slice fills exactly the available time between this marker and the next.
 */
export function triggerLooperSlice(
  instrument: Instrument,
  hitIndex: number,
  sortedHits: number[],
  secondsPer16th: number,
  audioTime: number,
  state: StoreState,
): void {
  if (!instrument.sampleName) return;

  const lp = instrument.looperParams ?? DEFAULT_LOOPER_PARAMS;

  const sliceBegin = sortedHits[hitIndex];
  const sliceEnd = hitIndex + 1 < sortedHits.length ? sortedHits[hitIndex + 1] : 1;

  // Compute time-stretch speed
  const editorState = state.looperEditors[instrument.id];
  const bufferDuration = editorState?.audioBuffer?.duration ?? 1;
  const originalSliceSec = (sliceEnd - sliceBegin) * bufferDuration;

  const thisStep = Math.round(sortedHits[hitIndex] * instrument.loopSize);
  const nextStep = hitIndex + 1 < sortedHits.length
    ? Math.round(sortedHits[hitIndex + 1] * instrument.loopSize)
    : instrument.loopSize;
  const availableSec = (nextStep - thisStep) * secondsPer16th;

  const sliceSpeed = lp.speed * (originalSliceSec / Math.max(availableSec, 0.01));
  const instGain = dbToLinear(instrument.volume);
  const effectOverrides = getEffectOverrides(instrument, state);

  superdough({
    s: instrument.sampleName,
    gain: lp.gain * instGain,
    speed: sliceSpeed,
    begin: sliceBegin,
    end: sliceEnd,
    attack: lp.attack,
    release: lp.release,
    cutoff: lp.cutoff,
    resonance: lp.resonance,
    pan: (lp.pan + 1) / 2,
    orbit: instrument.orbitIndex,
    ...effectOverrides,
  }, safeTime(audioTime), availableSec);
}
