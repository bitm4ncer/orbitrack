import type { GeneratedPattern, GeneratedEvent, GenerationContext, ScaleBasedParams } from '../types';
import type { RNG } from '../rng';
import { getScaleNotesInRange } from '../scaleUtils';

/**
 * Scale-based generator: runs, arpeggios, motif repetition.
 */
export function generateScaleBased(
  ctx: GenerationContext,
  params: ScaleBasedParams,
  rng: RNG,
): GeneratedPattern {
  const [lo] = ctx.octaveRange;
  // Expand range by octaves param
  const expandedHi = Math.min(127, lo + params.octaves * 12 + 11);
  const scaleNotes = getScaleNotesInRange(ctx.scaleRoot, ctx.scaleType, lo, expandedHi);
  if (scaleNotes.length === 0) return { events: [] };

  const events: GeneratedEvent[] = [];

  // Generate the note sequence based on pattern
  const noteSequence = buildNoteSequence(scaleNotes, params, ctx.loopSize, ctx.gridResolution, rng);

  // Apply density filtering and create events
  let noteIdx = 0;
  for (let step = 0; step < ctx.loopSize; step += ctx.gridResolution) {
    if (noteIdx >= noteSequence.length) break;
    if (!rng.chance(params.density)) {
      noteIdx++;
      continue;
    }

    const note = noteSequence[noteIdx];
    const isStrongBeat = step % 4 === 0;
    const length = isStrongBeat ? Math.min(2, ctx.gridResolution || 1) : 1;

    events.push({ step, notes: [note], length });
    noteIdx++;
  }

  return { events };
}

function buildNoteSequence(
  scaleNotes: number[],
  params: ScaleBasedParams,
  loopSize: number,
  gridRes: number,
  rng: RNG,
): number[] {
  const maxNotes = Math.ceil(loopSize / gridRes);
  const step = params.stepSize;

  switch (params.pattern) {
    case 'ascending':
      return buildDirectional(scaleNotes, step, 1, maxNotes, rng);
    case 'descending':
      return buildDirectional(scaleNotes, step, -1, maxNotes, rng);
    case 'pendulum':
      return buildPendulum(scaleNotes, step, maxNotes, rng);
    case 'arpUp':
      return buildArp(scaleNotes, 1, maxNotes, rng);
    case 'arpDown':
      return buildArp(scaleNotes, -1, maxNotes, rng);
    case 'arpUpDown':
      return buildArpUpDown(scaleNotes, maxNotes, rng);
    default:
      return buildDirectional(scaleNotes, step, 1, maxNotes, rng);
  }
}

function buildDirectional(
  scaleNotes: number[],
  stepSize: number,
  direction: 1 | -1,
  maxNotes: number,
  rng: RNG,
): number[] {
  const notes: number[] = [];
  const startIdx = direction === 1 ? 0 : scaleNotes.length - 1;
  let idx = startIdx;

  // Build a 4-note motif, then repeat with variation
  const motifLen = Math.min(4, maxNotes);
  const motif: number[] = [];
  for (let i = 0; i < motifLen; i++) {
    motif.push(scaleNotes[Math.max(0, Math.min(scaleNotes.length - 1, idx))]);
    idx += direction * stepSize;
    if (idx < 0) idx = 0;
    if (idx >= scaleNotes.length) idx = scaleNotes.length - 1;
  }

  // Repeat motif with transposition variations
  let transpose = 0;
  while (notes.length < maxNotes) {
    for (const n of motif) {
      if (notes.length >= maxNotes) break;
      const transposed = n + transpose;
      // Clamp to scale range
      if (transposed >= scaleNotes[0] && transposed <= scaleNotes[scaleNotes.length - 1]) {
        notes.push(transposed);
      } else {
        notes.push(n);
      }
    }
    // Transpose the next repetition by 1-2 scale steps
    const scaleStep = rng.nextInt(1, 2) * direction;
    transpose += scaleNotes[Math.min(scaleStep + 1, scaleNotes.length - 1)] - scaleNotes[0];
    // Reset if going out of range
    if (transpose > 24 || transpose < -24) transpose = 0;
  }

  return notes;
}

function buildPendulum(
  scaleNotes: number[],
  stepSize: number,
  maxNotes: number,
  _rng: RNG,
): number[] {
  const notes: number[] = [];
  let idx = 0;
  let dir = 1;

  while (notes.length < maxNotes) {
    notes.push(scaleNotes[idx]);
    idx += dir * stepSize;
    if (idx >= scaleNotes.length) { idx = scaleNotes.length - 2; dir = -1; }
    if (idx < 0) { idx = 1; dir = 1; }
  }

  return notes;
}

function buildArp(
  scaleNotes: number[],
  direction: 1 | -1,
  maxNotes: number,
  _rng: RNG,
): number[] {
  // Build triads on every other scale degree and arpeggiate
  const notes: number[] = [];
  const triads: number[][] = [];

  for (let i = 0; i < scaleNotes.length - 4; i += 2) {
    triads.push([scaleNotes[i], scaleNotes[i + 2], scaleNotes[i + 4]]);
  }
  if (triads.length === 0) return scaleNotes.slice(0, maxNotes);

  let triadIdx = direction === 1 ? 0 : triads.length - 1;
  while (notes.length < maxNotes) {
    const chord = triads[triadIdx];
    const ordered = direction === 1 ? chord : [...chord].reverse();
    for (const n of ordered) {
      if (notes.length >= maxNotes) break;
      notes.push(n);
    }
    triadIdx += direction;
    if (triadIdx >= triads.length) triadIdx = 0;
    if (triadIdx < 0) triadIdx = triads.length - 1;
  }

  return notes;
}

function buildArpUpDown(
  scaleNotes: number[],
  maxNotes: number,
  rng: RNG,
): number[] {
  const up = buildArp(scaleNotes, 1, Math.ceil(maxNotes / 2), rng);
  const down = buildArp(scaleNotes, -1, Math.floor(maxNotes / 2), rng);
  return [...up, ...down].slice(0, maxNotes);
}
