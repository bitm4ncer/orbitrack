/** MIDI input/output controller using WebMidi.js */

import { WebMidi } from 'webmidi';
import type { Input, Output } from 'webmidi';
import type { MidiCCMapping, MidiNoteMapping, MidiDeviceInfo } from '../types/midi';

type MidiCallback = (mapping: MidiCCMapping | MidiNoteMapping, value: number) => void;
type DeviceChangeCallback = (devices: MidiDeviceInfo[]) => void;
type MidiActivityCallback = () => void;
type MidiSystemCallback = (statusByte: number) => void;

type ReconnectCallback = (deviceId: string) => void;

let midiInputDevice: Input | null = null;
let midiOutputDevice: Output | null = null;
let isWebMidiEnabled = false;
let storedInputDeviceId: string | null = null;
let storedOutputDeviceId: string | null = null;
let ccCallbacks: MidiCallback[] = [];
let noteCallbacks: MidiCallback[] = [];
let deviceChangeCallbacks: DeviceChangeCallback[] = [];
let activityCallbacks: MidiActivityCallback[] = [];
let systemCallbacks: MidiSystemCallback[] = [];
let reconnectCallbacks: ReconnectCallback[] = [];

export async function initMidi(): Promise<void> {
  try {
    await WebMidi.enable();
    isWebMidiEnabled = true;
    console.log('[MIDI] WebMidi enabled');

    WebMidi.addListener('connected', (e: any) => {
      console.log('[MIDI] Device connected:', e.port?.name);
      notifyDeviceChange();

      // Auto-reconnect input if it matches stored device ID
      if (storedInputDeviceId && !midiInputDevice && e.port?.id === storedInputDeviceId) {
        console.log('[MIDI] Auto-reconnecting input device:', e.port.name);
        setMidiInputDevice(storedInputDeviceId);
        reconnectCallbacks.forEach(cb => cb(storedInputDeviceId!));
      }

      // Auto-reconnect output
      if (storedOutputDeviceId && !midiOutputDevice && e.port?.id === storedOutputDeviceId) {
        setMidiOutputDevice(storedOutputDeviceId);
      }
    });

    WebMidi.addListener('disconnected', (e: any) => {
      console.log('[MIDI] Device disconnected:', e.port?.name);

      if (midiInputDevice && e.port?.id === midiInputDevice.id) {
        console.log('[MIDI] Active input device disconnected, clearing reference');
        midiInputDevice.removeListener();
        midiInputDevice = null;
      }

      if (midiOutputDevice && e.port?.id === midiOutputDevice.id) {
        midiOutputDevice = null;
      }

      notifyDeviceChange();
    });

    notifyDeviceChange();
  } catch (error) {
    console.error('[MIDI] Failed to enable WebMidi:', error);
    throw new Error('MIDI access denied or unavailable');
  }
}

export function getMidiInputDevices(): MidiDeviceInfo[] {
  if (!isWebMidiEnabled) return [];
  return WebMidi.inputs.map(input => ({
    id: input.id,
    name: input.name,
    type: 'input' as const,
    connection: input.connection,
    manufacturer: input.manufacturer,
  }));
}

export function getMidiOutputDevices(): MidiDeviceInfo[] {
  if (!isWebMidiEnabled) return [];
  return WebMidi.outputs.map(output => ({
    id: output.id,
    name: output.name,
    type: 'output' as const,
    connection: output.connection,
    manufacturer: output.manufacturer,
  }));
}

export function setMidiInputDevice(deviceId: string | null): boolean {
  if (!isWebMidiEnabled) return false;

  if (midiInputDevice) {
    midiInputDevice.removeListener();
    midiInputDevice = null;
  }

  storedInputDeviceId = deviceId;
  if (!deviceId) return true;

  const device = WebMidi.getInputById(deviceId);
  if (!device) {
    console.error(`[MIDI] Input device not found: ${deviceId}`);
    return false;
  }

  midiInputDevice = device;
  setupInputListeners();
  console.log(`[MIDI] Connected to input: ${device.name}`);
  return true;
}

export function setMidiOutputDevice(deviceId: string | null): boolean {
  if (!isWebMidiEnabled) return false;

  storedOutputDeviceId = deviceId;
  midiOutputDevice = deviceId ? WebMidi.getOutputById(deviceId) || null : null;
  if (deviceId && !midiOutputDevice) {
    console.error(`[MIDI] Output device not found: ${deviceId}`);
    return false;
  }

  if (midiOutputDevice) {
    console.log(`[MIDI] Connected to output: ${midiOutputDevice.name}`);
  }
  return true;
}

