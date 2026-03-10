import type { GeneratedPattern, GeneratedEvent, GenerationContext, BasslineParams } from '../types';
import type { RNG } from '../rng';
import { getScaleNotesInRange, nearestScaleNote, getScaleDegree } from '../scaleUtils';
import { BASS_RHYTHM_TEMPLATES, resizeTemplate, applyDensity } from '../rhythmTemplates';

/**
 * Bassline generator — musically intelligent bass patterns.
 * Range: MIDI 28-60 (low bass register).
 */
export function generateBassline(
  ctx: GenerationContext,
  params: BasslineParams,
  rng: RNG,
): GeneratedPattern {
  // Force bass register regardless of octaveRange
  const bassLo = 28;
  const bassHi = 60;
  const scaleNotes = getScaleNotesInRange(ctx.scaleRoot, ctx.scaleType, bassLo, bassHi);
  if (scaleNotes.length === 0) return { events: [] };

  // Find root notes in bass range
  const rootNote = nearestScaleNote(ctx.scaleRoot + 36, ctx.scaleRoot, ctx.scaleType); // C3 area
  const rootBelow = rootNote - 12 >= bassLo ? rootNote - 12 : rootNote;
  const fifth = nearestScaleNote(rootNote + 7, ctx.scaleRoot, ctx.scaleType);
  const minorSeventh = nearestScaleNote(rootNote + 10, ctx.scaleRoot, ctx.scaleType);

  switch (params.style) {
    case 'root':
      return generateRootBass(ctx, params, scaleNotes, rootNote, fifth, rng);
    case 'octave':
      return generateOctaveBass(ctx, params, rootNote, rootBelow, fifth, rng);
    case 'walking':
      return generateWalkingBass(ctx, params, scaleNotes, rootNote, rng);
    case 'acid':
      return generateAcidBass(ctx, params, scaleNotes, rootNote, fifth, minorSeventh, rng);
    case 'arpeggiated':
      return generateArpBass(ctx, params, scaleNotes, rootNote, rng);
    default:
      return generateRootBass(ctx, params, scaleNotes, rootNote, fifth, rng);
  }
}

function generateRootBass(
  ctx: GenerationContext,
  params: BasslineParams,
  scaleNotes: number[],
  root: number,
  fifth: number,
  rng: RNG,
): GeneratedPattern {
  const template = resizeTemplate(BASS_RHYTHM_TEMPLATES['root'], ctx.loopSize);
  const hits = applyDensity(template, params.density + 0.3, ctx.gridResolution, rng);
  const events: GeneratedEvent[] = [];

  for (let step = 0; step < ctx.loopSize; step++) {
    if (!hits[step]) continue;
    const isDownbeat = step % 4 === 0;
    let note: number;

    if (isDownbeat) {
      note = root;
    } else if (rng.chance(0.3)) {
      note = fifth;
    } else if (rng.chance(params.octaveJumpProb)) {
      note = root - 12 >= 28 ? root - 12 : root;
    } else {
      note = rng.pick(scaleNotes.filter((n) => Math.abs(n - root) <= 7));
    }

    events.push({ step, notes: [note], length: 1 });
  }

  return { events };
}

function generateOctaveBass(
  ctx: GenerationContext,
  params: BasslineParams,
  root: number,
  rootBelow: number,
  fifth: number,
  rng: RNG,
): GeneratedPattern {
  const template = resizeTemplate(BASS_RHYTHM_TEMPLATES['octave'], ctx.loopSize);
  const hits = applyDensity(template, params.density + 0.3, ctx.gridResolution, rng);
  const events: GeneratedEvent[] = [];

  for (let step = 0; step < ctx.loopSize; step++) {
    if (!hits[step]) continue;
    const isDownbeat = step % 4 === 0;
    const isAnd = step % 4 === 2;

    let note: number;
    if (isDownbeat) {
      note = rootBelow;
    } else if (isAnd) {
      note = root;
    } else if (rng.chance(0.3)) {
      note = fifth;
    } else {
      note = rng.chance(0.5) ? root : rootBelow;
    }

    // Syncopation: shift some notes 1 step early
    const finalStep = params.syncopation > 0 && step > 0 && rng.chance(params.syncopation * 0.3)
      ? step - 1
      : step;

    events.push({ step: Math.max(0, finalStep), notes: [note], length: 1 });
  }

  // Dedupe steps
  return { events: dedupeSteps(events) };
}

