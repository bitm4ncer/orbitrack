import { useEffect, useRef, useState, useCallback, useId, useMemo } from 'react';
import { useStore } from '../../state/store';
import { fetchSampleTree, type SampleEntry } from '../../audio/sampleApi';
import { previewSample, stopPreview } from '../../audio/sampler';
import { WaveformView } from './WaveformView';
import type { SuperdoughSamplerParams } from '../../types/superdough';
import { DEFAULT_SAMPLER_PARAMS } from '../../types/superdough';

// MIDI note number → label (C-1 = 0, C4 = 60, C8 = 108)
function midiToLabel(note: number): string {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(note / 12) - 1;
  return noteNames[note % 12] + octave;
}

// Built-in sample alias → actual file path (relative, no leading slash)
const ALIAS_PATHS: Record<string, string> = {
  kick: 'samples/Default/kick.wav',
  snare: 'samples/Default/snare.wav',
  hihat: 'samples/Default/hihat.wav',
  clap: 'samples/Default/clap.wav',
};

// Circular SVG knob — border and indicator inherit color prop.
// Drag: captures startY + startValue at mousedown so the stale-closure bug is avoided.
// Text input: click the value label to type an exact number.
function Knob({ label, value, min, max, step = 0.001, decimals = 2, unit = '', color, onChange, onDragEnd }: {
  label: string; value: number; min: number; max: number;
  step?: number; decimals?: number; unit?: string; color: string;
  onChange: (v: number) => void;
  onDragEnd?: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Map value → indicator angle: min=-135°, max=+135° (270° sweep)
  const norm = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const angleDeg = -135 + norm * 270;
  const angleRad = (angleDeg * Math.PI) / 180;
  const lineX = Math.sin(angleRad) * 0.62;
  const lineY = -Math.cos(angleRad) * 0.62;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    // Capture start state — avoids stale closure on `value`
    const startY = e.clientY;
    const startValue = value;
    const range = max - min;
    let lastValue = value;

    const onMove = (ev: MouseEvent) => {
      const dy = startY - ev.clientY; // up = increase
      const delta = (dy / 120) * range;
      const raw = Math.max(min, Math.min(max, startValue + delta));
      const snapped = Math.round(raw / step) * step;
      lastValue = parseFloat(snapped.toFixed(decimals));
      onChange(lastValue);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      onDragEnd?.(lastValue);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const commitInput = () => {
    const parsed = parseFloat(inputVal);
    if (!isNaN(parsed)) {
      const clamped = Math.max(min, Math.min(max, parsed));
      const snapped = Math.round(clamped / step) * step;
      onChange(parseFloat(snapped.toFixed(decimals)));
    }
    setEditing(false);
  };

  useEffect(() => {
    if (editing) {
      setInputVal(value.toFixed(decimals));
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  return (
    <div className="flex flex-col items-center gap-0.5 select-none">
      <span className="text-[8px] text-text-secondary uppercase tracking-wider">{label}</span>
      <svg
        width="36" height="36"
        viewBox="-1 -1 2 2"
        onMouseDown={handleMouseDown}
        style={{ display: 'block', cursor: 'ns-resize' }}
      >
        {/* Circle border */}
        <circle cx="0" cy="0" r="0.80" fill="none" stroke={color} strokeWidth="0.10" opacity="0.6" />
        {/* Single radius indicator line */}
        <line x1="0" y1="0" x2={lineX} y2={lineY} stroke={color} strokeWidth="0.14" strokeLinecap="round" />
      </svg>
      {editing ? (
        <input
          ref={inputRef}
          type="number"
          value={inputVal}
          min={min}
          max={max}
          step={step}
          onChange={(e) => setInputVal(e.target.value)}
          onBlur={commitInput}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitInput();
            if (e.key === 'Escape') setEditing(false);
          }}
          className="w-12 text-center text-[8px] font-mono bg-bg-tertiary border border-border rounded px-0.5 py-0 text-text-primary outline-none"
          style={{ MozAppearance: 'textfield' } as React.CSSProperties}
        />
      ) : (
        <span
          className="text-[8px] text-text-secondary font-mono cursor-text hover:text-text-primary transition-colors"
          onClick={() => setEditing(true)}
          title="Click to enter value"
        >
          {value.toFixed(decimals)}{unit}
        </span>
      )}
    </div>
  );
}

export function SampleBank() {
  const selectedId = useStore((s) => s.selectedInstrumentId);
  const instruments = useStore((s) => s.instruments);
  const customSamples = useStore((s) => s.customSamples);
  const targetInst = instruments.find((i) => i.id === selectedId);
  const sp = targetInst?.samplerParams;

  const updateSamplerParams = useStore((s) => s.updateSamplerParams);
  const assignSample = useStore((s) => s.assignSample);
  const addCustomSample = useStore((s) => s.addCustomSample);
  const removeCustomSample = useStore((s) => s.removeCustomSample);

  const [tree, setTree] = useState<SampleEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [focusIdx, setFocusIdx] = useState(-1);
  const [searchQuery, setSearchQuery] = useState('');
  const [previewingUrl, setPreviewingUrl] = useState<string | null>(null);
  const [waveformUrl, setWaveformUrl] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [draft, setDraft] = useState<SuperdoughSamplerParams>(() => sp ?? DEFAULT_SAMPLER_PARAMS);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputId = useId();

  // Fetch sample tree on mount
  useEffect(() => {
    fetchSampleTree().then((t) => setTree(t));
  }, []);

  // Sync draft params when instrument changes
  useEffect(() => {
    if (sp) setDraft(sp);
  }, [selectedId, sp?.gain, sp?.speed, sp?.attack, sp?.release, sp?.pan, sp?.cutoff, sp?.resonance, sp?.begin, sp?.end, sp?.rootNote]);

  // Derive waveform URL for the currently assigned sample.
  // sampleName is the superdough key (e.g. 'name_ts'); samplePath is the original
  // key path (e.g. '__imported__/name_ts' or 'Folder/clap.wav'). Check both so
  // imported samples (cs.key = '__imported__/...') are found correctly.
  useEffect(() => {
    if (!targetInst?.sampleName) { setWaveformUrl(null); return; }
    const cs = customSamples.find(
      (c) => c.key === targetInst.sampleName || c.key === targetInst.samplePath
    );
    if (cs) {
      setWaveformUrl(cs.url); // blob URL — WaveformView detects and uses directly
    } else if (targetInst.samplePath) {
      setWaveformUrl(targetInst.samplePath); // full relative path, works for any folder depth
    } else {
      const resolved = ALIAS_PATHS[targetInst.sampleName] ?? targetInst.sampleName;
      setWaveformUrl(resolved);
    }
  }, [targetInst?.sampleName, targetInst?.samplePath, customSamples]);

  // Stop preview on unmount
  useEffect(() => () => { stopPreview(); }, []);

  // Build flat list of visible entries (built-in tree + imported group)
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

    if (customSamples.length > 0) {
      const importedFolder: SampleEntry = {
        name: 'Imported',
        path: '__imported__',
        type: 'folder',
        children: customSamples.map((cs) => ({ name: cs.name, path: cs.key, type: 'file' as const })),
      };
      walk([importedFolder], 0);
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
        if (e.type === 'file' && e.name.toLowerCase().includes(q)) {
          matches.push({ entry: e, depth: 0 });
        }
        if (e.type === 'folder' && e.children) walk(e.children);
      }
    };
    walk(tree);
    for (const cs of customSamples) {
      if (cs.name.toLowerCase().includes(q)) {
        matches.push({ entry: { name: cs.name, path: cs.key, type: 'file' as const }, depth: 0 });
      }
    }
    return matches;
  }, [searchQuery, tree, customSamples]);

  const displayList = searchResults ?? visible;

  const toggleFolder = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handlePreview = (key: string) => {
    if (previewingUrl === key) {
      stopPreview();
      setPreviewingUrl(null);
    } else {
      // Imported samples: key is '__imported__/...' — look up the actual blob URL
      const cs = customSamples.find((c) => c.key === key);
      const resolvedUrl = cs ? cs.url : key;
      previewSample(resolvedUrl);
      setPreviewingUrl(key);
    }
  };

  const handleAssign = (entry: SampleEntry) => {
    if (!selectedId || entry.type !== 'file') return;
    const displayName = entry.name.replace(/\.[^.]+$/, '');
    assignSample(selectedId, entry.path, displayName);
    const cs = customSamples.find((c) => c.key === entry.path);
    // Pass relative path (no base) so WaveformView can resolve it consistently
    setWaveformUrl(cs ? cs.url : entry.path);
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    for (const file of files) {
      const url = URL.createObjectURL(file);
      const name = file.name.replace(/\.[^.]+$/, '');
      const key = `__imported__/${name}_${Date.now()}`;
      addCustomSample({ key, url, name });
    }
    e.target.value = '';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.min(focusIdx + 1, displayList.length - 1);
      setFocusIdx(next);
      const item = displayList[next];
      if (item?.entry.type === 'file') handlePreview(item.entry.path);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.max(focusIdx - 1, 0);
      setFocusIdx(next);
      const item = displayList[next];
      if (item?.entry.type === 'file') handlePreview(item.entry.path);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const item = displayList[focusIdx];
      if (item?.entry.type === 'file') handleAssign(item.entry);
      else if (item?.entry.type === 'folder') toggleFolder(item.entry.path);
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const item = displayList[focusIdx];
      if (item?.entry.type === 'folder' && !expanded.has(item.entry.path)) toggleFolder(item.entry.path);
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const item = displayList[focusIdx];
      if (item?.entry.type === 'folder' && expanded.has(item.entry.path)) toggleFolder(item.entry.path);
      return;
    }
  };

  if (!targetInst) return null;

  const color = targetInst.color;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="sample-bank bg-bg-secondary border-l border-border flex flex-col shrink-0 h-full min-h-0 outline-none overflow-hidden w-full"
    >
      {/* Target instrument indicator + collapse */}
      <div className="flex items-center justify-between text-[9px] text-text-secondary px-4 pt-3 pb-1.5 shrink-0">
        <div>
          <span className="text-text-secondary/60">target: </span>
          <span style={{ color }}>{targetInst.name}</span>
        </div>
        <button
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expand sampler' : 'Collapse sampler'}
          className="flex-shrink-0 p-1 hover:bg-white/10 rounded transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"
            className="text-text-secondary/60 hover:text-text-primary transition-colors"
            style={{ transform: `rotate(${collapsed ? 180 : 0}deg)`, transition: 'transform 0.2s' }}>
            <polyline points="3 10 7 6 11 10" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Waveform — shows previewed file while browsing, otherwise the assigned sample */}
      {!collapsed && (previewingUrl || waveformUrl) && (() => {
        // Resolve the URL to display: preview takes priority over assigned sample
        const previewCs = previewingUrl
          ? customSamples.find((c) => c.key === previewingUrl)
          : null;
        const displayUrl = previewCs
          ? previewCs.url                // imported preview → blob URL
          : (previewingUrl ?? waveformUrl!); // built-in preview path or assigned url
        return (
          <div className="px-4 pb-2 shrink-0">
            <WaveformView
              sampleUrl={displayUrl}
              begin={!previewingUrl ? (draft?.begin ?? 0) : 0}
              end={!previewingUrl ? (draft?.end ?? 1) : 1}
              attack={!previewingUrl ? (draft?.attack ?? 0) : 0}
              release={!previewingUrl ? (draft?.release ?? 0) : 0}
              color={color}
              onRegionChange={!previewingUrl && selectedId
                ? (b, e) => {
                  setDraft(d => ({...d, begin: b, end: e}));
                  updateSamplerParams(selectedId, { begin: b, end: e });
                }
                : undefined
              }
            />
          </div>
        );
      })()}

      {/* Sample parameters */}
      {sp && selectedId && !collapsed && (
        <div className="px-4 py-3 border-b border-border/50 shrink-0">
          <div className="flex gap-2 justify-around mb-3">
            <Knob label="A" value={draft.attack} min={0} max={2} step={0.01} decimals={3} unit="s" color={color}
              onChange={(v) => setDraft(d => ({...d, attack: v}))}
              onDragEnd={(v) => updateSamplerParams(selectedId, { attack: v })} />
            <Knob label="R" value={draft.release} min={0} max={2} step={0.01} decimals={3} unit="s" color={color}
              onChange={(v) => setDraft(d => ({...d, release: v}))}
              onDragEnd={(v) => updateSamplerParams(selectedId, { release: v })} />
            <Knob label="Vol" value={draft.gain} min={0} max={1} decimals={2} color={color}
              onChange={(v) => setDraft(d => ({...d, gain: v}))}
              onDragEnd={(v) => updateSamplerParams(selectedId, { gain: v })} />
            <Knob label="Pan" value={draft.pan} min={-1} max={1} decimals={2} color={color}
              onChange={(v) => setDraft(d => ({...d, pan: v}))}
              onDragEnd={(v) => updateSamplerParams(selectedId, { pan: v })} />
          </div>
          <div className="flex gap-2 justify-around">
            <Knob label="Cutoff" value={draft.cutoff} min={20} max={20000} step={10} decimals={0} unit="Hz" color={color}
              onChange={(v) => setDraft(d => ({...d, cutoff: v}))}
              onDragEnd={(v) => updateSamplerParams(selectedId, { cutoff: v })} />
            <Knob label="Res" value={draft.resonance} min={0} max={50} decimals={1} color={color}
              onChange={(v) => setDraft(d => ({...d, resonance: v}))}
              onDragEnd={(v) => updateSamplerParams(selectedId, { resonance: v })} />
            <Knob label="Speed" value={draft.speed} min={0.1} max={4} decimals={2} color={color}
              onChange={(v) => setDraft(d => ({...d, speed: v}))}
              onDragEnd={(v) => updateSamplerParams(selectedId, { speed: v })} />
            {/* Root Note */}
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[8px] text-text-secondary uppercase tracking-wider">Root</span>
              <select
                value={draft.rootNote ?? 60}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setDraft(d => ({...d, rootNote: val}));
                  updateSamplerParams(selectedId, { rootNote: val });
                }}
                className="bg-bg-tertiary text-text-primary text-[8px] rounded px-1 py-0.5 border border-border
                           cursor-pointer mt-9"
                style={{ width: 40 }}
              >
                {Array.from({ length: 128 }, (_, i) => (
                  <option key={i} value={i}>{midiToLabel(i)}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Header — Sample Bank title + Import */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 shrink-0">
        <span className="text-[10px] text-text-secondary uppercase tracking-wider font-medium">
          Sample Bank
        </span>
        <label
          htmlFor={fileInputId}
          className="flex items-center gap-1.5 text-[9px] px-2 py-0.5 rounded border border-border hover:border-white/20
                     text-text-secondary hover:text-text-primary cursor-pointer transition-colors"
          title="Import audio files"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
            <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
            <line x1="7" y1="4" x2="7" y2="10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <line x1="4" y1="7" x2="10" y2="7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          Import
          <input
            id={fileInputId}
            type="file"
            accept=".wav,.mp3,.ogg,.flac,.aiff"
            multiple
            className="hidden"
            onChange={handleFileImport}
          />
        </label>
      </div>

      {/* Search */}
      <div className="px-4 py-2 border-b border-border/50 shrink-0">
        <input
          type="text"
          placeholder="Search samples…"
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setFocusIdx(-1); }}
          className="w-full bg-bg-tertiary border border-border rounded px-2 py-1
                     text-[11px] text-text-primary placeholder-text-secondary/40
                     outline-none focus:border-white/20 transition-colors"
        />
      </div>

      {/* File tree */}
      <div className="flex-1 overflow-y-auto px-0 min-h-0">
        {displayList.map(({ entry, depth }, idx) => {
          const isFocused = idx === focusIdx;
          const isFolder = entry.type === 'folder';
          const isExpanded = expanded.has(entry.path);
          // Derive the sdKey the same way registerSampleForPlayback does —
          // strips folder, extension, and sanitizes — so subfolder samples match.
          const entryKey = entry.path.split('/').pop()
            ?.replace(/\.[^.]+$/, '')
            .replace(/[^a-zA-Z0-9_-]/g, '_') ?? '';
          const isCurrentSample =
            targetInst.sampleName === entry.path ||           // exact path match
            ALIAS_PATHS[targetInst.sampleName] === entry.path || // built-in alias
            (entryKey !== '' && targetInst.sampleName === entryKey); // sdKey match (subfolder files)
          const isImportedItem = entry.path.startsWith('__imported__/');

          return (
            <div
              key={entry.path}
              className={`flex items-center gap-1 rounded cursor-pointer transition-colors
                ${isFocused ? 'bg-white/10' : 'hover:bg-white/5'}`}
              style={{ paddingLeft: depth * 16 + 6, paddingRight: 6, paddingTop: 4, paddingBottom: 4 }}
              onClick={() => {
                setFocusIdx(idx);
                if (isFolder) toggleFolder(entry.path);
              }}
              onDoubleClick={() => { if (!isFolder) handleAssign(entry); }}
            >
              {isFolder ? (
                <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"
                  className="text-text-secondary/60 shrink-0 transition-transform"
                  style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                  <path d="M2 1 L6 4 L2 7 Z" />
                </svg>
              ) : (
                /* Circled + assign button at the start of the row */
                <button
                  onClick={(e) => { e.stopPropagation(); handleAssign(entry); }}
                  className="shrink-0 rounded-full transition-colors text-text-secondary/40 hover:text-accent"
                  title="Assign to instrument"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" className="shrink-0">
                    <circle cx="7" cy="7" r="5.5" strokeWidth="1" />
                    <line x1="7" y1="4.5" x2="7" y2="9.5" strokeWidth="1.2" strokeLinecap="round" />
                    <line x1="4.5" y1="7" x2="9.5" y2="7" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                </button>
              )}

              {/* Active sample dot */}
              {isCurrentSample && (
                <div
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
              )}

              {/* Name */}
              <span
                className={`text-[11px] truncate flex-1 ${isFolder ? 'text-text-secondary' : 'text-text-primary'}`}
                style={isCurrentSample ? { color } : undefined}
              >
                {isFolder ? entry.name : entry.name.replace(/\.[^.]+$/, '')}
              </span>

              {!isFolder && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); handlePreview(entry.path); }}
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
                  {isImportedItem && (
                    <button
                      onClick={(e) => { e.stopPropagation(); removeCustomSample(entry.path); }}
                      className="shrink-0 p-0.5 rounded transition-colors text-text-secondary/30 hover:text-red-400"
                      title="Remove imported sample"
                    >
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <line x1="1" y1="1" x2="7" y2="7" />
                        <line x1="7" y1="1" x2="1" y2="7" />
                      </svg>
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}

        {displayList.length === 0 && (
          searchQuery.trim()
            ? <div className="text-[10px] text-text-secondary/50 text-center py-8">No samples match &ldquo;{searchQuery}&rdquo;</div>
            : <div className="text-[10px] text-text-secondary/50 text-center py-8">
                No samples found.<br />
                <span className="text-[9px]">Drop samples in /samples/ or use + Import</span>
              </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-4 py-2 border-t border-border/50 text-[8px] text-text-secondary/40 text-center shrink-0">
        arrows to browse &middot; enter to assign &middot; double-click to assign
      </div>
    </div>
  );
}
