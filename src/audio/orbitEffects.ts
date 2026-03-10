/**
 * Per-orbit Web Audio effect chains for EQ3 and Chorus.
 * These effects are not natively supported by superdough, so we intercept
 * each orbit's internal signal path and insert native Web Audio nodes.
 *
 * Architecture after intercept:
 *   [orbit.summingNode] → [eqLow] → [eqMid] → [eqHigh]
 *                       → [chorusDry] → [chorusMix] → [orbit.output]
 *                       → [chorusDelay] → [chorusWet] ↗
 *   [orbit.output] → [po StereoPanner] → ... → destination  (unchanged)
 */

import { getAudioContext, getSuperdoughAudioController } from 'superdough';
import type { Effect } from '../types/effects';
import { isAudioReady } from './engine';

interface OrbitEffectChain {
  // EQ3
  eqLow: BiquadFilterNode;
  eqMid: BiquadFilterNode;
  eqHigh: BiquadFilterNode;
  // Chorus
  chorusDelay: DelayNode;
  chorusLFO: OscillatorNode;
  chorusLFOGain: GainNode;
  chorusDryGain: GainNode;
  chorusWetGain: GainNode;
  chorusMix: GainNode;
  intercepted: boolean;
}

const chains = new Map<number, OrbitEffectChain>();

const orbitAnalysers = new Map<number, AnalyserNode>();

export function getOrbitAnalyser(orbitIndex: number): AnalyserNode | null {
  if (orbitAnalysers.has(orbitIndex)) return orbitAnalysers.get(orbitIndex)!;
  // Don't create until audio is fully initialized — orbit nodes live in
  // superdough's pre-init AudioContext before setAudioContext(nativeCtx) runs.
  // Creating an AnalyserNode too early produces a cross-context connection that
  // causes superdough's connectToOutput to throw InvalidAccessError.
  if (!isAudioReady()) return null;
  try {
    const orbit = getSuperdoughAudioController().getOrbit(orbitIndex);
    const outputNode = orbit.output as unknown as AudioNode;
    // Use the orbit node's own context — avoids cross-context errors when
    // Tone.js hasn't shared its AudioContext with superdough yet.
    const ac = outputNode.context as AudioContext;
    const analyser = ac.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0;
    outputNode.connect(analyser); // side-tap leaf node — never connected to destination
    orbitAnalysers.set(orbitIndex, analyser);
    return analyser;
  } catch {
    return null;
  }
}

function createChain(ac: AudioContext): OrbitEffectChain {
  // --- EQ3 ---
  const eqLow = ac.createBiquadFilter();
  eqLow.type = 'lowshelf';
  eqLow.frequency.value = 200;
  eqLow.gain.value = 0;

  const eqMid = ac.createBiquadFilter();
  eqMid.type = 'peaking';
  eqMid.frequency.value = 1000;
  eqMid.Q.value = 1;
  eqMid.gain.value = 0;

  const eqHigh = ac.createBiquadFilter();
  eqHigh.type = 'highshelf';
  eqHigh.frequency.value = 4000;
  eqHigh.gain.value = 0;

  eqLow.connect(eqMid);
  eqMid.connect(eqHigh);

  // --- Chorus ---
  const chorusDryGain = ac.createGain();
  chorusDryGain.gain.value = 1;

  const chorusWetGain = ac.createGain();
  chorusWetGain.gain.value = 0;

  const chorusMix = ac.createGain();
  chorusMix.gain.value = 1;

  const chorusDelay = ac.createDelay(0.05);
  chorusDelay.delayTime.value = 0.02;

  const chorusLFO = ac.createOscillator();
  chorusLFO.type = 'sine';
  chorusLFO.frequency.value = 1.5;
  chorusLFO.start();

  const chorusLFOGain = ac.createGain();
  chorusLFOGain.gain.value = 0.005;

  chorusLFO.connect(chorusLFOGain);
  chorusLFOGain.connect(chorusDelay.delayTime);

  // eqHigh → dry path → chorusMix
  eqHigh.connect(chorusDryGain);
  chorusDryGain.connect(chorusMix);

  // eqHigh → wet path → chorusMix
  eqHigh.connect(chorusDelay);
  chorusDelay.connect(chorusWetGain);
  chorusWetGain.connect(chorusMix);

  return {
    eqLow, eqMid, eqHigh,
    chorusDelay, chorusLFO, chorusLFOGain,
    chorusDryGain, chorusWetGain, chorusMix,
    intercepted: false,
  };
}

