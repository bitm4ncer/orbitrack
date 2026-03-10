import { create } from 'zustand';
import type { SynthPreset } from '../types/storage';
import type { SynthParams } from '../audio/synth/types';
import { storage } from '../storage/LocalStorageProvider';

function uid(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

interface PresetStoreState {
  // Data
  presets: SynthPreset[];
  loading: boolean;

  // Browser UI
  browserOpen: boolean;
  searchQuery: string;
  expandedFolders: Set<string>;
  selectedPresetId: string | null;

  // Actions
  openBrowser: () => void;
  closeBrowser: () => void;
  setSearchQuery: (q: string) => void;
  toggleFolder: (folder: string) => void;
  selectPreset: (id: string) => void;

  // CRUD
  loadPresets: () => Promise<void>;
  saveUserPreset: (name: string, folder: string, params: SynthParams) => Promise<SynthPreset>;
  deletePreset: (id: string) => Promise<void>;
  renamePreset: (id: string, newName: string) => Promise<void>;
  movePreset: (id: string, newFolder: string) => Promise<void>;
  duplicatePreset: (id: string) => Promise<void>;
}

export const usePresetStore = create<PresetStoreState>((set, get) => ({
  presets: [],
  loading: false,
  browserOpen: false,
  searchQuery: '',
  expandedFolders: new Set(['Factory']),
  selectedPresetId: null,

  openBrowser: () => set({ browserOpen: true }),
  closeBrowser: () => set({ browserOpen: false, searchQuery: '' }),

  setSearchQuery: (q) => set({ searchQuery: q }),

  toggleFolder: (folder) => {
    const expanded = new Set(get().expandedFolders);
    if (expanded.has(folder)) expanded.delete(folder);
    else expanded.add(folder);
    set({ expandedFolders: expanded });
  },

  selectPreset: (id) => set({ selectedPresetId: id }),

  loadPresets: async () => {
    set({ loading: true });
    const presets = await storage.listPresets();
    set({ presets, loading: false });
  },

  saveUserPreset: async (name, folder, params) => {
    const now = Date.now();
    const preset: SynthPreset = {
      id: uid(),
      name,
      folder: folder.startsWith('User/') ? folder : `User/${folder}`,
      source: 'user',
      createdAt: now,
      updatedAt: now,
      params: { ...params },
    };
    await storage.savePreset(preset);
    await get().loadPresets();
    return preset;
  },

  deletePreset: async (id) => {
    await storage.deletePreset(id);
    await get().loadPresets();
  },

  renamePreset: async (id, newName) => {
    const preset = await storage.getPreset(id);
    if (!preset || preset.source === 'factory') return;
    preset.name = newName;
    preset.updatedAt = Date.now();
    await storage.savePreset(preset);
    await get().loadPresets();
  },

  movePreset: async (id, newFolder) => {
    const preset = await storage.getPreset(id);
    if (!preset || preset.source === 'factory') return;
    preset.folder = newFolder.startsWith('User/') ? newFolder : `User/${newFolder}`;
    preset.updatedAt = Date.now();
    await storage.savePreset(preset);
    await get().loadPresets();
  },

  duplicatePreset: async (id) => {
    const original = await storage.getPreset(id);
    if (!original) return;
    const now = Date.now();
    const copy: SynthPreset = {
      ...original,
      id: uid(),
      name: `${original.name} (copy)`,
      folder: 'User/Copied',
      source: 'user',
      createdAt: now,
      updatedAt: now,
      params: { ...original.params },
    };
    await storage.savePreset(copy);
    await get().loadPresets();
  },
}));
