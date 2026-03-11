/**
 * Group audio bus — sums orbit outputs for group-level effects processing.
 *
 * Signal flow for grouped orbits:
 *   orbit chain tail (limiterMix) --X→ orbit.output   (disconnected)
 *   orbit chain tail (limiterMix) ───→ groupVolumeGain → groupChain.masterInput
 *                                        → [Group Effects Chain]
 *                                        → groupChain.masterOutput → destinationGain
 *
 * Ungrouped orbits are unaffected:
 *   orbit chain tail (limiterMix) → orbit.output → [superdough merge] → destinationGain
 */

import { getAudioContext, getSuperdoughAudioController } from 'superdough';
import { getOrbitChainTail } from './orbitEffects';
import { createMasterChain, applyEffectsToChain, type MasterChain } from './masterEffectsChain';
import type { Effect } from '../types/effects';
import { isAudioReady } from './engine';

interface GroupBus {
  id: string;
  volumeGain: GainNode;        // group volume control
  chain: MasterChain;          // full effects chain
  analyser: AnalyserNode;      // for group VU metering
  connectedOrbits: Set<number>;
}

const groupBuses = new Map<string, GroupBus>();

function getDestinationGain(): GainNode | null {
  try {
    return (getSuperdoughAudioController() as any).output?.destinationGain as GainNode ?? null;
  } catch { return null; }
}

/** Create a group bus and wire its output to destinationGain. */
export function createGroupBus(groupId: string): void {
  if (groupBuses.has(groupId)) return;
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

  groupBuses.set(groupId, {
    id: groupId,
    volumeGain,
    chain,
    analyser,
    connectedOrbits: new Set(),
  });
}

/** Route an orbit's chain tail into a group bus (disconnects from orbit.output). */
export function routeOrbitToGroup(orbitIndex: number, groupId: string): void {
  const bus = groupBuses.get(groupId);
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
export function unrouteOrbitFromGroup(orbitIndex: number): void {
  // Find which bus this orbit is in
  for (const bus of groupBuses.values()) {
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

/** Apply effects to a group bus. */
export function applyGroupEffects(groupId: string, effects: Effect[], bpm: number): void {
  const bus = groupBuses.get(groupId);
  if (!bus) return;
  applyEffectsToChain(bus.chain, effects, bpm);
}

/** Set group bus volume (dB to linear conversion). */
export function setGroupBusVolume(groupId: string, volumeDb: number): void {
  const bus = groupBuses.get(groupId);
  if (!bus) return;
  const linear = Math.pow(10, volumeDb / 20);
  const now = bus.volumeGain.context.currentTime;
  bus.volumeGain.gain.setTargetAtTime(linear, now, 0.02);
}

/** Mute/unmute a group bus. */
export function setGroupBusMuted(groupId: string, muted: boolean): void {
  const bus = groupBuses.get(groupId);
  if (!bus) return;
  const now = bus.volumeGain.context.currentTime;
  bus.volumeGain.gain.setTargetAtTime(muted ? 0 : 1, now, 0.02);
}

/** Get the analyser node for group VU metering. */
export function getGroupAnalyser(groupId: string): AnalyserNode | null {
  return groupBuses.get(groupId)?.analyser ?? null;
}

/** Tear down a group bus — disconnects all orbits and removes the bus. */
export function destroyGroupBus(groupId: string): void {
  const bus = groupBuses.get(groupId);
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

  groupBuses.delete(groupId);
}

/** Destroy all group buses (used on newSet / loadSet). */
export function destroyAllGroupBuses(): void {
  for (const groupId of [...groupBuses.keys()]) {
    destroyGroupBus(groupId);
  }
}

/** Re-initialize group buses from store state (used after loadSet). */
export function initGroupBusesFromState(
  groups: { id: string; muted: boolean; volume: number; instrumentIds: string[] }[],
  instruments: { id: string; orbitIndex: number }[],
): void {
  destroyAllGroupBuses();
  for (const group of groups) {
    createGroupBus(group.id);
    for (const instId of group.instrumentIds) {
      const inst = instruments.find((i) => i.id === instId);
      if (inst) routeOrbitToGroup(inst.orbitIndex, group.id);
    }
    if (group.muted) setGroupBusMuted(group.id, true);
    if (group.volume !== 0) setGroupBusVolume(group.id, group.volume);
  }
}
