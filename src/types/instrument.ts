import type { SuperdoughSynthParams, SuperdoughSamplerParams } from './superdough';

export interface Instrument {
  id: string;
  name: string;
  type: 'sampler' | 'synth';
  sampleName?: string;
  color: string;
  hits: number;
  hitPositions: number[]; // normalized [0..1) angular positions
  loopSize: number; // steps per loop
  loopSizeLocked: boolean;
  muted: boolean;
  solo: boolean;
  volume: number; // dB
  orbitIndex: number; // superdough orbit channel index (unique per instrument)
  synthParams?: SuperdoughSynthParams;
  samplerParams?: SuperdoughSamplerParams;
}
