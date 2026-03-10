/**
 * Per-orbit Web Audio effect chains.
 *
 * Signal path after intercept:
 *   [summingNode]
 *     → [EQ3: eqLow → eqMid → eqHigh]
 *     → [Chorus: chorusDryGain ──────────────────────────────┐]
 *     →          chorusDelay → chorusWetGain ─────────────────┤→ [chorusMix]
 *     → [Phaser: phaserDryGain ──────────────────────────────┐]
 *     →          allpass×N ←feedback─ → phaserWetGain ────── ┤→ [phaserMix]
 *     → [Filter: filterDryGain ──────────────────────────────┐]
 *     →          filterNode(+LFO) → filterWetGain ───────────┤→ [filterMix]
 *     → [Distort: distortDryGain ──────────────────────────────────────────┐]
 *     →           preGain → waveshaper → postGain → tone → distortWetGain ─┤→ [distortMix]
 *     → [Reverb: reverbDryGain ─────────────────────────────────────────────────┐]
 *     →          preDelay → combs × 4 → allpass × 2 → reverbWetGain ───────────┤→ [reverbMix]
 *     → [Delay:  delayDryGain ──────────────────────────────────────────────────────────┐]
 *     →          delayNode ←(feedback via highCut)─ → delayWetGain ───────────────────┤→ [delayMix]
 *   [delayMix] → [orbit.output] → ... → destination
 */

import { getAudioContext, getSuperdoughAudioController } from 'superdough';
import type { Effect } from '../types/effects';
import { isAudioReady } from './engine';

const MAX_PHASER_STAGES = 12;

// Schroeder reverb comb filter delay times (seconds)
const COMB_DELAY_TIMES = [0.0297, 0.0371, 0.0411, 0.0437];

interface CombFilter {
  delay: DelayNode;
  feedback: GainNode;
  damp: BiquadFilterNode;
}

interface OrbitEffectChain {
  // EQ3
  eqLow: BiquadFilterNode;
  eqMid: BiquadFilterNode;
  eqHigh: BiquadFilterNode;
  // Chorus
  chorusDelay: DelayNode;
  chorusDelay2: DelayNode;
  chorusLFO: OscillatorNode;
  chorusLFO2: OscillatorNode;
  chorusLFOGain: GainNode;
  chorusLFOGain2: GainNode;
  chorusDryGain: GainNode;
  chorusWetGain: GainNode;
  chorusMix: GainNode;
  // Phaser
  phaserAllpass: BiquadFilterNode[];
  phaserLFO: OscillatorNode;
  phaserLFOGain: GainNode;
  phaserFeedback: GainNode;
  phaserDryGain: GainNode;
  phaserWetGain: GainNode;
  phaserMix: GainNode;
  // Filter
  filterNode: BiquadFilterNode;
  filterLFO: OscillatorNode;
  filterLFOGain: GainNode;
  filterDryGain: GainNode;
  filterWetGain: GainNode;
  filterMix: GainNode;
  // Distortion (orbit chain — WaveShaperNode)
  distortPreGain: GainNode;
  distortWaveshaper: WaveShaperNode;
  distortPostGain: GainNode;
  distortTone: BiquadFilterNode;
  distortDryGain: GainNode;
  distortWetGain: GainNode;
  distortMix: GainNode;
  // Reverb (orbit chain — Schroeder comb filter reverb)
  reverbPreDelay: DelayNode;
  reverbCombs: CombFilter[];
  reverbAllpass: BiquadFilterNode[];
  reverbDryGain: GainNode;
  reverbWetGain: GainNode;
  reverbMix: GainNode;
  // Delay (orbit chain — feedback delay with hi-cut filter)
  delayNode: DelayNode;
  delayFeedback: GainNode;
  delayHighCut: BiquadFilterNode;
  delayDryGain: GainNode;
  delayWetGain: GainNode;
  delayMix: GainNode;

  intercepted: boolean;
}

