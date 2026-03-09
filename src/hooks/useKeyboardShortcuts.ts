import { useEffect } from 'react';
import { toggleTransport } from '../audio/transport';
import { initAudio } from '../audio/engine';
import { loadSamples } from '../audio/sampler';

const audioInitRef = { initialized: false };

async function ensureAudio() {
  if (audioInitRef.initialized) return;
  await initAudio();
  await loadSamples();
  audioInitRef.initialized = true;
}

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Don't trigger if user is typing in a text input
      if (
        (e.target instanceof HTMLInputElement && e.target.type !== 'range') ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        await ensureAudio();
        toggleTransport();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
