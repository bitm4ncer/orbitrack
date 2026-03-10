/**
 * Routing Engine
 *
 * Superdough's internal audio chain:
 *   orbit.output → StereoPanner → ChannelSplitter → channelMerger
 *                                                         ↓
 *                                                  destinationGain  ← THIS is the real master GainNode
 *                                                         ↓
 *                                                    ctx.destination
 *
 * destinationGain lives at: getSuperdoughAudioController().output.destinationGain
 * (the .output property on the controller is the AudioController class, not an orbit)
 *
 * We tap destinationGain as a side-connection to masterAnalyser (leaf node).
 * We set destinationGain.gain.value for master volume control.
 * No audio path interception, no disconnecting anything.
 */

import { getAudioContext, getSuperdoughAudioController } from 'superdough';
import { useStore } from '../state/store';

let masterAnalyser: AnalyserNode | null = null;
let initialized = false;
let destinationGainTapped = false;

function getDestinationGain(): GainNode | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((getSuperdoughAudioController() as any).output as any).destinationGain as GainNode ?? null;
  } catch {
    return null;
  }
}

function applyVolume(vol: number): void {
  const dg = getDestinationGain();
  if (dg) dg.gain.value = vol;
}

function tryTapDestinationGain(): void {
  if (destinationGainTapped || !masterAnalyser) return;
  const dg = getDestinationGain();
  if (!dg) return;
  try {
    dg.connect(masterAnalyser); // side-tap: dg still outputs to ctx.destination normally
    destinationGainTapped = true;
  } catch {
    // Retry next frame
  }
}

export function initRoutingEngine(): void {
  if (initialized) return;
  initialized = true;

  const ctx = getAudioContext();

  // Metering-only analyser — leaf node, never connected to destination
  const analyser = ctx.createAnalyser();
  // Larger fftSize → more samples per RMS frame → smoother, more accurate reading.
  // smoothingTimeConstant only affects FFT magnitude data, NOT getFloatTimeDomainData,
  // so set it to 0 (we apply our own ballistics in the VU meter draw loop).
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0;
  masterAnalyser = analyser;

  applyVolume(useStore.getState().masterVolume);
  useStore.subscribe((state) => applyVolume(state.masterVolume));

  tryTapDestinationGain();
}

export function getMasterAnalyser(): AnalyserNode | null {
  tryTapDestinationGain(); // retry each frame until tapped
  return masterAnalyser;
}

export function getMasterGain(): GainNode | null {
  return getDestinationGain();
}
