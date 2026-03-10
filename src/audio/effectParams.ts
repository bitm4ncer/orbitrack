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

export const EFFECT_PARAM_DEFS: Partial<Record<EffectType, EffectParamDef[]>> & Record<
  'eq3'|'compressor'|'reverb'|'delay'|'chorus'|'phaser'|'distortion'|'filter'|
  'bitcrusher'|'parame'|'tremolo'|'ringmod'|'trancegate'|'pingpong',
  EffectParamDef[]
> = {
  reverb: [
    { key: 'amount',   label: 'Mix',     min: 0,   max: 1,   step: 0.01,  defaultValue: 0.3 },
    { key: 'predelay', label: 'Pre-Dly', min: 0,   max: 0.1, step: 0.001, defaultValue: 0,   unit: 's' },
    { key: 'size',     label: 'Size',    min: 0,   max: 1,   step: 0.01,  defaultValue: 0.5 },
    { key: 'damp',     label: 'Damp',    min: 0,   max: 1,   step: 0.01,  defaultValue: 0.5 },
  ],
  delay: [
    { key: 'amount',   label: 'Mix',      min: 0,    max: 1,     step: 0.01,  defaultValue: 0.3 },
    { key: 'time',     label: 'Time',     min: 0.01, max: 2,     step: 0.001, defaultValue: 0.25, unit: 's' },
    { key: 'feedback', label: 'Feedback', min: 0,    max: 0.95,  step: 0.01,  defaultValue: 0.4 },
    { key: 'tone',     label: 'Hi-Cut',   min: 500,  max: 20000, step: 100,   defaultValue: 8000, unit: 'Hz' },
  ],
  eq3: [
    { key: 'low',     label: 'Low',      min: -18, max: 18,   step: 0.5, defaultValue: 0,    unit: 'dB' },
    { key: 'mid',     label: 'Mid',      min: -18, max: 18,   step: 0.5, defaultValue: 0,    unit: 'dB' },
    { key: 'high',    label: 'High',     min: -18, max: 18,   step: 0.5, defaultValue: 0,    unit: 'dB' },
    { key: 'lowFreq', label: 'Low Freq', min: 60,  max: 500,  step: 10,  defaultValue: 200,  unit: 'Hz' },
    { key: 'midFreq', label: 'Mid Freq', min: 200, max: 5000, step: 10,  defaultValue: 1000, unit: 'Hz' },
    { key: 'midQ',    label: 'Mid Q',    min: 0.1, max: 8,    step: 0.1, defaultValue: 1.0 },
    { key: 'highFreq',label: 'Hi Freq',  min: 2000,max: 16000,step: 100, defaultValue: 4000, unit: 'Hz' },
  ],
  compressor: [
    { key: 'threshold', label: 'Threshold', min: -60,  max: 0,   step: 1,     defaultValue: -24,  unit: 'dB' },
    { key: 'ratio',     label: 'Ratio',     min: 1,    max: 20,  step: 0.5,   defaultValue: 4 },
    { key: 'attack',    label: 'Attack',    min: 0.001,max: 0.5, step: 0.001, defaultValue: 0.003, unit: 's' },
    { key: 'release',   label: 'Release',   min: 0.01, max: 1,   step: 0.01,  defaultValue: 0.25, unit: 's' },
    { key: 'knee',      label: 'Knee',      min: 0,    max: 40,  step: 1,     defaultValue: 6,    unit: 'dB' },
    { key: 'makeupGain',label: 'Makeup',    min: 0,    max: 24,  step: 0.5,   defaultValue: 0,    unit: 'dB' },
  ],
  chorus: [
    { key: 'amount', label: 'Mix',    min: 0,    max: 1,    step: 0.01,  defaultValue: 0.5 },
    { key: 'depth',  label: 'Depth',  min: 0,    max: 0.02, step: 0.001, defaultValue: 0.005, unit: 's' },
    { key: 'rate',   label: 'Rate',   min: 0.1,  max: 10,   step: 0.1,   defaultValue: 1.5, unit: 'Hz' },
    { key: 'delay',  label: 'Delay',  min: 0.01, max: 0.05, step: 0.001, defaultValue: 0.02, unit: 's' },
    { key: 'spread', label: 'Spread', min: 0,    max: 1,    step: 0.01,  defaultValue: 0.3 },
  ],
  phaser: [
    { key: 'amount',   label: 'Mix',      min: 0,   max: 1,    step: 0.01, defaultValue: 0.5 },
    { key: 'stages',   label: 'Stages',   min: 2,   max: 12,   step: 2,    defaultValue: 4 },
    { key: 'rate',     label: 'Rate',     min: 0.1, max: 5,    step: 0.1,  defaultValue: 0.5, unit: 'Hz' },
    { key: 'depth',    label: 'Depth',    min: 0,   max: 1,    step: 0.01, defaultValue: 0.7 },
    { key: 'baseFreq', label: 'Freq',     min: 100, max: 5000, step: 50,   defaultValue: 1000, unit: 'Hz' },
    { key: 'feedback', label: 'Feedback', min: 0,   max: 0.9,  step: 0.01, defaultValue: 0 },
  ],
  distortion: [
    { key: 'type',   label: 'Type',   min: 0,   max: 3,     step: 1,    defaultValue: 0 },
    { key: 'drive',  label: 'Drive',  min: 0,   max: 1,     step: 0.01, defaultValue: 0.5 },
    { key: 'tone',   label: 'Tone',   min: 500, max: 20000, step: 100,  defaultValue: 8000, unit: 'Hz' },
    { key: 'output', label: 'Output', min: -24, max: 6,     step: 0.5,  defaultValue: 0,    unit: 'dB' },
    { key: 'amount', label: 'Mix',    min: 0,   max: 1,     step: 0.01, defaultValue: 1 },
  ],
  filter: [
    { key: 'filterType', label: 'Type',      min: 0,   max: 3,     step: 1,    defaultValue: 0 },
    { key: 'frequency',  label: 'Cutoff',    min: 20,  max: 20000, step: 10,   defaultValue: 2000, unit: 'Hz' },
    { key: 'q',          label: 'Q',         min: 0.1, max: 20,    step: 0.1,  defaultValue: 1 },
    { key: 'amount',     label: 'Mix',       min: 0,   max: 1,     step: 0.01, defaultValue: 1 },
    { key: 'lfoRate',    label: 'LFO Rate',  min: 0.1, max: 20,    step: 0.1,  defaultValue: 1,    unit: 'Hz' },
    { key: 'lfoDepth',   label: 'LFO Depth', min: 0,   max: 1,     step: 0.01, defaultValue: 0 },
  ],
  bitcrusher: [
    { key: 'bits',       label: 'Bits',       min: 1,   max: 16, step: 1,    defaultValue: 16 },
    { key: 'downsample', label: 'Downsample', min: 0,   max: 1,  step: 0.01, defaultValue: 0 },
    { key: 'amount',     label: 'Mix',        min: 0,   max: 1,  step: 0.01, defaultValue: 1 },
  ],
  parame: [
    // Band 1 — High-pass (left edge)
    { key: 'b1type', label: 'B1 Type', min: 0, max: 5, step: 1, defaultValue: 1 },
    { key: 'b1freq', label: 'B1 Freq', min: 20, max: 20000, step: 10, defaultValue: 30,    unit: 'Hz' },
    { key: 'b1gain', label: 'B1 Gain', min: -18, max: 18, step: 0.5, defaultValue: 0,     unit: 'dB' },
    { key: 'b1q',    label: 'B1 Q',    min: 0.1, max: 10, step: 0.1, defaultValue: 0.707 },
    // Band 2 — Low shelf
    { key: 'b2type', label: 'B2 Type', min: 0, max: 5, step: 1, defaultValue: 3 },
    { key: 'b2freq', label: 'B2 Freq', min: 20, max: 20000, step: 10, defaultValue: 120,   unit: 'Hz' },
    { key: 'b2gain', label: 'B2 Gain', min: -18, max: 18, step: 0.5, defaultValue: 0,     unit: 'dB' },
    { key: 'b2q',    label: 'B2 Q',    min: 0.1, max: 10, step: 0.1, defaultValue: 0.707 },
    // Band 3 — Bell (low-mid)
    { key: 'b3type', label: 'B3 Type', min: 0, max: 5, step: 1, defaultValue: 2 },
    { key: 'b3freq', label: 'B3 Freq', min: 20, max: 20000, step: 10, defaultValue: 500,   unit: 'Hz' },
    { key: 'b3gain', label: 'B3 Gain', min: -18, max: 18, step: 0.5, defaultValue: 0,     unit: 'dB' },
    { key: 'b3q',    label: 'B3 Q',    min: 0.1, max: 10, step: 0.1, defaultValue: 1.0 },
    // Band 4 — Bell (high-mid)
    { key: 'b4type', label: 'B4 Type', min: 0, max: 5, step: 1, defaultValue: 2 },
    { key: 'b4freq', label: 'B4 Freq', min: 20, max: 20000, step: 10, defaultValue: 3000,  unit: 'Hz' },
    { key: 'b4gain', label: 'B4 Gain', min: -18, max: 18, step: 0.5, defaultValue: 0,     unit: 'dB' },
    { key: 'b4q',    label: 'B4 Q',    min: 0.1, max: 10, step: 0.1, defaultValue: 1.0 },
    // Band 5 — High shelf
    { key: 'b5type', label: 'B5 Type', min: 0, max: 5, step: 1, defaultValue: 4 },
    { key: 'b5freq', label: 'B5 Freq', min: 20, max: 20000, step: 10, defaultValue: 10000, unit: 'Hz' },
    { key: 'b5gain', label: 'B5 Gain', min: -18, max: 18, step: 0.5, defaultValue: 0,     unit: 'dB' },
    { key: 'b5q',    label: 'B5 Q',    min: 0.1, max: 10, step: 0.1, defaultValue: 0.707 },
    // Band 6 — Low-pass (right edge)
    { key: 'b6type', label: 'B6 Type', min: 0, max: 5, step: 1, defaultValue: 0 },
    { key: 'b6freq', label: 'B6 Freq', min: 20, max: 20000, step: 10, defaultValue: 20000, unit: 'Hz' },
    { key: 'b6gain', label: 'B6 Gain', min: -18, max: 18, step: 0.5, defaultValue: 0,     unit: 'dB' },
    { key: 'b6q',    label: 'B6 Q',    min: 0.1, max: 10, step: 0.1, defaultValue: 0.707 },
  ],
  tremolo: [
    { key: 'amount',   label: 'Depth', min: 0,   max: 1,  step: 0.01, defaultValue: 0.5 },
    { key: 'rate',     label: 'Rate',  min: 0.1, max: 20, step: 0.1,  defaultValue: 4,   unit: 'Hz' },
    { key: 'waveform', label: 'Wave',  min: 0,   max: 2,  step: 1,    defaultValue: 0 },
  ],
  ringmod: [
    { key: 'frequency', label: 'Freq', min: 1,   max: 5000, step: 1,    defaultValue: 440, unit: 'Hz' },
    { key: 'amount',    label: 'Mix',  min: 0,   max: 1,    step: 0.01, defaultValue: 1 },
    { key: 'waveform',  label: 'Wave', min: 0,   max: 2,    step: 1,    defaultValue: 0 },
  ],
  trancegate: [
    { key: 'amount',  label: 'Mix',     min: 0,   max: 1,    step: 0.01, defaultValue: 1 },
    { key: 'steps',   label: 'Steps',   min: 4,   max: 16,   step: 4,    defaultValue: 16 },
    { key: 'rate',    label: 'Rate',    min: 4,   max: 32,   step: 4,    defaultValue: 16 },
    { key: 'attack',  label: 'Attack',  min: 0,   max: 0.49, step: 0.01, defaultValue: 0.02 },
    { key: 'release', label: 'Release', min: 0,   max: 0.49, step: 0.01, defaultValue: 0.2 },
    // s0–s15: step on/off — not listed as knobs, handled by circular sequencer UI
    ...Array.from({ length: 16 }, (_, i) => ({
      key: `s${i}`, label: `S${i}`, min: 0, max: 1, step: 1, defaultValue: 1,
    })),
  ],
  pingpong: [
    { key: 'amount',   label: 'Mix',      min: 0,   max: 1,     step: 0.01,  defaultValue: 0.4 },
    { key: 'time',     label: 'Time',     min: 0.01, max: 2,    step: 0.001, defaultValue: 0.25, unit: 's' },
    { key: 'feedback', label: 'Feedback', min: 0,   max: 0.9,   step: 0.01,  defaultValue: 0.45 },
    { key: 'tone',     label: 'Hi-Cut',   min: 500, max: 20000, step: 100,   defaultValue: 8000, unit: 'Hz' },
    { key: 'spread',   label: 'Spread',   min: 0,   max: 1,     step: 0.01,  defaultValue: 1 },
  ],
};

/** 2-3 most important param keys per effect for quick-access UI */
export const QUICK_PARAM_KEYS: Partial<Record<EffectType, string[]>> = {
  eq3:        ['low', 'mid', 'high'],
  parame:     ['b3gain', 'b4gain', 'b5gain'],
  compressor: ['threshold', 'ratio'],
  reverb:     ['amount', 'size', 'damp'],
  delay:      ['amount', 'time', 'feedback'],
  chorus:     ['amount', 'rate', 'depth'],
  phaser:     ['amount', 'rate', 'depth'],
  distortion: ['drive', 'tone', 'amount'],
  filter:     ['frequency', 'q', 'amount'],
  bitcrusher: ['bits', 'downsample'],
  tremolo:    ['amount', 'rate'],
  ringmod:    ['frequency', 'amount'],
  trancegate: ['amount', 'steps'],
  pingpong:   ['amount', 'time', 'feedback'],
};

export function DEFAULT_EFFECT_PARAMS(type: EffectType): Record<string, number> {
  const defs = EFFECT_PARAM_DEFS[type as keyof typeof EFFECT_PARAM_DEFS];
  if (!defs) return {};
  return Object.fromEntries(defs.map((p) => [p.key, p.defaultValue]));
}
