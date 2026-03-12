import { useState, useCallback, useEffect, useRef } from 'react';
import { useStore } from '../../state/store';
import { getCaptureDuration, getInputLevel } from '../../audio/audioInput';

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
      style={{ cursor: 'ns-resize', display: 'block' }}>
      {title && <title>{title}</title>}
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
  const updateLooperParams = useStore((s) => s.updateLooperParams);

  const hasSelection = editor?.selectionStart != null && editor?.selectionEnd != null;
  const hasClipboard = !!editor?.clipboard;
  const hasUndo = (editor?.undoStack.length ?? 0) > 0;
  const hasLoop = editor != null && (editor.loopIn > 0 || editor.loopOut < 1);
  const peakRes = editor?.peakResolution ?? 512;

  const isReversed = instrument?.looperParams?.reverse ?? false;
  const isStretchToSteps = instrument?.looperParams?.stretchToSteps ?? false;

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

  const handleReverse = () => {
    updateLooperParams(instrumentId, { reverse: !isReversed });
  };

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

      {/* Stretch to Steps toggle */}
      <button
        className={`px-2 py-1 text-[10px] font-medium uppercase tracking-wider rounded transition-colors cursor-pointer ${
          isStretchToSteps ? 'bg-cyan-500/20 text-cyan-400' : 'text-text-primary hover:bg-white/10'
        }`}
        onClick={() => updateLooperParams(instrumentId, { stretchToSteps: !isStretchToSteps })}
        title="Stretch slices to fill grid slots (time-warp)"
      >
        Stretch
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

      <div className="w-px h-4 bg-border/40 mx-1" />

      {/* Record audio input */}
      <RecordInputButton instrumentId={instrumentId} />
    </div>
  );
}

/** Thin 2px horizontal level meter for audio input */
function InputLevelMeter() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const gradientRef = useRef<CanvasGradient | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      const dB = getInputLevel();
      const level = Math.max(0, (dB + 48) / 48);

      // Cache gradient
      if (!gradientRef.current) {
        const g = ctx.createLinearGradient(0, 0, w, 0);
        g.addColorStop(0, '#16a34a');
        g.addColorStop(0.55, '#22c55e');
        g.addColorStop(0.75, '#f59e0b');
        g.addColorStop(0.88, '#f97316');
        g.addColorStop(1, '#ef4444');
        gradientRef.current = g;
      }

      ctx.clearRect(0, 0, w, h);
      const fillW = level * w;
      if (fillW > 0) {
        ctx.fillStyle = gradientRef.current;
        ctx.fillRect(0, 0, fillW, h);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={80}
      height={2}
      className="block"
      style={{ width: 80, height: 2, borderRadius: 1 }}
    />
  );
}

function RecordInputButton({ instrumentId }: { instrumentId: string }) {
  const isCapturingInput = useStore((s) => s.isCapturingInput);
  const startAudioCapture = useStore((s) => s.startAudioCapture);
  const stopAudioCapture = useStore((s) => s.stopAudioCapture);
  const selectInstrument = useStore((s) => s.selectInstrument);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isCapturingInput) { setElapsed(0); return; }
    const id = setInterval(() => setElapsed(getCaptureDuration()), 200);
    return () => clearInterval(id);
  }, [isCapturingInput]);

  const handleClick = () => {
    if (isCapturingInput) {
      stopAudioCapture();
    } else {
      // Select this looper so stopAudioCapture auto-assigns to it
      selectInstrument(instrumentId);
      startAudioCapture();
    }
  };

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={handleClick}
        className={`flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium uppercase tracking-wider rounded transition-colors cursor-pointer ${
          isCapturingInput
            ? 'bg-red-500/20 text-red-400 animate-pulse'
            : 'text-text-primary hover:bg-white/10'
        }`}
        title={isCapturingInput ? 'Stop recording input' : 'Record from audio input (uses default mic if no device selected in Settings)'}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
        </svg>
        {isCapturingInput ? 'Stop' : 'Rec'}
      </button>
      {isCapturingInput && (
        <span className="text-[9px] font-mono text-red-400">{formatTime(elapsed)}</span>
      )}
      {isCapturingInput && <InputLevelMeter />}
    </div>
  );
}
