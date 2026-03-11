/** MIDI mapping types and configuration */

export type MidiTargetType =
  | 'masterVolume'
  | 'bpm'
  | 'playPause'
  | 'orbitVolume'
  | 'orbitMute'
  | 'orbitSolo'
  | 'effectParam'
  | 'triggerClip';

export interface MidiCCMapping {
  cc: number;
  targetType: MidiTargetType;
  orbitIndex?: number;     // For orbit-specific targets
  effectIndex?: number;    // For effect-specific targets
  paramName?: string;      // 'wet', 'rate', etc.
  minValue: number;        // Mapped minimum (e.g., 0 for volume)
  maxValue: number;        // Mapped maximum (e.g., 1 for volume, 200 for BPM)
  deviceId?: string;       // Optional: lock to specific device
}

export interface MidiNoteMapping {
  note: number;
  targetType: MidiTargetType;
  orbitIndex?: number;
  action?: 'trigger' | 'toggleMute' | 'toggleSolo';
  deviceId?: string;
}

export interface MidiDeviceInfo {
  id: string;
  name: string;
  type: 'input' | 'output';
  connection: 'open' | 'closed' | 'pending';
  manufacturer?: string;
}

export interface MidiSettings {
  enabled: boolean;
  midiInputDeviceId: string | null;
  midiOutputDeviceId: string | null;
  ccMappings: MidiCCMapping[];
  noteMappings: MidiNoteMapping[];
  learningMode: boolean;
  learningTarget: MidiTargetType | null;
}

export const DEFAULT_MIDI_SETTINGS: MidiSettings = {
  enabled: true,
  midiInputDeviceId: null,
  midiOutputDeviceId: null,
  ccMappings: [
    // Default mappings: CC 1 → Master Volume, CC 74 → Filter Cutoff on first orbit
    {
      cc: 1,
      targetType: 'masterVolume',
      minValue: 0,
      maxValue: 1,
    },
    {
      cc: 7,
      targetType: 'masterVolume',
      minValue: 0,
      maxValue: 1,
    },
  ],
  noteMappings: [],
  learningMode: false,
  learningTarget: null,
};
