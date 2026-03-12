import type { SynthParams } from './types';

/** Shape of each preset JSON file */
export interface PresetFile {
  name: string;
  category: string;
  params: SynthParams;
}

// Load all factory preset JSON files at build time (nested: factory/<Category>/*.json)
const factoryModules = import.meta.glob<PresetFile>(
  '../../presets/factory/**/*.json',
  { eager: true, import: 'default' },
);

// Load user preset JSON files at build time (nested: user/**/*.json)
const userModules = import.meta.glob<PresetFile>(
  '../../presets/user/**/*.json',
  { eager: true, import: 'default' },
);

/** All factory presets keyed by name */
export const SYNTH_PRESETS: Record<string, SynthParams> = {};

/** Maps each factory preset name → its category folder for the preset browser */
export const FACTORY_PRESET_FOLDERS: Record<string, string> = {};

// Derive category from directory path: ../../presets/factory/<Category>/file.json
for (const [path, mod] of Object.entries(factoryModules)) {
  const parts = path.split('/');
  // parts: [ '..', '..', 'presets', 'factory', '<Category>', '<file>.json' ]
  const category = parts[parts.length - 2];
  SYNTH_PRESETS[mod.name] = mod.params;
  FACTORY_PRESET_FOLDERS[mod.name] = category;
}

/** User presets loaded from src/presets/user/ (file-based, not IndexedDB) */
export const FILE_USER_PRESETS: { name: string; category: string; params: SynthParams }[] = [];

for (const [path, mod] of Object.entries(userModules)) {
  const parts = path.split('/');
  // If in a subdirectory, use it as category; otherwise use the JSON's category field
  const category = parts.length > 6 ? parts[parts.length - 2] : (mod.category || 'Imported');
  FILE_USER_PRESETS.push({ name: mod.name, category, params: mod.params });
}
