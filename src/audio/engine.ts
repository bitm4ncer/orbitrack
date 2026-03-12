import * as Tone from 'tone';
import { samples, loadBuffer, getAudioContext as getSdAudioContext, loadWorklets } from 'superdough';
import { initRoutingEngine } from './routingEngine';
import { initSceneBusesFromState } from './sceneBus';

let initialized = false;

/** Re-initialize scene buses from current store state (called after audio init). */
async function initSceneBusesFromStore(): Promise<void> {
  try {
    const { useStore } = await import('../state/store');
    const s = useStore.getState();
    if (s.scenes && s.scenes.length > 0) {
      initSceneBusesFromState(s.scenes, s.instruments);
    }
  } catch { /* store not ready yet — safe to skip */ }
}

// Suppress superdough's internal "node.onended" deprecation warning — it fires
// from inside the library's own legacy code path, not from our code, and there
// is no API to opt out. The warning goes through console.log, not console.warn.
// All other console calls pass through unchanged.
const _origWarn = console.warn.bind(console);
const _origLog = console.log.bind(console);
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('node.onended')) return;
  _origWarn(...args);
};
console.log = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('node.onended')) return;
  _origLog(...args);
};

// Register the 4 default drum samples with superdough immediately at module load.
// superdough looks up `s: 'kick'` etc. in its internal soundMap — without this
// registration those sounds are never found and playback silently fails.
samples({
  _base: window.location.origin + import.meta.env.BASE_URL,
  kick: 'samples/Default/kick.wav',
  snare: 'samples/Default/snare.wav',
  hihat: 'samples/Default/hihat.wav',
  clap: 'samples/Default/clap.wav',
});

const DEFAULT_SAMPLES: Record<string, string> = {
  kick: 'samples/Default/kick.wav',
  snare: 'samples/Default/snare.wav',
  hihat: 'samples/Default/hihat.wav',
  clap: 'samples/Default/clap.wav',
};

export async function initAudio(): Promise<void> {
  if (initialized) return;

  // Let superdough own the AudioContext — then tell Tone.js to use it.
  // This guarantees a single AudioContext for everything: superdough orbits,
  // per-note nodes, Tone.js scheduling, our effect chains, and the synth engine.
  // The old approach (Tone creates context → setAudioContext) caused cross-context
  // errors because superdough could create orbit nodes before setAudioContext ran.
  const sdCtx = getSdAudioContext() as AudioContext;
  Tone.setContext(sdCtx);
  await Tone.start();

  // 200ms lookahead: buffers against brief main-thread blocks without
  // throwing off the step-counter logic in transport.ts (which uses
  // transport.seconds, i.e. current audio time, not the scheduled `time`).
  Tone.getContext().lookAhead = 0.2;

  // Load superdough's AudioWorklet processors (needed for distort, crush, etc.)
  // This also causes superdough to fully initialize its internal gainNode.
  try {
    await loadWorklets();
  } catch (e) {
    console.warn('[engine] superdough worklets failed to load:', e);
  }

  // Load our bitcrusher sample-rate-reduction AudioWorklet
  try {
    await sdCtx.audioWorklet.addModule(import.meta.env.BASE_URL + 'bitcrusher-processor.js');
  } catch (e) {
    console.warn('[engine] bitcrusher worklet failed to load:', e);
  }

  // Pre-decode all default samples into superdough's buffer cache so the
  // first note plays immediately without a loading delay.
  const base = window.location.origin + import.meta.env.BASE_URL;
  const ac = getSdAudioContext();
  await Promise.all(
    Object.entries(DEFAULT_SAMPLES).map(([name, path]) => loadBuffer(`${base}${path}`, ac, name, 0))
  );

  // Wire superdough output → masterGain → masterAnalyser → destination.
  // Called after loadWorklets() so superdough's gainNode is guaranteed to exist.
  // getMasterAnalyser() also retries lazily on each VU meter frame as a fallback.
  initRoutingEngine();

  initialized = true;

  // Re-initialize scene buses if scenes exist in store (e.g. from autosave restore)
  initSceneBusesFromStore();
}

export function isAudioReady(): boolean {
  return initialized;
}

/**
 * Convert a sample path (e.g. 'samples/kick.wav' or a blob URL) to a
 * collision-resistant superdough sound key and register it in superdough's
 * soundMap so it can be played via `superdough({ s: key })`.
 *
 * Returns the key that was registered.
 */
export function registerSampleForPlayback(pathOrUrl: string, blobUrl?: string): string {
  const last = pathOrUrl.split('/').pop() ?? pathOrUrl;
  const key = last.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');

  if (blobUrl) {
    // Blob / object URL — must use empty base so superdough stores the URL as-is
    samples({ _base: '', [key]: blobUrl });
  } else {
    samples({
      _base: window.location.origin + import.meta.env.BASE_URL,
      [key]: pathOrUrl,
    });
  }

  return key;
}
