import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../state/store';
import { PASTEL_COLORS } from '../../canvas/colors';
import { getOrbitAnalyser } from '../../audio/orbitEffects';
import type { Instrument } from '../../types/instrument';

// ── Knob28 ──────────────────────────────────────────────────────────────────

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

// ── VerticalVU ──────────────────────────────────────────────────────────────

const DB_FLOOR = -48;
const VU_GRID_DB = [0, -6, -12, -18, -24, -36, -48];

function VerticalVU({ orbitIndex, color }: { orbitIndex: number; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ level: 0, peak: 0, peakHold: 0 });
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Sync canvas resolution to container
      const parent = canvas.parentElement;
      if (parent) {
        const pw = parent.clientWidth;
        const ph = parent.clientHeight;
        if (canvas.width !== pw || canvas.height !== ph) {
          canvas.width = pw;
          canvas.height = ph;
        }
      }
      const W = canvas.width;
      const H = canvas.height;
      if (W === 0 || H === 0) return;

      ctx.clearRect(0, 0, W, H);

      // Read orbit analyser
      const analyser = getOrbitAnalyser(orbitIndex);
      const s = stateRef.current;
      if (analyser) {
        const buf = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        const db = rms > 0 ? Math.max(DB_FLOOR, 20 * Math.log10(rms)) : DB_FLOOR;
        const lvl = (db - DB_FLOOR) / -DB_FLOOR;
        if (lvl > s.level) s.level = lvl;
        else s.level = Math.max(0, s.level - 0.02);
        if (lvl > s.peak) { s.peak = lvl; s.peakHold = 120; }
        else if (s.peakHold > 0) s.peakHold--;
        else s.peak = Math.max(0, s.peak - 0.003);
      }

      // dB grid lines
      for (const db of VU_GRID_DB) {
        const t = (db - DB_FLOOR) / -DB_FLOOR;
        const y = Math.round(H * (1 - t)) + 0.5;
        ctx.strokeStyle = db === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      // Gradient level bar (bottom = quiet, top = loud) — same stops as VUMeter.tsx
      if (s.level > 0.001) {
        const grad = ctx.createLinearGradient(0, H, 0, 0);
        grad.addColorStop(0,    '#16a34a');
        grad.addColorStop(0.55, '#22c55e');
        grad.addColorStop(0.75, '#f59e0b');
        grad.addColorStop(0.88, '#f97316');
        grad.addColorStop(1.0,  '#ef4444');
        ctx.fillStyle = grad;
        const yTop = H * (1 - s.level);
        ctx.fillRect(0, yTop, W, H - yTop);
      }

      // Peak hold line
      if (s.peak > 0.002) {
        const py = Math.round(H * (1 - s.peak));
        ctx.fillStyle = s.peak > 0.93 ? '#ff5555' : color;
        ctx.fillRect(0, py, W, 2);
      }

      // dB labels
      ctx.font = '6.5px monospace';
      ctx.textAlign = 'left';
      for (const db of [0, -12, -24, -48]) {
        const t = (db - DB_FLOOR) / -DB_FLOOR;
        const y = H * (1 - t);
        ctx.fillStyle = 'rgba(255,255,255,0.30)';
        ctx.fillText(db === 0 ? ' 0' : String(db), 2, y - 2);
      }
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [orbitIndex, color]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  );
}

// ── VerticalFader ────────────────────────────────────────────────────────────

const FADER_MIN = -20;
const FADER_MAX = 20;

