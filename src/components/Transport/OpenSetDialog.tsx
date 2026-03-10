import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../state/store';
import { storage } from '../../storage/LocalStorageProvider';
import { importSetFromFile } from '../../storage/serializer';
import type { SetMeta } from '../../types/storage';

interface OpenSetDialogProps {
  onClose: () => void;
}

export function OpenSetDialog({ onClose }: OpenSetDialogProps) {
  const [sets, setSets] = useState<SetMeta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    storage.listSets().then((list) => {
      setSets(list.sort((a, b) => b.updatedAt - a.updatedAt));
      setLoading(false);
    });
  }, []);

  const handleOpen = async (id: string) => {
    const set = await storage.getSet(id);
    if (set) {
      useStore.getState().loadSet(set);
      onClose();
    }
  };

  const handleDelete = async (id: string) => {
    await storage.deleteSet(id);
    setSets((prev) => prev.filter((s) => s.id !== id));
  };

  const handleImportFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.orbeat,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const set = await importSetFromFile(file);
        useStore.getState().loadSet(set);
        onClose();
      } catch (e) {
        console.error('[OpenSetDialog] Import failed:', e);
      }
    };
    input.click();
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return createPortal(
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-bg-secondary border border-border rounded-lg shadow-2xl flex flex-col"
        style={{ width: 400, maxHeight: 500 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-3">
          <div className="text-sm font-semibold text-text-primary">Open Set</div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-3" style={{ minHeight: 120 }}>
          {loading && (
            <div className="text-[13px] text-text-secondary/40 text-center py-10">Loading…</div>
          )}
          {!loading && sets.length === 0 && (
            <div className="text-[13px] text-text-secondary/40 text-center py-10">No saved sets</div>
          )}
          {sets.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-3 px-4 py-3 rounded hover:bg-white/5 group cursor-pointer transition-colors"
              onClick={() => handleOpen(s.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-text-primary truncate">{s.name}</div>
                <div className="text-[11px] text-text-secondary/40 mt-0.5">{formatDate(s.updatedAt)}</div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-[12px] text-red-400/80 px-2 py-1 transition-opacity"
                title="Delete set"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-between items-center">
          <button
            onClick={handleImportFile}
            className="text-[12px] text-accent/70 hover:text-accent transition-colors"
          >
            Import from file…
          </button>
          <button
            onClick={onClose}
            className="text-[12px] px-5 py-2 text-text-secondary/60 hover:text-text-secondary rounded border border-border transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
