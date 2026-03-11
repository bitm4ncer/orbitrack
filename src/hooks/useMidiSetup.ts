/** Hook to initialize and manage MIDI setup */

import { useEffect, useRef } from 'react';
import { useStore } from '../state/store';
import {
  initMidi,
  setMidiInputDevice,
  setMidiOutputDevice,
  onMidiDeviceChange,
  isMidiEnabled,
} from '../audio/midiController';
import { startMidiRouting, stopMidiRouting } from '../audio/midiRouter';
import type { MidiDeviceInfo } from '../types/midi';

/**
 * Initialize MIDI on app load and handle device changes
 */
export function useMidiSetup(): {
  isReady: boolean;
  isConnected: boolean;
  error: string | null;
  availableDevices: MidiDeviceInfo[];
} {
  const midiSettings = useStore((s) => s.midiSettings);

  const isReady = useRef(false);
  const isConnected = useRef(isMidiEnabled());
  const error = useRef<string | null>(null);
  const availableDevices = useRef<MidiDeviceInfo[]>([]);

  useEffect(() => {
    let mounted = true;

    const setupMidi = async () => {
      if (!midiSettings.enabled) return;

      try {
        await initMidi();
        isReady.current = true;
        error.current = null;

        // Connect to previously selected devices
        if (midiSettings.midiInputDeviceId) {
          setMidiInputDevice(midiSettings.midiInputDeviceId);
        }

        if (midiSettings.midiOutputDeviceId) {
          setMidiOutputDevice(midiSettings.midiOutputDeviceId);
        }

        // Start routing with current mappings
        startMidiRouting(midiSettings.ccMappings, midiSettings.noteMappings);

        // Listen for device changes
        const unsubscribe = onMidiDeviceChange((devices) => {
          if (mounted) {
            availableDevices.current = devices;
          }
        });

        return () => {
          unsubscribe();
          stopMidiRouting();
        };
      } catch (err) {
        error.current = err instanceof Error ? err.message : 'MIDI initialization failed';
        console.error('[MIDI Setup]', error.current);
      }
    };

    const cleanup = setupMidi();

    return () => {
      mounted = false;
      cleanup?.then((fn) => fn?.());
      stopMidiRouting();
    };
  }, [midiSettings.enabled]);

  // Re-route when mappings change
  useEffect(() => {
    if (isReady.current) {
      stopMidiRouting();
      startMidiRouting(midiSettings.ccMappings, midiSettings.noteMappings);
    }
  }, [midiSettings.ccMappings, midiSettings.noteMappings]);

  // Connect to selected input device
  useEffect(() => {
    if (isReady.current && midiSettings.midiInputDeviceId) {
      setMidiInputDevice(midiSettings.midiInputDeviceId);
    }
  }, [midiSettings.midiInputDeviceId]);

  // Connect to selected output device
  useEffect(() => {
    if (isReady.current && midiSettings.midiOutputDeviceId) {
      setMidiOutputDevice(midiSettings.midiOutputDeviceId);
    }
  }, [midiSettings.midiOutputDeviceId]);

  return {
    isReady: isReady.current,
    isConnected: isConnected.current,
    error: error.current,
    availableDevices: availableDevices.current,
  };
}