function VerticalFader({ value, color, onChange }: {
  value: number; color: string; onChange: (v: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const norm = (value - FADER_MIN) / (FADER_MAX - FADER_MIN); // 0=bottom, 1=top
  const handleTop = `calc(${(1 - norm) * 100}% - 7px)`;

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();

    const onMove = (ev: MouseEvent) => {
      const relY = ev.clientY - rect.top;
      const n = Math.max(0, Math.min(1, 1 - relY / rect.height));
      onChange(Math.max(FADER_MIN, Math.min(FADER_MAX, Math.round(FADER_MIN + n * (FADER_MAX - FADER_MIN)))));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div
      ref={trackRef}
      className="relative w-full h-full select-none cursor-ns-resize"
      onMouseDown={startDrag}
    >
      {/* Track groove */}
      <div className="absolute rounded-full" style={{
        left: '50%', transform: 'translateX(-50%)',
        width: 3, top: 6, bottom: 6,
        background: 'rgba(255,255,255,0.06)',
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)',
      }} />
      {/* Fill: from bottom to handle */}
      <div className="absolute rounded-full" style={{
        left: '50%', transform: 'translateX(-50%)',
        width: 3,
        top: `calc(${(1 - norm) * 100}%)`,
        bottom: 6,
        background: `${color}45`,
      }} />
      {/* 0 dB notch */}
      <div className="absolute" style={{
        left: '22%', right: '22%', height: 1,
        top: '50%', transform: 'translateY(-50%)',
        background: 'rgba(255,255,255,0.28)',
      }} />
      {/* Handle */}
      <div className="absolute rounded" style={{
        left: '12%', right: '12%',
        height: 14,
        top: handleTop,
        background: `linear-gradient(160deg, ${color}f0 0%, ${color}88 100%)`,
        boxShadow: `0 2px 10px ${color}55, 0 1px 3px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.18)`,
        border: '1px solid rgba(255,255,255,0.12)',
      }} />
    </div>
  );
}

// ── ChannelStrip ─────────────────────────────────────────────────────────────

function ChannelStrip({ inst, selectedId }: { inst: Instrument; selectedId: string | null }) {
  const isSelected = inst.id === selectedId;
  const v = inst.volume;
  const volLabel = v === 0 ? '0 dB' : `${v > 0 ? '+' : ''}${v} dB`;

  return (
    <div
      onClick={() => useStore.getState().selectInstrument(inst.id)}
      className="flex flex-col shrink-0 cursor-pointer transition-colors"
      style={{
        width: 58,
        borderRight: '1px solid rgba(255,255,255,0.045)',
        background: isSelected ? `${inst.color}09` : 'transparent',
        borderTop: isSelected ? `1px solid ${inst.color}55` : '1px solid transparent',
      }}
    >
      {/* Channel name */}
      <div className="px-1 pt-2 pb-1 flex items-center justify-center">
        <span
          className="text-[9px] font-medium block w-full text-center truncate leading-tight"
          style={{ color: inst.muted ? '#444' : inst.color, letterSpacing: '0.01em' }}
          title={inst.name}
        >
          {inst.name}
        </span>
      </div>

      {/* VU + Fader (fills available height) */}
      <div className="flex flex-row flex-1 min-h-0 gap-0.5 px-1.5 pb-0.5">
        {/* VU meter */}
        <div
          className="flex-1 min-w-0 rounded-sm overflow-hidden"
          style={{ background: 'rgba(0,0,0,0.35)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)' }}
        >
          <VerticalVU orbitIndex={inst.orbitIndex} color={inst.color} />
        </div>
        {/* Fader */}
        <div className="shrink-0" style={{ width: 18 }}>
          <VerticalFader
            value={inst.volume}
            color={inst.color}
            onChange={(v) => useStore.getState().updateInstrument(inst.id, { volume: v })}
          />
        </div>
      </div>

      {/* Gain value */}
      <div className="text-center py-0.5" style={{ pointerEvents: 'none' }}>
        <span
          className="text-[8px] font-mono tabular-nums"
          style={{ color: v === 0 ? 'rgba(255,255,255,0.22)' : `${inst.color}bb` }}
        >
          {volLabel}
        </span>
      </div>

      {/* Mute + Solo */}
      <div
        className="flex items-center justify-center gap-2 pt-0.5"
        style={{ paddingBottom: 10 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={(e) => { e.stopPropagation(); useStore.getState().toggleMute(inst.id); }}
          className="w-[11px] h-[11px] rounded-full shrink-0 transition-all hover:scale-125 cursor-pointer"
          style={{
            backgroundColor: inst.muted ? '#3a3a3a' : inst.color,
            boxShadow: inst.muted ? 'none' : `0 0 4px ${inst.color}60`,
            border: `1px solid ${inst.muted ? '#555' : inst.color}`,
          }}
          title={inst.muted ? 'Unmute' : 'Mute'}
        />
        <button
          onClick={(e) => { e.stopPropagation(); useStore.getState().toggleSolo(inst.id); }}
          className="w-[11px] h-[11px] rounded-full border border-white/20 flex items-center justify-center shrink-0 transition-all hover:opacity-90 cursor-pointer"
          style={{
            background: inst.solo ? '#ffd700' : inst.color,
            opacity: inst.solo ? 1 : 0.32,
            boxShadow: inst.solo ? '0 0 6px #ffd70070' : 'none',
          }}
          title={inst.solo ? 'Unsolo' : 'Solo'}
        >
          <span className="text-[7px] font-bold text-black/70 leading-none select-none">S</span>
        </button>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function createId(): string {
  return Math.random().toString(36).slice(2, 9);
}

// ── InstrumentRack ───────────────────────────────────────────────────────────

export function InstrumentRack() {
  const instruments = useStore((s) => s.instruments);
  const selectedId = useStore((s) => s.selectedInstrumentId);
  const dragIdx = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [levelMode, setLevelMode] = useState(false);

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
    if (store.selectedInstrumentId === id) store.selectInstrument(null);
  };

  return (
    <div
      className="layers-sidebar bg-bg-secondary border-l border-border flex flex-col shrink-0 h-full"
      style={{ padding: 20, width: 300 }}
    >
      {/* Header */}
      <div className="layers-header px-4 py-3 border-b border-border/50 flex items-center" style={{ margin: '0 -20px 20px' }}>
        <span className="text-[10px] text-text-secondary uppercase tracking-wider font-medium flex-1 pl-1">Layers</span>
        <div className="flex items-center gap-0.5 pr-1">
          {/* Card view toggle */}
          <button
            onClick={() => setLevelMode(false)}
            className="p-1.5 rounded transition-all cursor-pointer"
            style={{
              color: !levelMode ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.22)',
              background: !levelMode ? 'rgba(255,255,255,0.09)' : 'transparent',
            }}
            title="Card view"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="1.5" width="11" height="3.5" rx="0.8" />
              <rect x="1" y="8" width="11" height="3.5" rx="0.8" />
            </svg>
          </button>
          {/* Mixer view toggle */}
          <button
            onClick={() => setLevelMode(true)}
            className="p-1.5 rounded transition-all cursor-pointer"
            style={{
              color: levelMode ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.22)',
              background: levelMode ? 'rgba(255,255,255,0.09)' : 'transparent',
            }}
            title="Mixer view"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor" stroke="none">
              <rect x="0.5" y="0.5" width="2.5" height="12" rx="0.6" opacity="0.25" />
              <rect x="5.25" y="0.5" width="2.5" height="12" rx="0.6" opacity="0.25" />
              <rect x="10" y="0.5" width="2.5" height="12" rx="0.6" opacity="0.25" />
              <rect x="0.5" y="7" width="2.5" height="3" rx="0.4" />
              <rect x="5.25" y="4" width="2.5" height="3" rx="0.4" />
              <rect x="10" y="8.5" width="2.5" height="3" rx="0.4" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Level / Mixer Mode ── */}
      {levelMode ? (
        <div
          className="flex-1 flex flex-row overflow-x-auto overflow-y-hidden min-h-0"
          style={{ margin: '0 -20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
        >
          {instruments.map((inst) => (
            <ChannelStrip key={inst.id} inst={inst} selectedId={selectedId} />
          ))}
        </div>
      ) : (
        /* ── Card Mode ── */
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
                          ${selectedId === inst.id ? 'layer-selected bg-white/5' : 'hover:bg-white/[0.03]'}
                          ${dragOverIdx === index ? 'opacity-50' : ''}`}
              style={{ border: `1px solid ${inst.color}`, padding: 22, marginBottom: 10 }}
            >
              {/* Top-right: remove + drag handle */}
              <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5">
                <button
                  onClick={(e) => { e.stopPropagation(); removeInstrument(inst.id); }}
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
                  onDragStart={(e) => { dragIdx.current = index; e.dataTransfer.effectAllowed = 'move'; }}
                  className="layer-drag-handle cursor-grab active:cursor-grabbing p-1 rounded hover:bg-white/10 transition-colors"
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

              {/* Row 1: mute, name, type, solo */}
              <div className="layer-header flex items-center gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); useStore.getState().toggleMute(inst.id); }}
                  className="layer-mute-btn w-3 h-3 rounded-full shrink-0 transition-all hover:scale-125 border border-transparent hover:border-white/20 cursor-pointer"
                  style={{ backgroundColor: inst.muted ? '#555' : inst.color }}
                  title={inst.muted ? 'Unmute' : 'Mute'}
                />
                <span className="layer-name text-[11px] text-text-primary truncate flex-1">{inst.name}</span>
                <span className="layer-type text-[9px] text-text-secondary shrink-0">{inst.type}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); useStore.getState().toggleSolo(inst.id); }}
                  className="w-[14px] h-[14px] rounded-full border border-white/20 flex items-center justify-center shrink-0 transition-all hover:opacity-90 cursor-pointer"
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
      )}

      {/* Add buttons */}
      <div className="layers-add-bar flex items-center gap-2 px-3 py-3 border-t border-border/50" style={{ margin: '0 -20px' }}>
        <button
          onClick={addSynth}
          style={{ padding: '3px 10px' }}
          className="add-synth-btn text-[10px] rounded border border-border hover:border-white/20 text-text-secondary hover:text-text-primary transition-colors flex-1"
        >
          + Synth
        </button>
        <button
          onClick={addSampler}
          style={{ padding: '3px 10px' }}
          className="add-sampler-btn text-[10px] rounded border border-border hover:border-white/20 text-text-secondary hover:text-text-primary transition-colors flex-1"
        >
          + Sampler
        </button>
      </div>
    </div>
  );
}
