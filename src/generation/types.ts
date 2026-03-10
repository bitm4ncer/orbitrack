/** Output contract — every generator returns this */
export interface GeneratedPattern {
  events: GeneratedEvent[];
}

export interface GeneratedEvent {
  step: number;        // 0-based step index within loopSize
  notes: number[];     // MIDI note numbers
  length?: number;     // grid steps (default 1)
  glide?: boolean;     // portamento to next note
}

export type GenerationMode = 'random' | 'scaleBased' | 'chordBased' | 'bassline' | 'drumPattern';

/** Shared context all generators receive */
export interface GenerationContext {
  scaleRoot: number;         // 0-11
  scaleType: string;         // key into SCALES
  loopSize: number;          // total 16th-note steps
  gridResolution: number;    // 1, 2, 4, 8
  instrumentType: 'synth' | 'sampler';
  octaveRange: [number, number]; // MIDI [low, high]
}

// ── Per-mode parameter interfaces ────────────────────────────────────────

export interface RandomParams {
  density: number;          // 0-1
  allowChords: boolean;
  chordProbability: number; // 0-1
}

export interface ScaleBasedParams {
  pattern: 'ascending' | 'descending' | 'pendulum' | 'arpUp' | 'arpDown' | 'arpUpDown';
  density: number;          // 0-1
  stepSize: number;         // 1=stepwise, 2=skip, 3=third-based
  octaves: number;          // 1-3
}

export interface ChordBasedParams {
  progression: 'common' | 'random' | 'circle5' | 'chromatic';
  voicing: 'close' | 'open' | 'drop2' | 'spread';
  rhythm: 'sustained' | 'stabs' | 'offbeat' | 'arp';
  chordsPerBar: number;     // 1, 2, or 4
}

export interface BasslineParams {
  style: 'root' | 'octave' | 'walking' | 'acid' | 'arpeggiated';
  density: number;          // 0-1
  syncopation: number;      // 0-1
  octaveJumpProb: number;   // 0-1
  slideProb: number;        // 0-1
}

export interface DrumPatternParams {
  genre: 'house' | 'techno' | 'breakbeat' | 'hiphop' | 'dnb' | 'random';
  density: number;          // 0-1
  variation: number;        // 0-1
}

export type GenerationParams =
  | { mode: 'random'; params: RandomParams }
  | { mode: 'scaleBased'; params: ScaleBasedParams }
  | { mode: 'chordBased'; params: ChordBasedParams }
  | { mode: 'bassline'; params: BasslineParams }
  | { mode: 'drumPattern'; params: DrumPatternParams };

// ── Default parameter presets ────────────────────────────────────────────

export const DEFAULT_RANDOM_PARAMS: RandomParams = {
  density: 0.5,
  allowChords: false,
  chordProbability: 0.3,
};

export const DEFAULT_SCALE_PARAMS: ScaleBasedParams = {
  pattern: 'ascending',
  density: 0.6,
  stepSize: 1,
  octaves: 2,
};

export const DEFAULT_CHORD_PARAMS: ChordBasedParams = {
  progression: 'common',
  voicing: 'close',
  rhythm: 'sustained',
  chordsPerBar: 4,
};

export const DEFAULT_BASSLINE_PARAMS: BasslineParams = {
  style: 'root',
  density: 0.5,
  syncopation: 0.2,
  octaveJumpProb: 0.2,
  slideProb: 0.1,
};

export const DEFAULT_DRUM_PARAMS: DrumPatternParams = {
  genre: 'house',
  density: 0.5,
  variation: 0.2,
};