function ensureIntercepted(orbitIndex: number): OrbitEffectChain {
  let chain = chains.get(orbitIndex);
  if (!chain) {
    const ac = getAudioContext() as AudioContext;
    chain = createChain(ac);
    chains.set(orbitIndex, chain);
  }

  if (!chain.intercepted) {
    const controller = getSuperdoughAudioController();
    const orbit = controller.getOrbit(orbitIndex);
    const summingNode = orbit.summingNode as unknown as AudioNode;
    const outputNode = orbit.output as unknown as AudioNode;

    // Remove direct summingNode → output connection
    try {
      (summingNode as GainNode).disconnect(outputNode as AudioNode);
    } catch {
      // May not be connected yet or already intercepted
    }

    // summingNode → eqLow → ... → chorusMix → outputNode
    summingNode.connect(chain.eqLow);
    chain.chorusMix.connect(outputNode);

    chain.intercepted = true;
  }

  return chain;
}

/**
 * Apply (or clear) EQ3 and Chorus effects for the given orbit.
 * Must be called before superdough() so the orbit intercept is in place
 * when the first note is scheduled.
 */
export function applyOrbitToneEffects(orbitIndex: number, effects: Effect[]): void {
  const eq3Effect = effects.find((e) => e.type === 'eq3' && e.enabled);
  const chorusEffect = effects.find((e) => e.type === 'chorus' && e.enabled);

  if (!eq3Effect && !chorusEffect) {
    // If chain was previously intercepted, set to bypass (unity gain, no EQ/chorus)
    const chain = chains.get(orbitIndex);
    if (chain?.intercepted) {
      chain.eqLow.gain.value = 0;
      chain.eqMid.gain.value = 0;
      chain.eqHigh.gain.value = 0;
      chain.chorusWetGain.gain.value = 0;
      chain.chorusDryGain.gain.value = 1;
    }
    return;
  }

  const chain = ensureIntercepted(orbitIndex);

  if (eq3Effect) {
    const p = eq3Effect.params;
    chain.eqLow.frequency.value = p.lowFreq ?? 200;
    chain.eqLow.gain.value = p.low ?? 0;
    chain.eqMid.frequency.value = p.midFreq ?? 1000;
    chain.eqMid.gain.value = p.mid ?? 0;
    chain.eqHigh.frequency.value = p.highFreq ?? 4000;
    chain.eqHigh.gain.value = p.high ?? 0;
  } else {
    chain.eqLow.gain.value = 0;
    chain.eqMid.gain.value = 0;
    chain.eqHigh.gain.value = 0;
  }

  if (chorusEffect) {
    const p = chorusEffect.params;
    const amount = p.amount ?? 0.5;
    chain.chorusLFO.frequency.value = p.rate ?? 1.5;
    chain.chorusLFOGain.gain.value = p.depth ?? 0.005;
    chain.chorusDelay.delayTime.value = p.delay ?? 0.02;
    // Constant-power crossfade: prevents +3.5 dB overdrive at 50% mix
    chain.chorusDryGain.gain.value = Math.cos(amount * Math.PI / 2);
    chain.chorusWetGain.gain.value = Math.sin(amount * Math.PI / 2);
  } else {
    chain.chorusWetGain.gain.value = 0;
    chain.chorusDryGain.gain.value = 1;
  }
}
