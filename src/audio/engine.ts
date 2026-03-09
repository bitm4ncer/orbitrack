import * as Tone from 'tone';

let initialized = false;

export async function initAudio(): Promise<void> {
  if (initialized) return;
  await Tone.start();
  initialized = true;
}

export function isAudioReady(): boolean {
  return initialized;
}
