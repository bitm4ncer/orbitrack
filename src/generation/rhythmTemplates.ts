import type { RNG } from './rng';
import { classifyInstrument } from './sampleClassifier';

/**
 * Rhythm templates: 16-step probability arrays.
 * Values 0-1 represent the probability of a hit on that step.
 * 1 = always hit, 0 = never, 0.5 = 50% chance.
 */

// ── Drum templates ───────────────────────────────────────────────────────

export const KICK_TEMPLATES: Record<string, number[]> = {
  house:     [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  techno:    [1, 0, 0, 0, 1, 0, 0, 0.3, 1, 0, 0, 0, 1, 0, 0.2, 0],
  breakbeat: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0.5, 1, 0, 0, 0, 0, 0.3],
  hiphop:    [1, 0, 0, 0.3, 0, 0, 0.5, 0, 1, 0, 0, 0, 0, 0.4, 0, 0],
  dnb:       [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
  trap:      [1, 0, 0, 0.7, 0, 0, 0, 0, 1, 0, 0, 0, 0.8, 0, 0.5, 0],
  jungle:    [1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0.7, 0],
  garage:    [1, 0, 0, 0, 0, 0, 0.6, 0, 0, 0, 1, 0, 0, 0, 0, 0],
  afrobeat:  [1, 0, 0, 0, 0, 0.7, 0, 0, 0, 0.5, 0, 0, 1, 0, 0, 0],
  ambient:   [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.3, 0, 0, 0],
};

export const SNARE_TEMPLATES: Record<string, number[]> = {
  house:     [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  techno:    [0, 0, 0, 0, 1, 0, 0, 0.2, 0, 0, 0, 0, 1, 0, 0.3, 0],
  breakbeat: [0, 0, 0, 0, 1, 0, 0, 0.3, 0, 0, 0, 0, 1, 0, 0, 0.5],
  hiphop:    [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  dnb:       [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  trap:      [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
  jungle:    [0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0.5],
  garage:    [0, 0, 0, 0, 0, 0.5, 0, 0, 1, 0, 0, 0, 0, 0.5, 0, 0],
  afrobeat:  [0, 0, 0, 0, 0.8, 0, 0, 0.3, 0, 0, 0.8, 0, 0, 0, 0.5, 0],
  ambient:   [0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0, 0, 0],
};

export const HIHAT_TEMPLATES: Record<string, number[]> = {
  house:     [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
  techno:    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  breakbeat: [1, 0.3, 1, 0, 1, 0.5, 1, 0.3, 1, 0.3, 1, 0, 1, 0.5, 1, 0.3],
  hiphop:    [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0.5],
  dnb:       [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0.3],
  trap:      [1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1],
  jungle:    [1, 0.5, 1, 0.5, 1, 0.5, 1, 0.5, 1, 0.5, 1, 0.5, 1, 0.5, 1, 0.5],
  garage:    [1, 0, 1, 0.5, 1, 0, 1, 0.5, 1, 0, 1, 0.5, 1, 0, 1, 0.5],
  afrobeat:  [1, 0, 0.7, 0, 1, 0, 0.7, 0, 1, 0, 0.7, 0, 1, 0, 0.7, 0],
  ambient:   [0.3, 0, 0, 0, 0.3, 0, 0, 0, 0.3, 0, 0, 0, 0.3, 0, 0, 0],
};

export const CLAP_TEMPLATES: Record<string, number[]> = {
  house:     [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  techno:    [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0.3],
  breakbeat: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0.3, 0, 0, 1, 0, 0, 0],
  hiphop:    [0, 0, 0, 0, 1, 0, 0, 0.2, 0, 0, 0, 0, 1, 0, 0.2, 0],
  dnb:       [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  trap:      [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
  jungle:    [0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  garage:    [0, 0, 0, 0, 0, 0.3, 0, 0, 1, 0, 0, 0, 0, 0.3, 0, 0],
  afrobeat:  [0, 0, 0.5, 0, 0, 0, 1, 0, 0, 0.3, 0, 0, 0, 0, 0.8, 0],
  ambient:   [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

// ── Melody / Bass rhythm templates ──────────────────────────────────────

export const MELODY_RHYTHM_TEMPLATES: Record<string, number[]> = {
  steady:     [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  syncopated: [1, 0, 0.8, 0, 0, 1, 0, 0.5, 1, 0, 0.6, 0, 0, 0.8, 0, 0.3],
  sparse:     [1, 0, 0, 0, 0, 0, 0.7, 0, 0, 0, 0, 0, 0.8, 0, 0, 0],
  offbeat:    [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
  dotted:     [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0],
};

export const BASS_RHYTHM_TEMPLATES: Record<string, number[]> = {
  root:       [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  octave:     [1, 0, 0.8, 0, 1, 0, 0.8, 0, 1, 0, 0.8, 0, 1, 0, 0.8, 0],
  walking:    [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
  acid:       [1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0],
  arpeggiated:[1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
};

// ── Template utilities ──────────────────────────────────────────────────

/** Resize a 16-step template to a different length via linear interpolation. */
export function resizeTemplate(template: number[], targetLength: number): number[] {
  if (template.length === targetLength) return [...template];
  const result: number[] = [];
  for (let i = 0; i < targetLength; i++) {
    const srcIndex = (i / targetLength) * template.length;
    const lo = Math.floor(srcIndex);
    const hi = Math.min(lo + 1, template.length - 1);
    const frac = srcIndex - lo;
    result.push(template[lo] * (1 - frac) + template[hi] * frac);
  }
  return result;
}

/**
 * Apply density scaling + stochastic hit decision.
 * Returns a boolean array: true = hit on that step.
 */
export function applyDensity(
  template: number[],
  density: number,
  gridRes: number,
  rng: RNG,
): boolean[] {
  return template.map((prob, i) => {
    // Only place hits on grid-aligned steps
    if (gridRes > 1 && i % gridRes !== 0) return false;
    return rng.chance(prob * density);
  });
}

/**
 * Apply variation: stochastically flip some steps from the template.
 */
export function applyVariation(
  hits: boolean[],
  variation: number,
  rng: RNG,
): boolean[] {
  return hits.map((hit) => {
    if (rng.chance(variation * 0.3)) return !hit;
    return hit;
  });
}

/**
 * Pick a drum template based on genre and instrument role.
 */
export function pickDrumTemplate(
  genre: string,
  sampleName: string,
  displayName: string = '',
): number[] {
  const role = classifyInstrument(sampleName, displayName);
  let bank: Record<string, number[]>;

  switch (role) {
    case 'kick':
      bank = KICK_TEMPLATES;
      break;
    case 'snare':
      bank = SNARE_TEMPLATES;
      break;
    case 'hihat':
    case 'openhat':
      bank = HIHAT_TEMPLATES;
      break;
    case 'clap':
    case 'percussion':
      bank = CLAP_TEMPLATES;
      break;
    default:
      // Default to hihat pattern for unknown samples
      bank = HIHAT_TEMPLATES;
      break;
  }

  return bank[genre] ?? bank['house'] ?? [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
}
