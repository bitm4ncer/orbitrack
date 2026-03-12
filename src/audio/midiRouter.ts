/** Routes MIDI messages to Zustand store actions based on mappings */

import { useStore } from '../state/store';
import { onMidiCC, onMidiNote, isMidiEnabled } from './midiController';
import { getSynthEngine } from './synthManager';
import { triggerSample, loadSamples } from './sampler';
import { initAudio } from './engine';
import type { MidiCCMapping, MidiNoteMapping } from '../types/midi';

let unsubscribeCC: (() => void) | null = null;
let unsubscribeNote: (() => void) | null = null;
const heldMidiNotes = new Map<number, number>();

let audioReady = false;
async function ensureAudioReady(): Promise<boolean> {
  if (audioReady) return true;
  try {
    await initAudio();
    await loadSamples();
    audioReady = true;
    return true;
  } catch {
    return false;
  }
}

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

    // Ensure audio context is started (needs user gesture — MIDI input counts)
    if (!audioReady) {
      ensureAudioReady().then((ok) => {
        if (ok) routeMidiNote(noteNumber, velocity);
      });
    } else {
      routeMidiNote(noteNumber, velocity);
    }

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

    if (!inst) return;

    if (inst.type === 'synth') {
      const engine = getSynthEngine(inst.id, inst.orbitIndex, inst.engineParams);

      if (velocity > 0) {
        // Note on — velocity arrives as 0-1, noteOnNow expects 0-127
        heldMidiNotes.set(noteNumber, noteNumber);
        engine.noteOnNow(noteNumber, velocity * 127);
      } else {
        // Note off - release the specific voice for this note
        heldMidiNotes.delete(noteNumber);
        engine.noteOffForNote(noteNumber);
      }
    } else if (inst.type === 'sampler' && inst.sampleName) {
      if (velocity > 0) {
        // Note on — pitch-shift from MIDI note, velocity as dB attenuation
        heldMidiNotes.set(noteNumber, noteNumber);
        const rootNote = inst.samplerParams?.rootNote ?? 60;
        const speed = (inst.samplerParams?.speed ?? 1) * Math.pow(2, (noteNumber - rootNote) / 12);
        // velocity 0-1 → dB: 1.0 = 0dB, 0.5 ≈ -6dB, 0.1 ≈ -20dB
        const velocityDb = 20 * Math.log10(Math.max(0.001, velocity));
        const volume = inst.volume + velocityDb;
        triggerSample(inst.sampleName, undefined, volume, speed);
      } else {
        // Note off - just remove from tracking (sample plays to completion)
        heldMidiNotes.delete(noteNumber);
      }
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
        const instrument = store.instruments.find(i => i.orbitIndex === mapping.orbitIndex);
        if (instrument) {
          const effects = store.instrumentEffects[instrument.id] ?? [];
          const effect = effects[mapping.effectIndex];
          if (effect) {
            store.setEffectParam(instrument.id, effect.id, mapping.paramName, value);
          }
        }
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
