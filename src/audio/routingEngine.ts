/**
 * Routing Engine
 *
 * Intercepts superdough's master gainNode output and routes it through
 * a custom effects chain before reaching AudioContext.destination.
 *
 * Architecture:
 *   [superdough internal] → [superdough gainNode]
 *     → [routerInputGain] → [effect nodes chain]
 *       → [masterGain] → [masterAnalyser] → [destination]
 *
 * The effects chain is rebuilt whenever store.effects or store.connections change.
 * Effects that don't have specific cable connections are applied in series to all audio.
 */

import { gainNode as superdoughGainNode, getAudioContext } from 'superdough';
import { useStore } from '../state/store';
import type { Effect } from '../types/effects';
import { createEffectNode, updateEffectNodeParams, type EffectAudioNode } from './effectNodeFactory';

let masterGain: GainNode | null = null;
let masterAnalyser: AnalyserNode | null = null;
let effectNodes: Map<string, EffectAudioNode> = new Map();
let initialized = false;

export function initRoutingEngine(): void {
  if (initialized) return;
  initialized = true;

  const ctx = getAudioContext();

  // Create master chain: masterGain → masterAnalyser → destination
  masterGain = ctx.createGain();
  masterAnalyser = ctx.createAnalyser();
  masterAnalyser.fftSize = 1024;
  masterAnalyser.smoothingTimeConstant = 0.8;

  masterGain.connect(masterAnalyser);
  masterAnalyser.connect(ctx.destination);

  // Intercept superdough's gainNode: disconnect from destination, route through our chain
  try {
    // superdough gainNode connects to destination by default
    // We need to disconnect and re-route
    const sdGain = superdoughGainNode as GainNode;
    sdGain.disconnect();
    sdGain.connect(masterGain);
  } catch {
    // gainNode may not be connected yet (first init); connect will happen via normal flow
    const sdGain = superdoughGainNode as GainNode;
    sdGain.connect(masterGain);
  }

  // Apply initial master volume
  const state = useStore.getState();
  masterGain.gain.value = state.masterVolume;

  // Subscribe to store changes
  useStore.subscribe((state) => {
    if (masterGain) {
      masterGain.gain.value = state.masterVolume;
    }
    rebuildEffectsChain(state.effects);
  });
}

export function getMasterAnalyser(): AnalyserNode | null {
  return masterAnalyser;
}

export function getMasterGain(): GainNode | null {
  return masterGain;
}

function rebuildEffectsChain(effects: Effect[]): void {
  const ctx = getAudioContext();
  if (!masterGain || !ctx) return;

  const sdGain = superdoughGainNode as GainNode;

  // Disconnect superdough's output from everything
  try { sdGain.disconnect(); } catch {}

  // Remove old effect nodes that no longer exist
  for (const [id, node] of effectNodes) {
    if (!effects.find((e) => e.id === id)) {
      try {
        node.inputNode.disconnect();
        node.outputNode.disconnect();
      } catch {}
      effectNodes.delete(id);
    }
  }

  // Create or update effect nodes
  for (const effect of effects) {
    if (effectNodes.has(effect.id)) {
      // Update params on existing node
      updateEffectNodeParams(effectNodes.get(effect.id)!, effect);
    } else {
      // Create new effect node
      const node = createEffectNode(ctx, effect);
      effectNodes.set(effect.id, node);
    }
  }

  // Build the chain of enabled effects in order
  const enabledEffects = effects.filter((e) => e.enabled && effectNodes.has(e.id));

  if (enabledEffects.length === 0) {
    // No effects: superdough → masterGain directly
    sdGain.connect(masterGain);
    return;
  }

  // Wire: superdough → first effect → ... → last effect → masterGain
  let prevOutput: AudioNode = sdGain;

  for (const effect of enabledEffects) {
    const node = effectNodes.get(effect.id)!;
    try { prevOutput.disconnect(); } catch {}
    prevOutput.connect(node.inputNode);
    prevOutput = node.outputNode;
  }

  // Disconnect previous final connection and connect to masterGain
  try { prevOutput.disconnect(); } catch {}
  prevOutput.connect(masterGain);
}
