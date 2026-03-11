import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePresetStore } from '../../state/presetStore';
import { useClickOutside } from '../../hooks/useClickOutside';
import { PresetSaveDialog } from './PresetSaveDialog';
import type { SynthPreset } from '../../types/storage';
import type { SynthEngine } from '../../audio/synth/SynthEngine';

// ── Folder tree helpers ──────────────────────────────────────────────────────

interface FolderNode {
  name: string;
  path: string;
  children: Map<string, FolderNode>;
  presets: SynthPreset[];
}

function buildTree(presets: SynthPreset[]): FolderNode {
  const root: FolderNode = { name: '', path: '', children: new Map(), presets: [] };

  for (const p of presets) {
    const parts = p.folder.split('/');
    let node = root;
    let pathSoFar = '';
    for (const part of parts) {
      pathSoFar = pathSoFar ? `${pathSoFar}/${part}` : part;
      if (!node.children.has(part)) {
        node.children.set(part, { name: part, path: pathSoFar, children: new Map(), presets: [] });
      }
      node = node.children.get(part)!;
    }
    node.presets.push(p);
  }
  return root;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function FolderTreeNode({
  node, depth, color, selectedId, expanded, onToggle, onSelect, onAction,
}: {
  node: FolderNode; depth: number; color: string; selectedId: string | null;
  expanded: Set<string>; onToggle: (path: string) => void;
  onSelect: (preset: SynthPreset) => void;
  onAction: (preset: SynthPreset, action: string) => void;
}) {
  const isOpen = expanded.has(node.path);

  return (
    <div>
      {/* Folder header */}
      {node.name && (
        <button
          onClick={() => onToggle(node.path)}
          className="w-full flex items-center gap-1.5 px-2 py-1 text-left hover:bg-white/5 rounded transition-colors"
          style={{ paddingLeft: depth * 12 + 8 }}
        >
          <span className="text-[9px] text-text-secondary/50 w-3">{isOpen ? '▼' : '▶'}</span>
          <span className="text-[10px] text-text-secondary/80 font-medium">{node.name}</span>
          <span className="text-[8px] text-text-secondary/30 ml-auto">
            {countPresets(node)}
          </span>
        </button>
      )}

      {/* Children + presets */}
      {(isOpen || !node.name) && (
        <>
          {[...node.children.values()].map((child) => (
            <FolderTreeNode
              key={child.path} node={child} depth={depth + (node.name ? 1 : 0)}
              color={color} selectedId={selectedId} expanded={expanded}
              onToggle={onToggle} onSelect={onSelect} onAction={onAction}
            />
          ))}
          {node.presets
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((p) => (
              <PresetRow
                key={p.id} preset={p} depth={depth + (node.name ? 1 : 0)}
                color={color} selected={p.id === selectedId}
                onSelect={() => onSelect(p)}
                onAction={(action) => onAction(p, action)}
              />
            ))}
        </>
      )}
    </div>
  );
}

function countPresets(node: FolderNode): number {
  let count = node.presets.length;
  for (const child of node.children.values()) count += countPresets(child);
  return count;
}

function PresetRow({
  preset, depth, color, selected, onSelect, onAction,
}: {
  preset: SynthPreset; depth: number; color: string; selected: boolean;
  onSelect: () => void; onAction: (action: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className="flex items-center group hover:bg-white/5 rounded transition-colors cursor-pointer"
      style={{
        paddingLeft: depth * 12 + 20,
        background: selected ? `${color}15` : undefined,
      }}
      onClick={onSelect}
    >
      <span
        className="flex-1 text-[10px] py-1 truncate"
        style={{ color: selected ? color : '#c8c8d0' }}
      >
        {preset.name}
      </span>

      {/* Dot menu */}
      <div className="relative">
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
          className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-[10px] px-1.5 py-0.5 text-text-secondary transition-opacity"
        >
          ⋯
        </button>
        {menuOpen && (
          <DotMenu
            source={preset.source}
            onAction={(a) => { setMenuOpen(false); onAction(a); }}
            onClose={() => setMenuOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

function DotMenu({
  source, onAction, onClose,
}: { source: 'factory' | 'user'; onAction: (a: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, onClose);

  const items = source === 'user'
    ? [{ label: 'Rename', action: 'rename' }, { label: 'Delete', action: 'delete' }]
    : [{ label: 'Duplicate to User', action: 'duplicate' }];

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-50 bg-bg-secondary border border-border rounded shadow-lg py-0.5 min-w-[120px]"
    >
      {items.map((item) => (
        <button
          key={item.action}
          onClick={(e) => { e.stopPropagation(); onAction(item.action); }}
          className="w-full text-left text-[10px] px-3 py-1 text-text-secondary hover:bg-white/5 hover:text-text-primary"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

interface PresetBrowserProps {
  engine: SynthEngine;
  color: string;
  currentPresetName: string;
  onPresetLoaded: () => void;
}

export function PresetBrowser({ engine, color, currentPresetName, onPresetLoaded }: PresetBrowserProps) {
  const {
    presets, browserOpen, searchQuery, expandedFolders, selectedPresetId,
    openBrowser, closeBrowser, setSearchQuery, toggleFolder, selectPreset,
    loadPresets, deletePreset, renamePreset, duplicatePreset,
  } = usePresetStore();

  const [saveOpen, setSaveOpen] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  useClickOutside(popupRef, () => { if (browserOpen) closeBrowser(); });

  // Load presets on first open
  useEffect(() => {
    if (browserOpen && presets.length === 0) { loadPresets(); }
  }, [browserOpen, presets.length, loadPresets]);

  // Filter
  const query = searchQuery.toLowerCase();
  const filtered = query
    ? presets.filter((p) => p.name.toLowerCase().includes(query))
    : presets;

  const tree = buildTree(filtered);

  const handleSelect = (preset: SynthPreset) => {
    selectPreset(preset.id);
    engine.loadPreset(preset.params);
    onPresetLoaded();
  };

  const handleAction = async (preset: SynthPreset, action: string) => {
    if (action === 'delete') {
      await deletePreset(preset.id);
    } else if (action === 'rename') {
      setRenameId(preset.id);
      setRenameValue(preset.name);
    } else if (action === 'duplicate') {
      await duplicatePreset(preset.id);
    }
  };

  const handleRenameConfirm = async () => {
    if (renameId && renameValue.trim()) {
      await renamePreset(renameId, renameValue.trim());
    }
    setRenameId(null);
  };

  // Popup position — clamp horizontally so it doesn't overflow the right edge
  const rect = triggerRef.current?.getBoundingClientRect();
  const popupW = 280;
  const popupMaxH = 420;
  const popupLeft = rect ? Math.min(rect.left, window.innerWidth - popupW - 8) : 0;
  const popupStyle: React.CSSProperties = rect ? {
    position: 'fixed',
    bottom: window.innerHeight - rect.top + 4,
    left: popupLeft,
    width: popupW,
    maxHeight: Math.min(popupMaxH, rect.top - 8),
    zIndex: 10000,
  } : {};

  return (
    <>
      {/* Trigger button */}
      <button
        ref={triggerRef}
        onClick={() => browserOpen ? closeBrowser() : openBrowser()}
        className="flex-1 flex items-center justify-between bg-bg-tertiary text-text-primary text-[10px] px-2 py-1 rounded border border-border hover:border-white/20 transition-colors truncate"
      >
        <span className="truncate">{currentPresetName || 'INIT'}</span>
        <span className="text-text-secondary/40 text-[8px] ml-1">{browserOpen ? '▲' : '▼'}</span>
      </button>

      {/* Popup */}
      {browserOpen && createPortal(
        <div
          ref={popupRef}
          className="bg-bg-secondary border border-border rounded-lg shadow-2xl flex flex-col overflow-hidden"
          style={popupStyle}
        >
          {/* Search */}
          <div className="px-2 pt-2 pb-1.5">
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search presets…"
              className="w-full bg-bg-tertiary text-text-primary text-[10px] px-2 py-1 rounded border border-border outline-none focus:border-accent"
            />
          </div>

          {/* Rename inline */}
          {renameId && (
            <div className="px-2 pb-1.5 flex gap-1">
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleRenameConfirm(); if (e.key === 'Escape') setRenameId(null); }}
                className="flex-1 bg-bg-tertiary text-text-primary text-[10px] px-2 py-0.5 rounded border border-accent outline-none"
              />
              <button onClick={handleRenameConfirm} className="text-[9px] px-1.5 rounded" style={{ color, background: `${color}20` }}>OK</button>
              <button onClick={() => setRenameId(null)} className="text-[9px] px-1.5 text-text-secondary/60">✕</button>
            </div>
          )}

          {/* Tree */}
          <div className="flex-1 overflow-y-auto px-1 pb-1" style={{ maxHeight: 340 }}>
            {query ? (
              // Flat search results
              filtered
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((p) => (
                  <PresetRow
                    key={p.id} preset={p} depth={0} color={color}
                    selected={p.id === selectedPresetId}
                    onSelect={() => handleSelect(p)}
                    onAction={(action) => handleAction(p, action)}
                  />
                ))
            ) : (
              <FolderTreeNode
                node={tree} depth={0} color={color} selectedId={selectedPresetId}
                expanded={expandedFolders} onToggle={toggleFolder}
                onSelect={handleSelect} onAction={handleAction}
              />
            )}
            {filtered.length === 0 && (
              <div className="text-[10px] text-text-secondary/40 text-center py-6">
                {query ? 'No presets found' : 'Loading…'}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-3 py-2 border-t border-border flex justify-between items-center">
            <button
              onClick={() => setSaveOpen(true)}
              className="text-[9px] px-2 py-0.5 rounded font-medium"
              style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}
            >
              Save Preset
            </button>
            <span className="text-[8px] text-text-secondary/40">{filtered.length} presets</span>
          </div>
        </div>,
        document.body,
      )}

      {/* Save dialog */}
      {saveOpen && (
        <PresetSaveDialog
          params={engine.getParams()}
          color={color}
          onClose={() => setSaveOpen(false)}
          onSaved={(id) => selectPreset(id)}
        />
      )}
    </>
  );
}
