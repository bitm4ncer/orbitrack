import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../state/store';
import type { SampleEntry } from '../../audio/sampleApi';
import { previewSample, stopPreview } from '../../audio/sampler';
import { findSiblings, preloadSample } from '../../audio/sampleCache';

interface Props {
  instrumentId: string;
  anchorRect: DOMRect;
  tree: SampleEntry[];
  onClose: () => void;
}

function flattenFiles(entries: SampleEntry[]): SampleEntry[] {
  return entries.flatMap((e) =>
    e.type === 'file' ? [e] : flattenFiles(e.children ?? [])
  );
}

function computeStyle(anchor: DOMRect): React.CSSProperties {
  const W = 240;
  const H = 340;
  const GAP = 4;
  const MARGIN = 8;

  let left = anchor.left;
  let top = anchor.bottom + GAP;

  // Clamp horizontal
  if (left + W > window.innerWidth - MARGIN) left = window.innerWidth - MARGIN - W;
  if (left < MARGIN) left = MARGIN;

  // Flip above if not enough room below
  if (top + H > window.innerHeight - MARGIN) top = anchor.top - H - GAP;
  if (top < MARGIN) top = MARGIN;

  return { position: 'fixed', left, top, width: W, zIndex: 9999 };
}

export function SamplePickerPopup({ instrumentId, anchorRect, tree, onClose }: Props) {
  const [query, setQuery] = useState('');
  const popupRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentItemRef = useRef<HTMLDivElement>(null);

  const assignSample = useStore((s) => s.assignSample);
  const inst = useStore((s) => s.instruments.find((i) => i.id === instrumentId));
  const currentPath = inst?.samplePath ?? '';

  const allFiles = useMemo(() => flattenFiles(tree), [tree]);

  // Default list: siblings in the same folder, falling back to first 100 files
  const siblings = useMemo(() => {
    if (!currentPath) return allFiles.slice(0, 100);
    const sibs = findSiblings(currentPath, tree);
    return sibs.length > 0 ? sibs : allFiles.slice(0, 100);
  }, [currentPath, tree, allFiles]);

  // Search filters all files; no query shows siblings
  const displayList = useMemo(() => {
    if (!query.trim()) return siblings;
    const q = query.toLowerCase();
    return allFiles.filter((e) => e.name.toLowerCase().includes(q));
  }, [query, siblings, allFiles]);

  // Autofocus search input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Scroll current sample into view after first render
  useEffect(() => {
    const id = setTimeout(() => {
      currentItemRef.current?.scrollIntoView({ block: 'nearest' });
    }, 30);
    return () => clearTimeout(id);
  }, []);

  // Click-outside → close (capture phase, fires before any bubbled events)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [onClose]);

  // Stop any preview audio when popup closes
  useEffect(() => () => stopPreview(), []);

  const handleSelect = (entry: SampleEntry) => {
    const displayName = entry.name.replace(/\.[^.]+$/, '');
    assignSample(instrumentId, entry.path, displayName);
    onClose();
  };

  const handleRowMouseEnter = (entry: SampleEntry) => {
    preloadSample(entry.path);
    previewSample(entry.path);
  };

  return createPortal(
    <div
      ref={popupRef}
      style={computeStyle(anchorRect)}
      className="bg-bg-secondary border border-border rounded-lg shadow-2xl flex flex-col overflow-hidden"
    >
      {/* Search */}
      <div className="px-2 pt-2 pb-1.5 border-b border-border flex-shrink-0">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onClose()}
          placeholder="Search samples…"
          className="w-full bg-bg border border-border rounded px-2 py-1 text-[11px] text-text-primary placeholder-text-secondary outline-none focus:border-white/20 transition-colors"
        />
      </div>

      {/* Sample list */}
      <div
        className="overflow-y-auto"
        style={{ maxHeight: 270 }}
        onWheel={(e) => e.stopPropagation()}
      >
        {displayList.map((entry) => {
          const isCurrent = entry.path === currentPath;
          return (
            <div
              key={entry.path}
              ref={isCurrent ? currentItemRef : undefined}
              className={`px-3 py-[5px] text-[11px] cursor-pointer truncate transition-colors select-none
                ${isCurrent
                  ? 'bg-white/10 text-text-primary'
                  : 'text-text-secondary hover:bg-white/5 hover:text-text-primary'
                }`}
              onClick={() => handleSelect(entry)}
              onMouseEnter={() => handleRowMouseEnter(entry)}
            >
              {entry.name.replace(/\.[^.]+$/, '')}
            </div>
          );
        })}
        {displayList.length === 0 && (
          <div className="px-3 py-3 text-[11px] text-text-secondary text-center">
            No results
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-2 py-1 border-t border-border flex-shrink-0 flex items-center justify-between">
        <span className="text-[9px] text-text-secondary">
          {query ? `${displayList.length} results` : `${siblings.length} samples`}
        </span>
        {!query && siblings.length < allFiles.length && (
          <span className="text-[9px] text-text-secondary">search for more</span>
        )}
      </div>
    </div>,
    document.body
  );
}
