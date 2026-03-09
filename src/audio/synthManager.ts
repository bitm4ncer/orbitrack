import { SynthEngine } from './synth/SynthEngine';
import * as Tone from 'tone';

const engines: Map<string, SynthEngine> = new Map();

export function getSynthEngine(instrumentId: string): SynthEngine {
  let engine = engines.get(instrumentId);
  if (!engine) {
    const ac = Tone.getContext().rawContext as AudioContext;
    engine = new SynthEngine(ac);
    engine.init();
    engines.set(instrumentId, engine);
  }
  return engine;
}

export function removeSynthEngine(instrumentId: string): void {
  const engine = engines.get(instrumentId);
  if (engine) {
    engine.noteStop();
    engines.delete(instrumentId);
  }
}

export function getAllEngines(): Map<string, SynthEngine> {
  return engines;
}
