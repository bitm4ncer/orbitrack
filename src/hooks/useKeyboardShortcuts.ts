import { useEffect } from 'react';
import { toggleTransport } from '../audio/transport';
import { initAudio } from '../audio/engine';
import { loadSamples } from '../audio/sampler';
import { undo, redo } from '../state/undoHistory';

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

      const isMod = e.metaKey || e.ctrlKey;

      // Undo: Ctrl+Z / Cmd+Z
      if (isMod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      // Redo: Ctrl+Shift+Z / Cmd+Shift+Z / Ctrl+Y
      if (isMod && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
        e.preventDefault();
        redo();
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
