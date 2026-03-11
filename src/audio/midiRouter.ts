/** Routes MIDI messages to Zustand store actions based on mappings */

import { useStore } from '../state/store';
import { onMidiCC, onMidiNote, isMidiEnabled } from './midiController';
import { getSynthEngine } from './synthManager';
import type { MidiCCMapping, MidiNoteMapping } from '../types/midi';

let unsubscribeCC: (() => void) | null = null;
let unsubscribeNote: (() => void) | null = null;
const heldMidiNotes = new Map<number, number>();

export function startMidiRouting(
  ccMappings: MidiCCMapping[],
  noteMappings: MidiNoteMapping[]
): void {
  if (!isMidiEnabled()) return;

  stopMidiRouting();

  unsubscribeCC = onMidiCC((mapping, normalizedValue) => {
    const ccNumber = (mapping as any).cc;
    const applicableMappings = ccMappings.filter(m => m.cc === ccNumber);

    applicableMappings.forEach(m => {
      const mappedValue = m.minValue + (m.maxValue - m.minValue) * normalizedValue;
      routeCCMessage(m, mappedValue);
    });
  });

  unsubscribeNote = onMidiNote((mapping, velocity) => {
    const noteNumber = (mapping as any).note;

    // Route MIDI notes to selected instrument (synth or sampler)
    routeMidiNote(noteNumber, velocity);

    // Also check for explicit mappings
    const applicableMappings = noteMappings.filter(m => m.note === noteNumber);
    applicableMappings.forEach(m => {
      routeNoteMessage(m, velocity);
    });
  });
}

export function stopMidiRouting(): void {
  unsubscribeCC?.();
  unsubscribeNote?.();
  unsubscribeCC = null;
  unsubscribeNote = null;
  heldMidiNotes.clear();
}

/**
 * Route MIDI note directly to selected synth or sampler
 */
function routeMidiNote(noteNumber: number, velocity: number): void {
  try {
    const store = useStore.getState();
    const inst = store.instruments.find(i => i.id === store.selectedInstrumentId);

    if (!inst || inst.type !== 'synth') return;

    const engine = getSynthEngine(inst.id, inst.orbitIndex, inst.engineParams);

    if (velocity === 0) {
      // Note off
      heldMidiNotes.delete(noteNumber);

      if (heldMidiNotes.size === 0) {
        engine.noteOff();
      } else {
        // Release current and retrigger last held note for smooth polyphony
        engine.noteOff();
        const heldNotes = Array.from(heldMidiNotes.values());
        const lastNote = heldNotes[heldNotes.length - 1];
        if (lastNote !== undefined) {
          engine.noteOnNow(lastNote);
        }
      }
    } else {
      // Note on
      heldMidiNotes.set(noteNumber, noteNumber);
      engine.noteOnNow(noteNumber);
    }
  } catch (err) {
    console.error('[MIDI] Failed to route note:', err);
  }
}

function routeCCMessage(mapping: MidiCCMapping, value: number): void {
  const store = useStore.getState();

  switch (mapping.targetType) {
    case 'masterVolume':
      store.setMasterVolume(value);
      break;

    case 'bpm':
      store.setBpm(Math.round(value));
      break;

    case 'orbitVolume':
      if (mapping.orbitIndex !== undefined) {
        const instrument = store.instruments.find(i => i.orbitIndex === mapping.orbitIndex);
        if (instrument) {
          store.updateInstrument(instrument.id, { volume: value });
        }
      }
      break;

    case 'effectParam':
      if (mapping.orbitIndex !== undefined && mapping.effectIndex !== undefined && mapping.paramName) {
        console.log('[MIDI] Effect param:', {
          orbitIndex: mapping.orbitIndex,
          effectIndex: mapping.effectIndex,
          paramName: mapping.paramName,
          value,
        });
      }
      break;

    default:
      console.warn('[MIDI] Unknown CC target:', mapping.targetType);
  }
}

function routeNoteMessage(mapping: MidiNoteMapping, velocity: number): void {
  const store = useStore.getState();

  if (velocity === 0) {
    return;
  }

  switch (mapping.targetType) {
    case 'triggerClip':
      if (mapping.orbitIndex !== undefined) {
        const instrument = store.instruments.find(i => i.orbitIndex === mapping.orbitIndex);
        if (instrument && instrument.type === 'sampler') {
          console.log('[MIDI] Trigger clip:', {
            instrumentId: instrument.id,
            note: mapping.note,
            velocity,
          });
        }
      }
      break;

    case 'orbitMute':
      if (mapping.orbitIndex !== undefined) {
        const instrument = store.instruments.find(i => i.orbitIndex === mapping.orbitIndex);
        if (instrument) {
          store.toggleMute(instrument.id);
        }
      }
      break;

    case 'orbitSolo':
      if (mapping.orbitIndex !== undefined) {
        const instrument = store.instruments.find(i => i.orbitIndex === mapping.orbitIndex);
        if (instrument) {
          store.toggleSolo(instrument.id);
        }
      }
      break;

    case 'playPause':
      store.setPlaying(!store.isPlaying);
      break;

    default:
      console.warn('[MIDI] Unknown note target:', mapping.targetType);
  }
}
