/**
 * Factory effect presets — hardcoded, seeded to IndexedDB on first run.
 */

interface FactoryEffectPreset {
  name: string;
  effectType: string;
  folder: string;
  params: Record<string, number>;
}

export const FACTORY_EFFECT_PRESETS: FactoryEffectPreset[] = [
  // ── Delay: Simple ─────────────────────────────────────────────────────────
  {
    name: 'Slapback',
    effectType: 'delay',
    folder: 'Factory/Delay/Simple',
    params: { amount: 0.4, time: 0.08, feedback: 0.1, tone: 12000, mode: 0, sync: 0, syncDiv: 8 },
  },
  {
    name: 'Short Echo',
    effectType: 'delay',
    folder: 'Factory/Delay/Simple',
    params: { amount: 0.3, time: 0.15, feedback: 0.3, tone: 8000, mode: 0, sync: 0, syncDiv: 8 },
  },
  {
    name: 'Long Wash',
    effectType: 'delay',
    folder: 'Factory/Delay/Simple',
    params: { amount: 0.25, time: 1.0, feedback: 0.7, tone: 3000, mode: 0, sync: 0, syncDiv: 8 },
  },

  // ── Delay: Synced ─────────────────────────────────────────────────────────
  {
    name: 'Quarter Echo',
    effectType: 'delay',
    folder: 'Factory/Delay/Synced',
    params: { amount: 0.3, time: 0.25, feedback: 0.35, tone: 8000, mode: 0, sync: 1, syncDiv: 8 },
  },
  {
    name: 'Dotted 8th',
    effectType: 'delay',
    folder: 'Factory/Delay/Synced',
    params: { amount: 0.35, time: 0.25, feedback: 0.4, tone: 6000, mode: 0, sync: 1, syncDiv: 7 },
  },
  {
    name: 'Synced Half',
    effectType: 'delay',
    folder: 'Factory/Delay/Synced',
    params: { amount: 0.3, time: 0.5, feedback: 0.5, tone: 6000, mode: 0, sync: 1, syncDiv: 11 },
  },
  {
    name: '16th Stutter',
    effectType: 'delay',
    folder: 'Factory/Delay/Synced',
    params: { amount: 0.4, time: 0.125, feedback: 0.5, tone: 10000, mode: 0, sync: 1, syncDiv: 2 },
  },

  // ── Delay: Character ──────────────────────────────────────────────────────
  {
    name: 'Tape Echo',
    effectType: 'delay',
    folder: 'Factory/Delay/Character',
    params: { amount: 0.4, time: 0.3, feedback: 0.55, tone: 5000, mode: 1, sync: 0, syncDiv: 8 },
  },
  {
    name: 'Dub Delay',
    effectType: 'delay',
    folder: 'Factory/Delay/Character',
    params: { amount: 0.5, time: 0.5, feedback: 0.75, tone: 2500, mode: 2, sync: 0, syncDiv: 8 },
  },
  {
    name: 'Lo-Fi Tape',
    effectType: 'delay',
    folder: 'Factory/Delay/Character',
    params: { amount: 0.45, time: 0.35, feedback: 0.6, tone: 3000, mode: 2, sync: 0, syncDiv: 8 },
  },
  {
    name: 'Multi-Tap Rhythm',
    effectType: 'delay',
    folder: 'Factory/Delay/Character',
    params: { amount: 0.35, time: 0.25, feedback: 0.4, tone: 8000, mode: 3, sync: 1, syncDiv: 8 },
  },
  {
    name: 'Multi-Tap Wide',
    effectType: 'delay',
    folder: 'Factory/Delay/Character',
    params: { amount: 0.3, time: 0.6, feedback: 0.5, tone: 6000, mode: 3, sync: 0, syncDiv: 8 },
  },

  // ── Delay: Ambient ────────────────────────────────────────────────────────
  {
    name: 'Ambient Shimmer',
    effectType: 'delay',
    folder: 'Factory/Delay/Ambient',
    params: { amount: 0.2, time: 0.75, feedback: 0.8, tone: 10000, mode: 0, sync: 0, syncDiv: 8 },
  },
  {
    name: 'Tape Drift',
    effectType: 'delay',
    folder: 'Factory/Delay/Ambient',
    params: { amount: 0.3, time: 0.9, feedback: 0.7, tone: 4000, mode: 1, sync: 0, syncDiv: 8 },
  },

  // ── Delay: Ping Pong ─────────────────────────────────────────────────────
  {
    name: 'Classic Pong',
    effectType: 'delay',
    folder: 'Factory/Delay/PingPong',
    params: { amount: 0.35, time: 0.25, feedback: 0.45, tone: 8000, mode: 4, sync: 1, syncDiv: 8 },
  },
  {
    name: 'Wide Bounce',
    effectType: 'delay',
    folder: 'Factory/Delay/PingPong',
    params: { amount: 0.4, time: 0.375, feedback: 0.5, tone: 6000, mode: 4, sync: 0, syncDiv: 8 },
  },
  {
    name: 'Dotted Pong',
    effectType: 'delay',
    folder: 'Factory/Delay/PingPong',
    params: { amount: 0.35, time: 0.25, feedback: 0.5, tone: 7000, mode: 4, sync: 1, syncDiv: 7 },
  },
  {
    name: 'Fast Pong',
    effectType: 'delay',
    folder: 'Factory/Delay/PingPong',
    params: { amount: 0.3, time: 0.125, feedback: 0.4, tone: 10000, mode: 4, sync: 1, syncDiv: 5 },
  },
  {
    name: 'Slow Stereo',
    effectType: 'delay',
    folder: 'Factory/Delay/PingPong',
    params: { amount: 0.3, time: 0.5, feedback: 0.6, tone: 5000, mode: 4, sync: 1, syncDiv: 11 },
  },
  {
    name: 'Dark Pong',
    effectType: 'delay',
    folder: 'Factory/Delay/PingPong',
    params: { amount: 0.4, time: 0.3, feedback: 0.55, tone: 3000, mode: 4, sync: 0, syncDiv: 8 },
  },

  // ── Reverb ────────────────────────────────────────────────────────────────
  {
    name: 'Small Room',
    effectType: 'reverb',
    folder: 'Factory/Reverb',
    params: { amount: 0.25, predelay: 0.005, size: 0.2, damp: 0.6 },
  },
  {
    name: 'Large Hall',
    effectType: 'reverb',
    folder: 'Factory/Reverb',
    params: { amount: 0.35, predelay: 0.02, size: 0.8, damp: 0.4 },
  },
  {
    name: 'Dark Plate',
    effectType: 'reverb',
    folder: 'Factory/Reverb',
    params: { amount: 0.4, predelay: 0.01, size: 0.5, damp: 0.8 },
  },
  {
    name: 'Ambient Wash',
    effectType: 'reverb',
    folder: 'Factory/Reverb',
    params: { amount: 0.5, predelay: 0.04, size: 0.95, damp: 0.3 },
  },

  // ── Compressor ────────────────────────────────────────────────────────────
  {
    name: 'Gentle Glue',
    effectType: 'compressor',
    folder: 'Factory/Compressor',
    params: { threshold: -18, ratio: 2, attack: 0.01, release: 0.15, knee: 10, makeupGain: 2 },
  },
  {
    name: 'Drum Squash',
    effectType: 'compressor',
    folder: 'Factory/Compressor',
    params: { threshold: -24, ratio: 8, attack: 0.003, release: 0.08, knee: 3, makeupGain: 6 },
  },
  {
    name: 'Vocal Leveler',
    effectType: 'compressor',
    folder: 'Factory/Compressor',
    params: { threshold: -20, ratio: 4, attack: 0.005, release: 0.2, knee: 6, makeupGain: 3 },
  },

  // ── Chorus ────────────────────────────────────────────────────────────────
  {
    name: 'Classic Chorus',
    effectType: 'chorus',
    folder: 'Factory/Chorus',
    params: { amount: 0.5, depth: 0.005, rate: 1.5, delay: 0.02, spread: 0.3 },
  },
  {
    name: 'Wide Shimmer',
    effectType: 'chorus',
    folder: 'Factory/Chorus',
    params: { amount: 0.6, depth: 0.01, rate: 0.8, delay: 0.03, spread: 0.8 },
  },

  // ── Distortion ────────────────────────────────────────────────────────────
  {
    name: 'Warm Overdrive',
    effectType: 'distortion',
    folder: 'Factory/Distortion',
    params: { type: 0, drive: 0.3, tone: 8000, output: 0, amount: 1 },
  },
  {
    name: 'Hard Clip',
    effectType: 'distortion',
    folder: 'Factory/Distortion',
    params: { type: 1, drive: 0.5, tone: 6000, output: -3, amount: 1 },
  },
  {
    name: 'Fuzz',
    effectType: 'distortion',
    folder: 'Factory/Distortion',
    params: { type: 3, drive: 0.7, tone: 4000, output: -6, amount: 0.8 },
  },
];
