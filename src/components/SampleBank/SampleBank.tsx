import { useEffect, useRef, useState, useCallback, useId } from 'react';
import { useStore } from '../../state/store';
import { fetchSampleTree, type SampleEntry } from '../../audio/sampleApi';
import { previewSample, stopPreview } from '../../audio/sampler';
import { WaveformView } from './WaveformView';

// MIDI note number → label (C-1 = 0, C4 = 60, C8 = 108)
function midiToLabel(note: number): string {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(note / 12) - 1;
  return noteNames[note % 12] + octave;
}


function Knob({ label, value, min, max, step = 0.001, decimals = 2, unit = '', onChange }: {
  label: string; value: number; min: number; max: number;
  step?: number; decimals?: number; unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[8px] text-text-secondary uppercase tracking-wider">{label}</span>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-0.5 accent-accent cursor-pointer"
        style={{ width: 56 }}
      />
      <span className="text-[8px] text-text-secondary font-mono">
        {value.toFixed(decimals)}{unit}
      </span>
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
  const [previewingUrl, setPreviewingUrl] = useState<string | null>(null);
  const [waveformUrl, setWaveformUrl] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputId = useId();

  // Fetch sample tree on mount
  useEffect(() => {
    fetchSampleTree().then((t) => setTree(t));
  }, []);

  // Show waveform for the currently assigned sample
  useEffect(() => {
    if (!targetInst?.sampleName) { setWaveformUrl(null); return; }
    const cs = customSamples.find((c) => c.key === targetInst.sampleName);
    if (cs) {
      setWaveformUrl(cs.url);
    } else {
      const base = (import.meta.env.BASE_URL as string ?? '/').replace(/\/$/, '');
      setWaveformUrl(base + '/' + targetInst.sampleName);
    }
  }, [targetInst?.sampleName, customSamples]);

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

    // Imported samples group
    if (customSamples.length > 0) {
      const importedFolder: SampleEntry = {
        name: 'Imported',
        path: '__imported__',
        type: 'folder',
        children: customSamples.map((cs) => ({ name: cs.name, path: cs.key, type: 'file' as const })),
      };
      const entries = [importedFolder];
      walk(entries, 0);
    }

    return result;
  }, [tree, expanded, customSamples]);

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
    assignSample(selectedId, entry.path, displayName);
    const cs = customSamples.find((c) => c.key === entry.path);
    setWaveformUrl(cs ? cs.url : (import.meta.env.BASE_URL as string ?? '/').replace(/\/$/, '') + '/' + entry.path);
  };

  // Custom file import
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

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.min(focusIdx + 1, visible.length - 1);
      setFocusIdx(next);
      const item = visible[next];
      if (item?.entry.type === 'file') handlePreview(item.entry.path);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.max(focusIdx - 1, 0);
      setFocusIdx(next);
      const item = visible[next];
      if (item?.entry.type === 'file') handlePreview(item.entry.path);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const item = visible[focusIdx];
      if (item?.entry.type === 'file') handleAssign(item.entry);
      else if (item?.entry.type === 'folder') toggleFolder(item.entry.path);
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const item = visible[focusIdx];
      if (item?.entry.type === 'folder' && !expanded.has(item.entry.path)) toggleFolder(item.entry.path);
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const item = visible[focusIdx];
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
      className="sample-bank bg-bg-secondary border-l border-border flex flex-col shrink-0 min-h-0 outline-none overflow-hidden"
      style={{ width: 300 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-border/50 shrink-0">
        <span className="text-[10px] text-text-secondary uppercase tracking-wider font-medium">
          Sample Bank
        </span>
        <label
          htmlFor={fileInputId}
          className="text-[9px] px-2 py-0.5 rounded border border-border hover:border-white/20
                     text-text-secondary hover:text-text-primary cursor-pointer transition-colors"
          title="Import audio files"
        >
          + Import
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

      {/* Target instrument indicator */}
      <div className="text-[9px] text-text-secondary px-4 py-1.5 shrink-0">
        <span className="text-text-secondary/60">target: </span>
        <span style={{ color }}>{targetInst.name}</span>
        {targetInst.sampleName && (
          <span className="text-text-secondary/40 ml-1">
            · {targetInst.sampleName.split('/').pop()?.replace(/\.[^.]+$/, '') ?? ''}
          </span>
        )}
      </div>

      {/* Waveform */}
      {waveformUrl && (
        <div className="px-4 pb-2 shrink-0">
          <WaveformView
            sampleUrl={waveformUrl}
            begin={sp?.begin ?? 0}
            end={sp?.end ?? 1}
            color={color}
            onRegionChange={selectedId
              ? (b, e) => updateSamplerParams(selectedId, { begin: b, end: e })
              : undefined
            }
          />
        </div>
      )}

      {/* ADSR + Root Note panel */}
      {sp && selectedId && (
        <div className="px-4 pb-3 border-b border-border/50 shrink-0">
          <div className="flex gap-3 justify-between mb-2">
            <Knob label="A" value={sp.attack} min={0} max={2} decimals={3} unit="s"
              onChange={(v) => updateSamplerParams(selectedId, { attack: v })} />
            <Knob label="R" value={sp.release} min={0} max={2} decimals={3} unit="s"
              onChange={(v) => updateSamplerParams(selectedId, { release: v })} />
            <Knob label="Vol" value={sp.gain} min={0} max={1} decimals={2}
              onChange={(v) => updateSamplerParams(selectedId, { gain: v })} />
            <Knob label="Pan" value={sp.pan} min={-1} max={1} decimals={2}
              onChange={(v) => updateSamplerParams(selectedId, { pan: v })} />
          </div>
          <div className="flex gap-3 justify-between">
            <Knob label="Cutoff" value={sp.cutoff} min={20} max={20000} step={10} decimals={0} unit="Hz"
              onChange={(v) => updateSamplerParams(selectedId, { cutoff: v })} />
            <Knob label="Res" value={sp.resonance} min={0} max={50} decimals={1}
              onChange={(v) => updateSamplerParams(selectedId, { resonance: v })} />
            <Knob label="Speed" value={sp.speed} min={0.1} max={4} decimals={2}
              onChange={(v) => updateSamplerParams(selectedId, { speed: v })} />
            {/* Root Note */}
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[8px] text-text-secondary uppercase tracking-wider">Root</span>
              <select
                value={sp.rootNote ?? 60}
                onChange={(e) => updateSamplerParams(selectedId, { rootNote: parseInt(e.target.value) })}
                className="bg-bg-tertiary text-text-primary text-[8px] rounded px-1 py-0.5 border border-border
                           cursor-pointer"
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

      {/* File tree */}
      <div className="flex-1 overflow-y-auto px-0 min-h-0">
        {visible.map(({ entry, depth }, idx) => {
          const isFocused = idx === focusIdx;
          const isFolder = entry.type === 'folder';
          const isExpanded = expanded.has(entry.path);
          const isCurrentSample = targetInst.sampleName === entry.path;
          const isImportedItem = entry.path.startsWith('__imported__/');

          return (
            <div
              key={entry.path}
              className={`flex items-center gap-1 rounded cursor-pointer transition-colors
                ${isFocused ? 'bg-white/10' : 'hover:bg-white/5'}
                ${isCurrentSample ? 'bg-accent/15' : ''}`}
              style={{ paddingLeft: depth * 16 + 6, paddingRight: 6, paddingTop: 4, paddingBottom: 4 }}
              onClick={() => {
                setFocusIdx(idx);
                if (isFolder) toggleFolder(entry.path);
              }}
              onDoubleClick={() => { if (!isFolder) handleAssign(entry); }}
            >
              {/* Folder chevron or file spacer */}
              {isFolder ? (
                <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"
                  className="text-text-secondary/60 shrink-0 transition-transform"
                  style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                  <path d="M2 1 L6 4 L2 7 Z" />
                </svg>
              ) : (
                <div className="w-2 shrink-0" />
              )}

              {/* Name */}
              <span className={`text-[11px] truncate flex-1 ${isFolder ? 'text-text-secondary' : 'text-text-primary'}`}>
                {isFolder ? entry.name : entry.name.replace(/\.[^.]+$/, '')}
              </span>

              {/* File actions */}
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
                  <button
                    onClick={(e) => { e.stopPropagation(); handleAssign(entry); }}
                    className="shrink-0 p-0.5 rounded transition-colors text-text-secondary/40 hover:text-accent"
                    title="Assign to instrument"
                  >
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <line x1="4" y1="1" x2="4" y2="7" />
                      <line x1="1" y1="4" x2="7" y2="4" />
                    </svg>
                  </button>
                  {/* Remove imported sample */}
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

        {tree.length === 0 && customSamples.length === 0 && (
          <div className="text-[10px] text-text-secondary/50 text-center py-8">
            No samples found.<br />
            <span className="text-[9px]">Drop samples in /public/samples/ or use + Import</span>
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
