import type { StorageProvider } from './StorageProvider';
import type { SynthPreset, EffectPreset, SetMeta, OrbeatSet, SampleMeta } from '../types/storage';
import { getAll, get, put, del } from './idb';

/**
 * IndexedDB-backed implementation of StorageProvider.
 * All user data lives locally in the browser.
 */
export class LocalStorageProvider implements StorageProvider {
  // ── Presets ───────────────────────────────────────────────────────────────

  async listPresets(): Promise<SynthPreset[]> {
    return getAll<SynthPreset>('presets');
  }

  async getPreset(id: string): Promise<SynthPreset | undefined> {
    return get<SynthPreset>('presets', id);
  }

  async savePreset(preset: SynthPreset): Promise<void> {
    return put('presets', preset);
  }

  async deletePreset(id: string): Promise<void> {
    return del('presets', id);
  }

  // ── Effect Presets ───────────────────────────────────────────────────────

  async listEffectPresets(): Promise<EffectPreset[]> {
    return getAll<EffectPreset>('effectPresets');
  }

  async getEffectPreset(id: string): Promise<EffectPreset | undefined> {
    return get<EffectPreset>('effectPresets', id);
  }

  async saveEffectPreset(preset: EffectPreset): Promise<void> {
    return put('effectPresets', preset);
  }

  async deleteEffectPreset(id: string): Promise<void> {
    return del('effectPresets', id);
  }

  // ── Sets ──────────────────────────────────────────────────────────────────

  async listSets(): Promise<SetMeta[]> {
    const sets = await getAll<OrbeatSet>('sets');
    return sets.map((s) => s.meta);
  }

  async getSet(id: string): Promise<OrbeatSet | undefined> {
    return get<OrbeatSet>('sets', id);
  }

  async saveSet(set: OrbeatSet): Promise<void> {
    return put('sets', set);
  }

  async deleteSet(id: string): Promise<void> {
    return del('sets', id);
  }

  // ── Samples ───────────────────────────────────────────────────────────────

  async listSamples(): Promise<SampleMeta[]> {
    return getAll<SampleMeta>('samples');
  }

  async getSample(key: string): Promise<SampleMeta | undefined> {
    return get<SampleMeta>('samples', key);
  }

  async saveSample(sample: SampleMeta): Promise<void> {
    return put('samples', sample);
  }

  async deleteSample(key: string): Promise<void> {
    return del('samples', key);
  }
}

/** Singleton instance used throughout the app. */
export const storage = new LocalStorageProvider();
