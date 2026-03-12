/** MIDI live recording — captures incoming MIDI notes and writes them to the grid */

import * as Tone from 'tone';
import { useStore } from '../state/store';
import { onMidiNote } from './midiController';

let unsubscribe: (() => void) | null = null;

export function startMidiRecording(): void {
  stopMidiRecording();

  unsubscribe = onMidiNote((mapping, velocity) => {
    const noteNumber = (mapping as any).note;
    if (noteNumber === undefined || velocity === 0) return; // Skip note-off

    const store = useStore.getState();
    if (!store.midiRecordArmed || !store.isPlaying) return;

    const inst = store.instruments.find((i) => i.id === store.selectedInstrumentId);
    if (!inst) return;
    if (inst.type !== 'synth' && inst.type !== 'sampler') return;

    const loopSize = inst.loopSize;
    if (loopSize <= 0) return;

    // Use Tone.Transport.seconds for real-time position (not the scheduled-ahead _globalStep)
    const transportSeconds = Tone.getTransport().seconds;
    const bpm = store.bpm;
    const stepsPerBeat = store.stepsPerBeat;
    const secondsPerStep = 60 / (bpm * stepsPerBeat);
    const currentStepFloat = transportSeconds / secondsPerStep;
    const stepInLoop = Math.round(currentStepFloat) % loopSize;
    const normalizedPos = ((stepInLoop % loopSize) + loopSize) % loopSize / loopSize;

    // Check if there's already a hit at this step
    let hitIndex = -1;
    for (let i = 0; i < inst.hitPositions.length; i++) {
      const hitStep = Math.round(inst.hitPositions[i] * loopSize) % loopSize;
      if (hitStep === stepInLoop) {
        hitIndex = i;
        break;
      }
    }

    const midiVelocity = Math.round(velocity * 127);

    if (hitIndex === -1) {
      // No hit at this step — use addSamplerHit which handles grid init and duplicate guard
      store.addSamplerHit(inst.id, normalizedPos, noteNumber);

      // Set the velocity for the newly added hit (addSamplerHit defaults to 100)
      const updatedInst = useStore.getState().instruments.find((i) => i.id === inst.id);
      if (updatedInst) {
        const newHitIndex = updatedInst.hitPositions.length - 1;
        store.setGridVelocity(inst.id, newHitIndex, midiVelocity);
      }
    } else {
      // Hit exists — add or replace the note
      if (store.midiRecordMode === 'replace') {
        store.setGridNote(inst.id, hitIndex, [noteNumber]);
      } else {
        // Overdub: add note to chord if not already present
        const existingNotes = store.gridNotes[inst.id]?.[hitIndex] ?? [];
        if (!existingNotes.includes(noteNumber)) {
          store.setGridNote(inst.id, hitIndex, [...existingNotes, noteNumber]);
        }
      }
      store.setGridVelocity(inst.id, hitIndex, midiVelocity);
    }
  });
}

export function stopMidiRecording(): void {
  unsubscribe?.();
  unsubscribe = null;
}