function setupInputListeners(): void {
  if (!midiInputDevice) return;

  midiInputDevice.addListener('controlchange', (e: any) => {
    const ccValue = (e.value ?? e.rawValue ?? 0) / 127;
    ccCallbacks.forEach(cb => cb({ cc: e.controller?.number ?? 0 } as any, ccValue));
    activityCallbacks.forEach(cb => cb());
  });

  midiInputDevice.addListener('noteon', (e: any) => {
    // WebMidi.js uses e.note.rawAttack for MIDI velocity (0-127)
    const rawVelocity = e.note?.rawAttack ?? 100;
    const velocity = Math.max(0, Math.min(1, rawVelocity / 127));
    noteCallbacks.forEach(cb => cb({ note: e.note?.number ?? 0 } as any, velocity));
    activityCallbacks.forEach(cb => cb());
  });

  midiInputDevice.addListener('noteoff', (e: any) => {
    noteCallbacks.forEach(cb => cb({ note: e.note?.number ?? 0 } as any, 0));
  });

  // Listen for system realtime messages (clock, start, stop, continue)
  midiInputDevice.addListener('midimessage', (e: any) => {
    const status = e.message?.data?.[0] ?? e.data?.[0];
    if (status >= 0xf8) {
      systemCallbacks.forEach(cb => cb(status));
    }
  });
}

export function onMidiCC(callback: MidiCallback): () => void {
  ccCallbacks.push(callback);
  return () => {
    ccCallbacks = ccCallbacks.filter(cb => cb !== callback);
  };
}

export function onMidiNote(callback: MidiCallback): () => void {
  noteCallbacks.push(callback);
  return () => {
    noteCallbacks = noteCallbacks.filter(cb => cb !== callback);
  };
}

export function onMidiActivity(callback: MidiActivityCallback): () => void {
  activityCallbacks.push(callback);
  return () => {
    activityCallbacks = activityCallbacks.filter(cb => cb !== callback);
  };
}

export function onMidiSystemMessage(callback: MidiSystemCallback): () => void {
  systemCallbacks.push(callback);
  return () => {
    systemCallbacks = systemCallbacks.filter(cb => cb !== callback);
  };
}

export function onMidiDeviceChange(callback: DeviceChangeCallback): () => void {
  deviceChangeCallbacks.push(callback);
  return () => {
    deviceChangeCallbacks = deviceChangeCallbacks.filter(cb => cb !== callback);
  };
}

export function onMidiReconnect(callback: ReconnectCallback): () => void {
  reconnectCallbacks.push(callback);
  return () => {
    reconnectCallbacks = reconnectCallbacks.filter(cb => cb !== callback);
  };
}

function notifyDeviceChange(): void {
  const allDevices: MidiDeviceInfo[] = [
    ...getMidiInputDevices(),
    ...getMidiOutputDevices(),
  ];
  deviceChangeCallbacks.forEach(cb => cb(allDevices));
}

export function sendNoteOn(note: number, _velocity: number = 100, _channel: number = 1): void {
  if (!midiOutputDevice) return;
  try {
    midiOutputDevice.sendNoteOn(note);
  } catch (e) {
    console.error('[MIDI] Failed to send note on:', e);
  }
}

export function sendNoteOff(note: number, _channel: number = 1): void {
  if (!midiOutputDevice) return;
  try {
    midiOutputDevice.sendNoteOff(note);
  } catch (e) {
    console.error('[MIDI] Failed to send note off:', e);
  }
}

export function sendCC(cc: number, value: number, _channel: number = 1): void {
  if (!midiOutputDevice) return;
  try {
    const normalizedValue = Math.max(0, Math.min(127, Math.round(value)));
    midiOutputDevice.sendControlChange(cc, normalizedValue);
  } catch (e) {
    console.error('[MIDI] Failed to send CC:', e);
  }
}

export function sendMidiRawMessage(data: number[]): void {
  if (!midiOutputDevice) return;
  try {
    midiOutputDevice.send(data);
  } catch (e) {
    console.error('[MIDI] Failed to send raw message:', e);
  }
}

export function sendProgramChange(program: number, _channel: number = 1): void {
  if (!midiOutputDevice) return;
  try {
    midiOutputDevice.sendProgramChange(program);
  } catch (e) {
    console.error('[MIDI] Failed to send program change:', e);
  }
}

export function isMidiEnabled(): boolean {
  return isWebMidiEnabled && midiInputDevice !== null;
}

export function disableMidi(): void {
  if (midiInputDevice) {
    midiInputDevice.removeListener();
    midiInputDevice = null;
  }
  midiOutputDevice = null;
  storedInputDeviceId = null;
  storedOutputDeviceId = null;
  ccCallbacks = [];
  noteCallbacks = [];
  activityCallbacks = [];
  systemCallbacks = [];
  reconnectCallbacks = [];
  if (isWebMidiEnabled) {
    WebMidi.removeListener('connected');
    WebMidi.removeListener('disconnected');
  }
  isWebMidiEnabled = false;
}