function generateWalkingBass(
  ctx: GenerationContext,
  params: BasslineParams,
  scaleNotes: number[],
  root: number,
  rng: RNG,
): GeneratedPattern {
  const template = resizeTemplate(BASS_RHYTHM_TEMPLATES['walking'], ctx.loopSize);
  const hits = applyDensity(template, params.density + 0.4, ctx.gridResolution, rng);
  const events: GeneratedEvent[] = [];

  let currentNote = root;
  let currentIdx = scaleNotes.indexOf(currentNote);
  if (currentIdx === -1) currentIdx = Math.floor(scaleNotes.length / 2);

  for (let step = 0; step < ctx.loopSize; step++) {
    if (!hits[step]) continue;

    // Beat 1 always root
    if (step === 0) {
      currentNote = root;
      currentIdx = scaleNotes.indexOf(root);
      if (currentIdx === -1) currentIdx = 0;
    } else {
      // Walking motion
      const r = rng.next();
      let nextIdx: number;
      if (r < 0.35) {
        nextIdx = currentIdx + 1; // step up
      } else if (r < 0.70) {
        nextIdx = currentIdx - 1; // step down
      } else if (r < 0.80) {
        nextIdx = currentIdx;     // repeat
      } else if (r < 0.90) {
        nextIdx = currentIdx + 2; // skip up
      } else {
        // Chromatic approach to root
        const rootIdx = scaleNotes.indexOf(root);
        nextIdx = rootIdx > currentIdx ? currentIdx + 1 : currentIdx - 1;
      }

      nextIdx = Math.max(0, Math.min(scaleNotes.length - 1, nextIdx));
      currentIdx = nextIdx;
      currentNote = scaleNotes[currentIdx];
    }

    events.push({
      step,
      notes: [currentNote],
      length: 1,
      glide: rng.chance(params.slideProb),
    });
  }

  return { events };
}

function generateAcidBass(
  ctx: GenerationContext,
  params: BasslineParams,
  scaleNotes: number[],
  root: number,
  fifth: number,
  minSeventh: number,
  rng: RNG,
): GeneratedPattern {
  const template = resizeTemplate(BASS_RHYTHM_TEMPLATES['acid'], ctx.loopSize);
  const hits = applyDensity(template, params.density + 0.3, ctx.gridResolution, rng);
  const events: GeneratedEvent[] = [];

  // Acid bass note pool: root, 5th, minor 7th, + octave variants
  const acidPool = [root, fifth, minSeventh];
  if (root - 12 >= 28) acidPool.push(root - 12);
  // Add a few nearby scale notes
  const nearby = scaleNotes.filter((n) => Math.abs(n - root) <= 5);
  acidPool.push(...nearby);

  for (let step = 0; step < ctx.loopSize; step++) {
    if (!hits[step]) continue;

    const isDownbeat = step % 4 === 0;
    let note: number;

    if (isDownbeat) {
      note = root;
    } else if (rng.chance(params.octaveJumpProb)) {
      note = root - 12 >= 28 ? root - 12 : root + 12;
    } else {
      note = rng.pick(acidPool);
    }

    // Syncopation
    const finalStep = params.syncopation > 0 && step > 0 && rng.chance(params.syncopation * 0.4)
      ? step - 1
      : step;

    events.push({
      step: Math.max(0, finalStep),
      notes: [note],
      length: 1,
      glide: rng.chance(params.slideProb * 1.5), // Acid loves slides
    });
  }

  return { events: dedupeSteps(events) };
}

function generateArpBass(
  ctx: GenerationContext,
  params: BasslineParams,
  scaleNotes: number[],
  root: number,
  rng: RNG,
): GeneratedPattern {
  const template = resizeTemplate(BASS_RHYTHM_TEMPLATES['arpeggiated'], ctx.loopSize);
  const hits = applyDensity(template, params.density + 0.3, ctx.gridResolution, rng);
  const events: GeneratedEvent[] = [];

  // Build chord tones from root (triad)
  const rootIdx = scaleNotes.indexOf(root);
  const arpNotes: number[] = [];
  if (rootIdx >= 0) {
    arpNotes.push(scaleNotes[rootIdx]);
    if (rootIdx + 2 < scaleNotes.length) arpNotes.push(scaleNotes[rootIdx + 2]);
    if (rootIdx + 4 < scaleNotes.length) arpNotes.push(scaleNotes[rootIdx + 4]);
  }
  if (arpNotes.length === 0) return { events: [] };

  let arpIdx = 0;
  for (let step = 0; step < ctx.loopSize; step++) {
    if (!hits[step]) continue;

    events.push({
      step,
      notes: [arpNotes[arpIdx % arpNotes.length]],
      length: 1,
      glide: rng.chance(params.slideProb),
    });
    arpIdx++;
  }

  return { events };
}

/** Remove duplicate steps, keeping the first event at each step. */
function dedupeSteps(events: GeneratedEvent[]): GeneratedEvent[] {
  const seen = new Set<number>();
  return events.filter((e) => {
    if (seen.has(e.step)) return false;
    seen.add(e.step);
    return true;
  });
}
