/**
 * Wavetable bank definitions — 10 banks, 64 frames each.
 * Each bank generates its frames lazily on first access (cached).
 */

import type { WTFrame, WTBank } from './types';
import { NUM_HARMONICS, computeNativeCoeffs } from './wavetables';

const τ = Math.PI * 2;
const FRAME_COUNT = 64;
const COEFF_LEN = NUM_HARMONICS + 1; // 129

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeFrame(): WTFrame {
  return { real: new Float32Array(COEFF_LEN), imag: new Float32Array(COEFF_LEN) };
}

/** Linear interpolate between two coefficient sets */
function lerpFrames(a: WTFrame, b: WTFrame, t: number): WTFrame {
  const f = makeFrame();
  const t1 = 1 - t;
  for (let k = 0; k < COEFF_LEN; k++) {
    f.real[k] = a.real[k] * t1 + b.real[k] * t;
    f.imag[k] = a.imag[k] * t1 + b.imag[k] * t;
  }
  return f;
}

// ── Bank generators ─────────────────────────────────────────────────────────

/** 1. Basic Shapes — morph sin → tri → sqr → saw (4 segments of 16 frames) */
function genBasicShapes(): WTFrame[] {
  const sin = computeNativeCoeffs('sine');
  const tri = computeNativeCoeffs('triangle');
  const sqr = computeNativeCoeffs('square');
  const saw = computeNativeCoeffs('sawtooth');
  const stages = [sin, tri, sqr, saw];
  const frames: WTFrame[] = [];
  for (let i = 0; i < FRAME_COUNT; i++) {
    const stage = (i / FRAME_COUNT) * stages.length;
    const idx = Math.min(Math.floor(stage), stages.length - 1);
    const next = (idx + 1) % stages.length;
    const t = stage - idx;
    frames.push(lerpFrames(stages[idx] as WTFrame, stages[next] as WTFrame, t));
  }
  return frames;
}

/** 2. Formant — vowel sweep (A → E → I → O → U) */
function genFormant(): WTFrame[] {
  // Formant center frequencies (Hz) for vowels at F1/F2/F3
  const vowels = [
    { f: [800, 1150, 2900], bw: [80, 90, 120] },  // A
    { f: [400, 1600, 2700], bw: [60, 80, 100] },   // E
    { f: [350, 2300, 3000], bw: [50, 100, 120] },   // I
    { f: [450, 800, 2830],  bw: [70, 80, 100] },    // O
    { f: [325, 700, 2530],  bw: [50, 60, 100] },    // U
  ];
  const frames: WTFrame[] = [];
  for (let i = 0; i < FRAME_COUNT; i++) {
    const f = makeFrame();
    const pos = (i / (FRAME_COUNT - 1)) * (vowels.length - 1);
    const vIdx = Math.min(Math.floor(pos), vowels.length - 2);
    const t = pos - vIdx;
    // Interpolate formant parameters
    const v0 = vowels[vIdx], v1 = vowels[vIdx + 1];
    const fc = v0.f.map((f0, j) => f0 * (1 - t) + v1.f[j] * t);
    const bw = v0.bw.map((b0, j) => b0 * (1 - t) + v1.bw[j] * t);
    // Generate harmonic amplitudes based on formant peaks
    // Assume fundamental at ~130 Hz (C3) for harmonic spacing
    const f0 = 130;
    for (let k = 1; k <= NUM_HARMONICS; k++) {
      const freq = k * f0;
      let amp = 0;
      for (let p = 0; p < 3; p++) {
        const diff = (freq - fc[p]) / bw[p];
        amp += Math.exp(-0.5 * diff * diff) * (1 - p * 0.2);
      }
      f.imag[k] = amp / k;
    }
    frames.push(f);
  }
  return frames;
}

/** 3. Digital — FM synthesis spectra, sweep modulation index 0 → 8 */
function genDigital(): WTFrame[] {
  const frames: WTFrame[] = [];
  for (let i = 0; i < FRAME_COUNT; i++) {
    const f = makeFrame();
    const beta = (i / (FRAME_COUNT - 1)) * 8; // modulation index
    // Bessel function approximation for FM carrier sidebands
    for (let k = 1; k <= NUM_HARMONICS; k++) {
      // Simple Bessel J_n approximation via series
      const n = k - 1;
      let jn = 0;
      for (let m = 0; m <= 10; m++) {
        const sign = m % 2 === 0 ? 1 : -1;
        let factM = 1;
        for (let x = 1; x <= m; x++) factM *= x;
        let factNM = 1;
        for (let x = 1; x <= n + m; x++) factNM *= x;
        jn += sign * Math.pow(beta / 2, n + 2 * m) / (factM * factNM);
      }
      f.imag[k] = Math.abs(jn) * 0.8;
    }
    frames.push(f);
  }
  return frames;
}

