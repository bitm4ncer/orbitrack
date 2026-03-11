import { useEffect, useRef } from 'react';
import { useStore } from '../state/store';
import { getSynthEngine } from '../audio/synthManager';
import { initAudio } from '../audio/engine';
import { loadSamples } from '../audio/sampler';

const audioInitRef = { initialized: false };

async function ensureAudio() {
  if (audioInitRef.initialized) return;
  try {
    await initAudio();
    await loadSamples();
    audioInitRef.initialized = true;
  } catch (err) {
    console.error('Failed to initialize audio:', err);
    audioInitRef.initialized = false;
    throw err;
  }
}

const PIANO_KEY_MAP: Record<string, number> = {
  // Home row: C D E F G A B C D
  KeyA: 0,   // C
  KeyS: 2,   // D
  KeyD: 4,   // E
  KeyF: 5,   // F
  KeyG: 7,   // G
  KeyH: 9,   // A
  KeyJ: 11,  // B
  KeyK: 12,  // C (next octave)
  KeyL: 14,  // D (next octave)

  // Top row: C# D# F# G# A#
  KeyW: 1,   // C#
  KeyE: 3,   // D#
  KeyT: 6,   // F#
  KeyY: 8,   // G#
  KeyU: 10,  // A#

  // Next octave: C# D#
  KeyO: 13,  // C# (next octave)
  KeyP: 15,  // D# (next octave)
};

export function usePianoKeyboard(): void {
  const octaveRef = useRef(4);
  const velocityRef = useRef(80);
  const heldKeysRef = useRef(new Map<string, number>());
  const audioInitializedRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isMounted) return;

      // Skip if typing in text input or textarea
      if (
        (e.target instanceof HTMLInputElement && e.target.type !== 'range') ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Skip if key repeat
      if (e.repeat) return;

      // Skip if modifier key pressed
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Octave control
      if (e.code === 'KeyZ') {
        e.preventDefault();
        octaveRef.current = Math.max(0, octaveRef.current - 1);
        return;
      }

      if (e.code === 'KeyX') {
        e.preventDefault();
        octaveRef.current = Math.min(8, octaveRef.current + 1);
        return;
      }

      // Velocity control
      if (e.code === 'KeyC') {
        e.preventDefault();
        velocityRef.current = Math.max(10, velocityRef.current - 8);
        return;
      }

      if (e.code === 'KeyV') {
        e.preventDefault();
        velocityRef.current = Math.min(127, velocityRef.current + 8);
        return;
      }

      // Piano key pressed
      if (e.code in PIANO_KEY_MAP && !heldKeysRef.current.has(e.code)) {
        e.preventDefault();

        // Initialize audio on first key press if needed
        if (!audioInitializedRef.current) {
          ensureAudio()
            .then(() => {
              audioInitializedRef.current = true;
              triggerNote(e.code);
            })
            .catch((err) => {
              console.error('Piano keyboard: failed to initialize audio:', err);
            });
        } else {
          triggerNote(e.code);
        }
      }
    };

    const triggerNote = (keyCode: string) => {
      try {
        const store = useStore.getState();
        const inst = store.instruments.find((i) => i.id === store.selectedInstrumentId);

        if (inst?.type === 'synth') {
          const engine = getSynthEngine(inst.id, inst.orbitIndex, inst.engineParams);
          const semitoneDelta = PIANO_KEY_MAP[keyCode];
          const midiNote = 12 * (octaveRef.current + 1) + semitoneDelta;

          engine.noteOnNow(midiNote);
          heldKeysRef.current.set(keyCode, midiNote);
        }
      } catch (err) {
        console.error('Piano keyboard: failed to trigger note:', err);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!isMounted) return;

      if (e.code in PIANO_KEY_MAP && heldKeysRef.current.has(e.code)) {
        e.preventDefault();
        heldKeysRef.current.delete(e.code);

        try {
          const store = useStore.getState();
          const inst = store.instruments.find((i) => i.id === store.selectedInstrumentId);

          if (inst?.type === 'synth' && audioInitializedRef.current) {
            const engine = getSynthEngine(inst.id, inst.orbitIndex, inst.engineParams);

            if (heldKeysRef.current.size > 0) {
              // Retrigger last held key without calling noteOff first
              const lastKey = Array.from(heldKeysRef.current.keys()).pop();
              if (lastKey) {
                const midiNote = heldKeysRef.current.get(lastKey)!;
                engine.noteOnNow(midiNote);
              }
            } else {
              // All keys released
              engine.noteOff();
            }
          }
        } catch (err) {
          console.error('Piano keyboard: failed on key release:', err);
        }
      }
    };

    const handleWindowBlur = () => {
      if (heldKeysRef.current.size > 0) {
        try {
          const store = useStore.getState();
          const inst = store.instruments.find((i) => i.id === store.selectedInstrumentId);
          if (inst?.type === 'synth' && audioInitializedRef.current) {
            getSynthEngine(inst.id, inst.orbitIndex, inst.engineParams).noteOff();
          }
        } catch (err) {
          // Ignore cleanup errors
        }
        heldKeysRef.current.clear();
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden && heldKeysRef.current.size > 0) {
        try {
          const store = useStore.getState();
          const inst = store.instruments.find((i) => i.id === store.selectedInstrumentId);
          if (inst?.type === 'synth' && audioInitializedRef.current) {
            getSynthEngine(inst.id, inst.orbitIndex, inst.engineParams).noteOff();
          }
        } catch (err) {
          // Ignore cleanup errors
        }
        heldKeysRef.current.clear();
      }
    };

    const handleBeforeUnload = () => {
      if (heldKeysRef.current.size > 0) {
        try {
          const store = useStore.getState();
          const inst = store.instruments.find((i) => i.id === store.selectedInstrumentId);
          if (inst?.type === 'synth' && audioInitializedRef.current) {
            getSynthEngine(inst.id, inst.orbitIndex, inst.engineParams).noteStop();
          }
        } catch (err) {
          // Ignore cleanup errors
        }
        heldKeysRef.current.clear();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      isMounted = false;
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Force cleanup on unmount
      if (heldKeysRef.current.size > 0) {
        try {
          const store = useStore.getState();
          const inst = store.instruments.find((i) => i.id === store.selectedInstrumentId);
          if (inst?.type === 'synth' && audioInitializedRef.current) {
            getSynthEngine(inst.id, inst.orbitIndex, inst.engineParams).noteStop();
          }
        } catch (err) {
          // Ignore
        }
        heldKeysRef.current.clear();
      }
    };
  }, []);
}
