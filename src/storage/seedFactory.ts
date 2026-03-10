import { SYNTH_PRESETS, FACTORY_PRESET_FOLDERS } from '../audio/synth/presets';
import { storage } from './LocalStorageProvider';
import type { SynthPreset } from '../types/storage';

/** Current factory preset version. Bump to re-seed after adding/changing presets. */
const FACTORY_VERSION = 1;
const LS_KEY = 'orbeat-factory-v';

/**
 * Seeds factory presets into IndexedDB on first run (or when the version bumps).
 * Existing user presets are never touched.
 */
export async function seedFactory(): Promise<void> {
  const stored = localStorage.getItem(LS_KEY);
  if (stored === String(FACTORY_VERSION)) return;

  const now = Date.now();

  // Delete old factory presets (re-seed cleanly)
  const existing = await storage.listPresets();
  for (const p of existing) {
    if (p.source === 'factory') await storage.deletePreset(p.id);
  }

  // Write fresh factory presets
  for (const [name, params] of Object.entries(SYNTH_PRESETS)) {
    const category = FACTORY_PRESET_FOLDERS[name] ?? 'Other';
    const preset: SynthPreset = {
      id: `factory_${name.replace(/\s+/g, '_').toLowerCase()}`,
      name,
      folder: `Factory/${category}`,
      source: 'factory',
      createdAt: now,
      updatedAt: now,
      params: { ...params },
    };
    await storage.savePreset(preset);
  }

  localStorage.setItem(LS_KEY, String(FACTORY_VERSION));
}
