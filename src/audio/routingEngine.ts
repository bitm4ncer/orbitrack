/**
 * Routing Engine
 *
 * Intercepts superdough's master gainNode output and routes it through
 * a master gain (for volume control) + master analyser (for VUMeter).
 *
 * Per-instrument effects are handled by superdoughAdapter via superdough
 * native parameters (room, delay, distortion, cutoff, etc.).
 *
 * Architecture:
 *   [superdough gainNode] → [masterGain] → [masterAnalyser] → destination
 */

import { gainNode as superdoughGainNode, getAudioContext } from 'superdough';
import { useStore } from '../state/store';

let masterGain: GainNode | null = null;
let masterAnalyser: AnalyserNode | null = null;
let initialized = false;

export function initRoutingEngine(): void {
  if (initialized) return;
  initialized = true;

  const ctx = getAudioContext();

  const gain = ctx.createGain();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.8;

  gain.connect(analyser);
  analyser.connect(ctx.destination);

  masterGain = gain;
  masterAnalyser = analyser;

  // Route superdough output through our master chain
  try {
    const sdGain = superdoughGainNode as GainNode;
    sdGain.disconnect();
    sdGain.connect(gain);
  } catch {
    const sdGain = superdoughGainNode as GainNode;
    sdGain.connect(gain);
  }

  // Apply initial master volume
  gain.gain.value = useStore.getState().masterVolume;

  // Keep master volume in sync
  useStore.subscribe((state) => {
    if (masterGain) masterGain.gain.value = state.masterVolume;
  });
}

export function getMasterAnalyser(): AnalyserNode | null {
  return masterAnalyser;
}

export function getMasterGain(): GainNode | null {
  return masterGain;
}
