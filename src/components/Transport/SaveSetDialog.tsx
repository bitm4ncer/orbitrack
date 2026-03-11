import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../state/store';
import { storage } from '../../storage/LocalStorageProvider';
import { serializeSet } from '../../storage/serializer';

interface SaveSetDialogProps {
  forceNewName: boolean;
  onClose: () => void;
}

export function SaveSetDialog({ onClose }: SaveSetDialogProps) {
  const currentName = useStore((s) => s.currentSetName);
  const [name, setName] = useState(currentName);
  const [embedSamples, setEmbedSamples] = useState(true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const state = useStore.getState().getSerializableState();
      const set = await serializeSet(state, {
        name: name.trim(),
        embedSamples,
        includeInstruments: true,
        includeEffects: true,
        includeSynthParams: true,
      });
      await storage.saveSet(set);
      useStore.getState().setCurrentSetName(name.trim());
      useStore.setState({ currentSetId: set.meta.id });
      onClose();
    } catch (e) {
      console.error('[SaveSetDialog] save failed:', e);
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-bg-secondary border border-border rounded-lg shadow-2xl"
        style={{ width: 380, padding: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-semibold text-text-primary mb-5">Save Set</div>

        <label className="block mb-4">
          <span className="text-[11px] text-text-secondary/60 uppercase tracking-wider">Name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); }}
            className="mt-1.5 w-full bg-bg-tertiary text-text-primary text-[13px] px-4 py-2.5 rounded border border-border outline-none focus:border-accent"
            placeholder="My Set"
          />
        </label>

        <label className="flex items-center gap-2.5 mb-6">
          <input
            type="checkbox"
            checked={embedSamples}
            onChange={(e) => setEmbedSamples(e.target.checked)}
            className="accent-accent w-3.5 h-3.5"
          />
          <span className="text-[12px] text-text-secondary/70">Embed custom samples</span>
        </label>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="text-[12px] px-5 py-2 text-text-secondary/60 hover:text-text-secondary rounded border border-border hover:border-border/80 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="text-[12px] px-5 py-2 rounded font-medium bg-accent/20 text-accent border border-accent/40 hover:bg-accent/30 transition-colors disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
