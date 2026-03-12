/** Hook to initialize and manage MIDI setup */

import { useEffect, useRef } from 'react';
import { useStore } from '../state/store';
import {
  initMidi,
  setMidiInputDevice,
  setMidiOutputDevice,
  onMidiDeviceChange,
  onMidiReconnect,
  isMidiEnabled,
} from '../audio/midiController';
import { startMidiRouting, stopMidiRouting } from '../audio/midiRouter';
import type { MidiDeviceInfo } from '../types/midi';

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
      if (!midiSettings.enabled) {
        stopMidiRouting();
        return;
      }

      try {
        await initMidi();
        isReady.current = true;
        error.current = null;

        if (midiSettings.midiInputDeviceId) {
          setMidiInputDevice(midiSettings.midiInputDeviceId);
        }

        if (midiSettings.midiOutputDeviceId) {
          setMidiOutputDevice(midiSettings.midiOutputDeviceId);
        }

        startMidiRouting(midiSettings.ccMappings, midiSettings.noteMappings);

        const unsubscribe = onMidiDeviceChange((devices) => {
          if (mounted) {
            availableDevices.current = devices;
          }
        });

        const unsubReconnect = onMidiReconnect(() => {
          if (mounted) {
            stopMidiRouting();
            startMidiRouting(midiSettings.ccMappings, midiSettings.noteMappings);
          }
        });

        return () => {
          unsubscribe();
          unsubReconnect();
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
  }, [midiSettings.enabled, midiSettings.midiInputDeviceId, midiSettings.midiOutputDeviceId, midiSettings.ccMappings, midiSettings.noteMappings]);

  useEffect(() => {
    if (isReady.current) {
      stopMidiRouting();
      startMidiRouting(midiSettings.ccMappings, midiSettings.noteMappings);
    }
  }, [midiSettings.ccMappings, midiSettings.noteMappings]);

  useEffect(() => {
    if (isReady.current && midiSettings.midiInputDeviceId) {
      setMidiInputDevice(midiSettings.midiInputDeviceId);
      // Restart routing to subscribe to events from the newly selected device
      stopMidiRouting();
      startMidiRouting(midiSettings.ccMappings, midiSettings.noteMappings);
    }
  }, [midiSettings.midiInputDeviceId, midiSettings.ccMappings, midiSettings.noteMappings]);

  useEffect(() => {
    if (isReady.current && midiSettings.midiOutputDeviceId) {
      setMidiOutputDevice(midiSettings.midiOutputDeviceId);
    }
  }, [midiSettings.midiOutputDeviceId]);

  // Re-validate MIDI connection when tab becomes visible again (stale session recovery)
  useEffect(() => {
    if (!midiSettings.enabled) return;

    const handleVisibilityChange = () => {
      if (!document.hidden && isReady.current) {
        if (midiSettings.midiInputDeviceId && !isMidiEnabled()) {
          const reconnected = setMidiInputDevice(midiSettings.midiInputDeviceId);
          if (reconnected) {
            stopMidiRouting();
            startMidiRouting(midiSettings.ccMappings, midiSettings.noteMappings);
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [midiSettings.enabled, midiSettings.midiInputDeviceId, midiSettings.ccMappings, midiSettings.noteMappings]);

  return {
    isReady: isReady.current,
    isConnected: isConnected.current,
    error: error.current,
    availableDevices: availableDevices.current,
  };
}
