declare module 'superdough' {
  export function superdough(params: Record<string, unknown>, time?: number, hapDuration?: number, cps?: number, cycle?: number): void;
  export function samples(bank: Record<string, unknown>): void;
  export function loadBuffer(url: string, ac: AudioContext, s?: string, n?: number): Promise<AudioBuffer>;
  export const gainNode: AudioNode;
  export function getAudioContext(): AudioContext;
  export function setAudioContext(ctx: AudioContext): AudioContext;
}
