import { create } from 'zustand';
import type { EffectPreset } from '../types/storage';
import { storage } from '../storage/LocalStorageProvider';

function uid(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

interface EffectPresetStoreState {
  presets: EffectPreset[];
  loading: boolean;

  loadPresets: () => Promise<void>;
  saveUserPreset: (
    name: string,
    folder: string,
    effectType: string,
    params: Record<string, number>,
  ) => Promise<EffectPreset>;
  deletePreset: (id: string) => Promise<void>;
  renamePreset: (id: string, newName: string) => Promise<void>;
  duplicatePreset: (id: string) => Promise<void>;
}

export const useEffectPresetStore = create<EffectPresetStoreState>((set, get) => ({
  presets: [],
  loading: false,

  loadPresets: async () => {
    set({ loading: true });
    const presets = await storage.listEffectPresets();
    set({ presets, loading: false });
  },

  saveUserPreset: async (name, folder, effectType, params) => {
    const now = Date.now();
    const preset: EffectPreset = {
      id: uid(),
      name,
      folder: folder.startsWith('User/') ? folder : `User/${folder}`,
      source: 'user',
      effectType,
      createdAt: now,
      updatedAt: now,
      params: { ...params },
    };
    await storage.saveEffectPreset(preset);
    await get().loadPresets();
    return preset;
  },

  deletePreset: async (id) => {
    await storage.deleteEffectPreset(id);
    await get().loadPresets();
  },

  renamePreset: async (id, newName) => {
    const preset = await storage.getEffectPreset(id);
    if (!preset || preset.source === 'factory') return;
    preset.name = newName;
    preset.updatedAt = Date.now();
    await storage.saveEffectPreset(preset);
    await get().loadPresets();
  },

  duplicatePreset: async (id) => {
    const original = await storage.getEffectPreset(id);
    if (!original) return;
    const now = Date.now();
    const copy: EffectPreset = {
      ...original,
      id: uid(),
      name: `${original.name} (copy)`,
      folder: 'User/Copied',
      source: 'user',
      createdAt: now,
      updatedAt: now,
      params: { ...original.params },
    };
    await storage.saveEffectPreset(copy);
    await get().loadPresets();
  },
}));
