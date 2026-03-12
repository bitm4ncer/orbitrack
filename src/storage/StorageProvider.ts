import type { SynthPreset, EffectPreset, SetMeta, OrbitrackSet, SampleMeta } from '../types/storage';

/**
 * Abstract storage interface. Implemented by LocalStorageProvider (IndexedDB)
 * now, and a future CloudStorageProvider (e.g. Supabase) later.
 */
export interface StorageProvider {
  // Presets
  listPresets(): Promise<SynthPreset[]>;
  getPreset(id: string): Promise<SynthPreset | undefined>;
  savePreset(preset: SynthPreset): Promise<void>;
  deletePreset(id: string): Promise<void>;

  // Effect Presets
  listEffectPresets(): Promise<EffectPreset[]>;
  getEffectPreset(id: string): Promise<EffectPreset | undefined>;
  saveEffectPreset(preset: EffectPreset): Promise<void>;
  deleteEffectPreset(id: string): Promise<void>;

  // Sets
  listSets(): Promise<SetMeta[]>;
  getSet(id: string): Promise<OrbitrackSet | undefined>;
  saveSet(set: OrbitrackSet): Promise<void>;
  deleteSet(id: string): Promise<void>;

  // Samples
  listSamples(): Promise<SampleMeta[]>;
  getSample(key: string): Promise<SampleMeta | undefined>;
  saveSample(sample: SampleMeta): Promise<void>;
  deleteSample(key: string): Promise<void>;
}
