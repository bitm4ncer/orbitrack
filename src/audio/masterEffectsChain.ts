/**
 * Master channel effect chain.
 *
 * Signal path (after per-orbit chains and master volume gain):
 *   destinationGain
 *     → masterInput
 *     → [EQ3 → Chorus → Phaser → Filter → Distortion → Reverb → Delay
 *        → BitCrusher → ParamEQ → Tremolo → RingMod → Compressor
 *        → TranceGate → PingPong(via Delay mode 4)]
 *     → masterOutput
 *     → ctx.destination
 *
 * Intercepted once at init; the side-tap analyser on destinationGain is unaffected.
 */

import { getSuperdoughAudioController } from 'superdough';
import { useStore } from '../state/store';
import type { Effect } from '../types/effects';
import { EQ_BAND_TYPES, getTranceGatePhase as _getTranceGatePhase } from './orbitEffects';
import { DELAY_SYNC_DIVS } from './effectParams';

// Re-export so TranceGateDisplay can call getTranceGatePhase(-1) for master
export { _getTranceGatePhase as getTranceGatePhaseForMaster };

export const MASTER_ORBIT_INDEX = -1;

const MAX_PHASER_STAGES = 12;
const COMB_DELAY_TIMES = [0.0297, 0.0371, 0.0411, 0.0437];

const PARAM_EQ_DEFAULTS: { type: BiquadFilterType; freq: number; q: number }[] = [
  { type: 'highpass',  freq: 30,    q: 0.707 },
  { type: 'lowshelf',  freq: 120,   q: 0.707 },
  { type: 'peaking',   freq: 500,   q: 1.0   },
  { type: 'peaking',   freq: 3000,  q: 1.0   },
  { type: 'highshelf', freq: 10000, q: 0.707 },
  { type: 'lowpass',   freq: 20000, q: 0.707 },
];

const TREMOLO_WAVEFORMS: OscillatorType[] = ['sine', 'triangle', 'square'];
const RING_WAVEFORMS:    OscillatorType[] = ['sine', 'triangle', 'sawtooth'];
const BIQUAD_FILTER_TYPES: BiquadFilterType[] = ['lowpass', 'highpass', 'bandpass', 'notch'];

interface CombFilter { delay: DelayNode; feedback: GainNode; damp: BiquadFilterNode; }

// ── Trance Gate Scheduler (same as in orbitEffects.ts) ─────────────────────
class TranceGateScheduler {
  private readonly ac: AudioContext;
  private readonly gain: GainNode;
  private params: Record<string, number> = {};
  private bpm = 120;
  private running = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private nextStepTime = 0;
  private currentStep = 0;
  private readonly LOOKAHEAD = 0.15;
  private readonly TICK_MS   = 40;

  constructor(ac: AudioContext, gain: GainNode) { this.ac = ac; this.gain = gain; }

  update(params: Record<string, number>, bpm: number) {
    this.params = params;
    this.bpm    = bpm;
    if (!this.running) {
      this.running      = true;
      this.nextStepTime = this.ac.currentTime;
      this.currentStep  = 0;
      this.intervalId   = setInterval(() => this.tick(), this.TICK_MS);
    }
  }

  stop() {
    if (this.intervalId !== null) { clearInterval(this.intervalId); this.intervalId = null; }
    this.running = false;
    const now = this.ac.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(1, now);
  }

  private tick() {
    const now = this.ac.currentTime;
    if (this.nextStepTime < now - 1.0) { this.nextStepTime = now; this.currentStep = 0; }
    const until = now + this.LOOKAHEAD;
    while (this.nextStepTime < until) this.scheduleStep(this.nextStepTime);
  }

  private scheduleStep(time: number) {
    const steps   = Math.max(1, Math.round(this.params.steps ?? 8));
    const rate    = Math.max(1, this.params.rate ?? 8);
    const stepDur = (60 / this.bpm) * (4 / rate);
    const stepIdx = this.currentStep % steps;
    const isOn    = (this.params[`s${stepIdx}`] ?? 1) > 0.5;
    const attack  = Math.max(0.002, Math.min(0.499, this.params.attack  ?? 0.02)) * stepDur;
    const release = Math.max(0.002, Math.min(0.499, this.params.release ?? 0.2))  * stepDur;
    if (isOn) {
      this.gain.gain.setValueAtTime(0, time);
      this.gain.gain.linearRampToValueAtTime(1, time + attack);
      this.gain.gain.setValueAtTime(1, time + stepDur - release);
      this.gain.gain.linearRampToValueAtTime(0, time + stepDur);
    } else {
      this.gain.gain.setValueAtTime(0, time);
    }
    this.currentStep++;
    this.nextStepTime = time + stepDur;
  }
}

function makeBitCrushCurve(bits: number): Float32Array {
  const n = Math.max(1, Math.min(16, Math.round(bits)));
  const steps = Math.pow(2, n - 1);
  const N = 4096;
  const curve = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = (i * 2 / (N - 1)) - 1;
    curve[i] = Math.round(x * steps) / steps;
  }
  return curve;
}

function makeDistortionCurve(type: number, drive: number): Float32Array {
  const N = 512;
  const curve = new Float32Array(N);
  const d = Math.max(0, Math.min(1, drive));
  for (let i = 0; i < N; i++) {
    const x = (i * 2 / (N - 1)) - 1;
    let y: number;
    switch (type) {
      case 0: { const k = 1 + d * 50; y = Math.tanh(x * k) / Math.tanh(k); break; }
      case 1: { const k = 1 + d * 100; y = Math.max(-1, Math.min(1, x * k)); break; }
      case 2: { const k = 1 + d * 25; const kx = x * k; y = kx >= 0 ? 1 - Math.exp(-kx) : -(1 - Math.exp(kx * 0.8)); y = Math.max(-1, Math.min(1, y)); break; }
      case 3: { const k = 1 + d * 200; const kx = x * k; y = Math.sign(kx) * (1 - Math.exp(-Math.abs(kx))); y = Math.max(-1, Math.min(1, y)); break; }
      default: y = x;
    }
    curve[i] = d < 0.001 ? x : y;
  }
  return curve;
}

// ── Node graph ─────────────────────────────────────────────────────────────

