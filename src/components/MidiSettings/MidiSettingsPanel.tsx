/** MIDI Settings Panel — Configure MIDI input/output devices, CC mappings, sync mode */

import { useEffect, useState } from 'react';
import { useStore } from '../../state/store';
import {
  getMidiInputDevices,
  getMidiOutputDevices,
  onMidiDeviceChange,
  isMidiEnabled,
} from '../../audio/midiController';
import { useMidiLearn } from '../../hooks/useMidiLearn';
import type { MidiDeviceInfo } from '../../types/midi';

export function MidiSettingsPanel() {
  const midiSettings = useStore((s) => s.midiSettings);
  const setMidiSettings = useStore((s) => s.setMidiSettings);

  const [inputDevices, setInputDevices] = useState<MidiDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MidiDeviceInfo[]>([]);
  const [isReady, setIsReady] = useState(isMidiEnabled());

  const { isLearning, learningTarget, cancelLearn, removeCCMapping } = useMidiLearn();

  useEffect(() => {
    if (midiSettings.enabled) {
      setInputDevices(getMidiInputDevices());
      setOutputDevices(getMidiOutputDevices());
      setIsReady(isMidiEnabled());
    }

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

  const handleSyncModeChange = (mode: string) => {
    setMidiSettings({ syncMode: mode as 'internal' | 'midiClockOut' | 'midiClockIn' });
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

          {/* Sync Mode */}
          <div className="space-y-1">
            <label className="text-xs font-medium">Clock Sync</label>
            <select
              value={midiSettings.syncMode}
              onChange={(e) => handleSyncModeChange(e.target.value)}
              className="w-full px-2 py-1.5 text-xs bg-background border border-border rounded"
            >
              <option value="internal">Internal</option>
              <option value="midiClockOut">MIDI Clock Out</option>
              <option value="midiClockIn">MIDI Clock In</option>
            </select>
            <p className="text-xs text-muted-foreground">
              {midiSettings.syncMode === 'internal' && 'orbitrack uses its own clock'}
              {midiSettings.syncMode === 'midiClockOut' && 'Sends clock to external devices'}
              {midiSettings.syncMode === 'midiClockIn' && 'Syncs to external MIDI clock'}
            </p>
          </div>

          {/* CC Mappings */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium">CC Mappings</label>
              {isLearning && (
                <button
                  onClick={cancelLearn}
                  className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30"
                >
                  Cancel Learn
                </button>
              )}
            </div>

            {isLearning && learningTarget && (
              <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded text-xs text-amber-300 animate-pulse">
                Move a MIDI CC to map it to: {learningTarget.label}
              </div>
            )}

            {midiSettings.ccMappings.length > 0 ? (
              <div className="space-y-1">
                {midiSettings.ccMappings.map((mapping, i) => (
                  <div
                    key={`${mapping.cc}-${mapping.targetType}-${i}`}
                    className="flex items-center justify-between px-2 py-1 bg-muted/30 rounded text-xs"
                  >
                    <span className="text-text-secondary font-mono">CC {mapping.cc}</span>
                    <span className="text-text-primary flex-1 mx-2 truncate">
                      {mapping.label || mapping.targetType}
                    </span>
                    <button
                      onClick={() => removeCCMapping(i)}
                      className="text-text-secondary/50 hover:text-red-400 px-1"
                      title="Remove mapping"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No CC mappings configured</p>
            )}
          </div>

          {/* Tips */}
          <div className="mt-3 p-2 bg-muted/40 rounded text-xs text-muted-foreground space-y-1">
            <p>• Right-click any effect knob to MIDI learn</p>
            <p>• MIDI keyboard plays selected instrument</p>
            <p>• Velocity is recognized from MIDI input</p>
            <p>• QWERTY keyboard: Ableton-style layout (A-L keys)</p>
          </div>
        </>
      )}
    </div>
  );
}
