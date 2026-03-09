import { superdough } from 'superdough';
import type { Instrument } from '../types/instrument';
import type { StoreState } from '../state/store';
import type { Connection } from '../types/effects';
import { DEFAULT_SYNTH_PARAMS, DEFAULT_SAMPLER_PARAMS } from '../types/superdough';

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

/**
 * Computes the superdough effect params for an instrument based on
 * its cable connections in the effects graph.
 *
 * When an instrument's Out port is cabled to an effect's In port,
 * the effect's params are applied to every note that instrument triggers.
 * Effects can chain: Instrument → Effect A → Effect B → Master.
 * In that case both Effect A and Effect B params are applied.
 */
function getEffectOverrides(
  instrument: Instrument,
  state: StoreState
): Record<string, number> {
  const { connections, effects } = state;
  const overrides: Record<string, number> = {};

  // Traverse the connections graph starting from this instrument's Out port
  // Collect all effects reachable from this instrument
  const visited = new Set<string>();
  const queue: string[] = [];

  // Start: find what the instrument connects to
  for (const conn of connections) {
    if (conn.from.kind === 'instrument' && conn.from.id === instrument.id) {
      if (conn.to.kind === 'effect') {
        queue.push(conn.to.id);
      }
    }
  }

  while (queue.length > 0) {
    const effectId = queue.shift()!;
    if (visited.has(effectId)) continue;
    visited.add(effectId);

    const effect = effects.find((e) => e.id === effectId);
    if (!effect || !effect.enabled) continue;

    // Apply this effect's params as superdough per-note overrides
    switch (effect.type) {
      case 'reverb':
        overrides.room = effect.params.amount ?? 0;
        overrides.size = effect.params.size ?? 0.5;
        break;
      case 'delay':
        overrides.delay = effect.params.amount ?? 0;
        overrides.delaytime = effect.params.time ?? 0.25;
        overrides.delayfeedback = effect.params.feedback ?? 0.4;
        break;
      case 'distortion':
        overrides.distortion = effect.params.drive ?? 0;
        break;
      case 'filter':
        overrides.cutoff = effect.params.frequency ?? 20000;
        overrides.resonance = effect.params.q ?? 0;
        break;
      // eq3, compressor, chorus, phaser: handled by routing engine post-processing
    }

    // Follow Out → next effect connections
    for (const conn of connections) {
      if (conn.from.kind === 'effect' && conn.from.id === effectId && conn.from.port === 'out') {
        if (conn.to.kind === 'effect') {
          queue.push(conn.to.id);
        }
      }
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
  const effectOverrides = getEffectOverrides(instrument, state);

  if (instrument.type === 'synth') {
    const sp = instrument.synthParams ?? DEFAULT_SYNTH_PARAMS;

    superdough({
      s: sp.synthType,
      note: midiNote,
      duration: noteDuration,
      gain: sp.gain * instGain,
      attack: sp.attack,
      decay: sp.decay,
      sustain: sp.sustain,
      release: sp.release,
      cutoff: sp.cutoff,
      resonance: sp.resonance,
      pan: sp.pan,
      delay: sp.delay,
      delaytime: sp.delaytime,
      delayfeedback: sp.delayfeedback,
      room: sp.room,
      size: sp.size,
      distortion: sp.distortion,
      orbit: instrument.orbitIndex,
      // Glide: portamento on consecutive notes
      ...(glide ? { portamento: 0.05 } : {}),
      // Effect cable overrides (applied on top of instrument defaults)
      ...effectOverrides,
    }, audioTime);
  } else if (instrument.type === 'sampler' && instrument.sampleName) {
    const sp = instrument.samplerParams ?? DEFAULT_SAMPLER_PARAMS;
    // Convert MIDI note to playback rate: MIDI 60 (C4) = rate 1.0
    const speed = sp.speed * Math.pow(2, (midiNote - 60) / 12);

    superdough({
      s: instrument.sampleName,
      duration: noteDuration,
      gain: sp.gain * instGain,
      speed,
      begin: sp.begin,
      end: sp.end,
      attack: sp.attack,
      release: sp.release,
      cutoff: sp.cutoff,
      resonance: sp.resonance,
      pan: sp.pan,
      orbit: instrument.orbitIndex,
      ...effectOverrides,
    }, audioTime);
  }
}
