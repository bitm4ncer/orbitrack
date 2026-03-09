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
