/**
 * Custom wavetable shapes for the main VCO.
 * Each shape is defined as a time-domain function; Fourier coefficients are
 * computed once (DFT) and cached per AudioContext as a PeriodicWave.
 */

const NATIVE_TYPES = new Set<string>(['sine', 'triangle', 'square', 'sawtooth']);

/** Shape keys in UI display order */
export const ALL_WAVE_SHAPES: string[] = [
  // native
  'sine', 'triangle', 'square', 'sawtooth',
  // custom
  'pulse', 'halfsin', 'organ', 'buzz', 'soft', 'bell',
];

export const ALL_WAVE_LABELS: string[] = [
  'SIN', 'TRI', 'SQR', 'SAW',
  'PLS', 'HSIN', 'ORG', 'BUZZ', 'SOFT', 'BELL',
];

// ── Time-domain shape functions ──────────────────────────────────────────────

const τ = Math.PI * 2;

const SHAPE_FNS: Record<string, (t: number) => number> = {
  // 25% duty-cycle pulse — punchy, classic synth bass/lead
  pulse: (t) => t < 0.25 ? 1 : -1,

  // Half-wave rectified sine — hollow, flute/clarinet-like
  halfsin: (t) => t < 0.5 ? Math.sin(t * τ) : 0,

  // Hammond organ — fundamental + upper harmonics (drawbar mix)
  organ: (t) => (
    0.70 * Math.sin(1 * τ * t) +
    0.60 * Math.sin(2 * τ * t) +
    0.50 * Math.sin(3 * τ * t) +
    0.30 * Math.sin(4 * τ * t) +
    0.20 * Math.sin(6 * τ * t) +
    0.10 * Math.sin(8 * τ * t)
  ),

  // Buzz — many equal harmonics, very bright / distorted
  buzz: (t) => {
    let v = 0;
    for (let k = 1; k <= 12; k++) v += Math.sin(k * τ * t) / k;
    return v * 0.7;
  },

  // Soft saw — sawtooth with exponential harmonic rolloff (warm, analog-ish)
  soft: (t) => {
    let v = 0;
    for (let k = 1; k <= 32; k++) {
      v += (k % 2 === 1 ? 1 : -1) * Math.sin(k * τ * t) * Math.pow(0.75, k - 1) / k;
    }
    return v * 1.8;
  },

  // Bell — strong 2nd/3rd/5th harmonics, weak fundamental
  bell: (t) => (
    0.30 * Math.sin(1 * τ * t) +
    0.80 * Math.sin(2 * τ * t) +
    0.65 * Math.sin(3 * τ * t) +
    0.40 * Math.sin(4 * τ * t) +
    0.25 * Math.sin(5 * τ * t) +
    0.15 * Math.sin(7 * τ * t)
  ),
};

// ── DFT → PeriodicWave ───────────────────────────────────────────────────────

export const NUM_HARMONICS = 128;
const NUM_SAMPLES   = 2048;

function computeCoeffs(fn: (t: number) => number) {
  const real = new Float32Array(NUM_HARMONICS + 1);
  const imag = new Float32Array(NUM_HARMONICS + 1);
  const invM = 1 / NUM_SAMPLES;
  for (let k = 1; k <= NUM_HARMONICS; k++) {
    let re = 0, im = 0;
    for (let n = 0; n < NUM_SAMPLES; n++) {
      const v     = fn(n * invM);
      const angle = τ * k * n * invM;
      re += v * Math.cos(angle);
      im -= v * Math.sin(angle);
    }
    real[k] = 2 * re * invM;
    imag[k] = 2 * im * invM;
  }
  return { real, imag };
}

// Lazy coefficient cache (one per shape key, shared across AudioContexts)
const coeffCache = new Map<string, { real: Float32Array; imag: Float32Array }>();

// PeriodicWave cache per AudioContext (WeakMap so GC can collect dead contexts)
const waveCache = new WeakMap<AudioContext, Map<string, PeriodicWave>>();

// ── Public API ───────────────────────────────────────────────────────────────

export function isNativeType(shape: string): shape is OscillatorType {
  return NATIVE_TYPES.has(shape);
}

/**
 * Returns a cached PeriodicWave for the given custom shape and AudioContext.
 * DFT is computed lazily on first call per shape (one-time cost ~5ms per shape).
 */
export function getPeriodicWave(ac: AudioContext, shape: string): PeriodicWave | null {
  const fn = SHAPE_FNS[shape];
  if (!fn) return null;

  let ctxMap = waveCache.get(ac);
  if (!ctxMap) { ctxMap = new Map(); waveCache.set(ac, ctxMap); }
  if (ctxMap.has(shape)) return ctxMap.get(shape)!;

  if (!coeffCache.has(shape)) coeffCache.set(shape, computeCoeffs(fn));
  const { real, imag } = coeffCache.get(shape)!;
  const wave = ac.createPeriodicWave(real, imag, { disableNormalization: false });
  ctxMap.set(shape, wave);
  return wave;
}

/**
 * Sample the time-domain value of a waveform shape at position t ∈ [0, 1).
 * Used by OscDisplay to draw the waveform preview.
 */
export function sampleWaveShape(t: number, shape: string): number {
  const fn = SHAPE_FNS[shape];
  return fn ? fn(t) : 0;
}

// ── Native waveform coefficients (for wavetable bank generators) ────────────

const nativeCoeffCache = new Map<string, { real: Float32Array; imag: Float32Array }>();

/**
 * Compute Fourier coefficients for the 4 native oscillator types.
 * Used by wavetable banks to create morph targets from native shapes.
 */
export function computeNativeCoeffs(type: OscillatorType): { real: Float32Array; imag: Float32Array } {
  if (nativeCoeffCache.has(type)) return nativeCoeffCache.get(type)!;

  const real = new Float32Array(NUM_HARMONICS + 1);
  const imag = new Float32Array(NUM_HARMONICS + 1);

  for (let k = 1; k <= NUM_HARMONICS; k++) {
    switch (type) {
      case 'sine':
        // Only fundamental
        imag[k] = k === 1 ? 1 : 0;
        break;
      case 'sawtooth':
        // -1^(k+1) / k  (descending ramp)
        imag[k] = (k % 2 === 0 ? -1 : 1) * (2 / (k * Math.PI));
        break;
      case 'square':
        // Odd harmonics only: 4/(kπ) for odd k
        imag[k] = k % 2 === 1 ? 4 / (k * Math.PI) : 0;
        break;
      case 'triangle':
        // Odd harmonics only: 8/(k²π²) alternating sign
        if (k % 2 === 1) {
          const sign = ((k - 1) / 2) % 2 === 0 ? 1 : -1;
          imag[k] = sign * 8 / (k * k * Math.PI * Math.PI);
        }
        break;
    }
  }

  const result = { real, imag };
  nativeCoeffCache.set(type, result);
  return result;
}

/**
 * Get Fourier coefficients for any shape (native or custom).
 * Used by wavetable banks to reference existing shapes as morph targets.
 */
export function getCoeffsForShape(shape: string): { real: Float32Array; imag: Float32Array } | null {
  if (isNativeType(shape)) return computeNativeCoeffs(shape);
  const fn = SHAPE_FNS[shape];
  if (!fn) return null;
  if (!coeffCache.has(shape)) coeffCache.set(shape, computeCoeffs(fn));
  return coeffCache.get(shape)!;
}
