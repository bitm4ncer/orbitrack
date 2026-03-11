/**
 * Scene audio bus — sums orbit outputs for scene-level effects processing.
 *
 * Signal flow for grouped orbits:
 *   orbit chain tail (limiterMix) --X→ orbit.output   (disconnected)
 *   orbit chain tail (limiterMix) ───→ sceneVolumeGain → sceneChain.masterInput
 *                                        → [Scene Effects Chain]
 *                                        → sceneChain.masterOutput → destinationGain
 *
 * Ungrouped orbits are unaffected:
 *   orbit chain tail (limiterMix) → orbit.output → [superdough merge] → destinationGain
 */

import { getAudioContext, getSuperdoughAudioController } from 'superdough';
import { getOrbitChainTail } from './orbitEffects';
import { createMasterChain, applyEffectsToChain, type MasterChain } from './masterEffectsChain';
import type { Effect } from '../types/effects';
import { isAudioReady } from './engine';

interface SceneBus {
  id: string;
  volumeGain: GainNode;        // scene volume control
  chain: MasterChain;          // full effects chain
  analyser: AnalyserNode;      // for scene VU metering
  connectedOrbits: Set<number>;
}

const sceneBuses = new Map<string, SceneBus>();

function getDestinationGain(): GainNode | null {
  try {
    return (getSuperdoughAudioController() as any).output?.destinationGain as GainNode ?? null;
  } catch { return null; }
}

/** Create a scene bus and wire its output to destinationGain. */
export function createSceneBus(sceneId: string): void {
  if (sceneBuses.has(sceneId)) return;
  if (!isAudioReady()) return;

  const ac = getAudioContext() as AudioContext;
  const dg = getDestinationGain();
  if (!dg) return;

  const volumeGain = ac.createGain();
  volumeGain.gain.value = 1;

  const chain = createMasterChain(ac);

  // Wire: volumeGain → chain input → chain output → destinationGain
  volumeGain.connect(chain.masterInput);
  chain.masterOutput.connect(dg);

  // Analyser side-tap (leaf node, never to destination)
  const analyser = ac.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.3;
  chain.masterOutput.connect(analyser);

  sceneBuses.set(sceneId, {
    id: sceneId,
    volumeGain,
    chain,
    analyser,
    connectedOrbits: new Set(),
  });
}

/** Route an orbit's chain tail into a scene bus (disconnects from orbit.output). */
export function routeOrbitToScene(orbitIndex: number, sceneId: string): void {
  const bus = sceneBuses.get(sceneId);
  if (!bus) return;

  const tail = getOrbitChainTail(orbitIndex);
  if (!tail) return;

  try {
    tail.limiterMix.disconnect(tail.outputNode);
  } catch { /* may not be connected */ }

  tail.limiterMix.connect(bus.volumeGain);
  bus.connectedOrbits.add(orbitIndex);
}

/** Restore an orbit back to default routing (reconnects to orbit.output). */
export function unrouteOrbitFromScene(orbitIndex: number): void {
  // Find which bus this orbit is in
  for (const bus of sceneBuses.values()) {
    if (!bus.connectedOrbits.has(orbitIndex)) continue;

    const tail = getOrbitChainTail(orbitIndex);
    if (tail) {
      try {
        tail.limiterMix.disconnect(bus.volumeGain);
      } catch { /* may not be connected */ }
      tail.limiterMix.connect(tail.outputNode);
    }
    bus.connectedOrbits.delete(orbitIndex);
    return;
  }
}

/** Apply effects to a scene bus. */
export function applySceneEffects(sceneId: string, effects: Effect[], bpm: number): void {
  const bus = sceneBuses.get(sceneId);
  if (!bus) return;
  applyEffectsToChain(bus.chain, effects, bpm);
}

/** Set scene bus volume (dB to linear conversion). */
export function setSceneBusVolume(sceneId: string, volumeDb: number): void {
  const bus = sceneBuses.get(sceneId);
  if (!bus) return;
  const linear = Math.pow(10, volumeDb / 20);
  const now = bus.volumeGain.context.currentTime;
  bus.volumeGain.gain.setTargetAtTime(linear, now, 0.02);
}

/** Mute/unmute a scene bus. */
export function setSceneBusMuted(sceneId: string, muted: boolean): void {
  const bus = sceneBuses.get(sceneId);
  if (!bus) return;
  const now = bus.volumeGain.context.currentTime;
  bus.volumeGain.gain.setTargetAtTime(muted ? 0 : 1, now, 0.02);
}

/** Get the analyser node for scene VU metering. */
export function getSceneAnalyser(sceneId: string): AnalyserNode | null {
  return sceneBuses.get(sceneId)?.analyser ?? null;
}

/** Tear down a scene bus — disconnects all orbits and removes the bus. */
export function destroySceneBus(sceneId: string): void {
  const bus = sceneBuses.get(sceneId);
  if (!bus) return;

  // Restore all orbits to default routing
  for (const orbitIndex of bus.connectedOrbits) {
    const tail = getOrbitChainTail(orbitIndex);
    if (tail) {
      try { tail.limiterMix.disconnect(bus.volumeGain); } catch {}
      tail.limiterMix.connect(tail.outputNode);
    }
  }

  // Disconnect the bus from the audio graph
  try { bus.volumeGain.disconnect(); } catch {}
  try { bus.chain.masterOutput.disconnect(); } catch {}

  sceneBuses.delete(sceneId);
}

/** Destroy all scene buses (used on newSet / loadSet). */
export function destroyAllSceneBuses(): void {
  for (const sceneId of [...sceneBuses.keys()]) {
    destroySceneBus(sceneId);
  }
}

/** Re-initialize scene buses from store state (used after loadSet). */
export function initSceneBusesFromState(
  scenes: { id: string; muted: boolean; volume: number; instrumentIds: string[] }[],
  instruments: { id: string; orbitIndex: number }[],
): void {
  destroyAllSceneBuses();
  for (const scene of scenes) {
    createSceneBus(scene.id);
    for (const instId of scene.instrumentIds) {
      const inst = instruments.find((i) => i.id === instId);
      if (inst) routeOrbitToScene(inst.orbitIndex, scene.id);
    }
    if (scene.muted) setSceneBusMuted(scene.id, true);
    if (scene.volume !== 0) setSceneBusVolume(scene.id, scene.volume);
  }
}
