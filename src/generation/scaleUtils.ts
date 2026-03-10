import { SCALES, isNoteInScale } from '../utils/music';
import type { RNG } from './rng';

/** All MIDI notes within [low, high] that belong to the scale. */
export function getScaleNotesInRange(
  root: number,
  scaleKey: string,
  low: number,
  high: number,
): number[] {
  const notes: number[] = [];
  for (let n = low; n <= high; n++) {
    if (isNoteInScale(n, root, scaleKey)) notes.push(n);
  }
  return notes;
}

/** Snap a MIDI note to the nearest in-scale note. */
export function nearestScaleNote(midi: number, root: number, scaleKey: string): number {
  if (isNoteInScale(midi, root, scaleKey)) return midi;
  for (let d = 1; d <= 6; d++) {
    if (isNoteInScale(midi + d, root, scaleKey)) return midi + d;
    if (isNoteInScale(midi - d, root, scaleKey)) return midi - d;
  }
  return midi;
}

/** Get the scale degree (0-based) of a MIDI note, or -1 if chromatic. */
export function getScaleDegree(midi: number, root: number, scaleKey: string): number {
  const scale = SCALES[scaleKey];
  if (!scale) return -1;
  const semitone = ((midi - root) % 12 + 12) % 12;
  return scale.intervals.indexOf(semitone);
}

/**
 * Build a chord on a given scale degree.
 * Returns MIDI notes rooted around `baseOctaveMidi` (e.g. 48 for C3).
 */
export function getChordTones(
  root: number,
  scaleKey: string,
  degree: number,
  type: 'triad' | 'seventh' | 'sus2' | 'sus4' = 'triad',
  baseOctaveMidi: number = 48,
): number[] {
  const scale = SCALES[scaleKey];
  if (!scale) return [baseOctaveMidi];

  const intervals = scale.intervals;
  const len = intervals.length;

  // Root of the chord in scale
  const chordRoot = baseOctaveMidi + intervals[degree % len] + Math.floor(degree / len) * 12;

  const degreeNotes = (offsets: number[]): number[] =>
    offsets.map((off) => {
      const idx = (degree + off) % len;
      const octaveShift = Math.floor((degree + off) / len) * 12;
      const semitone = intervals[idx];
      return baseOctaveMidi + semitone + octaveShift;
    });

  switch (type) {
    case 'triad':
      return degreeNotes([0, 2, 4]);
    case 'seventh':
      return degreeNotes([0, 2, 4, 6]);
    case 'sus2':
      return [chordRoot, chordRoot + (intervals[(degree + 1) % len] - intervals[degree % len] + 12) % 12, ...degreeNotes([4]).slice(0)];
    case 'sus4': {
      const third = degreeNotes([2])[0];
      const fourth = nearestScaleNote(chordRoot + 5, root, scaleKey);
      return [chordRoot, fourth > chordRoot ? fourth : third, degreeNotes([4])[0]];
    }
    default:
      return degreeNotes([0, 2, 4]);
  }
}

/**
 * Voice-lead from `fromChord` to `targetTones`.
 * Finds the voicing of target that minimizes total voice movement.
 * Each target tone can be in any octave within ±12 semitones of its base.
 */
export function voiceLeadChord(fromChord: number[], targetTones: number[]): number[] {
  if (fromChord.length === 0) return targetTones;

  // For each target tone, generate candidates in nearby octaves
  const candidates: number[][] = targetTones.map((t) => {
    const opts: number[] = [];
    for (let oct = -1; oct <= 1; oct++) {
      opts.push(t + oct * 12);
    }
    return opts;
  });

  // Greedy voice leading: assign each voice to the nearest candidate
  const result: number[] = [];
  const used = new Set<number>();

  for (let i = 0; i < Math.min(fromChord.length, candidates.length); i++) {
    const source = fromChord[i];
    let bestNote = candidates[i][0];
    let bestDist = Infinity;

    for (const c of candidates[i]) {
      const dist = Math.abs(c - source);
      if (dist < bestDist && !used.has(c)) {
        bestDist = dist;
        bestNote = c;
      }
    }
    result.push(bestNote);
    used.add(bestNote);
  }

  // If target has more notes than from, add remaining
  for (let i = fromChord.length; i < candidates.length; i++) {
    result.push(candidates[i][0]);
  }

  return result.sort((a, b) => a - b);
}

