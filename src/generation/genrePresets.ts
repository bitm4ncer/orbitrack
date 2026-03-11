import type {
  DrumPatternParams,
  BasslineParams,
  ChordBasedParams,
  OctaveOverride,
} from './types';

export interface GenrePreset {
  id: string;
  label: string;
  drumGenre: DrumPatternParams['genre'];
  drumDensity: number;
  drumVariation: number;
  bassStyle: BasslineParams['style'];
  bassDensity: number;
  bassSyncopation: number;
  chordProgression: ChordBasedParams['progression'];
  chordRhythm: ChordBasedParams['rhythm'];
  suggestedScaleType: string;
  suggestedOctaveBase: number;
  suggestedOctaveSpan: number;
  bpmRange: [number, number];
}

export const GENRE_PRESETS: Record<string, GenrePreset> = {
  house: {
    id: 'house',
    label: 'House',
    drumGenre: 'house',
    drumDensity: 0.8,
    drumVariation: 0.15,
    bassStyle: 'root',
    bassDensity: 0.7,
    bassSyncopation: 0.15,
    chordProgression: 'common',
    chordRhythm: 'offbeat',
    suggestedScaleType: 'minor',
    suggestedOctaveBase: 3,
    suggestedOctaveSpan: 2,
    bpmRange: [120, 130],
  },

  techno: {
    id: 'techno',
    label: 'Techno',
    drumGenre: 'techno',
    drumDensity: 0.9,
    drumVariation: 0.1,
    bassStyle: 'acid',
    bassDensity: 0.7,
    bassSyncopation: 0.3,
    chordProgression: 'chromatic',
    chordRhythm: 'stabs',
    suggestedScaleType: 'phrygian',
    suggestedOctaveBase: 2,
    suggestedOctaveSpan: 2,
    bpmRange: [130, 150],
  },

  breakbeat: {
    id: 'breakbeat',
    label: 'Breakbeat',
    drumGenre: 'breakbeat',
    drumDensity: 0.75,
    drumVariation: 0.35,
    bassStyle: 'walking',
    bassDensity: 0.65,
    bassSyncopation: 0.4,
    chordProgression: 'common',
    chordRhythm: 'arp',
    suggestedScaleType: 'minor',
    suggestedOctaveBase: 3,
    suggestedOctaveSpan: 2,
    bpmRange: [170, 180],
  },

  hiphop: {
    id: 'hiphop',
    label: 'Hip-Hop',
    drumGenre: 'hiphop',
    drumDensity: 0.6,
    drumVariation: 0.3,
    bassStyle: 'root',
    bassDensity: 0.5,
    bassSyncopation: 0.35,
    chordProgression: 'common',
    chordRhythm: 'sustained',
    suggestedScaleType: 'minor',
    suggestedOctaveBase: 3,
    suggestedOctaveSpan: 2,
    bpmRange: [85, 95],
  },

  dnb: {
    id: 'dnb',
    label: 'Drum & Bass',
    drumGenre: 'dnb',
    drumDensity: 0.85,
    drumVariation: 0.25,
    bassStyle: 'walking',
    bassDensity: 0.7,
    bassSyncopation: 0.45,
    chordProgression: 'common',
    chordRhythm: 'offbeat',
    suggestedScaleType: 'minor',
    suggestedOctaveBase: 2,
    suggestedOctaveSpan: 3,
    bpmRange: [170, 180],
  },

  trap: {
    id: 'trap',
    label: 'Trap',
    drumGenre: 'trap',
    drumDensity: 0.6,
    drumVariation: 0.3,
    bassStyle: 'root',
    bassDensity: 0.5,
    bassSyncopation: 0.4,
    chordProgression: 'common',
    chordRhythm: 'sustained',
    suggestedScaleType: 'minor',
    suggestedOctaveBase: 3,
    suggestedOctaveSpan: 2,
    bpmRange: [130, 160],
  },

  jungle: {
    id: 'jungle',
    label: 'Jungle',
    drumGenre: 'jungle',
    drumDensity: 0.85,
    drumVariation: 0.4,
    bassStyle: 'walking',
    bassDensity: 0.7,
    bassSyncopation: 0.35,
    chordProgression: 'common',
    chordRhythm: 'offbeat',
    suggestedScaleType: 'minor',
    suggestedOctaveBase: 2,
    suggestedOctaveSpan: 3,
    bpmRange: [155, 175],
  },

  garage: {
    id: 'garage',
    label: 'UK Garage',
    drumGenre: 'garage',
    drumDensity: 0.7,
    drumVariation: 0.25,
    bassStyle: 'arpeggiated',
    bassDensity: 0.75,
    bassSyncopation: 0.5,
    chordProgression: 'circle5',
    chordRhythm: 'offbeat',
    suggestedScaleType: 'minor',
    suggestedOctaveBase: 3,
    suggestedOctaveSpan: 2,
    bpmRange: [130, 140],
  },

  afrobeat: {
    id: 'afrobeat',
    label: 'Afrobeat',
    drumGenre: 'afrobeat',
    drumDensity: 0.8,
    drumVariation: 0.3,
    bassStyle: 'walking',
    bassDensity: 0.8,
    bassSyncopation: 0.6,
    chordProgression: 'common',
    chordRhythm: 'arp',
    suggestedScaleType: 'pentatonic',
    suggestedOctaveBase: 3,
    suggestedOctaveSpan: 2,
    bpmRange: [100, 120],
  },

  ambient: {
    id: 'ambient',
    label: 'Ambient',
    drumGenre: 'ambient',
    drumDensity: 0.25,
    drumVariation: 0.4,
    bassStyle: 'root',
    bassDensity: 0.25,
    bassSyncopation: 0.0,
    chordProgression: 'common',
    chordRhythm: 'sustained',
    suggestedScaleType: 'major',
    suggestedOctaveBase: 4,
    suggestedOctaveSpan: 2,
    bpmRange: [70, 90],
  },
};

/**
 * Apply a genre preset and return the resulting parameters.
 */
export function applyGenrePreset(presetId: string): {
  drumParams: DrumPatternParams;
  bassParams: Partial<BasslineParams>;
  octaveOverride: OctaveOverride;
} | null {
  const preset = GENRE_PRESETS[presetId];
  if (!preset) return null;

  return {
    drumParams: {
      genre: preset.drumGenre,
      density: preset.drumDensity,
      variation: preset.drumVariation,
    },
    bassParams: {
      style: preset.bassStyle,
      density: preset.bassDensity,
      syncopation: preset.bassSyncopation,
    },
    octaveOverride: {
      base: preset.suggestedOctaveBase,
      span: preset.suggestedOctaveSpan,
    },
  };
}
