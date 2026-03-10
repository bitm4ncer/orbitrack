export interface LooperParams {
  gain: number;           // 0-1
  speed: number;          // master playback rate multiplier
  attack: number;         // 0-2s
  release: number;        // 0-2s
  pan: number;            // -1 to 1
  cutoff: number;         // Hz, 20-20000
  resonance: number;      // 0-50
}

export const DEFAULT_LOOPER_PARAMS: LooperParams = {
  gain: 0.9,
  speed: 1,
  attack: 0.001,
  release: 0.05,
  pan: 0,
  cutoff: 20000,
  resonance: 0,
};

export interface LooperEditorState {
  audioBuffer: AudioBuffer | null;
  peaks: Float32Array | null;
  selectionStart: number | null;  // normalized 0-1
  selectionEnd: number | null;
  clipboard: AudioBuffer | null;
  viewStart: number;              // zoom range 0-1
  viewEnd: number;
  transients: number[];           // detected transient positions [0..1]
  undoStack: AudioBuffer[];
}

export function createLooperEditorState(): LooperEditorState {
  return {
    audioBuffer: null,
    peaks: null,
    selectionStart: null,
    selectionEnd: null,
    clipboard: null,
    viewStart: 0,
    viewEnd: 1,
    transients: [],
    undoStack: [],
  };
}
