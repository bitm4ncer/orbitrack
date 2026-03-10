import type { GeneratedPattern, GeneratedEvent, GenerationContext, DrumPatternParams } from '../types';
import type { RNG } from '../rng';
import { pickDrumTemplate, resizeTemplate, applyDensity, applyVariation } from '../rhythmTemplates';

/**
 * Drum pattern generator for sampler instruments.
 * Uses genre-specific templates + stochastic variation.
 */
export function generateDrumPattern(
  ctx: GenerationContext,
  params: DrumPatternParams,
  rng: RNG,
  sampleName: string = '',
): GeneratedPattern {
  let hits: boolean[];

  if (params.genre === 'random') {
    // Pure random: each step has `density` probability
    hits = Array.from({ length: ctx.loopSize }, (_, i) => {
      if (ctx.gridResolution > 1 && i % ctx.gridResolution !== 0) return false;
      return rng.chance(params.density);
    });
  } else {
    // Template-based
    const template = pickDrumTemplate(params.genre, sampleName);
    const resized = resizeTemplate(template, ctx.loopSize);
    hits = applyDensity(resized, params.density + 0.3, ctx.gridResolution, rng);
    hits = applyVariation(hits, params.variation, rng);

    // Genre-specific rules
    applyGenreRules(hits, params.genre, ctx.loopSize);
  }

  // Use middle C (60) as default note for samplers
  const rootNote = 60;
  const events: GeneratedEvent[] = [];

  for (let step = 0; step < hits.length; step++) {
    if (hits[step]) {
      events.push({ step, notes: [rootNote], length: 1 });
    }
  }

  return { events };
}

/**
 * Apply genre-specific hard rules that override stochastic decisions.
 * These ensure patterns maintain their characteristic feel.
 */
function applyGenreRules(hits: boolean[], genre: string, loopSize: number): void {
  switch (genre) {
    case 'house':
      // Four-on-the-floor: ensure hits on quarter notes
      for (let i = 0; i < loopSize; i += 4) {
        hits[i] = true;
      }
      break;

    case 'dnb':
      // Ensure kick on 1 and ~11 (2-step)
      if (loopSize >= 16) {
        hits[0] = true;
        hits[10] = true;
      }
      break;

    case 'hiphop':
      // Ensure hit on 1
      hits[0] = true;
      // Half-time feel: ensure hit around step 8
      if (loopSize >= 16) hits[8] = true;
      break;

    case 'breakbeat':
      // Syncopated but always hit on 1
      hits[0] = true;
      break;

    case 'techno':
      // Similar to house but allow more ghost notes
      for (let i = 0; i < loopSize; i += 4) {
        hits[i] = true;
      }
      break;
  }
}
