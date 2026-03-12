import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useClickOutside } from '../../hooks/useClickOutside';
import { useStore } from '../../state/store';
import { storage } from '../../storage/LocalStorageProvider';
import { serializeSet, exportSetToFile, importSetFromFile } from '../../storage/serializer';
import { gzipAsync, toBase64Url, strToU8 } from '../../storage/compressionUtils';
import { setLastSetId } from '../../storage/sessionAutosave';
import type { OrbeatSet, SetVersionEntry } from '../../types/storage';
import { SaveSetDialog } from './SaveSetDialog';
import { OpenSetDialog } from './OpenSetDialog';

const MAX_VERSIONS = 50;

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

interface FilesMenuProps {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}

export function FilesMenu({ anchorRef, onClose }: FilesMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveAs, setSaveAs] = useState(false);
  const [openDialogOpen, setOpenDialogOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const thumbnail = useStore((s) => s.currentSetThumbnail);
  useClickOutside(ref, () => {
    if (!saveOpen && !openDialogOpen) onClose();
  });

  const rect = anchorRef.current?.getBoundingClientRect();
  const style: React.CSSProperties = rect ? {
    position: 'fixed',
    bottom: window.innerHeight - rect.top + 4,
    left: rect.left,
    zIndex: 10000,
  } : {};

  const handleNew = () => {
    useStore.getState().newSet();
    setLastSetId(null);
    onClose();
  };

  const handleSave = async () => {
    const { currentSetId } = useStore.getState();
    if (currentSetId) {
      // Quick save to existing set with version creation
      const state = useStore.getState().getSerializableState();
      const name = useStore.getState().currentSetName;
      const set = await serializeSet(state, {
        name,
        embedSamples: true,
        includeInstruments: true,
        includeEffects: true,
        includeSynthParams: true,
      });
      set.id = currentSetId;
      set.meta.id = currentSetId;

      // Preserve existing thumbnail from store
      const storeThumb = useStore.getState().currentSetThumbnail;
      if (storeThumb) set.meta.thumbnail = storeThumb;

      // Load existing set for versions
      const existing = await storage.getSet(currentSetId);

      // Create version snapshot
      const { versions: _, ...setWithoutVersions } = set;
      const json = JSON.stringify(setWithoutVersions);
      const compressed = await gzipAsync(strToU8(json));
      const snapshot = toBase64Url(compressed);

      const entry: SetVersionEntry = {
        versionId: uid(),
        timestamp: Date.now(),
        source: 'manual',
        snapshot,
      };

      // Use already-loaded existing set for versions
      const versions: SetVersionEntry[] = (existing as OrbeatSet | undefined)?.versions ?? [];
      versions.unshift(entry);
      if (versions.length > MAX_VERSIONS) versions.length = MAX_VERSIONS;

      set.versions = versions;
      set.meta.versionCount = versions.length;
      set.meta.updatedAt = Date.now();

      await storage.saveSet(set);
      setLastSetId(currentSetId);
      onClose();
    } else {
      setSaveAs(false);
      setSaveOpen(true);
    }
  };

  const handleSaveAs = () => {
    setSaveAs(true);
    setSaveOpen(true);
  };

  const handleExport = async () => {
    const state = useStore.getState().getSerializableState();
    const name = useStore.getState().currentSetName;
    const set = await serializeSet(state, {
      name,
      embedSamples: true,
      includeInstruments: true,
      includeEffects: true,
      includeSynthParams: true,
    });
    // Preserve thumbnail from store
    const thumb = useStore.getState().currentSetThumbnail;
    if (thumb) set.meta.thumbnail = thumb;
    exportSetToFile(set);
    onClose();
  };

  const handleImport = () => {
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
        console.error('[FilesMenu] Import failed:', e);
      }
    };
    input.click();
  };

  const handleOpen = () => {
    setOpenDialogOpen(true);
  };

  const items = [
    { label: 'New Set', action: handleNew },
    'separator',
    { label: 'Save', action: handleSave },
    { label: 'Save As…', action: handleSaveAs },
    'separator',
    { label: 'Export .orbeat…', action: handleExport },
    { label: 'Import .orbeat…', action: handleImport },
    'separator',
    { label: 'My Sets', action: handleOpen },
  ] as const;

  return (
    <>
      {createPortal(
        <>
        <div className="fixed inset-0 backdrop-blur-sm bg-black/40 z-[9999]" />
        <div
          ref={ref}
          className="bg-bg-secondary border border-border rounded-lg shadow-2xl overflow-hidden"
          style={{ ...style, width: thumbnail ? 300 : undefined, minWidth: 200 }}
        >
          {/* Cover art above menu */}
          {thumbnail && (
            <button
              className="overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
              style={{ width: 300, height: 300 }}
              onClick={() => setLightboxOpen(true)}
              title="View cover art"
            >
              <img src={thumbnail} alt="" className="w-full h-full object-cover" />
            </button>
          )}
          <div className="py-2">
            {items.map((item, i) =>
              item === 'separator' ? (
                <div key={i} className="border-t border-border/40 my-1" />
              ) : (
                <button
                  key={item.label}
                  onClick={item.action}
                  className="w-full text-left text-[13px] px-5 py-2 text-text-secondary hover:bg-white/5 hover:text-text-primary transition-colors"
                >
                  {item.label}
                </button>
              ),
            )}
          </div>
        </div>
        </>,
        document.body,
      )}

      {/* Lightbox */}
      {lightboxOpen && thumbnail && createPortal(
        <div
          className="fixed inset-0 z-[10002] flex items-center justify-center backdrop-blur-md bg-black/60 cursor-pointer"
          onClick={() => setLightboxOpen(false)}
        >
          <img
            src={thumbnail}
            alt="Cover Art"
            className="max-w-[80vmin] max-h-[80vmin] rounded-lg shadow-2xl border border-border/30"
          />
        </div>,
        document.body,
      )}

      {saveOpen && (
        <SaveSetDialog
          forceNewName={saveAs}
          onClose={() => { setSaveOpen(false); onClose(); }}
        />
      )}

      {openDialogOpen && (
        <OpenSetDialog
          onClose={() => { setOpenDialogOpen(false); onClose(); }}
        />
      )}
    </>
  );
}
