export type SuperdoughSynthType =
  | 'supersaw'
  | 'supersquare'
  | 'supertriangle'
  | 'supersin'
  | 'fm'
  | 'zzfx';

export interface SuperdoughSynthParams {
  synthType: SuperdoughSynthType;
  gain: number;          // 0–1
  attack: number;        // 0–2s
  decay: number;         // 0–2s
  sustain: number;       // 0–1
  release: number;       // 0–2s
  cutoff: number;        // Hz, 20–20000
  resonance: number;     // 0–50
  pan: number;           // -1 to 1
  delay: number;         // send 0–1
  delaytime: number;     // 0–1s
  delayfeedback: number; // 0–0.95
  room: number;          // reverb 0–1
  size: number;          // reverb size 0–1
  distortion: number;    // 0–1
}

export interface SuperdoughSamplerParams {
  gain: number;      // 0–1
  speed: number;     // playback rate, 1 = normal pitch
  begin: number;     // 0–1 sample start position
  end: number;       // 0–1 sample end position
  attack: number;    // 0–2s
  release: number;   // 0–2s
  cutoff: number;    // Hz
  resonance: number; // 0–50
  pan: number;       // -1 to 1
}

export const DEFAULT_SYNTH_PARAMS: SuperdoughSynthParams = {
  synthType: 'supersaw',
  gain: 0.7,
  attack: 0.01,
  decay: 0.1,
  sustain: 0.5,
  release: 0.3,
  cutoff: 4000,
  resonance: 2,
  pan: 0,
  delay: 0,
  delaytime: 0.25,
  delayfeedback: 0.4,
  room: 0,
  size: 0.5,
  distortion: 0,
};

export const DEFAULT_SAMPLER_PARAMS: SuperdoughSamplerParams = {
  gain: 0.9,
  speed: 1,
  begin: 0,
  end: 1,
  attack: 0.001,
  release: 0.1,
  cutoff: 20000,
  resonance: 0,
  pan: 0,
};
