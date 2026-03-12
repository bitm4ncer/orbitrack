export type LFODestination = 'none' | 'filter' | 'pitch' | 'amp' | 'pan';

// ── Wavetable types ─────────────────────────────────────────────────────────

export interface WTFrame {
  real: Float32Array;   // length = NUM_HARMONICS + 1
  imag: Float32Array;
}

export interface WTBank {
  id: string;           // e.g. 'basic_shapes'
  name: string;         // display name: 'Basic Shapes'
  frameCount: number;   // typically 64
  generate: () => WTFrame[];
}

// ── Modulation types ────────────────────────────────────────────────────────

export type LFOTriggerMode = 'free' | 'retrig' | 'envelope';

export type LFOShape = OscillatorType | 'expDecay' | 'expRise' | 'punch' | 'halfSine' | 'staircase';

export interface LFOSlotParams {
  shape: LFOShape;
  rate: number;                   // Hz (when not tempo-synced)
  tempoSync: boolean;
  syncDiv: string;                // '1/1','1/2','1/4','1/8','1/16','1/32'
  triggerMode: LFOTriggerMode;
  smooth: number;                 // 0-1
  delay: number;                  // 0-2s fade-in
  phase: number;                  // 0-1 initial phase offset
}

export interface ModAssignment {
  id: string;
  source: 'lfo1' | 'lfo2' | 'lfo3' | 'lfo4';
  target: keyof SynthParams;
  depth: number;                  // -1 to +1 (bipolar)
}

export const DEFAULT_LFO_SLOT: LFOSlotParams = {
  shape: 'sine',
  rate: 1,
  tempoSync: false,
  syncDiv: '1/4',
  triggerMode: 'free',
  smooth: 0,
  delay: 0,
  phase: 0,
};

// ── Synth params ────────────────────────────────────────────────────────────

export interface SynthParams {
  masterVolume: number;

  // Gain envelope (ADSR)
  gainAttack: number;
  gainDecay: number;
  gainSustain: number;
  gainRelease: number;

  // VCO (main oscillator)
  vcoType: string; // OscillatorType or custom wavetable key
  vcoGain: number;
  vcoPan: number;
  vcoDetune: number; // cents, -100 to +100
  vcoOctave: number; // integer, -2 to +2

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

  // Wavetable
  wtPosition: number;      // 0–1, position within wavetable bank

  // Modulation (new system — 4 LFO slots + assignments)
  lfos: [LFOSlotParams, LFOSlotParams, LFOSlotParams, LFOSlotParams];
  modAssignments: ModAssignment[];

  // Poly / Glide
  maxVoices: number;       // 1–8
  portamentoSpeed: number;
}
