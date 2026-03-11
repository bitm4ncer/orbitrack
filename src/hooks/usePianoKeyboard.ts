import { useEffect, useRef } from 'react';
import { useStore } from '../state/store';
import { getSynthEngine } from '../audio/synthManager';
import { initAudio } from '../audio/engine';
import { loadSamples } from '../audio/sampler';

const audioInitRef = { initialized: false };

async function ensureAudio() {
  if (audioInitRef.initialized) return;
  await initAudio();
  await loadSamples();
  audioInitRef.initialized = true;
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
  const octaveRef = useRef(4); // Default octave: C4 = MIDI 60
  const velocityRef = useRef(80); // 0-127, default 80
  const heldKeysRef = useRef(new Map<string, number>()); // keyCode → midiNote
  const lastHeldKeyRef = useRef<string | null>(null); // Track last triggered key for retrigger

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Skip if typing in text input or textarea
      if (
        (e.target instanceof HTMLInputElement && e.target.type !== 'range') ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Skip if key repeat (holding down a key)
      if (e.repeat) {
        return;
      }

      // Skip if modifier key is pressed (let other shortcuts handle it)
      if (e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }

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

        try {
          await ensureAudio();

          const store = useStore.getState();
          const inst = store.instruments.find((i) => i.id === store.selectedInstrumentId);

          // Only play if a synth instrument is selected
          if (inst?.type === 'synth') {
            const engine = getSynthEngine(inst.id, inst.orbitIndex, inst.engineParams);
            const semitoneDelta = PIANO_KEY_MAP[e.code];
            const midiNote = 12 * (octaveRef.current + 1) + semitoneDelta;

            engine.noteOnNow(midiNote);
            heldKeysRef.current.set(e.code, midiNote);
            lastHeldKeyRef.current = e.code;
          }
        } catch (err) {
          console.error('Piano keyboard error:', err);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Piano key released
      if (e.code in PIANO_KEY_MAP && heldKeysRef.current.has(e.code)) {
        e.preventDefault();

        heldKeysRef.current.delete(e.code);

        const store = useStore.getState();
        const inst = store.instruments.find((i) => i.id === store.selectedInstrumentId);

        if (inst?.type === 'synth') {
          const engine = getSynthEngine(inst.id, inst.orbitIndex, inst.engineParams);

          if (heldKeysRef.current.size > 0) {
            // Other keys still held: retrigger the last remaining key
            const lastKey = Array.from(heldKeysRef.current.keys()).pop();
            if (lastKey) {
              const midiNote = heldKeysRef.current.get(lastKey)!;
              engine.noteOnNow(midiNote);
              lastHeldKeyRef.current = lastKey;
            }
          } else {
            // No more keys held: silence
            engine.noteOff();
            lastHeldKeyRef.current = null;
          }
        }
      }
    };

    // Cleanup stuck notes when window loses focus or is hidden
    const handleWindowBlur = () => {
      const store = useStore.getState();
      const inst = store.instruments.find((i) => i.id === store.selectedInstrumentId);
      if (inst?.type === 'synth' && heldKeysRef.current.size > 0) {
        const engine = getSynthEngine(inst.id, inst.orbitIndex, inst.engineParams);
        engine.noteOff();
        heldKeysRef.current.clear();
        lastHeldKeyRef.current = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        const store = useStore.getState();
        const inst = store.instruments.find((i) => i.id === store.selectedInstrumentId);
        if (inst?.type === 'synth' && heldKeysRef.current.size > 0) {
          const engine = getSynthEngine(inst.id, inst.orbitIndex, inst.engineParams);
          engine.noteOff();
          heldKeysRef.current.clear();
          lastHeldKeyRef.current = null;
        }
      }
    };

    const handleBeforeUnload = () => {
      const store = useStore.getState();
      const inst = store.instruments.find((i) => i.id === store.selectedInstrumentId);
      if (inst?.type === 'synth' && heldKeysRef.current.size > 0) {
        const engine = getSynthEngine(inst.id, inst.orbitIndex, inst.engineParams);
        engine.noteStop();
        heldKeysRef.current.clear();
        lastHeldKeyRef.current = null;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);
}
