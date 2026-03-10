import { useEffect, useRef, useState, useCallback, useId, useMemo } from 'react';
import { useStore } from '../../state/store';
import { fetchLoopTree } from '../../audio/loopApi';
import { previewSample, stopPreview } from '../../audio/sampler';
import { getAllCachedBpms } from '../../audio/bpmCache';
import type { SampleEntry } from '../../audio/sampleApi';
import type { LooperParams } from '../../types/looper';
import { DEFAULT_LOOPER_PARAMS } from '../../types/looper';

function Knob({ label, value, min, max, step = 0.001, decimals = 2, unit = '', color, onChange }: {
  label: string; value: number; min: number; max: number;
  step?: number; decimals?: number; unit?: string; color: string;
  onChange: (v: number) => void;
}) {
  const norm = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const angleDeg = -135 + norm * 270;
  const angleRad = (angleDeg * Math.PI) / 180;
  const lineX = Math.sin(angleRad) * 0.62;
  const lineY = -Math.cos(angleRad) * 0.62;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startValue = value;
    const range = max - min;
    const onMove = (ev: MouseEvent) => {
      const dy = startY - ev.clientY;
      const delta = (dy / 120) * range;
      const raw = Math.max(min, Math.min(max, startValue + delta));
      const snapped = Math.round(raw / step) * step;
      onChange(parseFloat(snapped.toFixed(decimals)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div className="flex flex-col items-center gap-0.5 select-none">
      <span className="text-[8px] text-text-secondary uppercase tracking-wider">{label}</span>
      <svg width="36" height="36" viewBox="-1 -1 2 2" onMouseDown={handleMouseDown}
        style={{ display: 'block', cursor: 'ns-resize' }}>
        <circle cx="0" cy="0" r="0.80" fill="none" stroke={color} strokeWidth="0.10" opacity="0.6" />
        <line x1="0" y1="0" x2={lineX} y2={lineY} stroke={color} strokeWidth="0.14" strokeLinecap="round" />
      </svg>
      <span className="text-[8px] text-text-secondary font-mono">
        {value.toFixed(decimals)}{unit}
      </span>
    </div>
  );
}

export function LoopBrowser() {
  const selectedId = useStore((s) => s.selectedInstrumentId);
  const instruments = useStore((s) => s.instruments);
  const customSamples = useStore((s) => s.customSamples);
  const targetInst = instruments.find((i) => i.id === selectedId);
  const lp: LooperParams = { ...DEFAULT_LOOPER_PARAMS, ...targetInst?.looperParams };

  const updateLooperParams = useStore((s) => s.updateLooperParams);
  const assignLoop = useStore((s) => s.assignLoop);
  const addCustomSample = useStore((s) => s.addCustomSample);

  const [tree, setTree] = useState<SampleEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [focusIdx, setFocusIdx] = useState(-1);
  const [searchQuery, setSearchQuery] = useState('');
  const [previewingUrl, setPreviewingUrl] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputId = useId();

  // Build BPM lookup from both localStorage cache and currently loaded instruments
  const bpmMap = useMemo(() => {
    const map: Record<string, number> = { ...getAllCachedBpms() };
    // Also include BPMs from loaded instruments (more up-to-date)
    for (const inst of instruments) {
      if (inst.samplePath && inst.detectedBpm && inst.detectedBpm > 0) {
        map[inst.samplePath] = inst.detectedBpm;
      }
    }
    return map;
  }, [instruments]);

  useEffect(() => {
    fetchLoopTree().then(setTree);
  }, []);

  useEffect(() => () => { stopPreview(); }, []);

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

    // Also show imported loops
    const importedLoops = customSamples.filter((c) => c.key.startsWith('__imported_loop__/'));
    if (importedLoops.length > 0) {
      const folder: SampleEntry = {
        name: 'Imported', path: '__imported_loops__', type: 'folder',
        children: importedLoops.map((c) => ({ name: c.name, path: c.key, type: 'file' as const })),
      };
      walk([folder], 0);
    }

    return result;
  }, [tree, expanded, customSamples]);

  const visible = flatList();

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.trim().toLowerCase();
    const matches: { entry: SampleEntry; depth: number }[] = [];
    const walk = (entries: SampleEntry[]) => {
      for (const e of entries) {
        if (e.type === 'file' && e.name.toLowerCase().includes(q)) matches.push({ entry: e, depth: 0 });
        if (e.type === 'folder' && e.children) walk(e.children);
      }
    };
    walk(tree);
    return matches;
  }, [searchQuery, tree]);

  const displayList = searchResults ?? visible;

  const toggleFolder = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  const handlePreview = (key: string) => {
    if (previewingUrl === key) { stopPreview(); setPreviewingUrl(null); }
    else {
      const cs = customSamples.find((c) => c.key === key);
      previewSample(cs ? cs.url : key);
      setPreviewingUrl(key);
    }
  };

  const handleAssign = (entry: SampleEntry) => {
    if (!selectedId || entry.type !== 'file') return;
    const displayName = entry.name.replace(/\.[^.]+$/, '');
    assignLoop(selectedId, entry.path, displayName);
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    for (const file of files) {
      const url = URL.createObjectURL(file);
      const name = file.name.replace(/\.[^.]+$/, '');
      const key = `__imported_loop__/${name}_${Date.now()}`;
      addCustomSample({ key, url, name });
      // Auto-assign if we have a selection
      if (selectedId) {
        assignLoop(selectedId, key, name);
      }
    }
    e.target.value = '';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIdx((i) => Math.min(i + 1, displayList.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setFocusIdx((i) => Math.max(i - 1, 0)); }
    if (e.key === 'Enter') {
      e.preventDefault();
      const item = displayList[focusIdx];
      if (item?.entry.type === 'file') handleAssign(item.entry);
      else if (item?.entry.type === 'folder') toggleFolder(item.entry.path);
    }
  };

  if (!targetInst) return null;
  const color = targetInst.color;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="bg-bg-secondary border-l border-border flex flex-col shrink-0 h-full min-h-0 outline-none overflow-hidden"
      style={{ width: 300 }}
    >
      {/* Target + Looper params */}
      <div className="text-[9px] text-text-secondary px-4 pt-3 pb-1 shrink-0">
        <span className="text-text-secondary/60">target: </span>
        <span style={{ color }}>{targetInst.name}</span>
      </div>

      {selectedId && (
        <div className="px-4 py-3 border-b border-border/50 shrink-0">
          <div className="flex gap-2 justify-around mb-3">
            <Knob label="Vol" value={lp.gain} min={0} max={1} decimals={2} color={color}
              onChange={(v) => updateLooperParams(selectedId, { gain: v })} />
            <Knob label="Speed" value={lp.speed} min={0.25} max={4} decimals={2} color={color}
              onChange={(v) => updateLooperParams(selectedId, { speed: v })} />
            <Knob label="A" value={lp.attack} min={0} max={2} decimals={3} unit="s" color={color}
              onChange={(v) => updateLooperParams(selectedId, { attack: v })} />
            <Knob label="R" value={lp.release} min={0} max={2} decimals={3} unit="s" color={color}
              onChange={(v) => updateLooperParams(selectedId, { release: v })} />
          </div>
          <div className="flex gap-2 justify-around">
            <Knob label="Pan" value={lp.pan} min={-1} max={1} decimals={2} color={color}
              onChange={(v) => updateLooperParams(selectedId, { pan: v })} />
            <Knob label="Cutoff" value={lp.cutoff} min={20} max={20000} step={10} decimals={0} unit="Hz" color={color}
              onChange={(v) => updateLooperParams(selectedId, { cutoff: v })} />
            <Knob label="Res" value={lp.resonance} min={0} max={50} decimals={1} color={color}
              onChange={(v) => updateLooperParams(selectedId, { resonance: v })} />
            <Knob label="Pitch" value={lp.pitchSemitones} min={-24} max={24} step={1} decimals={0} unit="st" color={color}
              onChange={(v) => updateLooperParams(selectedId, { pitchSemitones: v })} />
          </div>
          <div className="flex gap-2 justify-around mt-3">
            <Knob label="Offset" value={lp.startOffset} min={0} max={1} decimals={2} color={color}
              onChange={(v) => updateLooperParams(selectedId, { startOffset: v })} />
            <Knob label="Degrade" value={lp.degrade} min={0} max={1} decimals={2} color={color}
              onChange={(v) => updateLooperParams(selectedId, { degrade: v })} />
          </div>
        </div>
      )}

      {/* Loop Browser header + Import */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1 shrink-0">
        <span className="text-[10px] text-text-secondary uppercase tracking-wider font-medium">
          Loop Browser
        </span>
        <label htmlFor={fileInputId}
          className="text-[9px] px-2 py-0.5 rounded border border-border hover:border-white/20 text-text-secondary hover:text-text-primary cursor-pointer transition-colors"
          title="Import loop files">
          + Import
          <input id={fileInputId} type="file" accept=".wav,.mp3,.ogg,.flac,.aiff" multiple
            className="hidden" onChange={handleFileImport} />
        </label>
      </div>

      {/* Search */}
      <div className="px-4 py-2 border-b border-border/50 shrink-0">
        <input type="text" placeholder="Search loops…" value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setFocusIdx(-1); }}
          className="w-full bg-bg-tertiary border border-border rounded px-2 py-1 text-[11px] text-text-primary placeholder-text-secondary/40 outline-none focus:border-white/20 transition-colors" />
      </div>

      {/* File tree */}
      <div className="flex-1 overflow-y-auto px-0 min-h-0">
        {displayList.map(({ entry, depth }, idx) => {
          const isFocused = idx === focusIdx;
          const isFolder = entry.type === 'folder';
          const isExpanded = expanded.has(entry.path);
          const isCurrent = targetInst.samplePath === entry.path;

          return (
            <div key={entry.path}
              className={`flex items-center gap-1 rounded cursor-pointer transition-colors ${isFocused ? 'bg-white/10' : 'hover:bg-white/5'}`}
              style={{ paddingLeft: depth * 16 + 6, paddingRight: 6, paddingTop: 4, paddingBottom: 4 }}
              onClick={() => { setFocusIdx(idx); if (isFolder) toggleFolder(entry.path); }}
              onDoubleClick={() => { if (!isFolder) handleAssign(entry); }}>
              {isFolder ? (
                <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"
                  className="text-text-secondary/60 shrink-0 transition-transform"
                  style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                  <path d="M2 1 L6 4 L2 7 Z" />
                </svg>
              ) : <div className="w-2 shrink-0" />}
              <span className={`text-[11px] truncate flex-1 ${isFolder ? 'text-text-secondary' : 'text-text-primary'}`}
                style={isCurrent ? { color } : undefined}>
                {isFolder ? entry.name : entry.name.replace(/\.[^.]+$/, '')}
              </span>
              {!isFolder && bpmMap[entry.path] > 0 && (
                <span className="shrink-0 text-[8px] font-mono text-text-secondary/50 tabular-nums">
                  {Math.round(bpmMap[entry.path])}
                </span>
              )}
              {!isFolder && (
                <>
                  <button onClick={(e) => { e.stopPropagation(); handlePreview(entry.path); }}
                    className={`shrink-0 p-0.5 rounded transition-colors ${previewingUrl === entry.path ? 'text-accent' : 'text-text-secondary/40 hover:text-accent'}`}
                    title="Preview">
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
                      {previewingUrl === entry.path
                        ? <><rect x="1" y="1" width="2" height="6" /><rect x="5" y="1" width="2" height="6" /></>
                        : <path d="M1 0 L8 4 L1 8 Z" />}
                    </svg>
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleAssign(entry); }}
                    className="shrink-0 p-0.5 rounded transition-colors text-text-secondary/40 hover:text-accent"
                    title="Assign loop">
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <line x1="4" y1="1" x2="4" y2="7" /><line x1="1" y1="4" x2="7" y2="4" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          );
        })}

        {displayList.length === 0 && (
          <div className="text-[10px] text-text-secondary/50 text-center py-8">
            {searchQuery.trim()
              ? <>No loops match &ldquo;{searchQuery}&rdquo;</>
              : <>No loops found.<br /><span className="text-[9px]">Add .wav files to /public/loops/ or use + Import</span></>}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-border/50 text-[8px] text-text-secondary/40 text-center shrink-0">
        arrows to browse &middot; enter to assign &middot; double-click to assign
      </div>
    </div>
  );
}
