import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useEffectPresetStore } from '../../state/effectPresetStore';

interface Props {
  effectType: string;
  params: Record<string, number>;
  color: string;
  onClose: () => void;
  onSaved: () => void;
}

export function EffectPresetSaveDialog({ effectType, params, color, onClose, onSaved }: Props) {
  const presets = useEffectPresetStore((s) => s.presets);
  const saveUserPreset = useEffectPresetStore((s) => s.saveUserPreset);

  // Collect unique user folders for this effect type
  const userFolders = [...new Set(
    presets
      .filter((p) => p.source === 'user' && p.effectType === effectType)
      .map((p) => p.folder.replace(/^User\//, '')),
  )];

  const [name, setName] = useState('');
  const [folder, setFolder] = useState(userFolders[0] ?? 'My Presets');
  const [newFolder, setNewFolder] = useState('');
  const [useNewFolder, setUseNewFolder] = useState(userFolders.length === 0);
  const [saving, setSaving] = useState(false);

  const finalFolder = useNewFolder ? (newFolder.trim() || 'My Presets') : folder;

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await saveUserPreset(name.trim(), finalFolder, effectType, params);
    setSaving(false);
    onSaved();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-lg border border-border p-4 flex flex-col gap-3"
        style={{ background: '#14141e', width: 260 }}
      >
        <div className="text-[10px] uppercase tracking-wider font-medium" style={{ color }}>
          Save Effect Preset
        </div>

        {/* Name */}
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Preset name..."
          className="bg-bg-tertiary text-text-primary text-[11px] px-2 py-1.5 rounded border border-border outline-none focus:border-accent"
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
        />

        {/* Folder */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] text-text-secondary/60 uppercase tracking-wider">Folder</span>
          {userFolders.length > 0 && (
            <select
              value={useNewFolder ? '__new__' : folder}
              onChange={(e) => {
                if (e.target.value === '__new__') { setUseNewFolder(true); }
                else { setUseNewFolder(false); setFolder(e.target.value); }
              }}
              className="bg-bg-tertiary text-text-primary text-[10px] px-2 py-1 rounded border border-border"
            >
              {userFolders.map((f) => <option key={f} value={f}>{f}</option>)}
              <option value="__new__">+ New folder...</option>
            </select>
          )}
          {useNewFolder && (
            <input
              value={newFolder}
              onChange={(e) => setNewFolder(e.target.value)}
              placeholder="New folder name..."
              className="bg-bg-tertiary text-text-primary text-[10px] px-2 py-1 rounded border border-border outline-none focus:border-accent"
            />
          )}
        </div>

        {/* Buttons */}
        <div className="flex gap-2 justify-end mt-1">
          <button
            onClick={onClose}
            className="text-[10px] text-text-secondary/60 hover:text-text-primary px-3 py-1 rounded border border-border"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="text-[10px] px-3 py-1 rounded font-medium disabled:opacity-40"
            style={{ background: `${color}30`, color, border: `1px solid ${color}60` }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
