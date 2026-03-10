import type { GeneratedPattern, GeneratedEvent, GenerationContext, RandomParams } from '../types';
import type { RNG } from '../rng';
import { getScaleNotesInRange, getScaleNoteWeights } from '../scaleUtils';

/**
 * Random melody generator.
 * Weighted note selection (root/5th favored) + contour smoothing.
 */
export function generateRandom(
  ctx: GenerationContext,
  params: RandomParams,
  rng: RNG,
): GeneratedPattern {
  const [lo, hi] = ctx.octaveRange;
  const scaleNotes = getScaleNotesInRange(ctx.scaleRoot, ctx.scaleType, lo, hi);
  if (scaleNotes.length === 0) return { events: [] };

  const weights = getScaleNoteWeights(scaleNotes, ctx.scaleRoot, ctx.scaleType);
  const events: GeneratedEvent[] = [];

  // Generate notes on grid-aligned steps
  for (let step = 0; step < ctx.loopSize; step += ctx.gridResolution) {
    if (!rng.chance(params.density)) continue;

    const note = rng.weightedPick(scaleNotes, weights);
    const notes = [note];

    // Optional chord stacking
    if (params.allowChords && rng.chance(params.chordProbability)) {
      // Add 3rd above (2 scale steps)
      const noteIdx = scaleNotes.indexOf(note);
      if (noteIdx >= 0 && noteIdx + 2 < scaleNotes.length) {
        notes.push(scaleNotes[noteIdx + 2]);
      }
      // Sometimes add 5th too
      if (rng.chance(0.4) && noteIdx >= 0 && noteIdx + 4 < scaleNotes.length) {
        notes.push(scaleNotes[noteIdx + 4]);
      }
    }

    // Vary note lengths: longer on strong beats
    const isStrongBeat = step % 4 === 0;
    const length = isStrongBeat && rng.chance(0.4) ? 2 : 1;

    events.push({ step, notes, length });
  }

  // Contour smoothing pass: reduce large jumps
  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1].notes[0];
    const curr = events[i].notes[0];
    const jump = Math.abs(curr - prev);

    if (jump > 7 && rng.chance(0.7)) {
      // Replace with stepwise motion from previous note
      const direction = curr > prev ? 1 : -1;
      const target = prev + direction * rng.nextInt(1, 3);
      // Find nearest scale note to the target
      let best = scaleNotes[0];
      let bestDist = Infinity;
      for (const n of scaleNotes) {
        const d = Math.abs(n - target);
        if (d < bestDist) { bestDist = d; best = n; }
      }
      events[i].notes[0] = best;
    }
  }

  return { events };
}