export interface MasterChain {
  masterInput:  GainNode;
  masterOutput: GainNode;
  // Bypass state: when true, masterInput routes directly to masterOutput
  bypassed: boolean;
  // Curve-cache sentinels — avoid rebuilding WaveShaper curves when params unchanged
  _prevDistortType: number;
  _prevDistortDrive: number;
  _prevBcBits: number;
  _prevDbDrive: number;
  // EQ3
  eqLow: BiquadFilterNode; eqMid: BiquadFilterNode; eqHigh: BiquadFilterNode;
  // Chorus
  chorusDelay: DelayNode; chorusDelay2: DelayNode;
  chorusLFO: OscillatorNode; chorusLFO2: OscillatorNode;
  chorusLFOGain: GainNode; chorusLFOGain2: GainNode;
  chorusDryGain: GainNode; chorusWetGain: GainNode; chorusMix: GainNode;
  // Phaser
  phaserAllpass: BiquadFilterNode[];
  phaserLFO: OscillatorNode; phaserLFOGain: GainNode; phaserFeedback: GainNode;
  phaserDryGain: GainNode; phaserWetGain: GainNode; phaserMix: GainNode;
  // Filter
  filterNode: BiquadFilterNode; filterLFO: OscillatorNode; filterLFOGain: GainNode;
  filterDryGain: GainNode; filterWetGain: GainNode; filterMix: GainNode;
  // Distortion
  distortPreGain: GainNode; distortWaveshaper: WaveShaperNode;
  distortPostGain: GainNode; distortTone: BiquadFilterNode;
  distortDryGain: GainNode; distortWetGain: GainNode; distortMix: GainNode;
  // Reverb
  reverbPreDelay: DelayNode; reverbCombs: CombFilter[]; reverbAllpass: BiquadFilterNode[];
  reverbDryGain: GainNode; reverbWetGain: GainNode; reverbMix: GainNode;
  // Delay
  delayNode: DelayNode; delayFeedback: GainNode; delayHighCut: BiquadFilterNode;
  delayDryGain: GainNode; delayWetGain: GainNode; delayMix: GainNode;
  // BitCrusher
  bcSR: AudioWorkletNode | GainNode; bcBits: WaveShaperNode;
  bcDryGain: GainNode; bcWetGain: GainNode; bcMix: GainNode;
  // ParamEQ
  eqBands: BiquadFilterNode[];
  eqBandsDryGain: GainNode; eqBandsWetGain: GainNode; eqBandsMix: GainNode;
  // Tremolo
  tremoloLFO: OscillatorNode; tremoloLFOGain: GainNode; tremoloAmpGain: GainNode;
  // RingMod
  ringCarrier: OscillatorNode; ringModGain: GainNode;
  ringDryGain: GainNode; ringWetGain: GainNode; ringMix: GainNode;
  // Compressor
  compressor: DynamicsCompressorNode; compressorMakeup: GainNode;
  // TranceGate
  tranceGateScheduler: TranceGateScheduler;
  tranceGateGain: GainNode; tranceDryGain: GainNode; tranceWetGain: GainNode; tranceMix: GainNode;
  // PingPong
  ppDelay1: DelayNode; ppDelay2: DelayNode; ppFeedGain: GainNode; ppHiCut: BiquadFilterNode;
  ppPanL: StereoPannerNode; ppPanR: StereoPannerNode;
  ppWetGain: GainNode; ppDryGain: GainNode; ppMix: GainNode;
  // Drum Buss
  dbDry: GainNode; dbWet: GainNode; dbMix: GainNode;
  dbPreGain: GainNode; dbSaturator: WaveShaperNode;
  dbLowShelf: BiquadFilterNode; dbCompressor: DynamicsCompressorNode; dbOutput: GainNode;
  // Stereo Image
  siSplitter: ChannelSplitterNode; siMerger: ChannelMergerNode;
  siDL: GainNode; siDR: GainNode; siCL: GainNode; siCR: GainNode;
  siBassHPL: BiquadFilterNode; siBassHPR: BiquadFilterNode;
  siDry: GainNode; siWet: GainNode; siMix: GainNode;
  // Limiter
  limiterComp: DynamicsCompressorNode; limiterMakeup: GainNode;
  limiterDry: GainNode; limiterWet: GainNode; limiterMix: GainNode;
}

let masterChain: MasterChain | null = null;
let masterChainIntercepted = false;

