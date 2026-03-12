/** Hook to sync MIDI clock with Orbeat transport based on sync mode */

import { useEffect } from 'react';
import { useStore } from '../state/store';
import {
  startMidiClock,
  stopMidiClock,
  startMidiClockReceiver,
  stopMidiClockReceiver,
  onMidiClockBpm,
  onMidiTransportMessage,
} from '../audio/midiClock';

export function useMidiClock(): void {
  const isPlaying = useStore((s) => s.isPlaying);
  const bpm = useStore((s) => s.bpm);
  const midiSettings = useStore((s) => s.midiSettings);

  // Clock Output: send MIDI clock when playing
  useEffect(() => {
    if (midiSettings.syncMode !== 'midiClockOut') return;
    if (!midiSettings.enabled || !midiSettings.midiOutputDeviceId) return;

    if (isPlaying) {
      startMidiClock(bpm);
    } else {
      stopMidiClock();
    }

    return () => {
      stopMidiClock();
    };
  }, [isPlaying, bpm, midiSettings.enabled, midiSettings.midiOutputDeviceId, midiSettings.syncMode]);

  // Clock Input: receive external MIDI clock
  useEffect(() => {
    if (midiSettings.syncMode !== 'midiClockIn') return;
    if (!midiSettings.enabled || !midiSettings.midiInputDeviceId) return;

    startMidiClockReceiver();

    const unsubBpm = onMidiClockBpm((receivedBpm) => {
      const store = useStore.getState();
      // Only update if BPM changed by more than 0.5 to avoid jitter
      if (Math.abs(store.bpm - receivedBpm) > 0.5) {
        store.setBpm(receivedBpm);
      }
    });

    const unsubTransport = onMidiTransportMessage((action) => {
      const store = useStore.getState();
      switch (action) {
        case 'start':
          if (!store.isPlaying) store.setPlaying(true);
          break;
        case 'stop':
          if (store.isPlaying) store.setPlaying(false);
          break;
        case 'continue':
          if (!store.isPlaying) store.setPlaying(true);
          break;
      }
    });

    return () => {
      stopMidiClockReceiver();
      unsubBpm();
      unsubTransport();
    };
  }, [midiSettings.enabled, midiSettings.midiInputDeviceId, midiSettings.syncMode]);
}
