import type { InstrumentRole } from './types';

const ROLE_KEYWORD_MAP: Record<InstrumentRole, string[]> = {
  kick: ['kick', 'bd', 'bassdrum', 'bass drum', 'kck', 'k_', '_k_'],
  snare: ['snare', 'sd', 'snr', 'snre', 's_', '_sd', 'rimshot', 'rim'],
  hihat: ['hat', 'hh', 'ch', 'closed', 'hihat', 'hi-hat', 'closed hat'],
  openhat: ['oh', 'open', 'openhat', 'open hat', 'pedal', 'open_hat'],
  clap: ['clap', 'cp', 'clp', 'handclap', 'hand clap'],
  percussion: [
    'tom',
    'conga',
    'bongo',
    'cowbell',
    'tamb',
    'shaker',
    'ride',
    'crash',
    'cymbal',
    'perc',
    'cym',
    'agogo',
    'cajon',
    'woodblock',
    'marimba',
  ],
  bass: ['bass', 'sub', '808', 'bs', 'low', 'subbass', 'sub_bass'],
  lead: ['lead', 'melody', 'melo', 'lfo', 'pluck', 'stab', 'horn', 'brass'],
  pad: ['pad', 'string', 'choir', 'atmo', 'wash', 'ambient', 'texture', 'swell'],
  chord: ['chord', 'piano', 'keys', 'organ', 'rhodes', 'epiano', 'key'],
  arp: ['arp', 'seq', 'sequence', 'arpegg'],
  vocal: ['vox', 'vocal', 'voice', 'voc', 'chant', 'synth_voice'],
  fx: ['fx', 'effect', 'foley', 'hit', 'riser', 'sweep', 'noise', 'white', 'sfx'],
  unknown: [],
};

export { ROLE_KEYWORD_MAP };

/**
 * Classify an instrument based on its sample name and display name.
 * Scores both strings and returns the highest-scoring role.
 */
export function classifyInstrument(sampleName: string, displayName: string): InstrumentRole {
  const normalized = (s: string) => s.toLowerCase().replace(/[_\-./\\]/g, ' ').trim();
  const sample = normalized(sampleName);
  const display = normalized(displayName);
  const combined = `${sample} ${display}`;

  const scores: Record<InstrumentRole, number> = {
    kick: 0,
    snare: 0,
    hihat: 0,
    openhat: 0,
    clap: 0,
    percussion: 0,
    bass: 0,
    lead: 0,
    pad: 0,
    chord: 0,
    arp: 0,
    vocal: 0,
    fx: 0,
    unknown: 0,
  };

  // Score each role
  for (const [role, keywords] of Object.entries(ROLE_KEYWORD_MAP)) {
    for (const keyword of keywords) {
      // Word boundary match (start or after space): 2x weight
      if (combined.startsWith(keyword) || combined.includes(` ${keyword}`)) {
        scores[role as InstrumentRole] += 2;
      }
      // Mid-word substring: 1x weight
      else if (combined.includes(keyword)) {
        scores[role as InstrumentRole] += 1;
      }
    }
  }

  // Disambiguation rules
  const kickScore = scores.kick;
  const bassScore = scores.bass;

  // 808 = kick if no bass keywords, otherwise bass
  if (bassScore > 0 && kickScore > 0) {
    if (combined.includes('808')) {
      if (!combined.includes('bass') && !combined.includes('sub')) {
        scores.kick += 2;
        scores.bass -= 1;
      }
    }
  }

  // openhat only wins if it has open/oh keywords before hat keywords
  const openhatScore = scores.openhat;
  const hihatScore = scores.hihat;
  if (openhatScore > 0 && hihatScore > 0) {
    const openIdx = combined.indexOf('open');
    const hatIdx = combined.indexOf('hat');
    const ohIdx = combined.indexOf('oh');
    const hhIdx = combined.indexOf('hh');
    if (openIdx >= 0 && hatIdx >= 0 && openIdx > hatIdx) {
      scores.openhat -= 1;
    }
  }

  // Find best score
  let bestRole: InstrumentRole = 'unknown';
  let bestScore = 0;

  for (const [role, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestRole = role as InstrumentRole;
    }
  }

  return bestRole;
}
