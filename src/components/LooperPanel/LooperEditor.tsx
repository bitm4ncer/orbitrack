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
  const drawRef = useRef<() => void>(() => {});

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

  // ── Main draw function ──
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Ensure correct DPR transform before every draw
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

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
    const regionSize = loopOut - loopIn;
    const loopSize = instrument.loopSize;
    const stepsPerBeat = Math.round(loopSize / 4);

    // ── Beat grid lines ──
    for (let step = 0; step <= loopSize; step++) {
      const norm = step / loopSize;
      if (norm < viewStart || norm > viewEnd) continue;
      const x = ((norm - viewStart) / viewRange) * width;
      const isBar = step > 0 && step % loopSize === 0;
      const isBeat = step % stepsPerBeat === 0;

      if (isBar) {
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
        const barNum = Math.floor(step / loopSize) + 1;
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '9px monospace';
        ctx.fillText(String(barNum), x + 3, 10);
      } else if (isBeat) {
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      }
    }

    // ── Loop region dimming (outside loop is darkened) ──
    if (hasLoop) {
      const inX = ((loopIn - viewStart) / viewRange) * width;
      const outX = ((loopOut - viewStart) / viewRange) * width;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      if (inX > 0) ctx.fillRect(0, 0, Math.max(0, inX), height);
      if (outX < width) ctx.fillRect(Math.min(width, outX), 0, width - Math.min(width, outX), height);
    }

    // ── Selection highlight ──
    const selStart = editor.selectionStart;
    const selEnd = editor.selectionEnd;
    if (selStart != null && selEnd != null) {
      const sx = ((Math.min(selStart, selEnd) - viewStart) / viewRange) * width;
      const ex = ((Math.max(selStart, selEnd) - viewStart) / viewRange) * width;
      ctx.fillStyle = `${color}20`;
      ctx.fillRect(sx, 0, ex - sx, height);
    }

    // ── Clipboard region indicator ──
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

    // ── Build warp map: map buffer positions to grid positions per slice ──
    const hitPositions = [...instrument.hitPositions].sort((a: number, b: number) => a - b);
    const transientTails = editor.transientTails ?? [];
    const barW = Math.max(1, width / peaks.length * (1 / viewRange));

    // Build slice mappings: for each slice, define buffer range → grid range
    type SliceMap = { bufStart: number; bufEnd: number; gridStart: number; gridEnd: number };
    const slices: SliceMap[] = [];

    if (hitPositions.length > 0) {
      for (let si = 0; si < hitPositions.length; si++) {
        const bufStart = hitPositions[si];
        // Tail end: use detected tail or next hit, whichever is sooner
        const nextHit = si + 1 < hitPositions.length ? hitPositions[si + 1] : 1;
        const tail = si < transientTails.length ? Math.min(transientTails[si], nextHit) : nextHit;
        const bufEnd = tail;

        // Grid positions: where this hit snaps to on the grid
        const gridStart = Math.round(hitPositions[si] * loopSize) / loopSize;
        const gridEnd = si + 1 < hitPositions.length
          ? Math.round(hitPositions[si + 1] * loopSize) / loopSize
          : 1;

        slices.push({ bufStart, bufEnd, gridStart, gridEnd });
      }
    }

    // ── Ghost waveform (unwarped, very faint — shows original buffer layout) ──
    if (slices.length > 0) {
      for (let i = 0; i < peaks.length; i++) {
        const norm = i / peaks.length;
        if (norm < viewStart - 0.01 || norm > viewEnd + 0.01) continue;
        const x = ((norm - viewStart) / viewRange) * width;
        const amp = peaks[i] * mid * 0.9;
        const outsideLoop = hasLoop && (norm < loopIn || norm > loopOut);
        ctx.fillStyle = outsideLoop ? `${color}0a` : `${color}18`;
        ctx.fillRect(x, mid - amp, barW, amp * 2 || 1);
      }
    }

    // ── Warped waveform bars (main — peaks mapped from buffer to grid positions) ──
    if (slices.length > 0) {
      for (const slice of slices) {
        const bufRange = slice.bufEnd - slice.bufStart;
        const gridRange = slice.gridEnd - slice.gridStart;
        if (bufRange <= 0 || gridRange <= 0) continue;
        const stretchRatio = gridRange / bufRange;

        // Color shift for extreme stretching
        const isStretched = stretchRatio > 1.5;
        const isCompressed = stretchRatio < 0.6;

        const peakStart = Math.floor(slice.bufStart * peaks.length);
        const peakEnd = Math.ceil(slice.bufEnd * peaks.length);

        for (let p = peakStart; p < peakEnd && p < peaks.length; p++) {
          const bufNorm = p / peaks.length;
          // Map from buffer space to grid space
          const fraction = (bufNorm - slice.bufStart) / bufRange;
          const warpedNorm = slice.gridStart + fraction * gridRange;

          if (warpedNorm < viewStart - 0.01 || warpedNorm > viewEnd + 0.01) continue;
          const x = ((warpedNorm - viewStart) / viewRange) * width;
          const amp = peaks[p] * mid * 0.9;

          const outsideLoop = hasLoop && (bufNorm < loopIn || bufNorm > loopOut);
          const inSelection = selStart != null && selEnd != null &&
            bufNorm >= Math.min(selStart, selEnd) && bufNorm <= Math.max(selStart, selEnd);

          if (outsideLoop) {
            ctx.fillStyle = `${color}22`;
          } else if (inSelection) {
            ctx.fillStyle = color;
          } else if (isStretched) {
            ctx.fillStyle = `${color}70`; // slightly dimmer when heavily stretched
          } else if (isCompressed) {
            ctx.fillStyle = `${color}aa`; // brighter when compressed
          } else {
            ctx.fillStyle = `${color}88`;
          }
          ctx.fillRect(x, mid - amp, barW, amp * 2 || 1);
        }

        // Draw gap indicator (dotted) if tail ends before next grid slot
        const tailGridNorm = slice.gridStart + ((slice.bufEnd - slice.bufStart) / bufRange) * gridRange;
        if (tailGridNorm < slice.gridEnd - 0.005) {
          const gapStartX = ((tailGridNorm - viewStart) / viewRange) * width;
          const gapEndX = ((slice.gridEnd - viewStart) / viewRange) * width;
          if (gapEndX > 0 && gapStartX < width) {
            ctx.strokeStyle = `${color}20`;
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 4]);
            ctx.beginPath();
            ctx.moveTo(Math.max(0, gapStartX), mid);
            ctx.lineTo(Math.min(width, gapEndX), mid);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      }
    } else {
      // No hit positions — draw unwarped waveform normally
      for (let i = 0; i < peaks.length; i++) {
        const norm = i / peaks.length;
        if (norm < viewStart - 0.01 || norm > viewEnd + 0.01) continue;
        const x = ((norm - viewStart) / viewRange) * width;
        const amp = peaks[i] * mid * 0.9;
        const outsideLoop = hasLoop && (norm < loopIn || norm > loopOut);
        ctx.fillStyle = outsideLoop ? `${color}22` : `${color}88`;
        ctx.fillRect(x, mid - amp, barW, amp * 2 || 1);
      }
    }

    // ── Tiled ghost waveform (show loop region repeated outside its boundaries) ──
    if (hasLoop && regionSize > 0.01) {
      const regionPeakStart = Math.floor(loopIn * peaks.length);
      const regionPeakEnd = Math.ceil(loopOut * peaks.length);
      const regionPeakCount = regionPeakEnd - regionPeakStart;

      if (regionPeakCount > 0) {
        const maxTiles = Math.min(20, Math.ceil(1 / regionSize) + 1);
        for (let t = -maxTiles; t <= maxTiles; t++) {
          if (t === 0) continue;
          const offset = t * regionSize;
          for (let p = 0; p < regionPeakCount; p++) {
            const srcIdx = regionPeakStart + p;
            if (srcIdx < 0 || srcIdx >= peaks.length) continue;
            const ghostNorm = srcIdx / peaks.length + offset;
            if (ghostNorm < 0 || ghostNorm > 1) continue;
            if (ghostNorm < viewStart - 0.01 || ghostNorm > viewEnd + 0.01) continue;
            const x = ((ghostNorm - viewStart) / viewRange) * width;
            const amp = peaks[srcIdx] * mid * 0.9;
            ctx.fillStyle = `${color}15`;
            ctx.fillRect(x, mid - amp, barW, amp * 2 || 1);
          }
        }
      }
    }

    // ── Center line ──
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(width, mid); ctx.stroke();

    // ── Tile boundary lines (show where each loop repetition starts) ──
    if (hasLoop && regionSize > 0.01) {
      const maxTiles = Math.min(20, Math.ceil(1 / regionSize) + 1);
      for (let t = -maxTiles; t <= maxTiles; t++) {
        if (t === 0) continue;
        const boundary = loopIn + t * regionSize;
        if (boundary <= 0.001 || boundary >= 0.999) continue;
        // Skip boundaries that overlap with loop markers
        if (Math.abs(boundary - loopIn) < 0.002 || Math.abs(boundary - loopOut) < 0.002) continue;
        if (boundary < viewStart || boundary > viewEnd) continue;
        const x = ((boundary - viewStart) / viewRange) * width;
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.12)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 5]);
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
        ctx.setLineDash([]);
        // Tile repetition number
        const tileNum = t > 0 ? t + 1 : t;
        ctx.fillStyle = 'rgba(34, 211, 238, 0.2)';
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`×${Math.abs(tileNum)}`, x, height - 3);
      }
    }

    // ── Active slice highlight during playback ──
    if (isPlaying && hasLoop) {
      const playNorm = instrumentProgress;
      const hitPositions = instrument.hitPositions;
      const loopHits = hitPositions
        .filter((h: number) => h >= loopIn - 0.001 && h <= loopOut + 0.001)
        .sort((a: number, b: number) => a - b);

      if (loopHits.length > 0) {
        // Find which slice the playhead is in
        let sliceStart = loopIn;
        let sliceEnd = loopHits.length > 0 ? loopHits[0] : loopOut;
        for (let i = 0; i < loopHits.length; i++) {
          if (playNorm >= loopHits[i] - 0.001) {
            sliceStart = loopHits[i];
            sliceEnd = i + 1 < loopHits.length ? loopHits[i + 1] : loopOut;
          }
        }

        // Draw active slice glow
        const sx = ((sliceStart - viewStart) / viewRange) * width;
        const ex = ((sliceEnd - viewStart) / viewRange) * width;
        if (ex > 0 && sx < width) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
          ctx.fillRect(Math.max(0, sx), 0, Math.min(width, ex) - Math.max(0, sx), height);
          // Top accent bar for active slice
          ctx.fillStyle = `${color}50`;
          ctx.fillRect(Math.max(0, sx), 0, Math.min(width, ex) - Math.max(0, sx), 2);
        }
      }
    }

    // ── Loop in/out markers ──
    if (hasLoop) {
      const drawLoopMarker = (norm: number, label: string, isIn: boolean) => {
        if (norm < viewStart || norm > viewEnd) return;
        const x = ((norm - viewStart) / viewRange) * width;

        // Vertical line
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();

        // Bracket handle at top
        ctx.fillStyle = '#22d3ee';
        ctx.beginPath();
        if (isIn) {
          ctx.moveTo(x, 0); ctx.lineTo(x + 10, 0); ctx.lineTo(x, HANDLE_ZONE_HEIGHT);
        } else {
          ctx.moveTo(x, 0); ctx.lineTo(x - 10, 0); ctx.lineTo(x, HANDLE_ZONE_HEIGHT);
        }
        ctx.closePath();
        ctx.fill();

        // Label at bottom
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#22d3ee';
        ctx.fillText(label, x, height - 3);
      };
      drawLoopMarker(loopIn, 'I', true);
      drawLoopMarker(loopOut, 'O', false);

      // Loop region top/bottom accent lines
      const inX = Math.max(0, ((loopIn - viewStart) / viewRange) * width);
      const outX = Math.min(width, ((loopOut - viewStart) / viewRange) * width);
      if (outX > inX) {
        ctx.fillStyle = 'rgba(34, 211, 238, 0.15)';
        ctx.fillRect(inX, 0, outX - inX, 1);
        ctx.fillRect(inX, height - 1, outX - inX, 1);
      }
    }

    // ── Hit position markers (original) ──
    const markerPositions = instrument.hitPositions;
    for (let i = 0; i < markerPositions.length; i++) {
      const norm = markerPositions[i];
      if (norm < viewStart || norm > viewEnd) continue;
      const x = ((norm - viewStart) / viewRange) * width;
      // Dim markers outside loop region
      const outsideLoop = hasLoop && (norm < loopIn - 0.001 || norm > loopOut + 0.001);
      const alpha = outsideLoop ? '40' : 'cc';
      ctx.strokeStyle = `#f59e0b${alpha}`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      ctx.setLineDash([]);
      // Handle triangle
      ctx.fillStyle = `#f59e0b${alpha}`;
      ctx.beginPath();
      ctx.moveTo(x - 5, 0); ctx.lineTo(x + 5, 0); ctx.lineTo(x, 8);
      ctx.closePath();
      ctx.fill();
      // Number label
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${i + 1}`, x, height - 3);
    }

    // ── Ghost hit markers (tiled repetitions) ──
    if (hasLoop && regionSize > 0.01) {
      const loopHits = hitPositions.filter((h: number) => h >= loopIn - 0.001 && h <= loopOut + 0.001);
      const maxTiles = Math.min(20, Math.ceil(1 / regionSize) + 1);
      for (let t = -maxTiles; t <= maxTiles; t++) {
        if (t === 0) continue;
        const offset = t * regionSize;
        for (const hp of loopHits) {
          const ghostNorm = hp + offset;
          if (ghostNorm < 0 || ghostNorm > 1) continue;
          if (ghostNorm < viewStart || ghostNorm > viewEnd) continue;
          const x = ((ghostNorm - viewStart) / viewRange) * width;
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.18)';
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 4]);
          ctx.beginPath(); ctx.moveTo(x, HANDLE_ZONE_HEIGHT); ctx.lineTo(x, height); ctx.stroke();
          ctx.setLineDash([]);
          // Small ghost triangle
          ctx.fillStyle = 'rgba(245, 158, 11, 0.18)';
          ctx.beginPath();
          ctx.moveTo(x - 3, HANDLE_ZONE_HEIGHT); ctx.lineTo(x + 3, HANDLE_ZONE_HEIGHT); ctx.lineTo(x, HANDLE_ZONE_HEIGHT + 5);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // ── Cursor position (paste target) ──
    const cursorPos = editor.cursorPosition;
    if (cursorPos != null && cursorPos >= viewStart && cursorPos <= viewEnd) {
      const cx = ((cursorPos - viewStart) / viewRange) * width;
      ctx.strokeStyle = '#a78bfa';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, height); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#a78bfa';
      ctx.beginPath();
      ctx.moveTo(cx, mid - 5); ctx.lineTo(cx + 4, mid); ctx.lineTo(cx, mid + 5); ctx.lineTo(cx - 4, mid);
      ctx.closePath();
      ctx.fill();
    }

    // ── Playhead ──
    if (isPlaying) {
      const playNorm = instrumentProgress;
      if (playNorm >= viewStart && playNorm <= viewEnd) {
        const px = ((playNorm - viewStart) / viewRange) * width;
        // Playhead glow
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, height); ctx.stroke();
        // Playhead line
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, height); ctx.stroke();
        // Playhead triangle at top
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(px - 4, 0); ctx.lineTo(px + 4, 0); ctx.lineTo(px, 6);
        ctx.closePath();
        ctx.fill();
      }
    }

    // ── Info overlay: loop region size ──
    if (hasLoop) {
      const regionSteps = Math.round(regionSize * loopSize);
      const regionBeats = (regionSteps / stepsPerBeat).toFixed(1);
      ctx.fillStyle = 'rgba(34, 211, 238, 0.4)';
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      const inX = ((loopIn - viewStart) / viewRange) * width;
      if (inX > 0 && inX < width - 60) {
        ctx.fillText(`${regionBeats} beats`, inX + 4, HANDLE_ZONE_HEIGHT + 10);
      }
    }
  }, [editor, instrument, color, viewStart, viewRange, viewEnd, isPlaying, instrumentProgress]);

  // Keep drawRef in sync
  drawRef.current = draw;

  // ── Resize observer (stable — does NOT depend on draw) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleResize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(canvas.offsetWidth * dpr);
      canvas.height = Math.round(canvas.offsetHeight * dpr);
      drawRef.current();
    };

    const ro = new ResizeObserver(handleResize);
    ro.observe(canvas);
    handleResize(); // initial setup
    return () => ro.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Redraw on state changes (when not playing) ──
  useEffect(() => {
    if (!isPlaying) draw();
  }, [draw, isPlaying]);

  // ── Animation loop during playback ──
  useEffect(() => {
    if (!isPlaying) return;
    const animate = () => {
      draw();
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, draw]);

  // ── Mouse down: markers only from handle zone, otherwise start selection ──
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

    // Start selection — snap to nearest marker if click is close
    let startNorm = norm;
    const snapPositions = instrument.hitPositions;
    for (const hp of snapPositions) {
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

  // ── Global mouse move/up ──
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

  // ── Mouse wheel: zoom ──
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

  // ── Keyboard shortcuts ──
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