export function createMasterChain(ac: AudioContext): MasterChain {
  const masterInput  = ac.createGain(); masterInput.gain.value  = 1;
  const masterOutput = ac.createGain(); masterOutput.gain.value = 1;

  // EQ3
  const eqLow  = ac.createBiquadFilter(); eqLow.type  = 'lowshelf';  eqLow.frequency.value  = 200;  eqLow.gain.value  = 0;
  const eqMid  = ac.createBiquadFilter(); eqMid.type  = 'peaking';   eqMid.frequency.value  = 1000; eqMid.Q.value = 1; eqMid.gain.value  = 0;
  const eqHigh = ac.createBiquadFilter(); eqHigh.type = 'highshelf'; eqHigh.frequency.value = 4000; eqHigh.gain.value = 0;
  masterInput.connect(eqLow); eqLow.connect(eqMid); eqMid.connect(eqHigh);

  // Drum Buss
  const dbDry = ac.createGain(); dbDry.gain.value = 1;
  const dbWet = ac.createGain(); dbWet.gain.value = 0;
  const dbMix = ac.createGain(); dbMix.gain.value = 1;
  const dbPreGain = ac.createGain(); dbPreGain.gain.value = 1;
  const dbSaturator = ac.createWaveShaper(); dbSaturator.oversample = '2x';
  dbSaturator.curve = makeDistortionCurve(0, 0.3) as Float32Array<ArrayBuffer>;
  const dbLowShelf = ac.createBiquadFilter(); dbLowShelf.type = 'lowshelf'; dbLowShelf.frequency.value = 80; dbLowShelf.gain.value = 3;
  const dbCompressor = ac.createDynamicsCompressor();
  dbCompressor.threshold.value = -18; dbCompressor.ratio.value = 2; dbCompressor.attack.value = 0.005; dbCompressor.release.value = 0.05; dbCompressor.knee.value = 6;
  const dbOutput = ac.createGain(); dbOutput.gain.value = 1;
  eqHigh.connect(dbDry); dbDry.connect(dbMix);
  eqHigh.connect(dbPreGain); dbPreGain.connect(dbSaturator); dbSaturator.connect(dbLowShelf);
  dbLowShelf.connect(dbCompressor); dbCompressor.connect(dbOutput); dbOutput.connect(dbWet); dbWet.connect(dbMix);

  // Chorus
  const chorusDryGain = ac.createGain(); chorusDryGain.gain.value = 1;
  const chorusWetGain = ac.createGain(); chorusWetGain.gain.value = 0;
  const chorusMix     = ac.createGain(); chorusMix.gain.value     = 1;
  const chorusDelay   = ac.createDelay(0.05); chorusDelay.delayTime.value  = 0.02;
  const chorusDelay2  = ac.createDelay(0.05); chorusDelay2.delayTime.value = 0.028;
  const chorusLFO     = ac.createOscillator(); chorusLFO.type  = 'sine'; chorusLFO.frequency.value  = 1.5;  chorusLFO.start();
  const chorusLFO2    = ac.createOscillator(); chorusLFO2.type = 'sine'; chorusLFO2.frequency.value = 1.73; chorusLFO2.start();
  const chorusLFOGain  = ac.createGain(); chorusLFOGain.gain.value  = 0.005;
  const chorusLFOGain2 = ac.createGain(); chorusLFOGain2.gain.value = 0.005;
  chorusLFO.connect(chorusLFOGain);   chorusLFOGain.connect(chorusDelay.delayTime);
  chorusLFO2.connect(chorusLFOGain2); chorusLFOGain2.connect(chorusDelay2.delayTime);
  dbMix.connect(chorusDryGain); chorusDryGain.connect(chorusMix);
  dbMix.connect(chorusDelay);   dbMix.connect(chorusDelay2);
  chorusDelay.connect(chorusWetGain); chorusDelay2.connect(chorusWetGain); chorusWetGain.connect(chorusMix);

  // Phaser
  const phaserAllpass: BiquadFilterNode[] = [];
  for (let i = 0; i < MAX_PHASER_STAGES; i++) {
    const ap = ac.createBiquadFilter(); ap.type = 'allpass'; ap.frequency.value = 1000; ap.Q.value = 0.01;
    phaserAllpass.push(ap);
  }
  for (let i = 0; i < MAX_PHASER_STAGES - 1; i++) phaserAllpass[i].connect(phaserAllpass[i + 1]);
  const phaserLFO      = ac.createOscillator(); phaserLFO.type = 'sine'; phaserLFO.frequency.value = 0.5; phaserLFO.start();
  const phaserLFOGain  = ac.createGain(); phaserLFOGain.gain.value = 840;
  phaserLFO.connect(phaserLFOGain);
  for (const stage of phaserAllpass) phaserLFOGain.connect(stage.detune);
  const phaserFeedback = ac.createGain(); phaserFeedback.gain.value = 0;
  phaserAllpass[MAX_PHASER_STAGES - 1].connect(phaserFeedback); phaserFeedback.connect(phaserAllpass[0]);
  const phaserDryGain  = ac.createGain(); phaserDryGain.gain.value = 1;
  const phaserWetGain  = ac.createGain(); phaserWetGain.gain.value = 0;
  const phaserMix      = ac.createGain(); phaserMix.gain.value     = 1;
  chorusMix.connect(phaserDryGain); phaserDryGain.connect(phaserMix);
  chorusMix.connect(phaserAllpass[0]); phaserAllpass[MAX_PHASER_STAGES - 1].connect(phaserWetGain); phaserWetGain.connect(phaserMix);

  // Filter
  const filterNode    = ac.createBiquadFilter(); filterNode.type = 'lowpass'; filterNode.frequency.value = 2000; filterNode.Q.value = 1;
  const filterLFO     = ac.createOscillator(); filterLFO.type = 'sine'; filterLFO.frequency.value = 1; filterLFO.start();
  const filterLFOGain = ac.createGain(); filterLFOGain.gain.value = 0;
  filterLFO.connect(filterLFOGain); filterLFOGain.connect(filterNode.detune);
  const filterDryGain = ac.createGain(); filterDryGain.gain.value = 1;
  const filterWetGain = ac.createGain(); filterWetGain.gain.value = 0;
  const filterMix     = ac.createGain(); filterMix.gain.value     = 1;
  phaserMix.connect(filterDryGain); filterDryGain.connect(filterMix);
  phaserMix.connect(filterNode); filterNode.connect(filterWetGain); filterWetGain.connect(filterMix);

  // Distortion
  const distortPreGain    = ac.createGain(); distortPreGain.gain.value = 1;
  const distortWaveshaper = ac.createWaveShaper(); distortWaveshaper.oversample = '2x';
  distortWaveshaper.curve = makeDistortionCurve(0, 0) as Float32Array<ArrayBuffer>;
  const distortPostGain   = ac.createGain(); distortPostGain.gain.value = 1;
  const distortTone       = ac.createBiquadFilter(); distortTone.type = 'lowpass'; distortTone.frequency.value = 8000;
  const distortDryGain    = ac.createGain(); distortDryGain.gain.value = 1;
  const distortWetGain    = ac.createGain(); distortWetGain.gain.value = 0;
  const distortMix        = ac.createGain(); distortMix.gain.value     = 1;
  filterMix.connect(distortDryGain); distortDryGain.connect(distortMix);
  filterMix.connect(distortPreGain); distortPreGain.connect(distortWaveshaper);
  distortWaveshaper.connect(distortPostGain); distortPostGain.connect(distortTone);
  distortTone.connect(distortWetGain); distortWetGain.connect(distortMix);

  // Reverb
  const reverbPreDelay = ac.createDelay(0.2); reverbPreDelay.delayTime.value = 0;
  const reverbCombs: CombFilter[] = COMB_DELAY_TIMES.map((t) => {
    const delay    = ac.createDelay(2); delay.delayTime.value = t;
    const damp     = ac.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 8000;
    const feedback = ac.createGain(); feedback.gain.value = 0.7;
    delay.connect(damp); damp.connect(feedback); feedback.connect(delay);
    return { delay, feedback, damp };
  });
  const reverbAllpass = [ac.createBiquadFilter(), ac.createBiquadFilter()];
  reverbAllpass[0].type = 'allpass'; reverbAllpass[0].frequency.value = 800; reverbAllpass[0].Q.value = 1;
  reverbAllpass[1].type = 'allpass'; reverbAllpass[1].frequency.value = 200; reverbAllpass[1].Q.value = 1;
  reverbAllpass[0].connect(reverbAllpass[1]);
  for (const comb of reverbCombs) { reverbPreDelay.connect(comb.delay); comb.delay.connect(reverbAllpass[0]); }
  const reverbDryGain = ac.createGain(); reverbDryGain.gain.value = 1;
  const reverbWetGain = ac.createGain(); reverbWetGain.gain.value = 0;
  const reverbMix     = ac.createGain(); reverbMix.gain.value     = 1;
  distortMix.connect(reverbDryGain); reverbDryGain.connect(reverbMix);
  distortMix.connect(reverbPreDelay); reverbAllpass[1].connect(reverbWetGain); reverbWetGain.connect(reverbMix);

  // Delay
  const delayNode     = ac.createDelay(2); delayNode.delayTime.value = 0.25;
  const delayHighCut  = ac.createBiquadFilter(); delayHighCut.type = 'lowpass'; delayHighCut.frequency.value = 8000;
  const delayFeedback = ac.createGain(); delayFeedback.gain.value = 0.4;
  delayNode.connect(delayHighCut); delayHighCut.connect(delayFeedback); delayFeedback.connect(delayNode);
  const delayDryGain  = ac.createGain(); delayDryGain.gain.value = 1;
  const delayWetGain  = ac.createGain(); delayWetGain.gain.value = 0;
  const delayMix      = ac.createGain(); delayMix.gain.value     = 1;
  reverbMix.connect(delayDryGain); delayDryGain.connect(delayMix);
  reverbMix.connect(delayNode); delayNode.connect(delayWetGain); delayWetGain.connect(delayMix);

  // BitCrusher
  let bcSR: AudioWorkletNode | GainNode;
  try { bcSR = new AudioWorkletNode(ac, 'bitcrusher-processor'); }
  catch { bcSR = ac.createGain(); (bcSR as GainNode).gain.value = 1; }
  const bcBits     = ac.createWaveShaper(); bcBits.oversample = 'none';
  bcBits.curve     = makeBitCrushCurve(16) as Float32Array<ArrayBuffer>;
  const bcDryGain  = ac.createGain(); bcDryGain.gain.value = 1;
  const bcWetGain  = ac.createGain(); bcWetGain.gain.value = 0;
  const bcMix      = ac.createGain(); bcMix.gain.value     = 1;
  delayMix.connect(bcDryGain); bcDryGain.connect(bcMix);
  delayMix.connect(bcSR); bcSR.connect(bcBits); bcBits.connect(bcWetGain); bcWetGain.connect(bcMix);

  // ParamEQ
  const eqBands = PARAM_EQ_DEFAULTS.map(({ type, freq, q }) => {
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; f.gain.value = 0; return f;
  });
  for (let i = 0; i < eqBands.length - 1; i++) eqBands[i].connect(eqBands[i + 1]);
  const eqBandsDryGain = ac.createGain(); eqBandsDryGain.gain.value = 1;
  const eqBandsWetGain = ac.createGain(); eqBandsWetGain.gain.value = 0;
  const eqBandsMix     = ac.createGain(); eqBandsMix.gain.value     = 1;
  bcMix.connect(eqBandsDryGain); eqBandsDryGain.connect(eqBandsMix);
  bcMix.connect(eqBands[0]); eqBands[eqBands.length - 1].connect(eqBandsWetGain); eqBandsWetGain.connect(eqBandsMix);

  // Tremolo
  const tremoloAmpGain  = ac.createGain(); tremoloAmpGain.gain.value = 1;
  const tremoloLFO      = ac.createOscillator(); tremoloLFO.type = 'sine'; tremoloLFO.frequency.value = 4; tremoloLFO.start();
  const tremoloLFOGain  = ac.createGain(); tremoloLFOGain.gain.value = 0;
  tremoloLFO.connect(tremoloLFOGain); tremoloLFOGain.connect(tremoloAmpGain.gain);
  eqBandsMix.connect(tremoloAmpGain);

  // RingMod
  const ringCarrier = ac.createOscillator(); ringCarrier.type = 'sine'; ringCarrier.frequency.value = 440; ringCarrier.start();
  const ringModGain = ac.createGain(); ringModGain.gain.value = 0;
  ringCarrier.connect(ringModGain.gain);
  const ringDryGain = ac.createGain(); ringDryGain.gain.value = 1;
  const ringWetGain = ac.createGain(); ringWetGain.gain.value = 0;
  const ringMix     = ac.createGain(); ringMix.gain.value     = 1;
  tremoloAmpGain.connect(ringDryGain); ringDryGain.connect(ringMix);
  tremoloAmpGain.connect(ringModGain); ringModGain.connect(ringWetGain); ringWetGain.connect(ringMix);

  // Compressor
  const compressor = ac.createDynamicsCompressor();
  compressor.threshold.value = -100; compressor.ratio.value = 1;
  compressor.attack.value = 0.003; compressor.release.value = 0.25; compressor.knee.value = 6;
  const compressorMakeup = ac.createGain(); compressorMakeup.gain.value = 1;
  ringMix.connect(compressor); compressor.connect(compressorMakeup);

  // Stereo Image
  const siSplitter = ac.createChannelSplitter(2);
  const siMerger   = ac.createChannelMerger(2);
  const siDL = ac.createGain(); siDL.channelCount = 1; siDL.channelCountMode = 'explicit'; siDL.gain.value = 1;
  const siDR = ac.createGain(); siDR.channelCount = 1; siDR.channelCountMode = 'explicit'; siDR.gain.value = 1;
  const siCL = ac.createGain(); siCL.channelCount = 1; siCL.channelCountMode = 'explicit'; siCL.gain.value = 0;
  const siCR = ac.createGain(); siCR.channelCount = 1; siCR.channelCountMode = 'explicit'; siCR.gain.value = 0;
  const siBassHPL = ac.createBiquadFilter(); siBassHPL.type = 'highpass'; siBassHPL.frequency.value = 120;
  const siBassHPR = ac.createBiquadFilter(); siBassHPR.type = 'highpass'; siBassHPR.frequency.value = 120;
  const siDry = ac.createGain(); siDry.gain.value = 1;
  const siWet = ac.createGain(); siWet.gain.value = 0;
  const siMix = ac.createGain(); siMix.gain.value = 1;
  compressorMakeup.connect(siDry); siDry.connect(siMix);
  compressorMakeup.connect(siSplitter);
  siSplitter.connect(siDL, 0); siSplitter.connect(siDR, 1);
  siSplitter.connect(siBassHPL, 0); siBassHPL.connect(siCL);
  siSplitter.connect(siBassHPR, 1); siBassHPR.connect(siCR);
  siDL.connect(siMerger, 0, 0); siCR.connect(siMerger, 0, 0);
  siDR.connect(siMerger, 0, 1); siCL.connect(siMerger, 0, 1);
  siMerger.connect(siWet); siWet.connect(siMix);

  // TranceGate
  const tranceGateGain      = ac.createGain(); tranceGateGain.gain.value = 1;
  const tranceDryGain       = ac.createGain(); tranceDryGain.gain.value  = 1;
  const tranceWetGain       = ac.createGain(); tranceWetGain.gain.value  = 0;
  const tranceMix           = ac.createGain(); tranceMix.gain.value      = 1;
  const tranceGateScheduler = new TranceGateScheduler(ac, tranceGateGain);
  siMix.connect(tranceDryGain); tranceDryGain.connect(tranceMix);
  siMix.connect(tranceGateGain); tranceGateGain.connect(tranceWetGain); tranceWetGain.connect(tranceMix);

  // PingPong
  const ppDelay1  = ac.createDelay(2); ppDelay1.delayTime.value = 0.25;
  const ppDelay2  = ac.createDelay(2); ppDelay2.delayTime.value = 0.25;
  const ppFeedGain = ac.createGain(); ppFeedGain.gain.value = 0;
  const ppHiCut   = ac.createBiquadFilter(); ppHiCut.type = 'lowpass'; ppHiCut.frequency.value = 8000;
  const ppPanL    = ac.createStereoPanner(); ppPanL.pan.value = -1;
  const ppPanR    = ac.createStereoPanner(); ppPanR.pan.value = 1;
  const ppWetGain = ac.createGain(); ppWetGain.gain.value = 0;
  const ppDryGain = ac.createGain(); ppDryGain.gain.value = 1;
  const ppMix     = ac.createGain(); ppMix.gain.value     = 1;
  tranceMix.connect(ppDryGain); ppDryGain.connect(ppMix);
  tranceMix.connect(ppDelay1); ppDelay1.connect(ppPanL); ppPanL.connect(ppWetGain); ppWetGain.connect(ppMix);
  ppDelay1.connect(ppFeedGain); ppFeedGain.connect(ppHiCut); ppHiCut.connect(ppDelay2);
  ppDelay2.connect(ppPanR); ppPanR.connect(ppWetGain);
  ppDelay2.connect(ppFeedGain);

  // Limiter
  const limiterComp = ac.createDynamicsCompressor();
  limiterComp.threshold.value = -0.3; limiterComp.ratio.value = 20;
  limiterComp.knee.value = 3; limiterComp.attack.value = 0.001; limiterComp.release.value = 0.08;
  const limiterMakeup = ac.createGain(); limiterMakeup.gain.value = 1;
  const limiterDry    = ac.createGain(); limiterDry.gain.value    = 1;
  const limiterWet    = ac.createGain(); limiterWet.gain.value    = 0;
  const limiterMix    = ac.createGain(); limiterMix.gain.value    = 1;
  ppMix.connect(limiterDry); limiterDry.connect(limiterMix);
  ppMix.connect(limiterComp); limiterComp.connect(limiterMakeup); limiterMakeup.connect(limiterWet); limiterWet.connect(limiterMix);

  // Chain output
  limiterMix.connect(masterOutput);

  return {
    masterInput, masterOutput,
    eqLow, eqMid, eqHigh,
    chorusDelay, chorusDelay2, chorusLFO, chorusLFO2, chorusLFOGain, chorusLFOGain2,
    chorusDryGain, chorusWetGain, chorusMix,
    phaserAllpass, phaserLFO, phaserLFOGain, phaserFeedback, phaserDryGain, phaserWetGain, phaserMix,
    filterNode, filterLFO, filterLFOGain, filterDryGain, filterWetGain, filterMix,
    distortPreGain, distortWaveshaper, distortPostGain, distortTone, distortDryGain, distortWetGain, distortMix,
    reverbPreDelay, reverbCombs, reverbAllpass, reverbDryGain, reverbWetGain, reverbMix,
    delayNode, delayFeedback, delayHighCut, delayDryGain, delayWetGain, delayMix,
    bcSR, bcBits, bcDryGain, bcWetGain, bcMix,
    eqBands, eqBandsDryGain, eqBandsWetGain, eqBandsMix,
    tremoloLFO, tremoloLFOGain, tremoloAmpGain,
    ringCarrier, ringModGain, ringDryGain, ringWetGain, ringMix,
    compressor, compressorMakeup,
    siSplitter, siMerger, siDL, siDR, siCL, siCR, siBassHPL, siBassHPR, siDry, siWet, siMix,
    tranceGateScheduler, tranceGateGain, tranceDryGain, tranceWetGain, tranceMix,
    ppDelay1, ppDelay2, ppFeedGain, ppHiCut, ppPanL, ppPanR, ppWetGain, ppDryGain, ppMix,
    dbDry, dbWet, dbMix, dbPreGain, dbSaturator, dbLowShelf, dbCompressor, dbOutput,
    limiterComp, limiterMakeup, limiterDry, limiterWet, limiterMix,
    bypassed: false,
    _prevDistortType: -1,
    _prevDistortDrive: -1,
    _prevBcBits: -1,
    _prevDbDrive: -1,
  };
}

