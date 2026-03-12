import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../state/store';
import { isMidiEnabled, onMidiActivity } from '../../audio/midiController';

export function MidiLight() {
  const [active, setActive] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const midiEnabled = useStore((s) => s.midiSettings.enabled);
  const midiInputId = useStore((s) => s.midiSettings.midiInputDeviceId);
  const hasDevice = midiEnabled && midiInputId !== null;

  useEffect(() => {
    if (!hasDevice) return;

    const unsubscribe = onMidiActivity(() => {
      setActive(true);
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setActive(false), 120);
    });

    return () => {
      unsubscribe();
      clearTimeout(timeoutRef.current);
    };
  }, [hasDevice]);

  // Dim gray when no device, green flash on activity, dark green when idle with device
  const dotColor = !hasDevice
    ? 'bg-white/10'
    : active
      ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.6)]'
      : 'bg-green-900/60';

  return (
    <div
      className={`w-2.5 h-2.5 rounded-full transition-all duration-75 ${dotColor}`}
      title={
        !midiEnabled
          ? 'MIDI disabled'
          : !midiInputId
            ? 'No MIDI input device'
            : isMidiEnabled()
              ? 'MIDI connected'
              : 'MIDI initializing...'
      }
    />
  );
}
