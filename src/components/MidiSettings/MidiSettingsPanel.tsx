/** MIDI Settings Panel — Configure MIDI input/output devices */

import { useEffect, useState } from 'react';
import { useStore } from '../../state/store';
import {
  getMidiInputDevices,
  getMidiOutputDevices,
  onMidiDeviceChange,
  isMidiEnabled,
} from '../../audio/midiController';
import type { MidiDeviceInfo } from '../../types/midi';

export function MidiSettingsPanel() {
  const midiSettings = useStore((s) => s.midiSettings);
  const setMidiSettings = useStore((s) => s.setMidiSettings);

  const [inputDevices, setInputDevices] = useState<MidiDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MidiDeviceInfo[]>([]);
  const [isReady, setIsReady] = useState(isMidiEnabled());

  useEffect(() => {
    // Initial device scan
    if (midiSettings.enabled) {
      setInputDevices(getMidiInputDevices());
      setOutputDevices(getMidiOutputDevices());
      setIsReady(isMidiEnabled());
    }

    // Listen for device changes
    const unsubscribe = onMidiDeviceChange(() => {
      setInputDevices(getMidiInputDevices());
      setOutputDevices(getMidiOutputDevices());
    });

    return () => unsubscribe();
  }, [midiSettings.enabled]);

  const handleToggleMidi = () => {
    setMidiSettings({ enabled: !midiSettings.enabled });
  };

  const handleInputDeviceChange = (deviceId: string) => {
    setMidiSettings({ midiInputDeviceId: deviceId === 'none' ? null : deviceId });
  };

  const handleOutputDeviceChange = (deviceId: string) => {
    setMidiSettings({ midiOutputDeviceId: deviceId === 'none' ? null : deviceId });
  };

  return (
    <div className="border-t border-border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">MIDI Control</h3>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={midiSettings.enabled}
            onChange={handleToggleMidi}
            className="w-4 h-4 rounded"
          />
          <span className="text-xs text-muted-foreground">Enabled</span>
        </label>
      </div>

      {midiSettings.enabled && (
        <>
          {/* Status */}
          <div className="text-xs">
            <p className="text-muted-foreground">
              {isReady ? '✓ MIDI Ready' : '○ Initializing MIDI...'}
            </p>
          </div>

          {/* Input Device */}
          <div className="space-y-1">
            <label className="text-xs font-medium">Input Device</label>
            <select
              value={midiSettings.midiInputDeviceId ?? 'none'}
              onChange={(e) => handleInputDeviceChange(e.target.value)}
              className="w-full px-2 py-1.5 text-xs bg-background border border-border rounded"
            >
              <option value="none">— None —</option>
              {inputDevices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name} {device.manufacturer ? `(${device.manufacturer})` : ''}
                </option>
              ))}
            </select>
            {inputDevices.length === 0 && (
              <p className="text-xs text-muted-foreground">No MIDI input devices detected</p>
            )}
          </div>

          {/* Output Device */}
          <div className="space-y-1">
            <label className="text-xs font-medium">Output Device</label>
            <select
              value={midiSettings.midiOutputDeviceId ?? 'none'}
              onChange={(e) => handleOutputDeviceChange(e.target.value)}
              className="w-full px-2 py-1.5 text-xs bg-background border border-border rounded"
            >
              <option value="none">— None —</option>
              {outputDevices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name} {device.manufacturer ? `(${device.manufacturer})` : ''}
                </option>
              ))}
            </select>
            {outputDevices.length === 0 && (
              <p className="text-xs text-muted-foreground">No MIDI output devices detected</p>
            )}
          </div>

          {/* Info */}
          <div className="mt-3 p-2 bg-muted/40 rounded text-xs text-muted-foreground space-y-1">
            <p>• Master Volume: CC 1, CC 7</p>
            <p>• BPM: CC 2 (20–300)</p>
            <p>• Play/Pause: Middle C (note 60)</p>
            <p className="pt-1">Tip: Right-click effect knobs to bind MIDI CC</p>
          </div>
        </>
      )}
    </div>
  );
}
