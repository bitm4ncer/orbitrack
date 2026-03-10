import type { EffectType } from '../types/effects';

export interface EffectParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  unit?: string;
}

export const EFFECT_PARAM_DEFS: Record<EffectType, EffectParamDef[]> = {
  reverb: [
    { key: 'amount', label: 'Mix', min: 0, max: 1, step: 0.01, defaultValue: 0.3 },
    { key: 'size', label: 'Size', min: 0, max: 1, step: 0.01, defaultValue: 0.5 },
    { key: 'fade', label: 'Fade', min: 0.1, max: 5, step: 0.1, defaultValue: 1, unit: 's' },
  ],
  delay: [
    { key: 'amount', label: 'Mix', min: 0, max: 1, step: 0.01, defaultValue: 0.3 },
    { key: 'time', label: 'Time', min: 0.01, max: 1, step: 0.001, defaultValue: 0.25, unit: 's' },
    { key: 'feedback', label: 'Feedback', min: 0, max: 0.98, step: 0.01, defaultValue: 0.4 },
    { key: 'tone', label: 'Tone', min: 200, max: 20000, step: 10, defaultValue: 8000, unit: 'Hz' },
  ],
  eq3: [
    { key: 'low', label: 'Low', min: -18, max: 18, step: 0.5, defaultValue: 0, unit: 'dB' },
    { key: 'mid', label: 'Mid', min: -18, max: 18, step: 0.5, defaultValue: 0, unit: 'dB' },
    { key: 'high', label: 'High', min: -18, max: 18, step: 0.5, defaultValue: 0, unit: 'dB' },
    { key: 'lowFreq', label: 'Low Freq', min: 60, max: 500, step: 10, defaultValue: 200, unit: 'Hz' },
    { key: 'midFreq', label: 'Mid Freq', min: 200, max: 5000, step: 10, defaultValue: 1000, unit: 'Hz' },
    { key: 'highFreq', label: 'High Freq', min: 2000, max: 16000, step: 100, defaultValue: 4000, unit: 'Hz' },
  ],
  compressor: [
    { key: 'threshold', label: 'Threshold', min: -60, max: 0, step: 1, defaultValue: -24, unit: 'dB' },
    { key: 'ratio', label: 'Ratio', min: 1, max: 20, step: 0.5, defaultValue: 4 },
    { key: 'attack', label: 'Attack', min: 0.001, max: 0.5, step: 0.001, defaultValue: 0.003, unit: 's' },
    { key: 'release', label: 'Release', min: 0.01, max: 2, step: 0.01, defaultValue: 0.25, unit: 's' },
    { key: 'knee', label: 'Knee', min: 0, max: 40, step: 1, defaultValue: 6, unit: 'dB' },
    { key: 'makeupGain', label: 'Makeup', min: 0, max: 24, step: 0.5, defaultValue: 0, unit: 'dB' },
  ],
  chorus: [
    { key: 'amount', label: 'Mix', min: 0, max: 1, step: 0.01, defaultValue: 0.5 },
    { key: 'depth', label: 'Depth', min: 0, max: 0.02, step: 0.001, defaultValue: 0.005, unit: 's' },
    { key: 'rate', label: 'Rate', min: 0.1, max: 10, step: 0.1, defaultValue: 1.5, unit: 'Hz' },
    { key: 'delay', label: 'Delay', min: 0.01, max: 0.05, step: 0.001, defaultValue: 0.02, unit: 's' },
  ],
  phaser: [
    { key: 'amount', label: 'Mix', min: 0, max: 1, step: 0.01, defaultValue: 0.5 },
    { key: 'stages', label: 'Stages', min: 2, max: 12, step: 2, defaultValue: 4 },
    { key: 'rate', label: 'Rate', min: 0.1, max: 5, step: 0.1, defaultValue: 0.5, unit: 'Hz' },
    { key: 'depth', label: 'Depth', min: 0, max: 1, step: 0.01, defaultValue: 0.7 },
    { key: 'baseFreq', label: 'Freq', min: 100, max: 5000, step: 50, defaultValue: 1000, unit: 'Hz' },
  ],
  distortion: [
    { key: 'amount', label: 'Mix', min: 0, max: 1, step: 0.01, defaultValue: 0.5 },
    { key: 'drive', label: 'Drive', min: 0, max: 1, step: 0.01, defaultValue: 0.5 },
  ],
  filter: [
    { key: 'frequency', label: 'Cutoff', min: 20, max: 20000, step: 10, defaultValue: 2000, unit: 'Hz' },
    { key: 'q', label: 'Q', min: 0.1, max: 20, step: 0.1, defaultValue: 1 },
    { key: 'amount', label: 'Mix', min: 0, max: 1, step: 0.01, defaultValue: 1 },
  ],
};

export function DEFAULT_EFFECT_PARAMS(type: EffectType): Record<string, number> {
  return Object.fromEntries(
    EFFECT_PARAM_DEFS[type].map((p) => [p.key, p.defaultValue])
  );
}
