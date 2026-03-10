import { ADJECTIVES, NOUNS, TAIL_NOUNS } from './nameWords';

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export type NamePattern = '2' | '3' | 'of';

/**
 * Generate a random project name.
 * - '2'  → "Adjective Noun"           (e.g. "Acid Vortex")
 * - '3'  → "Adjective Noun Noun"      (e.g. "Cosmic Echo Machine")
 * - 'of' → "Adjective Noun of Tail"   (e.g. "Fractal Pulse of Midnight")
 */
export function generateName(pattern: NamePattern = 'of'): string {
  switch (pattern) {
    case '2':
      return `${pick(ADJECTIVES)} ${pick(NOUNS)}`;
    case '3':
      return `${pick(ADJECTIVES)} ${pick(NOUNS)} ${pick(NOUNS)}`;
    case 'of':
      return `${pick(ADJECTIVES)} ${pick(NOUNS)} of ${pick(TAIL_NOUNS)}`;
  }
}
