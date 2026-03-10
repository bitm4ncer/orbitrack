import { superdough } from 'superdough';
import type { Instrument } from '../types/instrument';
import type { StoreState } from '../state/store';
import { DEFAULT_SYNTH_PARAMS, DEFAULT_SAMPLER_PARAMS } from '../types/superdough';
import { applyOrbitToneEffects } from './orbitEffects';

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

/**
 * Computes superdough effect parameter overrides from the instrument's own
 * effect chain (instrumentEffects[instrument.id]), applied in order.
 * Only superdough-native params are mapped here (room/roomsize, delay, distort, cutoff).
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
      case 'reverb':
        overrides.room = effect.params.amount ?? 0;
        overrides.roomsize = effect.params.size ?? 0.5;
        break;
      case 'delay':
        overrides.delay = effect.params.amount ?? 0;
        overrides.delaytime = effect.params.time ?? 0.25;
        overrides.delayfeedback = effect.params.feedback ?? 0.4;
        break;
      case 'distortion':
        overrides.distort = effect.params.drive ?? 0;
        break;
      case 'filter':
        overrides.cutoff = effect.params.frequency ?? 20000;
        overrides.resonance = effect.params.q ?? 0;
        break;
      case 'compressor':
        // superdough native: compressor = threshold; triggers the compressor node
        overrides.compressor = effect.params.threshold ?? -24;
        overrides.compressorRatio = effect.params.ratio ?? 4;
        overrides.compressorKnee = effect.params.knee ?? 6;
        overrides.compressorAttack = effect.params.attack ?? 0.003;
        overrides.compressorRelease = effect.params.release ?? 0.25;
        break;
      case 'phaser':
        overrides.phaserrate = effect.params.rate ?? 0.5;
        overrides.phaserdepth = effect.params.depth ?? 0.7;
        overrides.phasercenter = effect.params.baseFreq ?? 1000;
        // phasersweep = frequency sweep range; scale baseFreq by depth so wider
        // modulation depth also widens the swept frequency band
        overrides.phasersweep = (effect.params.baseFreq ?? 1000) * (effect.params.depth ?? 0.7);
        break;
      // eq3, chorus: superdough has no native equivalent
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
  const instGain = dbToLinear(instrument.volume);
  const effects = state.instrumentEffects[instrument.id] ?? [];
  const effectOverrides = getEffectOverrides(instrument, state);

  // Apply EQ3 and Chorus via per-orbit Web Audio intercept (not natively in superdough)
  applyOrbitToneEffects(instrument.orbitIndex, effects);

  if (instrument.type === 'synth') {
    const sp = instrument.synthParams ?? DEFAULT_SYNTH_PARAMS;

    superdough({
      s: sp.synthType,
      note: midiNote,
      gain: sp.gain * instGain,
      attack: sp.attack,
      decay: sp.decay,
      sustain: sp.sustain,
      release: sp.release,
      cutoff: sp.cutoff,
      resonance: sp.resonance,
      pan: (sp.pan + 1) / 2,
      delay: sp.delay,
      delaytime: sp.delaytime,
      delayfeedback: sp.delayfeedback,
      room: sp.room,
      roomsize: sp.size,
      distort: sp.distortion,
      orbit: instrument.orbitIndex,
      ...(glide ? { portamento: 0.05 } : {}),
      ...effectOverrides,
    }, audioTime, noteDuration);
  } else if (instrument.type === 'sampler' && instrument.sampleName) {
    const sp = instrument.samplerParams ?? DEFAULT_SAMPLER_PARAMS;
    const rootNote = sp.rootNote ?? 60;
    const speed = sp.speed * Math.pow(2, (midiNote - rootNote) / 12);

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
    }, audioTime, noteDuration);
  }
}