const chains = new Map<number, OrbitEffectChain>();
const orbitAnalysers = new Map<number, AnalyserNode>();

export function getOrbitAnalyser(orbitIndex: number): AnalyserNode | null {
  if (orbitAnalysers.has(orbitIndex)) return orbitAnalysers.get(orbitIndex)!;
  if (!isAudioReady()) return null;
  try {
    const orbit = getSuperdoughAudioController().getOrbit(orbitIndex);
    const outputNode = orbit.output as unknown as AudioNode;
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

/**
 * Build a WaveShaperNode curve for the given distortion type and drive amount.
 * type: 0=soft clip, 1=hard clip, 2=tube (asymmetric), 3=fuzz
 * drive: 0–1
 */
function makeDistortionCurve(type: number, drive: number): Float32Array {
  const N = 512;
  const curve = new Float32Array(N);
  const d = Math.max(0, Math.min(1, drive));

  for (let i = 0; i < N; i++) {
    const x = (i * 2 / (N - 1)) - 1; // −1 to +1
    let y: number;

    switch (type) {
      case 0: { // Soft clip — warm, symmetric tanh overdrive
        const k = 1 + d * 50;
        y = Math.tanh(x * k) / Math.tanh(k);
        break;
      }
      case 1: { // Hard clip — sharp transistor/diode clipping
        const k = 1 + d * 100;
        y = Math.max(-1, Math.min(1, x * k));
        break;
      }
      case 2: { // Tube — asymmetric even-harmonic saturation (class A amp)
        const k = 1 + d * 25;
        const kx = x * k;
        // Positive side clips harder (more common in tube push-pull designs)
        y = kx >= 0
          ? 1 - Math.exp(-kx)
          : -(1 - Math.exp(kx * 0.8));
        y = Math.max(-1, Math.min(1, y));
        break;
      }
      case 3: { // Fuzz — extreme near-square-wave saturation
        const k = 1 + d * 200;
        const kx = x * k;
        y = Math.sign(kx) * (1 - Math.exp(-Math.abs(kx)));
        y = Math.max(-1, Math.min(1, y));
        break;
      }
      default:
        y = x;
    }

    // At drive=0: linear passthrough
    curve[i] = d < 0.001 ? x : y;
  }

  return curve;
}

function createChain(ac: AudioContext): OrbitEffectChain {
  // ─── EQ3 ─────────────────────────────────────────────────────────────────
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

  // ─── Chorus (2 detuned delay lines for richer doubling) ──────────────────
  const chorusDryGain = ac.createGain();
  chorusDryGain.gain.value = 1;

  const chorusWetGain = ac.createGain();
  chorusWetGain.gain.value = 0;

  const chorusMix = ac.createGain();
  chorusMix.gain.value = 1;

  // Voice 1
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

  // Voice 2 — slightly detuned LFO and offset delay for doubling richness
  const chorusDelay2 = ac.createDelay(0.05);
  chorusDelay2.delayTime.value = 0.028; // offset from voice 1

  const chorusLFO2 = ac.createOscillator();
  chorusLFO2.type = 'sine';
  chorusLFO2.frequency.value = 1.73; // golden-ratio-ish offset
  chorusLFO2.start();

  const chorusLFOGain2 = ac.createGain();
  chorusLFOGain2.gain.value = 0.005;

  chorusLFO2.connect(chorusLFOGain2);
  chorusLFOGain2.connect(chorusDelay2.delayTime);

  eqHigh.connect(chorusDryGain);
  chorusDryGain.connect(chorusMix);
  eqHigh.connect(chorusDelay);
  eqHigh.connect(chorusDelay2);
  chorusDelay.connect(chorusWetGain);
  chorusDelay2.connect(chorusWetGain);
  chorusWetGain.connect(chorusMix);

  // ─── Phaser (all-pass chain + feedback) ──────────────────────────────────
  const phaserAllpass: BiquadFilterNode[] = [];
  for (let i = 0; i < MAX_PHASER_STAGES; i++) {
    const ap = ac.createBiquadFilter();
    ap.type = 'allpass';
    ap.frequency.value = 1000;
    ap.Q.value = 0.01; // inactive — negligible phase shift
    phaserAllpass.push(ap);
  }
  for (let i = 0; i < MAX_PHASER_STAGES - 1; i++) {
    phaserAllpass[i].connect(phaserAllpass[i + 1]);
  }

  const phaserLFO = ac.createOscillator();
  phaserLFO.type = 'sine';
  phaserLFO.frequency.value = 0.5;
  phaserLFO.start();

  const phaserLFOGain = ac.createGain();
  phaserLFOGain.gain.value = 840;

  phaserLFO.connect(phaserLFOGain);
  // Modulate detune (cents) — multiplicative, so frequency never reaches zero
  for (const stage of phaserAllpass) {
    phaserLFOGain.connect(stage.detune);
  }

  // Feedback: last stage → feedbackGain → first stage (Web Audio handles cycle with 1-block delay)
  const phaserFeedback = ac.createGain();
  phaserFeedback.gain.value = 0;
  phaserAllpass[MAX_PHASER_STAGES - 1].connect(phaserFeedback);
  phaserFeedback.connect(phaserAllpass[0]);

  const phaserDryGain = ac.createGain();
  phaserDryGain.gain.value = 1;

  const phaserWetGain = ac.createGain();
  phaserWetGain.gain.value = 0;

  const phaserMix = ac.createGain();
  phaserMix.gain.value = 1;

  chorusMix.connect(phaserDryGain);
  phaserDryGain.connect(phaserMix);
  chorusMix.connect(phaserAllpass[0]);
  phaserAllpass[MAX_PHASER_STAGES - 1].connect(phaserWetGain);
  phaserWetGain.connect(phaserMix);

  // ─── Filter (BiquadFilter + LFO on cutoff) ────────────────────────────────
  const filterNode = ac.createBiquadFilter();
  filterNode.type = 'lowpass';
  filterNode.frequency.value = 2000;
  filterNode.Q.value = 1;

  // LFO modulates cutoff frequency via detune (cents — multiplicative, safe)
  const filterLFO = ac.createOscillator();
  filterLFO.type = 'sine';
  filterLFO.frequency.value = 1;
  filterLFO.start();

  const filterLFOGain = ac.createGain();
  filterLFOGain.gain.value = 0; // disabled by default

  filterLFO.connect(filterLFOGain);
  filterLFOGain.connect(filterNode.detune);

  const filterDryGain = ac.createGain();
  filterDryGain.gain.value = 1;

  const filterWetGain = ac.createGain();
  filterWetGain.gain.value = 0;

  const filterMix = ac.createGain();
  filterMix.gain.value = 1;

  phaserMix.connect(filterDryGain);
  filterDryGain.connect(filterMix);
  phaserMix.connect(filterNode);
  filterNode.connect(filterWetGain);
  filterWetGain.connect(filterMix);

  // ─── Distortion (WaveShaperNode, 4 types) ────────────────────────────────
  const distortPreGain = ac.createGain();
  distortPreGain.gain.value = 1;

  const distortWaveshaper = ac.createWaveShaper();
  distortWaveshaper.oversample = '4x';
  distortWaveshaper.curve = makeDistortionCurve(0, 0);

  const distortPostGain = ac.createGain();
  distortPostGain.gain.value = 1;

  const distortTone = ac.createBiquadFilter();
  distortTone.type = 'lowpass';
  distortTone.frequency.value = 8000;

  const distortDryGain = ac.createGain();
  distortDryGain.gain.value = 1;

  const distortWetGain = ac.createGain();
  distortWetGain.gain.value = 0;

  const distortMix = ac.createGain();
  distortMix.gain.value = 1;

  filterMix.connect(distortDryGain);
  distortDryGain.connect(distortMix);
  filterMix.connect(distortPreGain);
  distortPreGain.connect(distortWaveshaper);
  distortWaveshaper.connect(distortPostGain);
  distortPostGain.connect(distortTone);
  distortTone.connect(distortWetGain);
  distortWetGain.connect(distortMix);

  // ─── Reverb (Schroeder: 4 comb filters + 2 allpass) ──────────────────────
  const reverbPreDelay = ac.createDelay(0.2);
  reverbPreDelay.delayTime.value = 0;

  const reverbCombs: CombFilter[] = COMB_DELAY_TIMES.map((t) => {
    const delay = ac.createDelay(2);
    delay.delayTime.value = t;

    const damp = ac.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 8000;

    const feedback = ac.createGain();
    feedback.gain.value = 0.7;

    // Feedback loop inside comb filter: delay → damp → feedback → delay
    delay.connect(damp);
    damp.connect(feedback);
    feedback.connect(delay);

    return { delay, feedback, damp };
  });

  // Allpass diffusion filters
  const reverbAllpass: BiquadFilterNode[] = [
    ac.createBiquadFilter(),
    ac.createBiquadFilter(),
  ];
  reverbAllpass[0].type = 'allpass';
  reverbAllpass[0].frequency.value = 800;
  reverbAllpass[0].Q.value = 1;
  reverbAllpass[1].type = 'allpass';
  reverbAllpass[1].frequency.value = 200;
  reverbAllpass[1].Q.value = 1;
  reverbAllpass[0].connect(reverbAllpass[1]);

  // All combs receive preDelay input; their outputs sum into allpass[0]
  for (const comb of reverbCombs) {
    reverbPreDelay.connect(comb.delay);
    comb.delay.connect(reverbAllpass[0]);
  }

  const reverbDryGain = ac.createGain();
  reverbDryGain.gain.value = 1;

  const reverbWetGain = ac.createGain();
  reverbWetGain.gain.value = 0;

  const reverbMix = ac.createGain();
  reverbMix.gain.value = 1;

  distortMix.connect(reverbDryGain);
  reverbDryGain.connect(reverbMix);
  distortMix.connect(reverbPreDelay);
  reverbAllpass[1].connect(reverbWetGain);
  reverbWetGain.connect(reverbMix);

  // ─── Delay (feedback delay with hi-cut filter in feedback path) ───────────
  const delayNode = ac.createDelay(2);
  delayNode.delayTime.value = 0.25;

  // Hi-cut filter inside feedback path gives analog tape-delay character
  const delayHighCut = ac.createBiquadFilter();
  delayHighCut.type = 'lowpass';
  delayHighCut.frequency.value = 8000;

  const delayFeedback = ac.createGain();
  delayFeedback.gain.value = 0.4;

  // Feedback loop: delayNode → delayHighCut → delayFeedback → delayNode
  delayNode.connect(delayHighCut);
  delayHighCut.connect(delayFeedback);
  delayFeedback.connect(delayNode);

  const delayDryGain = ac.createGain();
  delayDryGain.gain.value = 1;

  const delayWetGain = ac.createGain();
  delayWetGain.gain.value = 0;

  const delayMix = ac.createGain();
  delayMix.gain.value = 1;

  reverbMix.connect(delayDryGain);
  delayDryGain.connect(delayMix);
  reverbMix.connect(delayNode);
  delayNode.connect(delayWetGain);
  delayWetGain.connect(delayMix);

  return {
    eqLow, eqMid, eqHigh,
    chorusDelay, chorusDelay2, chorusLFO, chorusLFO2,
    chorusLFOGain, chorusLFOGain2,
    chorusDryGain, chorusWetGain, chorusMix,
    phaserAllpass, phaserLFO, phaserLFOGain, phaserFeedback,
    phaserDryGain, phaserWetGain, phaserMix,
    filterNode, filterLFO, filterLFOGain,
    filterDryGain, filterWetGain, filterMix,
    distortPreGain, distortWaveshaper, distortPostGain, distortTone,
    distortDryGain, distortWetGain, distortMix,
    reverbPreDelay, reverbCombs, reverbAllpass,
    reverbDryGain, reverbWetGain, reverbMix,
    delayNode, delayFeedback, delayHighCut,
    delayDryGain, delayWetGain, delayMix,
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

    try {
      (summingNode as GainNode).disconnect(outputNode as AudioNode);
    } catch {
      // May not be connected yet or already intercepted
    }

    summingNode.connect(chain.eqLow);
    chain.delayMix.connect(outputNode);

    chain.intercepted = true;
  }

  return chain;
}

const BIQUAD_FILTER_TYPES: BiquadFilterType[] = ['lowpass', 'highpass', 'bandpass', 'notch'];

/**
 * Apply (or bypass) all orbit-chain effects for the given orbit.
 * Covers: EQ3, Chorus, Phaser, Filter, Distortion, Reverb, Delay.
 * Must be called before superdough() so the intercept is in place.
 */
export function applyOrbitToneEffects(orbitIndex: number, effects: Effect[]): void {
  const eq3Effect     = effects.find((e) => e.type === 'eq3'        && e.enabled);
  const chorusEffect  = effects.find((e) => e.type === 'chorus'     && e.enabled);
  const phaserEffect  = effects.find((e) => e.type === 'phaser'     && e.enabled);
  const filterEffect  = effects.find((e) => e.type === 'filter'     && e.enabled);
  const distortEffect = effects.find((e) => e.type === 'distortion' && e.enabled);
  const reverbEffect  = effects.find((e) => e.type === 'reverb'     && e.enabled);
  const delayEffect   = effects.find((e) => e.type === 'delay'      && e.enabled);

  if (!eq3Effect && !chorusEffect && !phaserEffect && !filterEffect
    && !distortEffect && !reverbEffect && !delayEffect) {
    const chain = chains.get(orbitIndex);
    if (chain?.intercepted) {
      chain.eqLow.gain.value          = 0;
      chain.eqMid.gain.value          = 0;
      chain.eqHigh.gain.value         = 0;
      chain.chorusWetGain.gain.value  = 0;
      chain.chorusDryGain.gain.value  = 1;
      chain.phaserWetGain.gain.value  = 0;
      chain.phaserDryGain.gain.value  = 1;
      chain.filterLFOGain.gain.value  = 0;
      chain.filterWetGain.gain.value  = 0;
      chain.filterDryGain.gain.value  = 1;
      chain.distortWetGain.gain.value = 0;
      chain.distortDryGain.gain.value = 1;
      chain.reverbWetGain.gain.value  = 0;
      chain.reverbDryGain.gain.value  = 1;
      chain.delayWetGain.gain.value   = 0;
      chain.delayDryGain.gain.value   = 1;
    }
    return;
  }

  const chain = ensureIntercepted(orbitIndex);
  const now   = chain.eqLow.context.currentTime;
  const ramp  = 0.02; // 20 ms smoothing — eliminates coefficient discontinuity clicks

  // ─── EQ3 ─────────────────────────────────────────────────────────────────
  if (eq3Effect) {
    const p = eq3Effect.params;
    chain.eqLow.frequency.value  = p.lowFreq  ?? 200;
    chain.eqLow.gain.value       = p.low      ?? 0;
    chain.eqMid.frequency.value  = p.midFreq  ?? 1000;
    chain.eqMid.Q.value          = p.midQ     ?? 1;
    chain.eqMid.gain.value       = p.mid      ?? 0;
    chain.eqHigh.frequency.value = p.highFreq ?? 4000;
    chain.eqHigh.gain.value      = p.high     ?? 0;
  } else {
    chain.eqLow.gain.value  = 0;
    chain.eqMid.gain.value  = 0;
    chain.eqHigh.gain.value = 0;
  }

  // ─── Chorus ──────────────────────────────────────────────────────────────
  if (chorusEffect) {
    const p      = chorusEffect.params;
    const amount = p.amount ?? 0.5;
    const spread = p.spread ?? 0.3;

    chain.chorusLFO.frequency.value    = p.rate  ?? 1.5;
    chain.chorusLFOGain.gain.value     = p.depth ?? 0.005;
    chain.chorusDelay.delayTime.value  = p.delay ?? 0.02;
    // Voice 2: offset delay for spread, slightly detuned LFO
    chain.chorusDelay2.delayTime.value = (p.delay ?? 0.02) + spread * 0.012;
    chain.chorusLFOGain2.gain.value    = (p.depth ?? 0.005) * (1 + spread * 0.5);

    chain.chorusDryGain.gain.value = Math.cos(amount * Math.PI / 2);
    chain.chorusWetGain.gain.value = Math.sin(amount * Math.PI / 2) * 0.5; // ÷2 because 2 voices
  } else {
    chain.chorusWetGain.gain.value = 0;
    chain.chorusDryGain.gain.value = 1;
  }

  // ─── Phaser ──────────────────────────────────────────────────────────────
  if (phaserEffect) {
    const p        = phaserEffect.params;
    const amount   = p.amount   ?? 0.5;
    const stages   = Math.max(2, Math.min(MAX_PHASER_STAGES, Math.round(p.stages ?? 4)));
    const rate     = p.rate     ?? 0.5;
    const baseFreq = p.baseFreq ?? 1000;
    const depth    = p.depth    ?? 0.7;
    const feedback = p.feedback ?? 0;

    chain.phaserLFO.frequency.setTargetAtTime(rate, now, ramp);
    chain.phaserLFOGain.gain.setTargetAtTime(depth * 1200, now, ramp);
    // Feedback: positive → notch reinforcement; keep below 0.9 to avoid instability
    chain.phaserFeedback.gain.setTargetAtTime(Math.min(0.9, feedback), now, ramp);

    for (let i = 0; i < MAX_PHASER_STAGES; i++) {
      chain.phaserAllpass[i].frequency.setTargetAtTime(baseFreq, now, ramp);
      // Active stages: Q=5 for clear notches; inactive: Q=0.01 (transparent)
      chain.phaserAllpass[i].Q.setTargetAtTime(i < stages ? 5 : 0.01, now, ramp);
    }

    chain.phaserDryGain.gain.setTargetAtTime(Math.cos(amount * Math.PI / 2), now, ramp);
    chain.phaserWetGain.gain.setTargetAtTime(Math.sin(amount * Math.PI / 2), now, ramp);
  } else {
    chain.phaserFeedback.gain.setTargetAtTime(0, now, ramp);
    chain.phaserWetGain.gain.setTargetAtTime(0, now, ramp);
    chain.phaserDryGain.gain.setTargetAtTime(1, now, ramp);
  }

  // ─── Filter ──────────────────────────────────────────────────────────────
  if (filterEffect) {
    const p        = filterEffect.params;
    const amount   = p.amount    ?? 1;
    const typeIdx  = Math.max(0, Math.min(3, Math.round(p.filterType ?? 0)));
    const freq     = p.frequency ?? 2000;
    const q        = p.q        ?? 1;
    const lfoRate  = p.lfoRate  ?? 1;
    const lfoDepth = p.lfoDepth ?? 0;

    chain.filterNode.type = BIQUAD_FILTER_TYPES[typeIdx];
    chain.filterNode.frequency.setTargetAtTime(freq, now, ramp);
    chain.filterNode.Q.setTargetAtTime(q, now, ramp);
    chain.filterLFO.frequency.setTargetAtTime(lfoRate, now, ramp);
    // LFO depth in cents: depth=1 → ±1 octave sweep around cutoff
    chain.filterLFOGain.gain.setTargetAtTime(lfoDepth * 1200, now, ramp);
    chain.filterDryGain.gain.setTargetAtTime(Math.cos(amount * Math.PI / 2), now, ramp);
    chain.filterWetGain.gain.setTargetAtTime(Math.sin(amount * Math.PI / 2), now, ramp);
  } else {
    chain.filterLFOGain.gain.setTargetAtTime(0, now, ramp);
    chain.filterWetGain.gain.setTargetAtTime(0, now, ramp);
    chain.filterDryGain.gain.setTargetAtTime(1, now, ramp);
  }

  // ─── Distortion ──────────────────────────────────────────────────────────
  if (distortEffect) {
    const p      = distortEffect.params;
    const type   = Math.max(0, Math.min(3, Math.round(p.type   ?? 0)));
    const drive  = p.drive  ?? 0.5;
    const amount = p.amount ?? 1;
    const tone   = p.tone   ?? 8000;
    const output = p.output ?? 0; // dB

    chain.distortWaveshaper.curve = makeDistortionCurve(type, drive);
    chain.distortTone.frequency.setTargetAtTime(tone, now, ramp);
    chain.distortPostGain.gain.setTargetAtTime(Math.pow(10, output / 20), now, ramp);
    chain.distortDryGain.gain.setTargetAtTime(Math.cos(amount * Math.PI / 2), now, ramp);
    chain.distortWetGain.gain.setTargetAtTime(Math.sin(amount * Math.PI / 2), now, ramp);
  } else {
    chain.distortWetGain.gain.setTargetAtTime(0, now, ramp);
    chain.distortDryGain.gain.setTargetAtTime(1, now, ramp);
  }

  // ─── Reverb ──────────────────────────────────────────────────────────────
  if (reverbEffect) {
    const p        = reverbEffect.params;
    const amount   = p.amount   ?? 0.3;
    const predelay = p.predelay ?? 0;
    const size     = p.size     ?? 0.5;
    const damp     = p.damp     ?? 0.5;

    chain.reverbPreDelay.delayTime.setTargetAtTime(predelay, now, ramp);

    // Size: feedback 0.5–0.9, delay scale 0.3–2.0×
    const fbGain   = 0.5 + size * 0.4;
    // Damp: LPF 8000–100 Hz (exponential scale feels more natural)
    const dampFreq = 8000 * Math.pow(0.0125, damp);

    for (let i = 0; i < chain.reverbCombs.length; i++) {
      const sizeScale = 0.3 + size * 1.7;
      chain.reverbCombs[i].delay.delayTime.setTargetAtTime(
        COMB_DELAY_TIMES[i] * sizeScale, now, ramp,
      );
      chain.reverbCombs[i].feedback.gain.setTargetAtTime(fbGain, now, ramp);
      chain.reverbCombs[i].damp.frequency.setTargetAtTime(dampFreq, now, ramp);
    }

    chain.reverbDryGain.gain.setTargetAtTime(Math.cos(amount * Math.PI / 2), now, ramp);
    chain.reverbWetGain.gain.setTargetAtTime(Math.sin(amount * Math.PI / 2), now, ramp);
  } else {
    chain.reverbWetGain.gain.setTargetAtTime(0, now, ramp);
    chain.reverbDryGain.gain.setTargetAtTime(1, now, ramp);
  }

  // ─── Delay ───────────────────────────────────────────────────────────────
  if (delayEffect) {
    const p        = delayEffect.params;
    const amount   = p.amount   ?? 0.3;
    const time     = p.time     ?? 0.25;
    const feedback = p.feedback ?? 0.4;
    const tone     = p.tone     ?? 8000;

    chain.delayNode.delayTime.setTargetAtTime(time,     now, ramp);
    chain.delayFeedback.gain.setTargetAtTime(feedback,  now, ramp);
    chain.delayHighCut.frequency.setTargetAtTime(tone,  now, ramp);
    chain.delayDryGain.gain.setTargetAtTime(Math.cos(amount * Math.PI / 2), now, ramp);
    chain.delayWetGain.gain.setTargetAtTime(Math.sin(amount * Math.PI / 2), now, ramp);
  } else {
    chain.delayWetGain.gain.setTargetAtTime(0, now, ramp);
    chain.delayDryGain.gain.setTargetAtTime(1, now, ramp);
  }
}
