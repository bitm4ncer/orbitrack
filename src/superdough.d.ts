declare module 'superdough' {
  export function superdough(params: Record<string, unknown>, time?: number, hapDuration?: number, cps?: number, cycle?: number): void;
  export function samples(bank: Record<string, unknown>): void;
  export function loadBuffer(url: string, ac: AudioContext, s?: string, n?: number): Promise<AudioBuffer>;
  export const gainNode: AudioNode;
  export function getAudioContext(): AudioContext;
  export function setAudioContext(ctx: AudioContext): AudioContext;
  export function loadWorklets(): Promise<void>;
  export function getSuperdoughAudioController(): {
    getOrbit(index: number, channels?: number[]): { output: GainNode; summingNode: GainNode };
    nodes: Record<number, { output: GainNode; summingNode: GainNode }>;
  };
}
