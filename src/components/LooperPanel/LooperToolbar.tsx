import { useState, useCallback } from 'react';
import { useStore } from '../../state/store';

/** Tiny inline knob for toolbar use (20×20px) */
function MiniKnob({ value, min, max, step, color, onChange, title }: {
  value: number; min: number; max: number; step: number; color: string;
  onChange: (v: number) => void; title?: string;
}) {
  const norm = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const angleDeg = -135 + norm * 270;
  const rad = (angleDeg * Math.PI) / 180;
  const lx = Math.sin(rad) * 0.55;
  const ly = -Math.cos(rad) * 0.55;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startVal = value;
    const range = max - min;
    const onMove = (ev: MouseEvent) => {
      const dy = startY - ev.clientY;
      const raw = Math.max(min, Math.min(max, startVal + (dy / 100) * range));
      onChange(Math.round(raw / step) * step);
    };
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [value, min, max, step, onChange]);

  return (
    <svg width="20" height="20" viewBox="-1 -1 2 2" onMouseDown={handleMouseDown}
      style={{ cursor: 'ns-resize', display: 'block' }} title={title}>
      <circle cx="0" cy="0" r="0.72" fill="none" stroke={color} strokeWidth="0.12" opacity="0.5" />
      <line x1="0" y1="0" x2={lx} y2={ly} stroke={color} strokeWidth="0.16" strokeLinecap="round" />
    </svg>
  );
}

interface LooperToolbarProps {
  instrumentId: string;
  color: string;
  sensitivity: number;
  onSensitivityChange: (v: number) => void;
}

