// Chord presets for the grid sequencer
// Each preset defines a sequence of chords as arrays of MIDI note numbers
// Notes are relative to C3 (MIDI 48) as root

export interface ChordPreset {
  name: string;
  chords: number[][]; // Array of chords, each chord is array of MIDI notes
  steps: number; // How many steps the pattern fills
}

export const CHORD_PRESETS: ChordPreset[] = [
  {
    name: 'House Am-F-C-G',
    steps: 4,
    chords: [
      [57, 60, 64, 67], // Am7: A3, C4, E4, G4
      [53, 57, 60, 65], // Fmaj7: F3, A3, C4, F4
      [48, 52, 55, 60], // C: C3, E3, G3, C4
      [55, 59, 62, 67], // G: G3, B3, D4, G4
    ],
  },
  {
    name: 'Minor 7th Stabs',
    steps: 4,
    chords: [
      [48, 51, 55, 58], // Cm7
      [53, 56, 60, 63], // Fm7
      [55, 58, 62, 65], // Gm7
      [51, 55, 58, 62], // Ebmaj7
    ],
  },
  {
    name: 'Deep House Dm-Bb-C-Am',
    steps: 4,
    chords: [
      [50, 53, 57, 60], // Dm7: D3, F3, A3, C4
      [58, 62, 65, 69], // Bb: Bb3, D4, F4, A4
      [48, 52, 55, 59], // Cmaj7: C3, E3, G3, B3
      [57, 60, 64, 67], // Am7: A3, C4, E4, G4
    ],
  },
  {
    name: 'Jazzy ii-V-I',
    steps: 4,
    chords: [
      [50, 53, 57, 60], // Dm7
      [55, 59, 62, 65], // G7
      [48, 52, 55, 59], // Cmaj7
      [48, 52, 55, 59], // Cmaj7
    ],
  },
  {
    name: 'Techno Cm stab',
    steps: 4,
    chords: [
      [48, 51, 55],      // Cm
      [],                 // rest
      [48, 51, 55],      // Cm
      [],                 // rest
    ],
  },
];