function getDestinationGain(): GainNode | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((getSuperdoughAudioController() as any).output as any).destinationGain as GainNode ?? null;
  } catch { return null; }
}

function tryIntercept(): void {
  if (masterChainIntercepted) return;
  const dg = getDestinationGain();
  if (!dg) { requestAnimationFrame(tryIntercept); return; }

  // Create the master chain on the SAME context as destinationGain.
  // superdough may have created its audio controller before setAudioContext()
  // took effect, so getAudioContext() can return a different context than
  // the one destinationGain lives on.
  const ac = dg.context as AudioContext;
  if (!masterChain) masterChain = createMasterChain(ac);

  try { dg.disconnect(ac.destination); } catch { /* may already be disconnected */ }
  dg.connect(masterChain.masterInput);
  masterChain.masterOutput.connect(ac.destination);
  masterChainIntercepted = true;
}

export function initMasterChain(): void {
  tryIntercept();

  // Subscribe to store changes
  useStore.subscribe((state) => {
    applyMasterEffects(state.masterEffects, state.bpm);
  });
}

/** Apply effects to any MasterChain instance (used by both master and group buses). */
export function applyEffectsToChain(chain: MasterChain, effects: Effect[], bpm = 120): void {

  const eq3Effect        = effects.find((e) => e.type === 'eq3'          && e.enabled);
  const chorusEffect     = effects.find((e) => e.type === 'chorus'       && e.enabled);
  const phaserEffect     = effects.find((e) => e.type === 'phaser'       && e.enabled);
  const filterEffect     = effects.find((e) => e.type === 'filter'       && e.enabled);
  const distortEffect    = effects.find((e) => e.type === 'distortion'   && e.enabled);
  const reverbEffect     = effects.find((e) => e.type === 'reverb'       && e.enabled);
  const delayEffect      = effects.find((e) => e.type === 'delay'        && e.enabled);
  const bcEffect         = effects.find((e) => e.type === 'bitcrusher'   && e.enabled);
  const parameEffect     = effects.find((e) => e.type === 'parame'       && e.enabled);
  const tremoloEffect    = effects.find((e) => e.type === 'tremolo'      && e.enabled);
  const ringmodEffect    = effects.find((e) => e.type === 'ringmod'      && e.enabled);
  const compressorEffect = effects.find((e) => e.type === 'compressor'   && e.enabled);
  const tranceEffect     = effects.find((e) => e.type === 'trancegate'   && e.enabled);
  const drumbussEffect   = effects.find((e) => e.type === 'drumbuss'     && e.enabled);
  const stereoimageEffect= effects.find((e) => e.type === 'stereoimage'  && e.enabled);
  const limiterEffect    = effects.find((e) => e.type === 'limiter'      && e.enabled);

  const hasAny = eq3Effect || chorusEffect || phaserEffect || filterEffect
    || distortEffect || reverbEffect || delayEffect || bcEffect
    || parameEffect || tremoloEffect || ringmodEffect || compressorEffect
    || tranceEffect || drumbussEffect || stereoimageEffect || limiterEffect;

  // True bypass: when no effects are enabled, route masterInput → masterOutput directly,
  // completely removing ~80 DSP nodes from the signal path.
  if (!hasAny) {
    if (!chain.bypassed) {
      chain.tranceGateScheduler.stop();
      try { chain.masterInput.disconnect(chain.eqLow); } catch { /* ignore */ }
      try { chain.limiterMix.disconnect(chain.masterOutput); } catch { /* ignore */ }
      chain.masterInput.connect(chain.masterOutput);
      chain.bypassed = true;
    }
    return;
  }

  // Un-bypass if needed
  if (chain.bypassed) {
    try { chain.masterInput.disconnect(chain.masterOutput); } catch { /* ignore */ }
    chain.masterInput.connect(chain.eqLow);
    chain.limiterMix.connect(chain.masterOutput);
    chain.bypassed = false;
  }

  const now  = chain.eqLow.context.currentTime;
  const ramp = 0.02;

  // EQ3
  if (eq3Effect) {
    const p = eq3Effect.params;
    chain.eqLow.frequency.value  = p.lowFreq  ?? 200;  chain.eqLow.gain.value  = p.low  ?? 0;
    chain.eqMid.frequency.value  = p.midFreq  ?? 1000; chain.eqMid.Q.value     = p.midQ ?? 1; chain.eqMid.gain.value  = p.mid  ?? 0;
    chain.eqHigh.frequency.value = p.highFreq ?? 4000; chain.eqHigh.gain.value = p.high ?? 0;
  } else { chain.eqLow.gain.value = 0; chain.eqMid.gain.value = 0; chain.eqHigh.gain.value = 0; }

  // Chorus
  if (chorusEffect) {
    const p = chorusEffect.params; const amount = p.amount ?? 0.5; const spread = p.spread ?? 0.3;
    chain.chorusLFO.frequency.value    = p.rate  ?? 1.5;
    chain.chorusLFOGain.gain.value     = p.depth ?? 0.005;
    chain.chorusDelay.delayTime.value  = p.delay ?? 0.02;
    chain.chorusDelay2.delayTime.value = (p.delay ?? 0.02) + spread * 0.012;
    chain.chorusLFOGain2.gain.value    = (p.depth ?? 0.005) * (1 + spread * 0.5);
    chain.chorusDryGain.gain.value = Math.cos(amount * Math.PI / 2);
    chain.chorusWetGain.gain.value = Math.sin(amount * Math.PI / 2) * 0.5;
  } else { chain.chorusWetGain.gain.value = 0; chain.chorusDryGain.gain.value = 1; }

  // Phaser
  if (phaserEffect) {
    const p = phaserEffect.params;
    const amount = p.amount ?? 0.5; const stages = Math.max(2, Math.min(MAX_PHASER_STAGES, Math.round(p.stages ?? 4)));
    chain.phaserLFO.frequency.setTargetAtTime(p.rate ?? 0.5, now, ramp);
    chain.phaserLFOGain.gain.setTargetAtTime((p.depth ?? 0.7) * 1200, now, ramp);
    chain.phaserFeedback.gain.setTargetAtTime(Math.min(0.9, p.feedback ?? 0), now, ramp);
    for (let i = 0; i < MAX_PHASER_STAGES; i++) {
      chain.phaserAllpass[i].frequency.setTargetAtTime(p.baseFreq ?? 1000, now, ramp);
      chain.phaserAllpass[i].Q.setTargetAtTime(i < stages ? 5 : 0.01, now, ramp);
    }
    chain.phaserDryGain.gain.setTargetAtTime(Math.cos(amount * Math.PI / 2), now, ramp);
    chain.phaserWetGain.gain.setTargetAtTime(Math.sin(amount * Math.PI / 2), now, ramp);
  } else {
    chain.phaserFeedback.gain.setTargetAtTime(0, now, ramp);
    chain.phaserWetGain.gain.setTargetAtTime(0, now, ramp); chain.phaserDryGain.gain.setTargetAtTime(1, now, ramp);
  }

  // Filter
  if (filterEffect) {
    const p = filterEffect.params; const amount = p.amount ?? 1;
    chain.filterNode.type = BIQUAD_FILTER_TYPES[Math.max(0, Math.min(3, Math.round(p.filterType ?? 0)))];
    chain.filterNode.frequency.setTargetAtTime(p.frequency ?? 2000, now, ramp);
    chain.filterNode.Q.setTargetAtTime(p.q ?? 1, now, ramp);
    chain.filterLFO.frequency.setTargetAtTime(p.lfoRate ?? 1, now, ramp);
    chain.filterLFOGain.gain.setTargetAtTime((p.lfoDepth ?? 0) * 1200, now, ramp);
    chain.filterDryGain.gain.setTargetAtTime(Math.cos(amount * Math.PI / 2), now, ramp);
    chain.filterWetGain.gain.setTargetAtTime(Math.sin(amount * Math.PI / 2), now, ramp);
  } else {
    chain.filterLFOGain.gain.setTargetAtTime(0, now, ramp);
    chain.filterWetGain.gain.setTargetAtTime(0, now, ramp); chain.filterDryGain.gain.setTargetAtTime(1, now, ramp);
  }

  // Distortion
  if (distortEffect) {
    const p = distortEffect.params; const amount = p.amount ?? 1;
    const dType = Math.max(0, Math.min(3, Math.round(p.type ?? 0)));
    const dDrive = p.drive ?? 0.5;
    if (dType !== chain._prevDistortType || dDrive !== chain._prevDistortDrive) {
      chain._prevDistortType = dType; chain._prevDistortDrive = dDrive;
      chain.distortWaveshaper.curve = makeDistortionCurve(dType, dDrive) as Float32Array<ArrayBuffer>;
    }
    chain.distortTone.frequency.setTargetAtTime(p.tone ?? 8000, now, ramp);
    chain.distortPostGain.gain.setTargetAtTime(Math.pow(10, (p.output ?? 0) / 20), now, ramp);
    chain.distortDryGain.gain.setTargetAtTime(Math.cos(amount * Math.PI / 2), now, ramp);
    chain.distortWetGain.gain.setTargetAtTime(Math.sin(amount * Math.PI / 2), now, ramp);
  } else { chain.distortWetGain.gain.setTargetAtTime(0, now, ramp); chain.distortDryGain.gain.setTargetAtTime(1, now, ramp); }

  // Reverb
  if (reverbEffect) {
    const p = reverbEffect.params; const amount = p.amount ?? 0.3; const size = p.size ?? 0.5; const damp = p.damp ?? 0.5;
    chain.reverbPreDelay.delayTime.setTargetAtTime(p.predelay ?? 0, now, ramp);
    const fbGain = 0.5 + size * 0.4; const dampFreq = 8000 * Math.pow(0.0125, damp);
    for (let i = 0; i < chain.reverbCombs.length; i++) {
      chain.reverbCombs[i].delay.delayTime.setTargetAtTime(COMB_DELAY_TIMES[i] * (0.3 + size * 1.7), now, ramp);
      chain.reverbCombs[i].feedback.gain.setTargetAtTime(fbGain, now, ramp);
      chain.reverbCombs[i].damp.frequency.setTargetAtTime(dampFreq, now, ramp);
    }
    chain.reverbDryGain.gain.setTargetAtTime(Math.cos(amount * Math.PI / 2), now, ramp);
    chain.reverbWetGain.gain.setTargetAtTime(Math.sin(amount * Math.PI / 2), now, ramp);
  } else { chain.reverbWetGain.gain.setTargetAtTime(0, now, ramp); chain.reverbDryGain.gain.setTargetAtTime(1, now, ramp); }

  // Delay
  if (delayEffect) {
    const p = delayEffect.params; const amount = p.amount ?? 0.3;
    let time = p.time ?? 0.25;
    const feedback = p.feedback ?? 0.4; const tone = p.tone ?? 8000;
    const mode = Math.round(p.mode ?? 0);
    const sync = Math.round(p.sync ?? 0); const syncDiv = Math.round(p.syncDiv ?? 8);
    if (sync === 1 && bpm > 0) {
      const div = DELAY_SYNC_DIVS[Math.min(syncDiv, DELAY_SYNC_DIVS.length - 1)];
      time = Math.min(2.0, (60 / bpm) * div.mult);
    }
    if (mode === 4) {
      // PingPong: delay chain transparent, pp chain active
      chain.delayDryGain.gain.setTargetAtTime(1, now, ramp);
      chain.delayWetGain.gain.setTargetAtTime(0, now, ramp);
      chain.ppDelay1.delayTime.setTargetAtTime(time, now, ramp);
      chain.ppDelay2.delayTime.setTargetAtTime(time, now, ramp);
      chain.ppFeedGain.gain.setTargetAtTime(feedback, now, ramp);
      chain.ppHiCut.frequency.setTargetAtTime(tone, now, ramp);
      chain.ppPanL.pan.setTargetAtTime(-1, now, ramp);
      chain.ppPanR.pan.setTargetAtTime(1, now, ramp);
      chain.ppDryGain.gain.setTargetAtTime(Math.cos(amount * Math.PI / 2), now, ramp);
      chain.ppWetGain.gain.setTargetAtTime(Math.sin(amount * Math.PI / 2), now, ramp);
    } else {
      chain.delayNode.delayTime.setTargetAtTime(time, now, ramp);
      chain.delayFeedback.gain.setTargetAtTime(feedback, now, ramp);
      chain.delayHighCut.frequency.setTargetAtTime(tone, now, ramp);
      chain.delayDryGain.gain.setTargetAtTime(Math.cos(amount * Math.PI / 2), now, ramp);
      chain.delayWetGain.gain.setTargetAtTime(Math.sin(amount * Math.PI / 2), now, ramp);
    }
  } else { chain.delayWetGain.gain.setTargetAtTime(0, now, ramp); chain.delayDryGain.gain.setTargetAtTime(1, now, ramp); }

  // BitCrusher
  if (bcEffect) {
    const p = bcEffect.params; const amount = p.amount ?? 1;
    const bcBitsVal = Math.max(1, Math.min(16, Math.round(p.bits ?? 16)));
    if (bcBitsVal !== chain._prevBcBits) {
      chain._prevBcBits = bcBitsVal;
      chain.bcBits.curve = makeBitCrushCurve(bcBitsVal) as Float32Array<ArrayBuffer>;
    }
    if (chain.bcSR instanceof AudioWorkletNode) {
      const dsParam = chain.bcSR.parameters.get('downsample');
      if (dsParam) dsParam.setTargetAtTime(Math.max(0, Math.min(1, p.downsample ?? 0)), now, ramp);
    }
    chain.bcDryGain.gain.setTargetAtTime(Math.cos(amount * Math.PI / 2), now, ramp);
    chain.bcWetGain.gain.setTargetAtTime(Math.sin(amount * Math.PI / 2), now, ramp);
  } else { chain.bcWetGain.gain.setTargetAtTime(0, now, ramp); chain.bcDryGain.gain.setTargetAtTime(1, now, ramp); }

  // ParamEQ
  if (parameEffect) {
    const p = parameEffect.params; const bandKeys = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'];
    for (let i = 0; i < 6; i++) {
      const k = bandKeys[i];
      const defaultTypeIdx = EQ_BAND_TYPES.indexOf(PARAM_EQ_DEFAULTS[i].type);
      chain.eqBands[i].type = EQ_BAND_TYPES[Math.max(0, Math.min(5, Math.round(p[`${k}type`] ?? defaultTypeIdx)))] ?? 'peaking';
      chain.eqBands[i].frequency.setTargetAtTime(p[`${k}freq`] ?? PARAM_EQ_DEFAULTS[i].freq, now, ramp);
      chain.eqBands[i].gain.setTargetAtTime(p[`${k}gain`] ?? 0, now, ramp);
      chain.eqBands[i].Q.setTargetAtTime(p[`${k}q`] ?? PARAM_EQ_DEFAULTS[i].q, now, ramp);
    }
    chain.eqBandsDryGain.gain.setTargetAtTime(0, now, ramp);
    chain.eqBandsWetGain.gain.setTargetAtTime(1, now, ramp);
  } else { chain.eqBandsWetGain.gain.setTargetAtTime(0, now, ramp); chain.eqBandsDryGain.gain.setTargetAtTime(1, now, ramp); }

  // Tremolo
  if (tremoloEffect) {
    const p = tremoloEffect.params; const depth = Math.max(0, Math.min(1, p.amount ?? 0.5));
    chain.tremoloLFO.type = TREMOLO_WAVEFORMS[Math.max(0, Math.min(2, Math.round(p.waveform ?? 0)))];
    chain.tremoloLFO.frequency.setTargetAtTime(Math.max(0.1, p.rate ?? 4), now, ramp);
    chain.tremoloAmpGain.gain.setTargetAtTime(1 - depth / 2, now, ramp);
    chain.tremoloLFOGain.gain.setTargetAtTime(depth / 2, now, ramp);
  } else { chain.tremoloLFOGain.gain.setTargetAtTime(0, now, ramp); chain.tremoloAmpGain.gain.setTargetAtTime(1, now, ramp); }

  // RingMod
  if (ringmodEffect) {
    const p = ringmodEffect.params; const amount = Math.max(0, Math.min(1, p.amount ?? 1));
    chain.ringCarrier.type = RING_WAVEFORMS[Math.max(0, Math.min(2, Math.round(p.waveform ?? 0)))];
    chain.ringCarrier.frequency.setTargetAtTime(Math.max(1, p.frequency ?? 440), now, ramp);
    chain.ringDryGain.gain.setTargetAtTime(Math.cos(amount * Math.PI / 2), now, ramp);
    chain.ringWetGain.gain.setTargetAtTime(Math.sin(amount * Math.PI / 2), now, ramp);
  } else { chain.ringWetGain.gain.setTargetAtTime(0, now, ramp); chain.ringDryGain.gain.setTargetAtTime(1, now, ramp); }

  // Compressor
  if (compressorEffect) {
    const p = compressorEffect.params;
    chain.compressor.threshold.setTargetAtTime(p.threshold ?? -24, now, ramp);
    chain.compressor.ratio.setTargetAtTime(    p.ratio     ?? 4,   now, ramp);
    chain.compressor.attack.setTargetAtTime(   p.attack    ?? 0.003, now, ramp);
    chain.compressor.release.setTargetAtTime(  p.release   ?? 0.25,  now, ramp);
    chain.compressor.knee.setTargetAtTime(     p.knee      ?? 6,   now, ramp);
    chain.compressorMakeup.gain.setTargetAtTime(Math.pow(10, (p.makeupGain ?? 0) / 20), now, ramp);
  } else {
    chain.compressor.threshold.setTargetAtTime(-100, now, ramp);
    chain.compressor.ratio.setTargetAtTime(1, now, ramp);
    chain.compressorMakeup.gain.setTargetAtTime(1, now, ramp);
  }

  // TranceGate
  if (tranceEffect) {
    const p = tranceEffect.params; const amount = Math.max(0, Math.min(1, p.amount ?? 1));
    chain.tranceDryGain.gain.setTargetAtTime(Math.cos(amount * Math.PI / 2), now, ramp);
    chain.tranceWetGain.gain.setTargetAtTime(Math.sin(amount * Math.PI / 2), now, ramp);
    chain.tranceGateScheduler.update(p, bpm);
  } else {
    chain.tranceGateScheduler.stop();
    chain.tranceDryGain.gain.setTargetAtTime(1, now, ramp);
    chain.tranceWetGain.gain.setTargetAtTime(0, now, ramp);
  }

  // PingPong chain — controlled by delay mode=4
  {
    const delayHandlesPP = delayEffect && Math.round(delayEffect.params.mode ?? 0) === 4;
    if (!delayHandlesPP) {
      chain.ppFeedGain.gain.setTargetAtTime(0, now, ramp);
      chain.ppDryGain.gain.setTargetAtTime(1, now, ramp);
      chain.ppWetGain.gain.setTargetAtTime(0, now, ramp);
    }
  }

  // Drum Buss
  if (drumbussEffect) {
    const p = drumbussEffect.params; const drive = Math.max(0, Math.min(1, p.drive ?? 0.3));
    chain.dbPreGain.gain.setTargetAtTime(1 + drive * 9, now, ramp);
    if (drive !== chain._prevDbDrive) {
      chain._prevDbDrive = drive;
      chain.dbSaturator.curve = makeDistortionCurve(0, drive) as Float32Array<ArrayBuffer>;
    }
    chain.dbLowShelf.gain.setTargetAtTime(p.low ?? 3, now, ramp);
    chain.dbCompressor.ratio.setTargetAtTime(Math.max(1, p.compress ?? 2), now, ramp);
    chain.dbOutput.gain.setTargetAtTime(Math.pow(10, (p.output ?? 0) / 20), now, ramp);
    chain.dbDry.gain.setTargetAtTime(1 - (p.mix ?? 0.6), now, ramp);
    chain.dbWet.gain.setTargetAtTime(p.mix ?? 0.6, now, ramp);
  } else { chain.dbDry.gain.setTargetAtTime(1, now, ramp); chain.dbWet.gain.setTargetAtTime(0, now, ramp); }

  // Stereo Image
  if (stereoimageEffect) {
    const p = stereoimageEffect.params;
    const width = Math.max(0, Math.min(2, p.width ?? 1));
    const gD = 0.5 + 0.5 * width; const gC = 0.5 - 0.5 * width;
    chain.siDL.gain.setTargetAtTime(gD, now, ramp); chain.siDR.gain.setTargetAtTime(gD, now, ramp);
    chain.siCL.gain.setTargetAtTime(gC, now, ramp); chain.siCR.gain.setTargetAtTime(gC, now, ramp);
    chain.siBassHPL.frequency.setTargetAtTime(Math.max(20, p.monoLow ?? 120), now, ramp);
    chain.siBassHPR.frequency.setTargetAtTime(Math.max(20, p.monoLow ?? 120), now, ramp);
    chain.siDry.gain.setTargetAtTime(0, now, ramp); chain.siWet.gain.setTargetAtTime(1, now, ramp);
  } else {
    chain.siDL.gain.setTargetAtTime(1, now, ramp); chain.siDR.gain.setTargetAtTime(1, now, ramp);
    chain.siCL.gain.setTargetAtTime(0, now, ramp); chain.siCR.gain.setTargetAtTime(0, now, ramp);
    chain.siDry.gain.setTargetAtTime(1, now, ramp); chain.siWet.gain.setTargetAtTime(0, now, ramp);
  }

  // Limiter
  if (limiterEffect) {
    const p       = limiterEffect.params;
    const ceiling = Math.max(-12, Math.min(0, p.ceiling ?? -1.0));
    const release = Math.max(0.02, p.release ?? 0.08);
    const makeup  = Math.pow(10, -ceiling / 20); // auto-compensate: -3dB ceiling → +3dB makeup
    chain.limiterComp.threshold.setTargetAtTime(ceiling, now, ramp);
    chain.limiterComp.ratio.setTargetAtTime(20, now, ramp);
    chain.limiterComp.release.setTargetAtTime(release, now, ramp);
    chain.limiterMakeup.gain.setTargetAtTime(makeup, now, ramp);
    chain.limiterDry.gain.setTargetAtTime(0, now, ramp); chain.limiterWet.gain.setTargetAtTime(1, now, ramp);
  } else {
    chain.limiterComp.threshold.setTargetAtTime(0, now, ramp);
    chain.limiterComp.ratio.setTargetAtTime(1, now, ramp);
    chain.limiterMakeup.gain.setTargetAtTime(1, now, ramp);
    chain.limiterDry.gain.setTargetAtTime(1, now, ramp); chain.limiterWet.gain.setTargetAtTime(0, now, ramp);
  }
}

export function applyMasterEffects(effects: Effect[], bpm = 120): void {
  if (!masterChain) return;
  applyEffectsToChain(masterChain, effects, bpm);
}

/** Get the master ParamEQ bands for the frequency response display. */
export function getMasterParaEQBands(): BiquadFilterNode[] | null {
  return masterChain?.eqBands ?? null;
}

/** Get the master compressor node for the compressor display. */
export function getMasterCompressorNode(): DynamicsCompressorNode | null {
  return masterChain?.compressor ?? null;
}

/** Get the master output node for post-effects metering (LUFS side-tap). */
export function getMasterOutputNode(): GainNode | null {
  return masterChain?.masterOutput ?? null;
}
