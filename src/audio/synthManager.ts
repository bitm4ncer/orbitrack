import { SynthEngine } from './synth/SynthEngine';
import { getSynthOrbitInput } from './orbitEffects';
import * as Tone from 'tone';

interface EngineEntry {
  engine: SynthEngine;
  orbitIndex: number;
  connected: boolean;
}

const engines: Map<string, EngineEntry> = new Map();

export function getSynthEngine(instrumentId: string, orbitIndex: number): SynthEngine {
  const existing = engines.get(instrumentId);

  if (existing) {
    // Reconnect if not yet connected (audio wasn't ready at creation time) or orbit changed
    if (!existing.connected || existing.orbitIndex !== orbitIndex) {
      const orbitInput = getSynthOrbitInput(orbitIndex);
      if (orbitInput) {
        if (existing.connected) {
          try { existing.engine.getOutputNode().disconnect(); } catch { /* ignore */ }
        }
        existing.engine.getOutputNode().connect(orbitInput);
        existing.orbitIndex = orbitIndex;
        existing.connected = true;
      }
    }
    return existing.engine;
  }

  // Use the native AudioContext (not the standardized-audio-context polyfill that
  // Tone.js wraps). The polyfill throws InvalidAccessError after cancelScheduledValues
  // + linearRampToValueAtTime sequences that are valid in the native Web Audio API.
  const rawCtx = Tone.getContext().rawContext as unknown as { _nativeContext?: AudioContext };
  const ac: AudioContext = rawCtx._nativeContext ?? (Tone.getContext().rawContext as unknown as AudioContext);
  const engine = new SynthEngine(ac);
  engine.init();

  // Connect engine output → orbit effects chain input (may be null if audio not ready yet)
  const orbitInput = getSynthOrbitInput(orbitIndex);
  let connected = false;
  if (orbitInput) {
    engine.getOutputNode().connect(orbitInput);
    connected = true;
  }

  engines.set(instrumentId, { engine, orbitIndex, connected });
  return engine;
}

export function removeSynthEngine(instrumentId: string): void {
  const entry = engines.get(instrumentId);
  if (entry) {
    entry.engine.noteStop();
    try { entry.engine.getOutputNode().disconnect(); } catch { /* ignore */ }
    engines.delete(instrumentId);
  }
}

export function getAllEngines(): Map<string, SynthEngine> {
  const result = new Map<string, SynthEngine>();
  for (const [id, entry] of engines) {
    result.set(id, entry.engine);
  }
  return result;
}
