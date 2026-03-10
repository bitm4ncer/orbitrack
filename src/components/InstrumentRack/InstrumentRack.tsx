import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../state/store';
import { PASTEL_COLORS } from '../../canvas/colors';

function Knob28({ label, value, min, max, step = 1, color, format, onChange }: {
  label: string; value: number; min: number; max: number; step?: number;
  color: string; format?: (v: number) => string; onChange: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const norm = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const angleDeg = -135 + norm * 270;
  const angleRad = (angleDeg * Math.PI) / 180;
  const lx = Math.sin(angleRad) * 0.62;
  const ly = -Math.cos(angleRad) * 0.62;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startVal = value;
    const range = max - min;
    const onMove = (ev: MouseEvent) => {
      const dy = startY - ev.clientY;
      const raw = startVal + Math.round((dy / 80) * range / step) * step;
      onChange(Math.max(min, Math.min(max, raw)));
    };
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const commit = () => {
    const n = parseFloat(inputVal);
    if (!isNaN(n)) onChange(Math.max(min, Math.min(max, Math.round(n / step) * step)));
    setEditing(false);
  };

  useEffect(() => {
    if (editing) { setInputVal(String(value)); inputRef.current?.focus(); inputRef.current?.select(); }
  }, [editing]);

  const displayVal = format ? format(value) : String(value);

  return (
    <div className="flex flex-col items-center gap-0.5 select-none">
      <span className="text-[8px] text-text-secondary uppercase tracking-wider">{label}</span>
      <svg width="28" height="28" viewBox="-1 -1 2 2" onMouseDown={handleMouseDown} style={{ cursor: 'ns-resize' }}>
        <circle cx="0" cy="0" r="0.80" fill="none" stroke={color} strokeWidth="0.10" opacity="0.6" />
        <line x1="0" y1="0" x2={lx} y2={ly} stroke={color} strokeWidth="0.14" strokeLinecap="round" />
      </svg>
      {editing ? (
        <input
          ref={inputRef} type="number" value={inputVal} min={min} max={max} step={step}
          onChange={(e) => setInputVal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
          className="w-10 text-center text-[8px] font-mono bg-bg-tertiary border border-border rounded px-0.5 py-0 text-text-primary outline-none"
          style={{ MozAppearance: 'textfield' } as React.CSSProperties}
        />
      ) : (
        <span className="text-[8px] text-text-secondary font-mono cursor-text hover:text-text-primary transition-colors"
          onClick={() => setEditing(true)} title="Click to enter value">
          {displayVal}
        </span>
      )}
    </div>
  );
}

function createId(): string {
  return Math.random().toString(36).slice(2, 9);
}


export function InstrumentRack() {
  const instruments = useStore((s) => s.instruments);
  const selectedId = useStore((s) => s.selectedInstrumentId);
  const dragIdx = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const addSampler = () => {
    const store = useStore.getState();
    const color = PASTEL_COLORS[store.instruments.length % PASTEL_COLORS.length];
    const newInst = {
      id: createId(),
      name: 'Kick',
      type: 'sampler' as const,
      sampleName: 'kick',
      color,
      hits: 4,
      hitPositions: Array.from({ length: 4 }, (_, i) => i / 4),
      loopSize: 16,
      loopSizeLocked: false,
      muted: false,
      solo: false,
      volume: 0,
      orbitIndex: store.instruments.length,
    };
    store.setInstruments([...store.instruments, newInst]);
    store.selectInstrument(newInst.id);
    store.openSampleBank(newInst.id);
  };

  const addSynth = () => {
    const store = useStore.getState();
    const color = PASTEL_COLORS[store.instruments.length % PASTEL_COLORS.length];
    const loopSize = 16;
    const newInst = {
      id: createId(),
      name: `Synth ${store.instruments.filter((i) => i.type === 'synth').length + 1}`,
      type: 'synth' as const,
      color,
      hits: loopSize,
      hitPositions: Array.from({ length: loopSize }, (_, i) => i / loopSize),
      loopSize,
      loopSizeLocked: false,
      muted: false,
      solo: false,
      volume: 0,
      orbitIndex: store.instruments.length,
    };
    useStore.setState({
      instruments: [...store.instruments, newInst],
      gridNotes: {
        ...store.gridNotes,
        [newInst.id]: Array.from({ length: loopSize }, () => [60]),
      },
    });
    store.selectInstrument(newInst.id);
  };

  const removeInstrument = (id: string) => {
    const store = useStore.getState();
    store.setInstruments(store.instruments.filter((i) => i.id !== id));
    if (store.selectedInstrumentId === id) {
      store.selectInstrument(null);
    }
  };

  return (
    <div className="layers-sidebar bg-bg-secondary border-l border-border flex flex-col shrink-0 h-full" style={{ padding: 20, width: 300 }}>
      {/* Layers header */}
      <div className="layers-header px-4 py-3 border-b border-border/50">
        <span className="text-[10px] text-text-secondary uppercase tracking-wider font-medium">Layers</span>
      </div>

      {/* Instrument list */}
      <div className="layers-list flex-1 flex flex-col overflow-y-auto pb-3">
        {instruments.map((inst, index) => (
          <div
            key={inst.id}
            onDragOver={(e) => { e.preventDefault(); setDragOverIdx(index); }}
            onDragLeave={() => { if (dragOverIdx === index) setDragOverIdx(null); }}
            onDrop={() => {
              if (dragIdx.current !== null && dragIdx.current !== index) {
                const reordered = [...instruments];
                const [moved] = reordered.splice(dragIdx.current, 1);
                reordered.splice(index, 0, moved);
                useStore.getState().setInstruments(reordered);
              }
              dragIdx.current = null;
              setDragOverIdx(null);
            }}
            onDragEnd={() => { dragIdx.current = null; setDragOverIdx(null); }}
            onClick={() => useStore.getState().selectInstrument(inst.id)}
            className={`layer-card layer-${inst.type} flex flex-col gap-2 mx-3 mt-3 rounded cursor-pointer transition-colors relative
                        ${selectedId === inst.id
                          ? 'layer-selected bg-white/5'
                          : 'hover:bg-white/[0.03]'}
                        ${dragOverIdx === index ? 'opacity-50' : ''}`}
            style={{ border: `1px solid ${inst.color}`, padding: 22, marginBottom: 10 }}
          >
            {/* Top-right: remove + drag handle */}
            <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeInstrument(inst.id);
                }}
                className="layer-remove-btn p-1 rounded hover:bg-red-500/20 transition-colors text-white/25 hover:text-red-400"
                title="Remove"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <line x1="2" y1="2" x2="8" y2="8" />
                  <line x1="8" y1="2" x2="2" y2="8" />
                </svg>
              </button>
              <div
                draggable
                onDragStart={(e) => {
                  dragIdx.current = index;
                  e.dataTransfer.effectAllowed = 'move';
                }}
                className="layer-drag-handle cursor-grab active:cursor-grabbing
                           p-1 rounded hover:bg-white/10 transition-colors"
                title="Drag to reorder"
                onClick={(e) => e.stopPropagation()}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="text-white/25">
                  <rect x="1" y="1" width="2" height="2" rx="0.5" />
                  <rect x="5" y="1" width="2" height="2" rx="0.5" />
                  <rect x="1" y="5" width="2" height="2" rx="0.5" />
                  <rect x="5" y="5" width="2" height="2" rx="0.5" />
                </svg>
              </div>
            </div>

            {/* Row 1: mute dot, name, type, solo dot */}
            <div className="layer-header flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  useStore.getState().toggleMute(inst.id);
                }}
                className="layer-mute-btn w-3 h-3 rounded-full shrink-0 transition-all hover:scale-125 border border-transparent hover:border-white/20"
                style={{ backgroundColor: inst.muted ? '#555' : inst.color }}
                title={inst.muted ? 'Unmute' : 'Mute'}
              />
              <span className="layer-name text-[11px] text-text-primary truncate flex-1">{inst.name}</span>
              <span className="layer-type text-[9px] text-text-secondary shrink-0">{inst.type}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  useStore.getState().toggleSolo(inst.id);
                }}
                className="w-[14px] h-[14px] rounded-full border border-white/20 flex items-center justify-center shrink-0 transition-all hover:opacity-90"
                style={{ background: inst.solo ? '#ffd700' : inst.color, opacity: inst.solo ? 0.9 : 0.4 }}
                title={inst.solo ? 'Unsolo' : 'Solo'}
              >
                <span className="text-[8px] font-bold text-black/70 leading-none select-none">S</span>
              </button>
            </div>

            {/* Row 2: steps + hits + gain knobs */}
            <div className="flex items-end justify-between" style={{ pointerEvents: 'none' }}>
              <div className="flex gap-3">
                <div style={{ pointerEvents: 'auto' }}>
                  <Knob28
                    label="steps" value={inst.loopSize} min={1} max={64} color={inst.color}
                    onChange={(v) => useStore.getState().setLoopSize(inst.id, v)}
                  />
                </div>
                <div style={{ pointerEvents: 'auto' }}>
                  <Knob28
                    label="hits" value={inst.hits} min={0} max={inst.loopSize} color={inst.color}
                    onChange={(v) => useStore.getState().setHitCount(inst.id, v)}
                  />
                </div>
              </div>
              <div style={{ pointerEvents: 'auto' }}>
                <Knob28
                  label="gain" value={inst.volume} min={-20} max={20} color={inst.color}
                  format={(v) => `${v > 0 ? '+' : ''}${v}dB`}
                  onChange={(v) => useStore.getState().updateInstrument(inst.id, { volume: v })}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add buttons */}
      <div className="layers-add-bar flex items-center gap-2 px-3 py-3 border-t border-border/50">
        <button
          onClick={addSynth}
          style={{ padding: '3px 10px' }}
          className="add-synth-btn text-[10px] rounded border border-border
                     hover:border-white/20 text-text-secondary hover:text-text-primary transition-colors flex-1"
        >
          + Synth
        </button>

        <button
          onClick={addSampler}
          style={{ padding: '3px 10px' }}
          className="add-sampler-btn text-[10px] rounded border border-border
                     hover:border-white/20 text-text-secondary hover:text-text-primary transition-colors flex-1"
        >
          + Sampler
        </button>
      </div>
    </div>
  );
}