export function LooperToolbar({ instrumentId, color, sensitivity, onSensitivityChange }: LooperToolbarProps) {
  const editor = useStore((s) => s.looperEditors[instrumentId]);
  const instrument = useStore((s) => s.instruments.find((i) => i.id === instrumentId));
  const looperCut = useStore((s) => s.looperCut);
  const looperCopy = useStore((s) => s.looperCopy);
  const looperPaste = useStore((s) => s.looperPaste);
  const looperTrim = useStore((s) => s.looperTrim);
  const looperDelete = useStore((s) => s.looperDelete);
  const looperSilence = useStore((s) => s.looperSilence);
  const looperUndo = useStore((s) => s.looperUndo);
  const redetectTransients = useStore((s) => s.redetectTransients);
  const setLooperLoop = useStore((s) => s.setLooperLoop);
  const setLooperPeakResolution = useStore((s) => s.setLooperPeakResolution);
  const setDetectedBpm = useStore((s) => s.setDetectedBpm);
  const setLooperBpmMultiplier = useStore((s) => s.setLooperBpmMultiplier);
  const updateLooperParams = useStore((s) => s.updateLooperParams);

  const [editingBpm, setEditingBpm] = useState(false);
  const [bpmInput, setBpmInput] = useState('');

  const hasSelection = editor?.selectionStart != null && editor?.selectionEnd != null;
  const hasClipboard = !!editor?.clipboard;
  const hasUndo = (editor?.undoStack.length ?? 0) > 0;
  const hasLoop = editor != null && (editor.loopIn > 0 || editor.loopOut < 1);
  const peakRes = editor?.peakResolution ?? 512;

  const detectedBpm = instrument?.detectedBpm ?? 0;
  const bpmMultiplier = instrument?.bpmMultiplier ?? 1;
  const isReversed = instrument?.looperParams?.reverse ?? false;

  const btnClass = (enabled: boolean) =>
    `px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider rounded transition-colors ${
      enabled
        ? 'text-text-primary hover:bg-white/10 cursor-pointer'
        : 'text-text-secondary/30 cursor-default'
    }`;

  const handleSetLoop = () => {
    if (!hasSelection || !editor) return;
    const s = Math.min(editor.selectionStart!, editor.selectionEnd!);
    const e = Math.max(editor.selectionStart!, editor.selectionEnd!);
    setLooperLoop(instrumentId, s, e);
  };

  const handleClearLoop = () => {
    setLooperLoop(instrumentId, 0, 1);
  };

  const handleBpmClick = () => {
    setEditingBpm(true);
    setBpmInput(detectedBpm > 0 ? detectedBpm.toFixed(0) : '');
  };

  const handleBpmSubmit = () => {
    const val = parseFloat(bpmInput);
    if (val >= 30 && val <= 300) {
      setDetectedBpm(instrumentId, val);
      // Recalculate with current multiplier
      setLooperBpmMultiplier(instrumentId, bpmMultiplier);
    }
    setEditingBpm(false);
  };

  const handleBpmKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleBpmSubmit();
    if (e.key === 'Escape') setEditingBpm(false);
  };

  const handleReverse = () => {
    updateLooperParams(instrumentId, { reverse: !isReversed });
  };

  const mulBtnClass = (mul: number) =>
    `px-1.5 py-0.5 text-[9px] font-medium rounded transition-colors cursor-pointer ${
      bpmMultiplier === mul
        ? 'bg-cyan-500/20 text-cyan-400'
        : 'text-text-secondary/60 hover:bg-white/10 hover:text-text-primary'
    }`;

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border/50 shrink-0 bg-bg-secondary">
      <button className={btnClass(hasSelection)} disabled={!hasSelection}
        onClick={() => hasSelection && looperCut(instrumentId)} title="Cut (Ctrl+X)">
        Cut
      </button>
      <button className={btnClass(hasSelection)} disabled={!hasSelection}
        onClick={() => hasSelection && looperCopy(instrumentId)} title="Copy (Ctrl+C)">
        Copy
      </button>
      <button className={btnClass(hasClipboard)} disabled={!hasClipboard}
        onClick={() => hasClipboard && looperPaste(instrumentId)} title="Paste (Ctrl+V)">
        Paste
      </button>
      <button className={btnClass(hasSelection)} disabled={!hasSelection}
        onClick={() => hasSelection && looperTrim(instrumentId)} title="Trim to selection">
        Trim
      </button>
      <button className={btnClass(hasSelection)} disabled={!hasSelection}
        onClick={() => hasSelection && looperDelete(instrumentId)} title="Delete selection and close gap (Del)">
        Delete
      </button>
      <button className={btnClass(hasSelection)} disabled={!hasSelection}
        onClick={() => hasSelection && looperSilence(instrumentId)} title="Silence selection, keep gap (Shift+Del)">
        Silence
      </button>

      <div className="w-px h-4 bg-border/40 mx-1" />

      <button className={btnClass(hasUndo)} disabled={!hasUndo}
        onClick={() => hasUndo && looperUndo(instrumentId)} title="Undo (Ctrl+Z)">
        Undo
      </button>

      <div className="w-px h-4 bg-border/40 mx-1" />

      {/* Reverse toggle */}
      <button
        className={`px-2 py-1 text-[10px] font-medium uppercase tracking-wider rounded transition-colors cursor-pointer ${
          isReversed ? 'bg-cyan-500/20 text-cyan-400' : 'text-text-primary hover:bg-white/10'
        }`}
        onClick={handleReverse}
        title="Reverse playback"
      >
        Rev
      </button>

      <div className="w-px h-4 bg-border/40 mx-1" />

      {/* Loop in/out */}
      <button
        className={`px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider rounded transition-colors ${
          hasSelection
            ? hasLoop ? 'text-amber-400 hover:bg-amber-500/10 cursor-pointer' : 'text-text-primary hover:bg-white/10 cursor-pointer'
            : 'text-text-secondary/30 cursor-default'
        }`}
        disabled={!hasSelection}
        onClick={handleSetLoop}
        title="Set loop in/out from selection"
      >
        Loop
      </button>
      {hasLoop && (
        <button
          className="px-1.5 py-1 text-[10px] font-medium text-amber-400/70 hover:text-amber-400 hover:bg-amber-500/10 rounded transition-colors cursor-pointer"
          onClick={handleClearLoop}
          title="Clear loop region"
        >
          ×
        </button>
      )}

      <div className="w-px h-4 bg-border/40 mx-1" />

      {/* BPM display + half/double time */}
      <span className="text-[9px] text-text-secondary/60 uppercase tracking-wider">BPM</span>
      {editingBpm ? (
        <input
          type="number"
          min={30} max={300}
          value={bpmInput}
          onChange={(e) => setBpmInput(e.target.value)}
          onBlur={handleBpmSubmit}
          onKeyDown={handleBpmKeyDown}
          autoFocus
          className="w-12 h-5 text-[10px] font-mono text-center bg-bg-primary border border-border rounded px-1 text-text-primary outline-none focus:border-cyan-500"
        />
      ) : (
        <button
          className={`px-1.5 py-0.5 text-[10px] font-mono rounded transition-colors cursor-pointer ${
            detectedBpm > 0 ? 'text-cyan-400 hover:bg-cyan-500/10' : 'text-text-secondary/40 hover:bg-white/10'
          }`}
          onClick={handleBpmClick}
          title={detectedBpm > 0 ? `Detected BPM: ${detectedBpm.toFixed(1)} — click to override` : 'No BPM detected — click to set manually'}
        >
          {detectedBpm > 0 ? detectedBpm.toFixed(0) : '—'}
        </button>
      )}
      <div className="flex items-center gap-0.5 ml-0.5">
        <button className={mulBtnClass(2)} onClick={() => setLooperBpmMultiplier(instrumentId, 2)} title="Half-time (double loop length)">÷2</button>
        <button className={mulBtnClass(1)} onClick={() => setLooperBpmMultiplier(instrumentId, 1)} title="Normal">1×</button>
        <button className={mulBtnClass(0.5)} onClick={() => setLooperBpmMultiplier(instrumentId, 0.5)} title="Double-time (halve loop length)">×2</button>
      </div>

      <div className="w-px h-4 bg-border/40 mx-1" />

      {/* Sensitivity slider */}
      <span className="text-[9px] text-text-secondary/60 uppercase tracking-wider ml-1">Sens</span>
      <input
        type="range"
        min={0} max={1} step={0.05}
        value={sensitivity}
        onChange={(e) => onSensitivityChange(parseFloat(e.target.value))}
        onMouseUp={() => redetectTransients(instrumentId, sensitivity)}
        className="inst-slider w-16 h-4"
        style={{ '--slider-color': color } as React.CSSProperties}
      />
      <span className="text-[9px] text-text-secondary/50 font-mono w-6">{(sensitivity * 100).toFixed(0)}%</span>

      <div className="w-px h-4 bg-border/40 mx-1" />

      {/* Wave resolution knob */}
      <span className="text-[9px] text-text-secondary/60 uppercase tracking-wider">Res</span>
      <MiniKnob value={peakRes} min={256} max={2048} step={128} color={color}
        onChange={(v) => setLooperPeakResolution(instrumentId, v)}
        title={`Waveform resolution: ${peakRes}`} />
      <span className="text-[9px] text-text-secondary/50 font-mono w-8">{peakRes}</span>
    </div>
  );
}
