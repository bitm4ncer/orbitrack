export interface LooperParams {
  gain: number;           // 0-1
  speed: number;          // master playback rate multiplier
  attack: number;         // 0-2s
  release: number;        // 0-2s
  pan: number;            // -1 to 1
  cutoff: number;         // Hz, 20-20000
  resonance: number;      // 0-50
  pitchSemitones: number; // -24 to +24, pitch offset in semitones
  reverse: boolean;       // reverse playback
  startOffset: number;    // 0-1 normalized, shifts loop start point
}

export const DEFAULT_LOOPER_PARAMS: LooperParams = {
  gain: 0.9,
  speed: 1,
  attack: 0.001,
  release: 0.05,
  pan: 0,
  cutoff: 20000,
  resonance: 0,
  pitchSemitones: 0,
  reverse: false,
  startOffset: 0,
};

export interface LooperEditorState {
  audioBuffer: AudioBuffer | null;
  peaks: Float32Array | null;
  peakResolution: number;           // number of peak buckets (256-2048)
  selectionStart: number | null;    // normalized 0-1
  selectionEnd: number | null;
  loopIn: number;                   // loop region start, normalized 0-1
  loopOut: number;                  // loop region end, normalized 0-1
  cursorPosition: number | null;    // paste cursor, normalized 0-1
  clipboard: AudioBuffer | null;
  clipboardStart: number | null;    // source region start, normalized 0-1
  clipboardEnd: number | null;      // source region end, normalized 0-1
  viewStart: number;                // zoom range 0-1
  viewEnd: number;
  transients: number[];             // detected transient positions [0..1]
  transientTails: number[];         // detected tail positions [0..1], parallel to transients
  undoStack: AudioBuffer[];
}

export function createLooperEditorState(): LooperEditorState {
  return {
    audioBuffer: null,
    peaks: null,
    peakResolution: 2048,
    selectionStart: null,
    selectionEnd: null,
    loopIn: 0,
    loopOut: 1,
    cursorPosition: null,
    clipboard: null,
    clipboardStart: null,
    clipboardEnd: null,
    viewStart: 0,
    viewEnd: 1,
    transients: [],
    transientTails: [],
    undoStack: [],
  };
}
