import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from '../../state/store';
import { fetchSampleTree, invalidateSampleCache, type SampleEntry } from '../../audio/sampleApi';
import { previewSample, stopPreview } from '../../audio/sampler';

export function SampleBank() {
  const selectedId = useStore((s) => s.selectedInstrumentId);
  const instruments = useStore((s) => s.instruments);
  const targetInst = instruments.find((i) => i.id === selectedId);

  const [tree, setTree] = useState<SampleEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [focusIdx, setFocusIdx] = useState(-1);
  const [previewingUrl, setPreviewingUrl] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch sample tree on mount
  useEffect(() => {
    fetchSampleTree().then((t) => {
      setTree(t);
      // Auto-expand all folders
      const allFolders = new Set<string>();
      const walk = (entries: SampleEntry[]) => {
        for (const e of entries) {
          if (e.type === 'folder') {
            allFolders.add(e.path);
            if (e.children) walk(e.children);
          }
        }
      };
      walk(t);
      void allFolders; // folders collapsed by default
    });
  }, []);

  // Stop preview on unmount
  useEffect(() => {
    return () => {
      stopPreview();
    };
  }, []);

  // Build flat list of visible entries
  const flatList = useCallback(() => {
    const result: { entry: SampleEntry; depth: number }[] = [];
    const walk = (entries: SampleEntry[], depth: number) => {
      for (const e of entries) {
        result.push({ entry: e, depth });
        if (e.type === 'folder' && expanded.has(e.path) && e.children) {
          walk(e.children, depth + 1);
        }
      }
    };
    walk(tree, 0);
    return result;
  }, [tree, expanded]);

  const visible = flatList();

  const toggleFolder = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handlePreview = (url: string) => {
    if (previewingUrl === url) {
      stopPreview();
      setPreviewingUrl(null);
    } else {
      previewSample(url);
      setPreviewingUrl(url);
    }
  };

  const handleAssign = (entry: SampleEntry) => {
    if (!selectedId || entry.type !== 'file') return;
    const displayName = entry.name.replace(/\.[^.]+$/, '');
    useStore.getState().assignSample(selectedId, entry.path, displayName);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.min(focusIdx + 1, visible.length - 1);
      setFocusIdx(next);
      const item = visible[next];
      if (item?.entry.type === 'file') {
        handlePreview(item.entry.path);
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.max(focusIdx - 1, 0);
      setFocusIdx(next);
      const item = visible[next];
      if (item?.entry.type === 'file') {
        handlePreview(item.entry.path);
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const item = visible[focusIdx];
      if (item?.entry.type === 'file') {
        handleAssign(item.entry);
      } else if (item?.entry.type === 'folder') {
        toggleFolder(item.entry.path);
      }
      return;
    }

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const item = visible[focusIdx];
      if (item?.entry.type === 'folder' && !expanded.has(item.entry.path)) {
        toggleFolder(item.entry.path);
      }
      return;
    }

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const item = visible[focusIdx];
      if (item?.entry.type === 'folder' && expanded.has(item.entry.path)) {
        toggleFolder(item.entry.path);
      }
      return;
    }
  };

  if (!targetInst) return null;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="sample-bank bg-bg-secondary border-l border-border flex flex-col shrink-0 min-h-0 outline-none"
      style={{ width: 300, padding: 20 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border/50 mb-2">
        <span className="text-[10px] text-text-secondary uppercase tracking-wider font-medium">
          Sample Bank
        </span>
      </div>

      {/* Current assignment */}
      <div className="text-[9px] text-text-secondary mb-3 px-1">
        <span className="text-text-secondary/60">target: </span>
        <span style={{ color: targetInst.color }}>{targetInst.name}</span>
      </div>

      {/* File tree */}
      <div className="flex-1 overflow-y-auto">
        {visible.map(({ entry, depth }, idx) => {
          const isFocused = idx === focusIdx;
          const isFolder = entry.type === 'folder';
          const isExpanded = expanded.has(entry.path);
          const isCurrentSample = targetInst.sampleName === entry.path;

          return (
            <div
              key={entry.path}
              className={`flex items-center gap-1 rounded cursor-pointer transition-colors
                ${isFocused ? 'bg-white/10' : 'hover:bg-white/5'}
                ${isCurrentSample ? 'bg-accent/15' : ''}`}
              style={{ paddingLeft: depth * 16 + 6, paddingRight: 6, paddingTop: 4, paddingBottom: 4 }}
              onClick={() => {
                setFocusIdx(idx);
                if (isFolder) {
                  toggleFolder(entry.path);
                }
              }}
              onDoubleClick={() => {
                if (!isFolder) handleAssign(entry);
              }}
            >
              {/* Folder chevron or file icon */}
              {isFolder ? (
                <svg
                  width="8" height="8" viewBox="0 0 8 8" fill="currentColor"
                  className="text-text-secondary/60 shrink-0 transition-transform"
                  style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                >
                  <path d="M2 1 L6 4 L2 7 Z" />
                </svg>
              ) : (
                <div className="w-2 shrink-0" />
              )}

              {/* Name */}
              <span className={`text-[11px] truncate flex-1 ${isFolder ? 'text-text-secondary' : 'text-text-primary'}`}>
                {isFolder ? entry.name : entry.name.replace(/\.[^.]+$/, '')}
              </span>

              {/* Play/preview + add buttons for files */}
              {!isFolder && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePreview(entry.path);
                    }}
                    className={`shrink-0 p-0.5 rounded transition-colors
                      ${previewingUrl === entry.path ? 'text-accent' : 'text-text-secondary/40 hover:text-accent'}`}
                    title="Preview"
                  >
                    {previewingUrl === entry.path ? (
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
                        <rect x="1" y="1" width="2" height="6" />
                        <rect x="5" y="1" width="2" height="6" />
                      </svg>
                    ) : (
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
                        <path d="M1 0 L8 4 L1 8 Z" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAssign(entry);
                    }}
                    className="shrink-0 p-0.5 rounded transition-colors text-text-secondary/40 hover:text-accent"
                    title="Assign to instrument"
                  >
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <line x1="4" y1="1" x2="4" y2="7" />
                      <line x1="1" y1="4" x2="7" y2="4" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          );
        })}

        {tree.length === 0 && (
          <div className="text-[10px] text-text-secondary/50 text-center py-8">
            No samples found in /public/samples/
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="pt-2 mt-2 border-t border-border/50 text-[8px] text-text-secondary/40 text-center">
        arrows to browse &middot; enter to assign
      </div>
    </div>
  );
}
