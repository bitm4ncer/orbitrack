/** Seeded pseudo-random number generator (LCG). Same seed = same sequence. */
export interface RNG {
  next(): number;                                     // [0, 1)
  nextInt(min: number, max: number): number;          // [min, max] inclusive
  pick<T>(arr: readonly T[]): T;
  weightedPick<T>(items: readonly T[], weights: number[]): T;
  chance(probability: number): boolean;               // true with given probability
  shuffle<T>(arr: T[]): T[];                          // in-place Fisher-Yates
}

export function createRNG(seed: number): RNG {
  // Mulberry32 — fast 32-bit PRNG with good distribution
  let s = seed | 0;

  function next(): number {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next,
    nextInt(min: number, max: number): number {
      return min + Math.floor(next() * (max - min + 1));
    },
    pick<T>(arr: readonly T[]): T {
      return arr[Math.floor(next() * arr.length)];
    },
    weightedPick<T>(items: readonly T[], weights: number[]): T {
      const total = weights.reduce((a, b) => a + b, 0);
      let r = next() * total;
      for (let i = 0; i < items.length; i++) {
        r -= weights[i];
        if (r <= 0) return items[i];
      }
      return items[items.length - 1];
    },
    chance(probability: number): boolean {
      return next() < probability;
    },
    shuffle<T>(arr: T[]): T[] {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  };
}

/** Generate a random seed value */
export function randomSeed(): number {
  return Math.floor(Math.random() * 2147483647);
}
