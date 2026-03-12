/** Persist MIDI settings to localStorage */

import type { MidiSettings } from '../types/midi';
import { DEFAULT_MIDI_SETTINGS } from '../types/midi';

const STORAGE_KEY = 'orbitrack_midi_settings';

/**
 * Save MIDI settings to localStorage
 */
export function saveMidiSettings(settings: MidiSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('[MIDI Storage] Failed to save settings:', e);
  }
}

/**
 * Load MIDI settings from localStorage
 */
export function loadMidiSettings(): MidiSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_MIDI_SETTINGS;

    const parsed = JSON.parse(stored) as MidiSettings;
    // Merge with defaults to handle new fields added in future versions
    return {
      ...DEFAULT_MIDI_SETTINGS,
      ...parsed,
    };
  } catch (e) {
    console.error('[MIDI Storage] Failed to load settings:', e);
    return DEFAULT_MIDI_SETTINGS;
  }
}

/**
 * Clear MIDI settings from localStorage
 */
export function clearMidiSettings(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error('[MIDI Storage] Failed to clear settings:', e);
  }
}
