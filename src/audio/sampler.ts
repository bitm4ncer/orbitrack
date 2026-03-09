import * as Tone from 'tone';

const players: Map<string, { player: Tone.Player; url: string }> = new Map();
let output: Tone.Gain | null = null;
let previewPlayer: Tone.Player | null = null;

// Legacy aliases for default instruments
const LEGACY_ALIASES: Record<string, string> = {
  kick: 'samples/kick.wav',
  snare: 'samples/snare.wav',
  hihat: 'samples/hihat.wav',
  clap: 'samples/clap.wav',
};

function ensureOutput(): Tone.Gain {
  if (!output) {
    output = new Tone.Gain(1).toDestination();
  }
  return output;
}

export async function loadSample(key: string, url: string): Promise<void> {
  const out = ensureOutput();
  const existing = players.get(key);

  // Already loaded with same URL
  if (existing && existing.url === url) return;

  // Dispose old player if different URL
  if (existing) {
    existing.player.stop();
    existing.player.disconnect();
    existing.player.dispose();
  }

  return new Promise<void>((resolve) => {
    const player = new Tone.Player({
      url,
      onload: () => resolve(),
      onerror: () => resolve(), // Don't block on load errors
    }).connect(out);
    players.set(key, { player, url });
  });
}

export async function loadSamples(): Promise<void> {
  ensureOutput();
  const promises = Object.entries(LEGACY_ALIASES).map(([key, url]) => loadSample(key, url));
  await Promise.all(promises);
}

export function triggerSample(name: string, time?: number, volume = 0, playbackRate = 1.0): void {
  // Resolve legacy alias
  const key = LEGACY_ALIASES[name] ? name : name;
  const entry = players.get(key);
  if (!entry || !entry.player.loaded) return;
  entry.player.volume.value = volume;
  entry.player.playbackRate = playbackRate;
  entry.player.start(time);
}

export function previewSample(url: string): void {
  stopPreview();
  const out = ensureOutput();
  previewPlayer = new Tone.Player({
    url,
    autostart: true,
    onload: () => {
      // Player auto-starts after loading
    },
  }).connect(out);
}

export function stopPreview(): void {
  if (previewPlayer) {
    try {
      previewPlayer.stop();
    } catch {
      // Ignore if not started
    }
    previewPlayer.disconnect();
    previewPlayer.dispose();
    previewPlayer = null;
  }
}

export function getSampleNames(): string[] {
  return Object.keys(LEGACY_ALIASES);
}
