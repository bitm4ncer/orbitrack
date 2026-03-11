/** Hook to sync MIDI clock with Orbeat transport */

import { useEffect } from 'react';
import { useStore } from '../state/store';
import { startMidiClock, stopMidiClock } from '../audio/midiClock';

/**
 * Auto-sync MIDI clock with transport play/stop
 * Sends MIDI Start when playing, MIDI Stop when stopped
 */
export function useMidiClock(): void {
  const isPlaying = useStore((s) => s.isPlaying);
  const bpm = useStore((s) => s.bpm);
  const midiSettings = useStore((s) => s.midiSettings);

  useEffect(() => {
    if (!midiSettings.enabled || !midiSettings.midiOutputDeviceId) {
      return;
    }

    if (isPlaying) {
      startMidiClock(bpm);
    } else {
      stopMidiClock();
    }

    return () => {
      stopMidiClock();
    };
  }, [isPlaying, bpm, midiSettings.enabled, midiSettings.midiOutputDeviceId]);
}
