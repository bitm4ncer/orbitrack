import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from '../../state/store';
import { LooperToolbar } from './LooperToolbar';

const HANDLE_ZONE_HEIGHT = 14; // only top 14px is the drag handle for markers

export function LooperEditor() {
  const selectedId = useStore((s) => s.selectedInstrumentId);
  const instruments = useStore((s) => s.instruments);
  const instrument = instruments.find((i) => i.id === selectedId);
  const editor = useStore((s) => selectedId ? s.looperEditors[selectedId] : undefined);
  const instrumentProgress = useStore((s) => selectedId ? s.instrumentProgress[selectedId] ?? 0 : 0);
  const isPlaying = useStore((s) => s.isPlaying);

  const setLooperSelection = useStore((s) => s.setLooperSelection);
  const setLooperZoom = useStore((s) => s.setLooperZoom);
  const setLooperCursor = useStore((s) => s.setLooperCursor);
  const setHitPosition = useStore((s) => s.setHitPosition);
  const looperCut = useStore((s) => s.looperCut);
  const looperCopy = useStore((s) => s.looperCopy);
  const looperPaste = useStore((s) => s.looperPaste);
  const looperDelete = useStore((s) => s.looperDelete);
  const looperSilence = useStore((s) => s.looperSilence);
  const looperUndo = useStore((s) => s.looperUndo);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const dragRef = useRef<{ type: 'select' | 'marker' | 'loopIn' | 'loopOut'; startNorm: number; markerIdx?: number } | null>(null);

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

  // Draw waveform + markers + selection + playhead + loop region + cursor + clipboard
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
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
    const loopIn = editor.loopIn ?? 0;
    const loopOut = editor.loopOut ?? 1;
    const hasLoop = loopIn > 0 || loopOut < 1;

    // Loop region background tint (dimmed outside loop)
    if (hasLoop) {
      const inX = ((loopIn - viewStart) / viewRange) * width;
      const outX = ((loopOut - viewStart) / viewRange) * width;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      if (inX > 0) ctx.fillRect(0, 0, Math.max(0, inX), height);
      if (outX < width) ctx.fillRect(Math.min(width, outX), 0, width - Math.min(width, outX), height);
    }

    // Beat grid lines (16th subdivisions) + bar markers
    const loopSize = instrument.loopSize;
    for (let step = 0; step <= loopSize; step++) {
      const norm = step / loopSize;
      if (norm < viewStart || norm > viewEnd) continue;
      const x = ((norm - viewStart) / viewRange) * width;

      const isBar = step % 16 === 0;
      const isBeat = step % 4 === 0;

      if (isBar) {
        // Bar boundary: thicker, brighter line + bar number label
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
        // Bar number
        const barNum = Math.floor(step / 16) + 1;
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '9px monospace';
        ctx.fillText(String(barNum), x + 3, 10);
      } else if (isBeat) {
        // Beat boundary: medium brightness
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      } else {
        // 16th subdivision: faint
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
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

    // Clipboard source region indicator (dashed outline + faint tint)
    const clipStart = editor.clipboardStart;
    const clipEnd = editor.clipboardEnd;
    if (clipStart != null && clipEnd != null && editor.clipboard) {
      const csX = ((clipStart - viewStart) / viewRange) * width;
      const ceX = ((clipEnd - viewStart) / viewRange) * width;
      ctx.fillStyle = `${color}12`;
      ctx.fillRect(csX, 0, ceX - csX, height);
      ctx.strokeStyle = `${color}40`;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(csX, 0, ceX - csX, height);
      ctx.setLineDash([]);
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
      const inClipboard = clipStart != null && clipEnd != null && editor.clipboard &&
        norm >= clipStart && norm <= clipEnd;
      const outsideLoop = hasLoop && (norm < loopIn || norm > loopOut);
      ctx.fillStyle = outsideLoop
        ? `${color}33`
        : inSelection
          ? color
          : inClipboard
            ? `${color}bb`
            : `${color}88`;
      ctx.fillRect(x, mid - amp, barW, amp * 2 || 1);
    }

    // Center line
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(width, mid);
    ctx.stroke();

    // Loop in/out markers
    if (hasLoop) {
      const drawLoopMarker = (norm: number, label: string) => {
        if (norm < viewStart || norm > viewEnd) return;
        const x = ((norm - viewStart) / viewRange) * width;
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
        ctx.fillStyle = '#22d3ee';
        ctx.beginPath();
        if (label === 'I') {
          ctx.moveTo(x, 0); ctx.lineTo(x + 8, 0); ctx.lineTo(x, HANDLE_ZONE_HEIGHT);
        } else {
          ctx.moveTo(x, 0); ctx.lineTo(x - 8, 0); ctx.lineTo(x, HANDLE_ZONE_HEIGHT);
        }
        ctx.closePath();
        ctx.fill();
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#22d3ee';
        ctx.fillText(label, x, height - 3);
      };
      drawLoopMarker(loopIn, 'I');
      drawLoopMarker(loopOut, 'O');
    }

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
      // Marker handle triangle
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.moveTo(x - 5, 0);
      ctx.lineTo(x + 5, 0);
      ctx.lineTo(x, 8);
      ctx.closePath();
      ctx.fill();
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${i + 1}`, x, height - 3);
    }

    // Cursor position (paste target)
    const cursorPos = editor.cursorPosition;
    if (cursorPos != null && cursorPos >= viewStart && cursorPos <= viewEnd) {
      const cx = ((cursorPos - viewStart) / viewRange) * width;
      ctx.strokeStyle = '#a78bfa';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, height);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#a78bfa';
      ctx.beginPath();
      ctx.moveTo(cx, mid - 5);
      ctx.lineTo(cx + 4, mid);
      ctx.lineTo(cx, mid + 5);
      ctx.lineTo(cx - 4, mid);
      ctx.closePath();
      ctx.fill();
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

  // Mouse down: markers only from handle zone, otherwise start selection (snap to markers)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!selectedId || !instrument || !editor) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const norm = xToNorm(e.clientX);
    const inHandleZone = clickY < HANDLE_ZONE_HEIGHT;

    const loopIn = editor.loopIn ?? 0;
    const loopOut = editor.loopOut ?? 1;
    const hasLoop = loopIn > 0 || loopOut < 1;

    // Only drag markers/loop handles from the triangle handle zone (top ~14px)
    if (inHandleZone) {
      // Check loop in/out markers
      if (hasLoop) {
        const inX = ((loopIn - viewStart) / viewRange) * rect.width;
        const outX = ((loopOut - viewStart) / viewRange) * rect.width;
        if (Math.abs(clickX - inX) < 10) {
          dragRef.current = { type: 'loopIn', startNorm: norm };
          return;
        }
        if (Math.abs(clickX - outX) < 10) {
          dragRef.current = { type: 'loopOut', startNorm: norm };
          return;
        }
      }

      // Check hit position markers
      const hitPositions = instrument.hitPositions;
      for (let i = 0; i < hitPositions.length; i++) {
        const markerX = ((hitPositions[i] - viewStart) / viewRange) * rect.width;
        if (Math.abs(clickX - markerX) < 8) {
          dragRef.current = { type: 'marker', startNorm: norm, markerIdx: i };
          return;
        }
      }
    }

    // Start selection — snap to nearest marker if click is close (guides)
    let startNorm = norm;
    const hitPositions = instrument.hitPositions;
    for (const hp of hitPositions) {
      const markerX = ((hp - viewStart) / viewRange) * rect.width;
      if (Math.abs(clickX - markerX) < 6) {
        startNorm = hp;
        break;
      }
    }
    // Also snap to loop in/out if close
    if (hasLoop) {
      const inX = ((loopIn - viewStart) / viewRange) * rect.width;
      const outX = ((loopOut - viewStart) / viewRange) * rect.width;
      if (Math.abs(clickX - inX) < 6) startNorm = loopIn;
      else if (Math.abs(clickX - outX) < 6) startNorm = loopOut;
    }

    dragRef.current = { type: 'select', startNorm };
    setLooperSelection(selectedId, startNorm, startNorm);
    setLooperCursor(selectedId, null);
  }, [selectedId, instrument, editor, xToNorm, viewStart, viewRange, setLooperSelection, setLooperCursor]);

  // Global mouse move/up
  useEffect(() => {
    const setLooperLoop = useStore.getState().setLooperLoop;

    const handleMove = (e: MouseEvent) => {
      if (!dragRef.current || !selectedId) return;
      const norm = xToNorm(e.clientX);

      if (dragRef.current.type === 'select') {
        setLooperSelection(selectedId, dragRef.current.startNorm, norm);
      } else if (dragRef.current.type === 'marker' && dragRef.current.markerIdx != null) {
        setHitPosition(selectedId, dragRef.current.markerIdx, norm);
      } else if (dragRef.current.type === 'loopIn') {
        const editor = useStore.getState().looperEditors[selectedId];
        const loopOut = editor?.loopOut ?? 1;
        setLooperLoop(selectedId, Math.min(norm, loopOut - 0.005), loopOut);
      } else if (dragRef.current.type === 'loopOut') {
        const editor = useStore.getState().looperEditors[selectedId];
        const loopIn = editor?.loopIn ?? 0;
        setLooperLoop(selectedId, loopIn, Math.max(norm, loopIn + 0.005));
      }
    };
    const handleUp = () => {
      if (dragRef.current?.type === 'select' && selectedId) {
        const editor = useStore.getState().looperEditors[selectedId];
        if (editor?.selectionStart != null && editor?.selectionEnd != null) {
          const s = Math.min(editor.selectionStart, editor.selectionEnd);
          const e = Math.max(editor.selectionStart, editor.selectionEnd);
          if (e - s < 0.002) {
            // Click without drag = set cursor position (for paste target)
            setLooperSelection(selectedId, null, null);
            setLooperCursor(selectedId, s);
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
  }, [selectedId, xToNorm, setLooperSelection, setLooperCursor, setHitPosition]);

  // Mouse wheel: zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!selectedId) return;
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseNorm = xToNorm(e.clientX);
    const zoomFactor = e.deltaY > 0 ? 1.15 : 0.87;
    const newRange = Math.min(1, Math.max(0.02, viewRange * zoomFactor));

    const mouseRatio = (e.clientX - rect.left) / rect.width;
    let newStart = mouseNorm - mouseRatio * newRange;
    let newEnd = newStart + newRange;

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
      if (e.shiftKey) {
        looperSilence(selectedId);
      } else {
        looperDelete(selectedId);
      }
    }
  }, [selectedId, looperCut, looperCopy, looperPaste, looperDelete, looperSilence, looperUndo]);

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
