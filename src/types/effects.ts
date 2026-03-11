export type EffectType =
  | 'eq3'
  | 'reverb'
  | 'delay'
  | 'compressor'
  | 'chorus'
  | 'phaser'
  | 'distortion'
  | 'filter'
  | 'bitcrusher'
  | 'parame'
  | 'tremolo'
  | 'ringmod'
  | 'trancegate'
  | 'limiter'
  | 'drumbuss'
  | 'stereoimage';

export interface Effect {
  id: string;
  type: EffectType;
  label: string;
  enabled: boolean;
  params: Record<string, number>;
  collapsed: boolean;
}
