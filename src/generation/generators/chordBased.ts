import type { GeneratedPattern, GeneratedEvent, GenerationContext, ChordBasedParams } from '../types';
import type { RNG } from '../rng';
import { getChordTones, voiceLeadChord, applyVoicing, pickProgression } from '../scaleUtils';

/**
 * Chord progression generator with voice leading.
 */
export function generateChordBased(
  ctx: GenerationContext,
  params: ChordBasedParams,
  rng: RNG,
): GeneratedPattern {
  const [lo] = ctx.octaveRange;
  const baseOctave = lo;
  const stepsPerChord = Math.floor(ctx.loopSize / params.chordsPerBar);

  // Pick chord progression (array of scale degrees)
  const degrees = pickProgression(params.chordsPerBar, params.progression, ctx.scaleType, rng);

  // Build raw chord tones for each degree
  const rawChords: number[][] = degrees.map((deg) =>
    getChordTones(ctx.scaleRoot, ctx.scaleType, deg, 'triad', baseOctave),
  );

  // Apply voicing
  const voicedChords = rawChords.map((c) => applyVoicing(c, params.voicing));

  // Voice-lead between consecutive chords
  const ledChords: number[][] = [voicedChords[0]];
  for (let i = 1; i < voicedChords.length; i++) {
    ledChords.push(voiceLeadChord(ledChords[i - 1], voicedChords[i]));
  }

  // Apply rhythm pattern
  const events: GeneratedEvent[] = [];

  switch (params.rhythm) {
    case 'sustained':
      for (let i = 0; i < ledChords.length; i++) {
        const step = i * stepsPerChord;
        events.push({
          step,
          notes: ledChords[i],
          length: stepsPerChord,
        });
      }
      break;

    case 'stabs':
      for (let i = 0; i < ledChords.length; i++) {
        const baseStep = i * stepsPerChord;
        // Hit on downbeat
        events.push({ step: baseStep, notes: ledChords[i], length: 1 });
        // Optional ghost stab on beat 3
        if (stepsPerChord >= 8 && rng.chance(0.6)) {
          const offStep = baseStep + Math.floor(stepsPerChord / 2);
          if (offStep < ctx.loopSize) {
            events.push({ step: offStep, notes: ledChords[i], length: 1 });
          }
        }
      }
      break;

    case 'offbeat': {
      const stepsPerQuarterNote = Math.round(ctx.loopSize / 4); // scale to actual grid
      const halfBeat = Math.round(stepsPerQuarterNote / 2);     // offset to "and"
      for (let i = 0; i < ledChords.length; i++) {
        const baseStep = i * stepsPerChord;
        // Place chord on the "and" of each beat within this chord's zone
        for (let s = baseStep + halfBeat; s < baseStep + stepsPerChord; s += stepsPerQuarterNote) {
          if (s < ctx.loopSize) {
            events.push({ step: s, notes: ledChords[i], length: halfBeat });
          }
        }
      }
      break;
    }

    case 'arp': {
      for (let i = 0; i < ledChords.length; i++) {
        const baseStep = i * stepsPerChord;
        const chord = ledChords[i];
        let noteIdx = 0;
        for (let s = baseStep; s < baseStep + stepsPerChord; s += ctx.gridResolution) {
          if (s >= ctx.loopSize) break;
          events.push({
            step: s,
            notes: [chord[noteIdx % chord.length]],
            length: ctx.gridResolution,
          });
          noteIdx++;
        }
      }
      break;
    }
  }

  return { events };
}
