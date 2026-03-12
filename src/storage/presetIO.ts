/**
 * Preset import/export — handles .json files for sharing synth presets.
 *
 * File format (single preset):
 *   { "name": "Acid 303", "category": "Acid", "params": { ...SynthParams } }
 *
 * File format (preset library / multiple):
 *   [ { "name": "...", "category": "...", "params": { ... } }, ... ]
 *
 * Exported files can be:
 *   1. Dropped into src/presets/factory/ to become factory presets (dev workflow)
 *   2. Imported by other users via the Import button (user preset)
 */

import type { SynthPreset } from '../types/storage';
import type { SynthParams } from '../audio/synth/types';
import { storage } from './LocalStorageProvider';

interface PresetFileEntry {
  name: string;
  category: string;
  params: SynthParams;
}

/** Download a preset as a .json file */
export function exportPresetFile(preset: SynthPreset): void {
  // Strip category from folder path (e.g., "Factory/Bass" → "Bass", "User/My Sounds" → "My Sounds")
  const category = preset.folder.split('/').slice(1).join('/') || preset.folder;

  const data: PresetFileEntry = {
    name: preset.name,
    category,
    params: preset.params,
  };

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = preset.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '.json';
  a.click();
  URL.revokeObjectURL(url);
}

/** Import one or more .json preset files into the user library */
export async function importPresetFiles(files: File[]): Promise<number> {
  let imported = 0;

  for (const file of files) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      // Support both single preset and array of presets
      const entries: PresetFileEntry[] = Array.isArray(parsed) ? parsed : [parsed];

      for (const entry of entries) {
        if (!entry.name || !entry.params) {
          console.warn('[presetIO] Skipping invalid entry:', entry);
          continue;
        }

        const now = Date.now();
        const uid = Math.random().toString(36).slice(2, 9) + now.toString(36);
        const folder = `User/${entry.category || 'Imported'}`;

        const preset: SynthPreset = {
          id: `imported_${uid}`,
          name: entry.name,
          folder,
          source: 'user',
          createdAt: now,
          updatedAt: now,
          params: entry.params,
        };

        await storage.savePreset(preset);
        imported++;
      }
    } catch (e) {
      console.error('[presetIO] Failed to import file:', file.name, e);
    }
  }

  if (imported > 0) {
    console.log(`[presetIO] Imported ${imported} preset(s)`);
  }

  return imported;
}
