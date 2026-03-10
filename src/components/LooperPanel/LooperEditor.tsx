import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from '../../state/store';
import { LooperToolbar } from './LooperToolbar';

export function LooperEditor() {
  const selectedId = useStore((s) => s.selectedInstrumentId);
  const instruments = useStore((s) => s.instruments);
  const instrument = instruments.find((i) => i.id === selectedId);
  const editor = useStore((s) => selectedId ? s.looperEditors[selectedId] : undefined);
  const instrumentProgress = useStore((s) => selectedId ? s.instrumentProgress[selectedId] ?? 0 : 0);
  const isPlaying = useStore((s) => s.isPlaying);

  const setLooperSelection = useStore((s) => s.setLooperSelection);
  const setLooperZoom = useStore((s) => s.setLooperZoom);
  const setHitPosition = useStore((s) => s.setHitPosition);
  const looperCut = useStore((s) => s.looperCut);
  const looperCopy = useStore((s) => s.looperCopy);
  const looperPaste = useStore((s) => s.looperPaste);
  const looperDelete = useStore((s) => s.looperDelete);
  const looperUndo = useStore((s) => s.looperUndo);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const dragRef = useRef<{ type: 'select' | 'marker'; startNorm: number; markerIdx?: number } | null>(null);

  const [sensitivity, setSensitivity] = useState(0.5);

  const color = instrument?.color ?? '#7dd3fc';
  const viewStart = editor?.viewStart ?? 0;
  const viewEnd = editor?.viewEnd ?? 1;
  const viewRange = viewEnd - viewStart;

  // Convert canvas x to normalized position [0..1] in the full buffer
  const xToNorm = useCallback((clientX: number): number => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const localX = (clientX - rect.left) / rect.width;
    return viewStart + localX * viewRange;
  }, [viewStart, viewRange]);

  // Draw waveform + markers + selection + playhead
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Use CSS pixel dimensions (not device pixels) since ctx is already scaled by DPR
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#0d0d18';
    ctx.fillRect(0, 0, width, height);

    if (!editor?.peaks || !instrument) {
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(
        editor?.audioBuffer ? 'Processing...' : 'No loop loaded — select a loop from the browser',
        width / 2, height / 2,
      );
      return;
    }

    const peaks = editor.peaks;
    const mid = height / 2;

    // Beat grid lines (16th subdivisions)
    const loopSize = instrument.loopSize;
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let step = 0; step <= loopSize; step++) {
      const norm = step / loopSize;
      if (norm < viewStart || norm > viewEnd) continue;
      const x = ((norm - viewStart) / viewRange) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();

      // Beat lines (every 4 steps) are brighter
      if (step % 4 === 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      }
    }

    // Selection highlight
    const selStart = editor.selectionStart;
    const selEnd = editor.selectionEnd;
    if (selStart != null && selEnd != null) {
      const sx = ((Math.min(selStart, selEnd) - viewStart) / viewRange) * width;
      const ex = ((Math.max(selStart, selEnd) - viewStart) / viewRange) * width;
      ctx.fillStyle = `${color}20`;
      ctx.fillRect(sx, 0, ex - sx, height);
    }

    // Waveform bars
    const barW = Math.max(1, width / peaks.length * (1 / viewRange));
    for (let i = 0; i < peaks.length; i++) {
      const norm = i / peaks.length;
      if (norm < viewStart - 0.01 || norm > viewEnd + 0.01) continue;
      const x = ((norm - viewStart) / viewRange) * width;
      const amp = peaks[i] * mid * 0.9;
      const inSelection = selStart != null && selEnd != null &&
        norm >= Math.min(selStart, selEnd) && norm <= Math.max(selStart, selEnd);
      ctx.fillStyle = inSelection ? color : `${color}88`;
      ctx.fillRect(x, mid - amp, barW, amp * 2 || 1);
    }

    // Center line
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(width, mid);
    ctx.stroke();

    // Marker lines (hitPositions)
    const hitPositions = instrument.hitPositions;
    for (let i = 0; i < hitPositions.length; i++) {
      const norm = hitPositions[i];
      if (norm < viewStart || norm > viewEnd) continue;
      const x = ((norm - viewStart) / viewRange) * width;

      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.setLineDash([]);

      // Marker handle
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.moveTo(x - 5, 0);
      ctx.lineTo(x + 5, 0);
      ctx.lineTo(x, 8);
      ctx.closePath();
      ctx.fill();

      // Index label
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${i + 1}`, x, height - 3);
    }

    // Playhead
    if (isPlaying) {
      const playNorm = instrumentProgress;
      if (playNorm >= viewStart && playNorm <= viewEnd) {
        const px = ((playNorm - viewStart) / viewRange) * width;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, height);
        ctx.stroke();
      }
    }
  }, [editor, instrument, color, viewStart, viewRange, viewEnd, isPlaying, instrumentProgress]);

  // Animation loop for playhead
  useEffect(() => {
    if (!isPlaying) {
      draw();
      return;
    }
    const animate = () => {
      draw();
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, draw]);

  // Redraw on non-playing state changes
  useEffect(() => {
    if (!isPlaying) draw();
  }, [draw, isPlaying]);

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth * (window.devicePixelRatio || 1);
      canvas.height = canvas.offsetHeight * (window.devicePixelRatio || 1);
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
      draw();
    });
    ro.observe(canvas);
    canvas.width = canvas.offsetWidth * (window.devicePixelRatio || 1);
    canvas.height = canvas.offsetHeight * (window.devicePixelRatio || 1);
    return () => ro.disconnect();
  }, [draw]);

  // Mouse down: start selection or marker drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!selectedId || !instrument) return;
    const norm = xToNorm(e.clientX);

    // Check if clicking near a marker
    const hitPositions = instrument.hitPositions;
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      for (let i = 0; i < hitPositions.length; i++) {
        const markerX = ((hitPositions[i] - viewStart) / viewRange) * rect.width;
        const clickX = e.clientX - rect.left;
        if (Math.abs(clickX - markerX) < 8) {
          dragRef.current = { type: 'marker', startNorm: norm, markerIdx: i };
          return;
        }
      }
    }

    // Start selection
    dragRef.current = { type: 'select', startNorm: norm };
    setLooperSelection(selectedId, norm, norm);
  }, [selectedId, instrument, xToNorm, viewStart, viewRange, setLooperSelection]);

  // Global mouse move/up
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!dragRef.current || !selectedId) return;
      const norm = xToNorm(e.clientX);

      if (dragRef.current.type === 'select') {
        setLooperSelection(selectedId, dragRef.current.startNorm, norm);
      } else if (dragRef.current.type === 'marker' && dragRef.current.markerIdx != null) {
        setHitPosition(selectedId, dragRef.current.markerIdx, norm);
      }
    };
    const handleUp = () => {
      if (dragRef.current?.type === 'select' && selectedId) {
        // Normalize selection order
        const editor = useStore.getState().looperEditors[selectedId];
        if (editor?.selectionStart != null && editor?.selectionEnd != null) {
          const s = Math.min(editor.selectionStart, editor.selectionEnd);
          const e = Math.max(editor.selectionStart, editor.selectionEnd);
          if (e - s < 0.002) {
            // Click without drag = clear selection
            setLooperSelection(selectedId, null, null);
          } else {
            setLooperSelection(selectedId, s, e);
          }
        }
      }
      dragRef.current = null;
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [selectedId, xToNorm, setLooperSelection, setHitPosition]);

  // Mouse wheel: zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!selectedId) return;
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseNorm = xToNorm(e.clientX);
    const zoomFactor = e.deltaY > 0 ? 1.15 : 0.87;
    const newRange = Math.min(1, Math.max(0.02, viewRange * zoomFactor));

    // Zoom toward mouse position
    const mouseRatio = (e.clientX - rect.left) / rect.width;
    let newStart = mouseNorm - mouseRatio * newRange;
    let newEnd = newStart + newRange;

    // Clamp
    if (newStart < 0) { newEnd -= newStart; newStart = 0; }
    if (newEnd > 1) { newStart -= (newEnd - 1); newEnd = 1; }
    newStart = Math.max(0, newStart);
    newEnd = Math.min(1, newEnd);

    setLooperZoom(selectedId, newStart, newEnd);
  }, [selectedId, xToNorm, viewRange, setLooperZoom]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!selectedId) return;
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case 'x': e.preventDefault(); looperCut(selectedId); break;
        case 'c': e.preventDefault(); looperCopy(selectedId); break;
        case 'v': e.preventDefault(); looperPaste(selectedId); break;
        case 'z': e.preventDefault(); looperUndo(selectedId); break;
      }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      looperDelete(selectedId);
    }
  }, [selectedId, looperCut, looperCopy, looperPaste, looperDelete, looperUndo]);

  if (!instrument || instrument.type !== 'looper' || !selectedId) return null;

  return (
    <div
      className="flex-1 flex flex-col bg-bg min-w-0 h-full outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <LooperToolbar
        instrumentId={selectedId}
        color={color}
        sensitivity={sensitivity}
        onSensitivityChange={setSensitivity}
      />
      <div ref={containerRef} className="flex-1 relative min-h-0" onWheel={handleWheel}>
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ cursor: dragRef.current?.type === 'marker' ? 'ew-resize' : 'crosshair' }}
          onMouseDown={handleMouseDown}
        />
      </div>
    </div>
  );
}
