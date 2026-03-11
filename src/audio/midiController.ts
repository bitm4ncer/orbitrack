/** MIDI input/output controller using WebMidi.js */

import { WebMidi } from 'webmidi';
import type { Input, Output } from 'webmidi';
import type { MidiCCMapping, MidiNoteMapping, MidiDeviceInfo } from '../types/midi';

type MidiCallback = (mapping: MidiCCMapping | MidiNoteMapping, value: number) => void;
type DeviceChangeCallback = (devices: MidiDeviceInfo[]) => void;

let midiInputDevice: Input | null = null;
let midiOutputDevice: Output | null = null;
let isWebMidiEnabled = false;
let ccCallbacks: MidiCallback[] = [];
let noteCallbacks: MidiCallback[] = [];
let deviceChangeCallbacks: DeviceChangeCallback[] = [];

/**
 * Initialize WebMidi and request access
 */
export async function initMidi(): Promise<void> {
  try {
    await WebMidi.enable();
    isWebMidiEnabled = true;
    console.log('[MIDI] WebMidi enabled');
    notifyDeviceChange();
  } catch (error) {
    console.error('[MIDI] Failed to enable WebMidi:', error);
    throw new Error('MIDI access denied or unavailable');
  }
}

/**
 * Get list of connected MIDI input devices
 */
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

/**
 * Get list of connected MIDI output devices
 */
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

/**
 * Connect to a MIDI input device
 */
export function setMidiInputDevice(deviceId: string | null): boolean {
  if (!isWebMidiEnabled) return false;

  // Disconnect existing
  if (midiInputDevice) {
    midiInputDevice.removeListener();
    midiInputDevice = null;
  }

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

/**
 * Connect to a MIDI output device
 */
export function setMidiOutputDevice(deviceId: string | null): boolean {
  if (!isWebMidiEnabled) return false;

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

/**
 * Set up listeners on the input device for CC and Note events
 */
function setupInputListeners(): void {
  if (!midiInputDevice) return;

  // Listen to control change (CC) messages
  midiInputDevice.addListener('controlchange', (e: any) => {
    const ccValue = (e.value ?? e.rawValue ?? 0) / 127; // Normalize to 0-1
    ccCallbacks.forEach(cb => cb({ cc: e.controller?.number ?? 0 } as any, ccValue));
  });

  // Listen to note on messages
  midiInputDevice.addListener('noteon', (e: any) => {
    const velocity = (e.velocity ?? e.rawVelocity ?? 0) / 127; // Normalize to 0-1
    noteCallbacks.forEach(cb => cb({ note: e.note?.number ?? 0 } as any, velocity));
  });

  // Listen to note off messages (velocity = 0)
  midiInputDevice.addListener('noteoff', (e: any) => {
    noteCallbacks.forEach(cb => cb({ note: e.note?.number ?? 0 } as any, 0));
  });
}

/**
 * Register a callback for CC messages
 */
export function onMidiCC(callback: MidiCallback): () => void {
  ccCallbacks.push(callback);
  return () => {
    ccCallbacks = ccCallbacks.filter(cb => cb !== callback);
  };
}

/**
 * Register a callback for Note messages
 */
export function onMidiNote(callback: MidiCallback): () => void {
  noteCallbacks.push(callback);
  return () => {
    noteCallbacks = noteCallbacks.filter(cb => cb !== callback);
  };
}

/**
 * Register a callback for device changes (connect/disconnect)
 */
export function onMidiDeviceChange(callback: DeviceChangeCallback): () => void {
  deviceChangeCallbacks.push(callback);
  return () => {
    deviceChangeCallbacks = deviceChangeCallbacks.filter(cb => cb !== callback);
  };
}

/**
 * Notify listeners of device changes
 */
function notifyDeviceChange(): void {
  const allDevices: MidiDeviceInfo[] = [
    ...getMidiInputDevices(),
    ...getMidiOutputDevices(),
  ];
  deviceChangeCallbacks.forEach(cb => cb(allDevices));
}

/**
 * Send a note on message
 */
export function sendNoteOn(note: number, _velocity: number = 100, _channel: number = 1): void {
  if (!midiOutputDevice) return;
  try {
    midiOutputDevice.sendNoteOn(note);
  } catch (e) {
    console.error('[MIDI] Failed to send note on:', e);
  }
}

/**
 * Send a note off message
 */
export function sendNoteOff(note: number, _channel: number = 1): void {
  if (!midiOutputDevice) return;
  try {
    midiOutputDevice.sendNoteOff(note);
  } catch (e) {
    console.error('[MIDI] Failed to send note off:', e);
  }
}

/**
 * Send a control change message
 */
export function sendCC(cc: number, value: number, _channel: number = 1): void {
  if (!midiOutputDevice) return;
  try {
    // Normalize value to 0-127 range
    const normalizedValue = Math.max(0, Math.min(127, Math.round(value)));
    midiOutputDevice.sendControlChange(cc, normalizedValue);
  } catch (e) {
    console.error('[MIDI] Failed to send CC:', e);
  }
}

/**
 * Send a program change message
 */
export function sendProgramChange(program: number, _channel: number = 1): void {
  if (!midiOutputDevice) return;
  try {
    midiOutputDevice.sendProgramChange(program);
  } catch (e) {
    console.error('[MIDI] Failed to send program change:', e);
  }
}

/**
 * Check if MIDI is currently enabled and ready
 */
export function isMidiEnabled(): boolean {
  return isWebMidiEnabled && midiInputDevice !== null;
}

/**
 * Disable MIDI and clean up
 */
export function disableMidi(): void {
  if (midiInputDevice) {
    midiInputDevice.removeListener();
    midiInputDevice = null;
  }
  midiOutputDevice = null;
  ccCallbacks = [];
  noteCallbacks = [];
  isWebMidiEnabled = false;
}