/** 4. Analog — sawtooth with variable harmonic rolloff (bright → warm → dark) */
function genAnalog(): WTFrame[] {
  const frames: WTFrame[] = [];
  for (let i = 0; i < FRAME_COUNT; i++) {
    const f = makeFrame();
    // Rolloff exponent: 1.0 (bright saw) → 3.0 (very dark)
    const rolloff = 1.0 + (i / (FRAME_COUNT - 1)) * 2.0;
    for (let k = 1; k <= NUM_HARMONICS; k++) {
      const sign = k % 2 === 0 ? -1 : 1;
      f.imag[k] = sign * (2 / (Math.PI * Math.pow(k, rolloff)));
    }
    frames.push(f);
  }
  return frames;
}

/** 5. PWM — pulse width modulation, duty cycle 50% → 3% */
function genPWM(): WTFrame[] {
  const frames: WTFrame[] = [];
  for (let i = 0; i < FRAME_COUNT; i++) {
    const f = makeFrame();
    const duty = 0.5 - (i / (FRAME_COUNT - 1)) * 0.47; // 50% → 3%
    for (let k = 1; k <= NUM_HARMONICS; k++) {
      f.real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    }
    frames.push(f);
  }
  return frames;
}

/** 6. Harmonic Series — progressive additive harmonic stacking */
function genHarmonicSeries(): WTFrame[] {
  const frames: WTFrame[] = [];
  for (let i = 0; i < FRAME_COUNT; i++) {
    const f = makeFrame();
    const numHarmonics = Math.max(1, Math.round(1 + (i / (FRAME_COUNT - 1)) * 63));
    let maxAmp = 0;
    for (let k = 1; k <= numHarmonics && k <= NUM_HARMONICS; k++) {
      f.imag[k] = 1;
      maxAmp += 1;
    }
    // Normalize
    if (maxAmp > 0) {
      const scale = 1 / Math.sqrt(maxAmp);
      for (let k = 1; k <= numHarmonics && k <= NUM_HARMONICS; k++) {
        f.imag[k] = scale;
      }
    }
    frames.push(f);
  }
  return frames;
}

/** 7. Organ — Hammond drawbar sweep through 8 registrations */
function genOrgan(): WTFrame[] {
  // Drawbar settings (8 registrations): [16', 5⅓', 8', 4', 2⅔', 2', 1⅗', 1⅓', 1']
  // harmonic indices:                    [ 1,    1.5,  2,  4,   3,    8,   5,    6,   16]
  // We'll use actual harmonics: 1,2,3,4,5,6,8,10,12,16
  const registrations = [
    [8, 0, 8, 0, 0, 0, 0, 0, 0], // jazz
    [8, 8, 8, 0, 0, 0, 0, 0, 0], // mellow
    [8, 8, 8, 8, 0, 0, 0, 0, 0], // full mellow
    [8, 6, 8, 8, 6, 0, 0, 0, 0], // gospel
    [8, 8, 8, 8, 8, 8, 0, 0, 0], // full
    [8, 8, 8, 8, 8, 8, 8, 0, 0], // bright
    [8, 8, 8, 8, 8, 8, 8, 8, 0], // very bright
    [8, 8, 8, 8, 8, 8, 8, 8, 8], // all out
  ];
  const drawbarHarmonics = [1, 3, 2, 4, 6, 8, 10, 12, 16];
  const frames: WTFrame[] = [];
  for (let i = 0; i < FRAME_COUNT; i++) {
    const f = makeFrame();
    const pos = (i / (FRAME_COUNT - 1)) * (registrations.length - 1);
    const rIdx = Math.min(Math.floor(pos), registrations.length - 2);
    const t = pos - rIdx;
    const r0 = registrations[rIdx], r1 = registrations[rIdx + 1];
    for (let d = 0; d < 9; d++) {
      const amp = ((r0[d] * (1 - t) + r1[d] * t) / 8);
      const k = drawbarHarmonics[d];
      if (k <= NUM_HARMONICS) f.imag[k] += amp;
    }
    frames.push(f);
  }
  return frames;
}

/** 8. Spectral — odd-only → even-only → all harmonics crossfade */
function genSpectral(): WTFrame[] {
  const frames: WTFrame[] = [];
  for (let i = 0; i < FRAME_COUNT; i++) {
    const f = makeFrame();
    const pos = i / (FRAME_COUNT - 1);
    for (let k = 1; k <= NUM_HARMONICS; k++) {
      const isOdd = k % 2 === 1;
      let amp: number;
      if (pos <= 0.5) {
        // 0→0.5: odd (1→0) + even (0→1)
        const t = pos * 2;
        amp = isOdd ? (1 - t) : t;
      } else {
        // 0.5→1: even (1→0.5) + odd (0→0.5), converging to all=0.5
        const t = (pos - 0.5) * 2;
        amp = isOdd ? t * 0.5 : (1 - t * 0.5);
      }
      f.imag[k] = amp / k;
    }
    frames.push(f);
  }
  return frames;
}

