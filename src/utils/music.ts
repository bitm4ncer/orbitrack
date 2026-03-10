// Standard MIDI note to frequency conversion
// A4 (MIDI 69) = 440 Hz
export function midiNoteToFreq(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

// Note names for display
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export function noteNameWithOctave(midiNote: number): string {
  const octave = Math.floor(midiNote / 12) - 1;
  const name = NOTE_NAMES[midiNote % 12];
  return `${name}${octave}`;
}

// Get MIDI note from note name and octave
export function noteFromNameAndOctave(name: string, octave: number): number {
  const index = NOTE_NAMES.indexOf(name as typeof NOTE_NAMES[number]);
  if (index === -1) return 60; // default C4
  return (octave + 1) * 12 + index;
}

// ── Scale definitions ─────────────────────────────────────────────────────
// Each scale is defined as an array of semitone intervals from the root.
export const SCALES: Record<string, { name: string; intervals: number[] }> = {
  chromatic:   { name: 'Chromatic',       intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  major:       { name: 'Major',           intervals: [0, 2, 4, 5, 7, 9, 11] },
  minor:       { name: 'Minor',           intervals: [0, 2, 3, 5, 7, 8, 10] },
  dorian:      { name: 'Dorian',          intervals: [0, 2, 3, 5, 7, 9, 10] },
  phrygian:    { name: 'Phrygian',        intervals: [0, 1, 3, 5, 7, 8, 10] },
  lydian:      { name: 'Lydian',          intervals: [0, 2, 4, 6, 7, 9, 11] },
  mixolydian:  { name: 'Mixolydian',      intervals: [0, 2, 4, 5, 7, 9, 10] },
  harmonicMin: { name: 'Harmonic Minor',  intervals: [0, 2, 3, 5, 7, 8, 11] },
  melodicMin:  { name: 'Melodic Minor',   intervals: [0, 2, 3, 5, 7, 9, 11] },
  pentatonic:  { name: 'Pentatonic Maj',  intervals: [0, 2, 4, 7, 9] },
  pentMinor:   { name: 'Pentatonic Min',  intervals: [0, 3, 5, 7, 10] },
  blues:       { name: 'Blues',           intervals: [0, 3, 5, 6, 7, 10] },
  wholeT:      { name: 'Whole Tone',      intervals: [0, 2, 4, 6, 8, 10] },
  dimished:    { name: 'Diminished',      intervals: [0, 2, 3, 5, 6, 8, 9, 11] },
};

export const SCALE_KEYS = Object.keys(SCALES);

/** Returns true if the given MIDI note belongs to the scale (root + intervals). */
export function isNoteInScale(midiNote: number, rootNote: number, scaleKey: string): boolean {
  const scale = SCALES[scaleKey];
  if (!scale) return true; // chromatic fallback
  const semitone = ((midiNote - rootNote) % 12 + 12) % 12;
  return scale.intervals.includes(semitone);
}
