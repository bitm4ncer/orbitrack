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
  | 'pingpong';

export interface Effect {
  id: string;
  type: EffectType;
  label: string;
  enabled: boolean;
  params: Record<string, number>;
  collapsed: boolean;
}
