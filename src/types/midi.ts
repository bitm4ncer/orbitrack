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
  orbitIndex?: number;
  effectIndex?: number;
  paramName?: string;
  minValue: number;
  maxValue: number;
  deviceId?: string;
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
