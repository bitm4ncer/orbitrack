import { FACTORY_EFFECT_PRESETS } from '../audio/effects/effectPresets';
import { storage } from './LocalStorageProvider';
import type { EffectPreset } from '../types/storage';

/** Current factory effect preset version. Bump to re-seed after adding/changing presets. */
const EFFECT_FACTORY_VERSION = 2;
const LS_KEY = 'orbitrack-effect-factory-v';

/**
 * Seeds factory effect presets into IndexedDB on first run (or when the version bumps).
 * Existing user effect presets are never touched.
 */
export async function seedEffectFactory(): Promise<void> {
  const stored = localStorage.getItem(LS_KEY);
  if (stored === String(EFFECT_FACTORY_VERSION)) return;

  const now = Date.now();

  // Delete old factory effect presets (re-seed cleanly)
  const existing = await storage.listEffectPresets();
  for (const p of existing) {
    if (p.source === 'factory') await storage.deleteEffectPreset(p.id);
  }

  // Write fresh factory effect presets
  for (const def of FACTORY_EFFECT_PRESETS) {
    const preset: EffectPreset = {
      id: `efx_factory_${def.effectType}_${def.name.replace(/\s+/g, '_').toLowerCase()}`,
      name: def.name,
      folder: def.folder,
      source: 'factory',
      effectType: def.effectType,
      createdAt: now,
      updatedAt: now,
      params: { ...def.params },
    };
    await storage.saveEffectPreset(preset);
  }

  localStorage.setItem(LS_KEY, String(EFFECT_FACTORY_VERSION));
}
