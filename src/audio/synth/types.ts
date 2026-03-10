export type LFODestination = 'none' | 'filter' | 'pitch' | 'amp' | 'pan';

export interface SynthParams {
  masterVolume: number;

  // Gain envelope (ADSR)
  gainAttack: number;
  gainDecay: number;
  gainSustain: number;
  gainRelease: number;

  // VCO (main oscillator)
  vcoType: OscillatorType;
  vcoGain: number;
  vcoPan: number;
  vcoDetune: number; // cents, -100 to +100

  // Sub 1
  sub1Type: OscillatorType;
  sub1Offset: number; // semitones, -24 to +24
  sub1Pan: number;
  sub1Gain: number;

  // Sub 2
  sub2Type: OscillatorType;
  sub2Offset: number;
  sub2Pan: number;
  sub2Gain: number;

  // Unison
  unisonVoices: number;   // 1–7
  unisonDetune: number;   // 0–50 cents spread
  unisonSpread: number;   // 0–1 stereo width

  // Filter
  filterType: BiquadFilterType;
  filterFreq: number;
  filterQ: number;
  filterAttack: number;
  filterDecay: number;
  filterEnvAmount: number;

  // LFO 1
  lfo1Rate: number;
  lfo1Depth: number;
  lfo1Shape: OscillatorType;
  lfo1Dest: LFODestination;

  // LFO 2
  lfo2Rate: number;
  lfo2Depth: number;
  lfo2Shape: OscillatorType;
  lfo2Dest: LFODestination;

  // FM
  fmEnabled: boolean;
  fmRatio: number;   // 0.5–8
  fmDepth: number;   // 0–500 Hz

  // Delay
  delayTime: number;
  delayFeedback: number;
  delayTone: number;
  delayAmount: number;

  // Reverb
  reverbType: string;
  reverbAmount: number;

  // Distortion
  distortionDist: number;
  distortionAmount: number;

  // Bit Crusher
  bitCrushDepth: number;
  bitCrushAmount: number;

  // Poly / Glide
  maxVoices: number;       // 1–8
  portamentoSpeed: number;
}