/** 9. Vocal — breathy formant sweep with wider bandwidths */
function genVocal(): WTFrame[] {
  // Choir-like vowels with wider bandwidths than Formant bank
  const vowels = [
    { f: [350, 600, 2400],  bw: [120, 150, 200] },  // oo
    { f: [450, 800, 2700],  bw: [100, 130, 180] },   // oh
    { f: [700, 1100, 2900], bw: [110, 140, 200] },   // ah
    { f: [500, 1500, 2500], bw: [100, 120, 160] },   // eh
    { f: [350, 2200, 2800], bw: [80, 120, 180] },    // ee
  ];
  const frames: WTFrame[] = [];
  for (let i = 0; i < FRAME_COUNT; i++) {
    const f = makeFrame();
    const pos = (i / (FRAME_COUNT - 1)) * (vowels.length - 1);
    const vIdx = Math.min(Math.floor(pos), vowels.length - 2);
    const t = pos - vIdx;
    const v0 = vowels[vIdx], v1 = vowels[vIdx + 1];
    const fc = v0.f.map((f0, j) => f0 * (1 - t) + v1.f[j] * t);
    const bw = v0.bw.map((b0, j) => b0 * (1 - t) + v1.bw[j] * t);
    const f0 = 130;
    for (let k = 1; k <= NUM_HARMONICS; k++) {
      const freq = k * f0;
      let amp = 0.05; // breathy baseline
      for (let p = 0; p < 3; p++) {
        const diff = (freq - fc[p]) / bw[p];
        amp += Math.exp(-0.5 * diff * diff) * (1 - p * 0.15);
      }
      f.imag[k] = amp / Math.sqrt(k);
    }
    frames.push(f);
  }
  return frames;
}

/** 10. Metallic — bell/gong timbres emphasizing inharmonic-adjacent partials */
function genMetallic(): WTFrame[] {
  // Target "inharmonic" ratios (approximated to nearest integer harmonics)
  // Bell partials: 1, 2, 2.76→3, 5.4→5, 8.93→9, 13.34→13
  const bellPartials = [1, 2, 3, 5, 9, 13, 17, 23, 29];
  const frames: WTFrame[] = [];
  for (let i = 0; i < FRAME_COUNT; i++) {
    const f = makeFrame();
    const pos = i / (FRAME_COUNT - 1);
    for (let k = 1; k <= NUM_HARMONICS; k++) {
      // Start harmonic (pos=0), end with bell emphasis (pos=1)
      const harmonicAmp = 1 / k;
      let bellAmp = 0;
      for (const bp of bellPartials) {
        const dist = Math.abs(k - bp);
        if (dist <= 1) bellAmp += (1 - dist) * (0.8 / Math.sqrt(bp));
      }
      f.imag[k] = harmonicAmp * (1 - pos) + bellAmp * pos;
    }
    frames.push(f);
  }
  return frames;
}

// ── Bank registry ───────────────────────────────────────────────────────────

export const WAVETABLE_BANKS: WTBank[] = [
  { id: 'basic_shapes',    name: 'Basic Shapes',    frameCount: FRAME_COUNT, generate: genBasicShapes },
  { id: 'formant',         name: 'Formant',         frameCount: FRAME_COUNT, generate: genFormant },
  { id: 'digital',         name: 'Digital',         frameCount: FRAME_COUNT, generate: genDigital },
  { id: 'analog',          name: 'Analog',          frameCount: FRAME_COUNT, generate: genAnalog },
  { id: 'pwm',             name: 'PWM',             frameCount: FRAME_COUNT, generate: genPWM },
  { id: 'harmonic_series', name: 'Harmonic Series', frameCount: FRAME_COUNT, generate: genHarmonicSeries },
  { id: 'organ',           name: 'Organ',           frameCount: FRAME_COUNT, generate: genOrgan },
  { id: 'spectral',        name: 'Spectral',        frameCount: FRAME_COUNT, generate: genSpectral },
  { id: 'vocal',           name: 'Vocal',           frameCount: FRAME_COUNT, generate: genVocal },
  { id: 'metallic',        name: 'Metallic',        frameCount: FRAME_COUNT, generate: genMetallic },
];

const framesCache = new Map<string, WTFrame[]>();

export function getWTBank(id: string): WTBank | undefined {
  return WAVETABLE_BANKS.find((b) => b.id === id);
}

export function getWTFrames(id: string): WTFrame[] | null {
  if (framesCache.has(id)) return framesCache.get(id)!;
  const bank = getWTBank(id);
  if (!bank) return null;
  const frames = bank.generate();
  framesCache.set(id, frames);
  return frames;
}
