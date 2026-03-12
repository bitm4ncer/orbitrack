/**
 * Wavetable interpolation engine — handles frame blending, PeriodicWave
 * caching (256-step quantized), and time-domain sampling for display.
 */

import type { WTFrame } from './types';
import { NUM_HARMONICS } from './wavetables';
import { getWTFrames } from './wavetableBanks';

const COEFF_LEN = NUM_HARMONICS + 1;
const QUANT_STEPS = 256;

// ── Frame interpolation ────────────────────────────────────────────────────

export function interpolateFrames(frames: WTFrame[], position: number): WTFrame {
  const count = frames.length;
  const pos = Math.max(0, Math.min(1, position)) * (count - 1);
  const idx = Math.floor(pos);
  const frac = pos - idx;

  if (frac < 0.001 || idx >= count - 1) {
    return frames[Math.min(idx, count - 1)];
  }

  const a = frames[idx];
  const b = frames[idx + 1];
  const real = new Float32Array(COEFF_LEN);
  const imag = new Float32Array(COEFF_LEN);
  const t1 = 1 - frac;

  for (let k = 0; k < COEFF_LEN; k++) {
    real[k] = a.real[k] * t1 + b.real[k] * frac;
    imag[k] = a.imag[k] * t1 + b.imag[k] * frac;
  }

  return { real, imag };
}

// ── PeriodicWave cache (quantized to 1/256 steps) ──────────────────────────

const waveCache = new WeakMap<AudioContext, Map<string, PeriodicWave>>();

function cacheKey(bankId: string, position: number): string {
  return `${bankId}:${Math.round(position * QUANT_STEPS)}`;
}

export function getInterpolatedPeriodicWave(
  ac: AudioContext,
  bankId: string,
  position: number,
): PeriodicWave | null {
  const frames = getWTFrames(bankId);
  if (!frames) return null;

  const key = cacheKey(bankId, position);
  let ctxMap = waveCache.get(ac);
  if (!ctxMap) { ctxMap = new Map(); waveCache.set(ac, ctxMap); }

  if (ctxMap.has(key)) return ctxMap.get(key)!;

  // Limit cache size per context to ~64 entries
  if (ctxMap.size > 64) {
    const firstKey = ctxMap.keys().next().value;
    if (firstKey !== undefined) ctxMap.delete(firstKey);
  }

  const frame = interpolateFrames(frames, position);
  const wave = ac.createPeriodicWave(frame.real, frame.imag, { disableNormalization: false });
  ctxMap.set(key, wave);
  return wave;
}

// ── Time-domain sampling for display ────────────────────────────────────────

const displayCache = new Map<string, Float32Array>();
const DISPLAY_SAMPLES = 512;

function displayCacheKey(bankId: string, position: number): string {
  return `${bankId}:${Math.round(position * QUANT_STEPS)}`;
}

/**
 * Sample the wavetable waveform at a given position for display.
 * Returns a value at time t ∈ [0,1) by reconstructing from Fourier coefficients.
 */
export function sampleWTWaveShape(bankId: string, position: number, t: number): number {
  const key = displayCacheKey(bankId, position);

  // Check if we have a cached waveform array
  let samples = displayCache.get(key);
  if (!samples) {
    const frames = getWTFrames(bankId);
    if (!frames) return 0;

    const frame = interpolateFrames(frames, position);
    samples = new Float32Array(DISPLAY_SAMPLES);

    for (let n = 0; n < DISPLAY_SAMPLES; n++) {
      const phase = n / DISPLAY_SAMPLES;
      let val = 0;
      for (let k = 1; k <= NUM_HARMONICS; k++) {
        const angle = k * Math.PI * 2 * phase;
        val += frame.real[k] * Math.cos(angle) + frame.imag[k] * Math.sin(angle);
      }
      samples[n] = val;
    }

    // Limit display cache size
    if (displayCache.size > 32) {
      const firstKey = displayCache.keys().next().value;
      if (firstKey !== undefined) displayCache.delete(firstKey);
    }
    displayCache.set(key, samples);
  }

  // Lookup in cached samples with linear interpolation
  const idx = ((t % 1) + 1) % 1 * DISPLAY_SAMPLES;
  const i0 = Math.floor(idx) % DISPLAY_SAMPLES;
  const i1 = (i0 + 1) % DISPLAY_SAMPLES;
  const frac = idx - Math.floor(idx);
  return samples[i0] * (1 - frac) + samples[i1] * frac;
}