/**
 * Apply a voicing style to raw chord tones.
 */
export function applyVoicing(
  tones: number[],
  voicing: 'close' | 'open' | 'drop2' | 'spread',
): number[] {
  if (tones.length <= 1) return tones;
  const sorted = [...tones].sort((a, b) => a - b);

  switch (voicing) {
    case 'close':
      return sorted;
    case 'open': {
      // Move alternating notes up an octave
      return sorted.map((n, i) => i % 2 === 1 ? n + 12 : n).sort((a, b) => a - b);
    }
    case 'drop2': {
      // Drop the second-from-top note down an octave
      if (sorted.length < 3) return sorted;
      const result = [...sorted];
      result[sorted.length - 2] -= 12;
      return result.sort((a, b) => a - b);
    }
    case 'spread': {
      // Each note in a different octave
      return sorted.map((n, i) => {
        const base = n % 12;
        return base + (3 + i) * 12; // start at octave 3, spread upward
      });
    }
    default:
      return sorted;
  }
}

// ── Common chord progressions (scale degrees, 0-indexed) ─────────────────

export interface ProgressionEntry {
  name: string;
  degrees: number[];
}

export const COMMON_PROGRESSIONS: ProgressionEntry[] = [
  { name: 'I-V-vi-IV',   degrees: [0, 4, 5, 3] },
  { name: 'I-IV-V-IV',   degrees: [0, 3, 4, 3] },
  { name: 'vi-IV-I-V',   degrees: [5, 3, 0, 4] },
  { name: 'I-vi-IV-V',   degrees: [0, 5, 3, 4] },
  { name: 'ii-V-I',      degrees: [1, 4, 0] },
  { name: 'I-IV-vi-V',   degrees: [0, 3, 5, 4] },
  { name: 'i-bVI-bIII-bVII', degrees: [0, 5, 2, 6] },
  { name: 'i-iv-v-i',    degrees: [0, 3, 4, 0] },
  { name: 'I-iii-vi-IV', degrees: [0, 2, 5, 3] },
  { name: 'I-V-IV-V',    degrees: [0, 4, 3, 4] },
];

/** Pick a progression, optionally filtering to the target number of chords. */
export function pickProgression(
  chordsPerBar: number,
  style: 'common' | 'random' | 'circle5' | 'chromatic',
  scaleKey: string,
  rng: RNG,
): number[] {
  const scaleLen = SCALES[scaleKey]?.intervals.length ?? 7;

  switch (style) {
    case 'common': {
      const filtered = COMMON_PROGRESSIONS.filter(
        (p) => p.degrees.length <= chordsPerBar * 2,
      );
      const prog = rng.pick(filtered.length > 0 ? filtered : COMMON_PROGRESSIONS);
      // Repeat/truncate to fill chordsPerBar
      const result: number[] = [];
      while (result.length < chordsPerBar) {
        result.push(prog.degrees[result.length % prog.degrees.length]);
      }
      return result;
    }
    case 'circle5': {
      const degrees: number[] = [0];
      for (let i = 1; i < chordsPerBar; i++) {
        degrees.push((degrees[i - 1] + 4) % scaleLen); // up a 5th = +4 degrees in 7-note scale
      }
      return degrees;
    }
    case 'chromatic': {
      // Allow any degree including out-of-key mediants
      const degrees: number[] = [0];
      for (let i = 1; i < chordsPerBar; i++) {
        degrees.push(rng.nextInt(0, scaleLen - 1));
      }
      return degrees;
    }
    case 'random':
    default: {
      return Array.from({ length: chordsPerBar }, () => rng.nextInt(0, scaleLen - 1));
    }
  }
}

/**
 * Build weights for scale notes: root=2x, 5th=2x, 3rd=1.5x, others=1x.
 */
export function getScaleNoteWeights(notes: number[], root: number, scaleKey: string): number[] {
  return notes.map((n) => {
    const degree = getScaleDegree(n, root, scaleKey);
    if (degree === 0) return 2.0;   // root
    if (degree === 4) return 2.0;   // 5th
    if (degree === 2) return 1.5;   // 3rd
    return 1.0;
  });
}
