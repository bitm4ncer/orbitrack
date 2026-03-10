import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useClickOutside } from '../../hooks/useClickOutside';
import { useStore } from '../../state/store';
import { storage } from '../../storage/LocalStorageProvider';
import { serializeSet, exportSetToFile, importSetFromFile } from '../../storage/serializer';
import { SaveSetDialog } from './SaveSetDialog';
import { OpenSetDialog } from './OpenSetDialog';

interface FilesMenuProps {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}

export function FilesMenu({ anchorRef, onClose }: FilesMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveAs, setSaveAs] = useState(false);
  const [openDialogOpen, setOpenDialogOpen] = useState(false);
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
    onClose();
  };

  const handleSave = () => {
    const { currentSetId } = useStore.getState();
    if (currentSetId) {
      // Quick save to existing set
      const state = useStore.getState().getSerializableState();
      const name = useStore.getState().currentSetName;
      serializeSet(state, {
        name,
        embedSamples: true,
        includeInstruments: true,
        includeEffects: true,
        includeSynthParams: true,
      }).then((set) => {
        set.id = currentSetId;
        set.meta.id = currentSetId;
        storage.saveSet(set);
      });
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
    { label: 'Open…', action: handleOpen },
  ] as const;

  return (
    <>
      {createPortal(
        <div
          ref={ref}
          className="bg-bg-secondary border border-border rounded-lg shadow-2xl py-2 min-w-[200px]"
          style={style}
        >
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
