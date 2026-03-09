export type EffectType =
  | 'eq3'
  | 'reverb'
  | 'delay'
  | 'compressor'
  | 'chorus'
  | 'phaser'
  | 'distortion'
  | 'filter';

export interface Effect {
  id: string;
  type: EffectType;
  label: string;
  enabled: boolean;
  params: Record<string, number>;
  collapsed: boolean;
}

export type ConnectionEndpoint =
  | { kind: 'instrument'; id: string }
  | { kind: 'effect'; id: string; port: 'in' | 'out' }
  | { kind: 'master'; port: 'in' };

export interface Connection {
  id: string;
  from: ConnectionEndpoint;
  to: ConnectionEndpoint;
}
