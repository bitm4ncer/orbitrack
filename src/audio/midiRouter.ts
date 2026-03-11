/** Routes MIDI messages to Zustand store actions based on mappings */

import { useStore } from '../state/store';
import {
  onMidiCC,
  onMidiNote,
  isMidiEnabled,
} from './midiController';
import type { MidiCCMapping, MidiNoteMapping } from '../types/midi';

let unsubscribeCC: (() => void) | null = null;
let unsubscribeNote: (() => void) | null = null;

/**
 * Start MIDI routing with the given mappings
 */
export function startMidiRouting(
  ccMappings: MidiCCMapping[],
  noteMappings: MidiNoteMapping[]
): void {
  if (!isMidiEnabled()) return;

  // Clean up existing subscriptions
  stopMidiRouting();

  // Route CC messages
  unsubscribeCC = onMidiCC((mapping, normalizedValue) => {
    const ccNumber = (mapping as any).cc;
    const applicableMappings = ccMappings.filter(m => m.cc === ccNumber);

    applicableMappings.forEach(m => {
      const mappedValue = m.minValue + (m.maxValue - m.minValue) * normalizedValue;
      routeCCMessage(m, mappedValue);
    });
  });

  // Route Note messages
  unsubscribeNote = onMidiNote((mapping, velocity) => {
    const noteNumber = (mapping as any).note;
    const applicableMappings = noteMappings.filter(m => m.note === noteNumber);

    applicableMappings.forEach(m => {
      routeNoteMessage(m, velocity);
    });
  });
}

/**
 * Stop MIDI routing and clean up
 */
export function stopMidiRouting(): void {
  unsubscribeCC?.();
  unsubscribeNote?.();
  unsubscribeCC = null;
  unsubscribeNote = null;
}

/**
 * Route a CC message to store actions
 */
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
        // Route to effect parameter (implement in effects handling)
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

/**
 * Route a Note message to store actions
 */
function routeNoteMessage(mapping: MidiNoteMapping, velocity: number): void {
  const store = useStore.getState();

  if (velocity === 0) {
    // Note off — could trigger release envelope, etc.
    return;
  }

  switch (mapping.targetType) {
    case 'triggerClip':
      if (mapping.orbitIndex !== undefined) {
        const instrument = store.instruments.find(i => i.orbitIndex === mapping.orbitIndex);
        if (instrument && instrument.type === 'sampler') {
          // Trigger the sampler
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
