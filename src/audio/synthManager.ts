import { SynthEngine } from './synth/SynthEngine';
import { getSynthOrbitInput } from './orbitEffects';
import type { SynthParams } from './synth/types';
import * as Tone from 'tone';

interface EngineEntry {
  engine: SynthEngine;
  orbitIndex: number;
  connected: boolean;
}

const engines: Map<string, EngineEntry> = new Map();

export function getSynthEngine(instrumentId: string, orbitIndex: number, initialParams?: SynthParams): SynthEngine {
  const existing = engines.get(instrumentId);

  if (existing) {
    // Re-apply params if provided (e.g. restore from autosave on page reload)
    if (initialParams) {
      for (const key of Object.keys(initialParams) as (keyof SynthParams)[]) {
        existing.engine.setParam(key, initialParams[key] as never);
      }
    }
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

  // Restore saved params if provided (e.g. from autosave / set load)
  if (initialParams) {
    for (const key of Object.keys(initialParams) as (keyof SynthParams)[]) {
      engine.setParam(key, initialParams[key] as never);
    }
  }

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
    entry.engine.dispose();
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

/** Number of active synth engines (for perf monitoring). */
export function getActiveSynthCount(): number {
  return engines.size;
}
