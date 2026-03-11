import { useRef, useState, useEffect, useCallback } from 'react';
import { useStore } from '../../state/store';
import { noteNameWithOctave, NOTE_NAMES, SCALES, SCALE_KEYS, isNoteInScale } from '../../utils/music';
import { CHORD_PRESETS } from '../../utils/chordPresets';
import { GenerateButton } from './GenerateButton';
import { GenSidebar } from './GenSidebar';
import { useResizable } from '../../hooks/useResizable';

const ROW_H = 20;
const RESIZE_HANDLE_W = 6;

type DragMode = 'move' | 'resize' | null;

interface DragState {
  mode: DragMode;
  hitIndex: number;
  origHitIndex: number;
  midiNote: number;
  startY: number;
  startNote: number;
  startLength: number;
  startX: number;
  colWidth: number;
}

// Selection rectangle in pixel coords relative to the grid body
interface SelectionRect {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

// ── Grid resolution options ─────────────────────────────────────────────────
const GRID_RESOLUTIONS = [
  { label: '1/32', value: 1 },  // 1 column = 1 step = 1/32nd note
  { label: '1/16', value: 2 },  // 1 column = 2 steps = 1/16th note
  { label: '1/8', value: 4 },   // 1 column = 4 steps = 1/8th note
  { label: '1/4', value: 8 },   // 1 column = 8 steps = 1/4 note
] as const;

function getBeatClass(hitIndex: number, _hitCount: number, gridRes: number): string {
  // Alternating group shading: group every `gridRes` columns (1 at 1/16, 2 at 1/8, etc.)
  const groupSize = Math.max(1, gridRes);
  const groupIndex = Math.floor(hitIndex / groupSize);
  return groupIndex % 2 === 0 ? 'bg-white/[0.04]' : '';
}

function getBeatBorder(hitIndex: number, hitCount: number, gridRes: number): string {
  if (hitIndex === 0) return '';
  // Strong border at resolution boundaries
  if (gridRes > 1 && hitIndex % gridRes === 0) return 'border-l-2 border-l-white/20';
  // Quarter note boundaries
  const colsPerQuarter = hitCount / 4;
  if (colsPerQuarter >= 1 && hitIndex % colsPerQuarter === 0) return 'border-l border-l-white/15';
  // Eighth note boundaries
  const colsPerEighth = hitCount / 8;
  if (colsPerEighth >= 1 && hitIndex % colsPerEighth === 0) return 'border-l border-l-white/8';
  return '';
}

/** Snap a step index to the nearest grid resolution multiple */
function snapStep(step: number, gridRes: number, maxStep: number): number {
  const snapped = Math.round(step / gridRes) * gridRes;
  return Math.max(0, Math.min(maxStep, snapped));
}

/** Key for a note in the selection set */
function noteKey(step: number, midi: number): string {
  return `${step}-${midi}`;
}

/** Parse a note key back to step + midi */
function parseNoteKey(key: string): { step: number; midi: number } {
  const [s, m] = key.split('-');
  return { step: parseInt(s), midi: parseInt(m) };
}

export function GridSequencer() {
  const selectedId = useStore((s) => s.selectedInstrumentId);
  const instruments = useStore((s) => s.instruments);
  const gridNotes = useStore((s) => s.gridNotes);
  const gridGlide = useStore((s) => s.gridGlide);
  const gridLengths = useStore((s) => s.gridLengths);
  const gridVelocities = useStore((s) => s.gridVelocities);
  const octaveOffset = useStore((s) => s.octaveOffset);
  const instrumentProgress = useStore((s) => s.instrumentProgress);
  const isPlaying = useStore((s) => s.isPlaying);
  const snapEnabled = useStore((s) => s.snapEnabled);
  const gridResolution = useStore((s) => s.gridResolution);
  const scaleRoot = useStore((s) => s.scaleRoot);
  const scaleType = useStore((s) => s.scaleType);

  const dragRef = useRef<DragState | null>(null);
  const gridBodyRef = useRef<HTMLDivElement>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const hoveredHitRef = useRef<{ instrumentId: string; hitIndex: number } | null>(null);
  const velDragRef = useRef<{ hitIndex: number; startY: number; startVel: number } | null>(null);

  // Multi-select state
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set());
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const selRectRef = useRef<SelectionRect | null>(null);
  const [showVelocity, setShowVelocity] = useState(false);

  // GEN sidebar state
  const [genOpen, setGenOpen] = useState(false);
  const { size: genWidth, onMouseDown: onGenResize } = useResizable(200, 160, 'x', -1);

  const instrument = instruments.find((i) => i.id === selectedId);

  // ── Octave scroll via mouse wheel (or velocity scroll if hovering over note) ──────────────────────────────────────
  useEffect(() => {
    const el = gridContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const store = useStore.getState();

      // Check if hovering over a note hit — if so, adjust velocity instead of octave
      if (hoveredHitRef.current) {
        const { instrumentId, hitIndex } = hoveredHitRef.current;
        const vel = store.gridVelocities[instrumentId]?.[hitIndex] ?? 100;
        const delta = e.deltaY < 0 ? 5 : -5;
        const newVel = Math.max(1, Math.min(127, vel + delta));
        store.setGridVelocity(instrumentId, hitIndex, newVel);
        return;
      }

      // Otherwise, adjust octave
      const offset = store.octaveOffset;
      if (e.deltaY < 0) {
        store.setOctaveOffset(Math.min(7, offset + 1));
      } else {
        store.setOctaveOffset(Math.max(0, offset - 1));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Clear selection when instrument changes
  useEffect(() => {
    setSelectedNotes(new Set());
  }, [selectedId]);

  // ── Velocity bar drag handler ──────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!velDragRef.current) return;
      const { hitIndex, startY, startVel } = velDragRef.current;
      const dy = startY - e.clientY;
      const newVel = Math.max(1, Math.min(127, startVel + Math.round(dy * 1.5)));
      if (instrument) {
        useStore.getState().setGridVelocity(instrument.id, hitIndex, newVel);
      }
    };
    const onUp = () => {
      velDragRef.current = null;
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [instrument]);

  // ── Keyboard handler for delete ──────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!instrument) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNotes.size > 0) {
      e.preventDefault();
      const store = useStore.getState();
      const inst = store.instruments.find((i) => i.id === instrument.id);
      if (!inst) return;
      const totalSteps = inst.loopSize;
      const freshMap = new Map<number, number>();
      for (let i = 0; i < inst.hitPositions.length; i++) {
        const s = Math.round(inst.hitPositions[i] * totalSteps) % totalSteps;
        freshMap.set(s, i);
      }
      const toRemove: { hitIdx: number; midi: number }[] = [];
      for (const key of selectedNotes) {
        const { step, midi } = parseNoteKey(key);
        const hitIdx = freshMap.get(step);
        if (hitIdx !== undefined) toRemove.push({ hitIdx, midi });
      }
      toRemove.sort((a, b) => b.hitIdx - a.hitIdx);
      for (const { hitIdx, midi } of toRemove) {
        const currentNotes = store.gridNotes[instrument.id]?.[hitIdx] || [];
        if (currentNotes.length <= 1) {
          store.removeHit(instrument.id, hitIdx);
        } else {
          store.toggleGridNote(instrument.id, hitIdx, midi);
        }
      }
      setSelectedNotes(new Set());
    }
    if (e.key === 'Escape') {
      setSelectedNotes(new Set());
    }
  }, [instrument, selectedNotes]);

  if (!instrument) {
    return (
      <div className="grid-empty h-48 flex items-center justify-center text-text-secondary text-sm bg-bg-secondary flex-1 min-w-0">
        Select an instrument to edit
      </div>
    );
  }

  const isSampler = instrument.type === 'sampler';
  const isSynth = instrument.type === 'synth';
  const loopSize = instrument.loopSize;
  const notes = gridNotes[instrument.id] || [];
  const glides = gridGlide[instrument.id] || [];
  const lengths = gridLengths[instrument.id] || [];
  const totalSteps = loopSize;
  const gridRes = gridResolution;

  // 5 octaves of MIDI notes centered on octaveOffset, from high to low — filtered by scale
  const centerNote = (octaveOffset + 3) * 12;  // Center on C of octave (offset+3)
  const startNote = Math.max(0, Math.floor(centerNote - 30));  // ~5 octaves (60 semitones)
  const endNote = Math.min(127, Math.floor(centerNote + 30));
  const allRows: number[] = [];
  for (let i = endNote; i >= startNote; i--) allRows.push(i);
  const isChromatic = scaleType === 'chromatic';
  const rows = isChromatic ? allRows : allRows.filter((n) => isNoteInScale(n, scaleRoot, scaleType));

  // Active step for playback indicator
  const activeStep = isPlaying ? (() => {
    const instProg = instrumentProgress[instrument.id] ?? 0;
    return Math.floor(instProg * loopSize) % loopSize;
  })() : -1;

  // Build step → hitIndex map
  const stepToHit = new Map<number, number>();
  for (let i = 0; i < instrument.hitPositions.length; i++) {
    const step = Math.round(instrument.hitPositions[i] * totalSteps) % totalSteps;
    stepToHit.set(step, i);
  }

  const getNoteLength = (hitIdx: number): number => lengths[hitIdx] ?? 1;

  const handleGlideToggle = (e: React.MouseEvent, hitIndex: number) => {
    e.preventDefault();
    const current = glides[hitIndex] ?? false;
    useStore.getState().setGridGlide(instrument.id, hitIndex, !current);
  };

  // ── Resize drag handler ──────────────────────────────────────────────
  const handleResizeMouseDown = (
    e: React.MouseEvent,
    hitIdx: number,
    midiNote: number,
    stepIndex: number,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const colWidth = gridBodyRef.current ? gridBodyRef.current.clientWidth / totalSteps : 1;
    const currentLength = getNoteLength(hitIdx);
    const isSelected = selectedNotes.has(noteKey(stepIndex, midiNote));

    // Capture initial lengths for all selected notes
    const initialLengths = new Map<string, { hitIdx: number; length: number }>();
    if (isSelected && selectedNotes.size > 1) {
      for (const key of selectedNotes) {
        const { step } = parseNoteKey(key);
        const hIdx = stepToHit.get(step);
        if (hIdx !== undefined) {
          initialLengths.set(key, { hitIdx: hIdx, length: getNoteLength(hIdx) });
        }
      }
    }

    dragRef.current = {
      mode: 'resize',
      hitIndex: hitIdx,
      origHitIndex: hitIdx,
      midiNote,
      startY: e.clientY,
      startNote: midiNote,
      startLength: currentLength,
      startX: e.clientX,
      colWidth,
    };

    const handleMouseMove = (ev: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.mode !== 'resize') return;
      const dx = ev.clientX - drag.startX;
      const stepDelta = dx / drag.colWidth;
      const snapInc = Math.max(gridRes, 1);

      if (isSelected && initialLengths.size > 0) {
        // Multi-resize: apply same delta to all selected notes
        for (const [, info] of initialLengths) {
          const rawLen = info.length + stepDelta;
          const snapped = Math.max(snapInc, Math.round(rawLen / snapInc) * snapInc);
          const final = Math.min(snapped, totalSteps);
          useStore.getState().setGridLength(instrument.id, info.hitIdx, final);
        }
      } else {
        // Single resize
        const rawLen = drag.startLength + stepDelta;
        const snapped = Math.max(snapInc, Math.round(rawLen / snapInc) * snapInc);
        const final = Math.min(snapped, totalSteps);
        useStore.getState().setGridLength(instrument.id, drag.hitIndex, final);
      }
    };

    const handleMouseUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // ── Cell click (place/remove note) ───────────────────────────────────
  const handleCellClick = (stepIndex: number, midiNote: number) => {
    // Always snap to grid resolution (separate from snapEnabled which controls orbit-position snap)
    const snapped = snapStep(stepIndex, gridRes, totalSteps - 1);
    const store = useStore.getState();
    const hitIdx = stepToHit.get(snapped);

    if (hitIdx !== undefined) {
      const currentNotes = notes[hitIdx] || [];
      if (currentNotes.includes(midiNote)) {
        if (currentNotes.length === 1) {
          store.removeHit(instrument.id, hitIdx);
        } else {
          store.toggleGridNote(instrument.id, hitIdx, midiNote);
        }
      } else {
        if (isSampler) {
          // Samplers: replace note (one note per hit)
          store.setGridNote(instrument.id, hitIdx, [midiNote]);
        } else {
          // Synths: add note to chord
          store.setGridNote(instrument.id, hitIdx, [...currentNotes, midiNote]);
        }
      }
    } else {
      // addSamplerHit works for both sampler and synth — it accepts a midiNote
      // and does the hit + note assignment atomically in a single setState.
      store.addSamplerHit(instrument.id, snapped / totalSteps, midiNote);
    }
    setSelectedNotes(new Set());
  };

  // ── Note drag (move) ─────────────────────────────────────────────────
  const handleNoteMouseDown = (
    e: React.MouseEvent,
    stepIndex: number,
    midiNote: number,
  ) => {
    e.stopPropagation();
    e.preventDefault();

    const key = noteKey(stepIndex, midiNote);
    const isSelected = selectedNotes.has(key);

    // Ctrl+click toggles selection
    if (e.ctrlKey || e.metaKey) {
      setSelectedNotes((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      return;
    }

    // If clicking an unselected note without Ctrl, clear selection first
    if (!isSelected) {
      setSelectedNotes(new Set());
    }

    const colWidth = gridBodyRef.current ? gridBodyRef.current.clientWidth / totalSteps : 1;
    let currentStep = stepIndex;
    const hitIdx = stepToHit.get(stepIndex);
    if (hitIdx === undefined) return;

    dragRef.current = {
      mode: 'move',
      hitIndex: hitIdx,
      origHitIndex: hitIdx,
      midiNote,
      startY: e.clientY,
      startNote: midiNote,
      startX: e.clientX,
      startLength: getNoteLength(hitIdx),
      colWidth,
    };

    const handleMouseMove = (ev: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      // Vertical drag: change pitch (absolute from original start, scale-aware)
      const dy = ev.clientY - drag.startY;
      const rowDelta = Math.round(dy / ROW_H);
      const startRowIdx = rows.indexOf(drag.startNote);
      const targetRowIdx = startRowIdx === -1 ? -1 : Math.max(0, Math.min(rows.length - 1, startRowIdx + rowDelta));
      const targetNote = targetRowIdx >= 0 ? rows[targetRowIdx] : undefined;
      if (targetNote !== undefined && targetNote !== drag.midiNote) {
        if (isSampler) {
          const state = useStore.getState();
          const inst = state.instruments.find((i) => i.id === instrument.id);
          if (!inst) return;
          const freshMap = new Map<number, number>();
          for (let i = 0; i < inst.hitPositions.length; i++) {
            const s = Math.round(inst.hitPositions[i] * totalSteps) % totalSteps;
            freshMap.set(s, i);
          }
          const freshHitIdx = freshMap.get(currentStep);
          if (freshHitIdx !== undefined) {
            state.moveGridNote(instrument.id, freshHitIdx, drag.midiNote, targetNote);
            drag.hitIndex = freshHitIdx;
          }
        } else {
          useStore.getState().moveGridNote(instrument.id, drag.hitIndex, drag.midiNote, targetNote);
        }
        drag.midiNote = targetNote;
      }

      // Horizontal drag: move to different step
      {
        const dx = ev.clientX - drag.startX;
        const stepDelta = Math.round(dx / drag.colWidth);
        const rawStep = stepIndex + stepDelta;
        const newStep = snapEnabled
          ? snapStep(rawStep, gridRes, totalSteps - 1)
          : Math.max(0, Math.min(totalSteps - 1, rawStep));
        if (newStep !== currentStep) {
          useStore.getState().moveSamplerNoteToStep(
            instrument.id, currentStep, newStep, drag.midiNote,
          );
          currentStep = newStep;
        }
      }
    };

    const handleMouseUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // ── Rubber-band selection ────────────────────────────────────────────
  const handleGridMouseDown = (e: React.MouseEvent) => {
    // Only start selection on the grid background (not on notes)
    if (e.target !== e.currentTarget) return;
    if (e.button !== 0) return;

    const rect = gridBodyRef.current?.getBoundingClientRect();
    if (!rect) return;

    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;

    const newRect: SelectionRect = { startX, startY, currentX: startX, currentY: startY };
    selRectRef.current = newRect;
    setSelectionRect(newRect);

    if (!e.ctrlKey && !e.metaKey) {
      setSelectedNotes(new Set());
    }

    const handleMouseMove = (ev: MouseEvent) => {
      if (!selRectRef.current || !rect) return;
      const updated = {
        ...selRectRef.current,
        currentX: ev.clientX - rect.left,
        currentY: ev.clientY - rect.top,
      };
      selRectRef.current = updated;
      setSelectionRect(updated);
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);

      const sr = selRectRef.current;
      if (!sr || !gridBodyRef.current) {
        setSelectionRect(null);
        selRectRef.current = null;
        return;
      }

      // Calculate selection bounds
      const rx1 = Math.min(sr.startX, sr.currentX);
      const rx2 = Math.max(sr.startX, sr.currentX);
      const ry1 = Math.min(sr.startY, sr.currentY);
      const ry2 = Math.max(sr.startY, sr.currentY);

      // Only select if dragged more than 4px
      if (rx2 - rx1 > 4 || ry2 - ry1 > 4) {
        const colWidth = gridBodyRef.current.clientWidth / totalSteps;
        const topOffset = isSynth ? 14 : 0; // glide row offset for synth
        const newSelected = new Set<string>(e.ctrlKey || e.metaKey ? selectedNotes : undefined);

        for (const [step, hitIdx] of stepToHit.entries()) {
          const hitNotes = gridNotes[instrument.id]?.[hitIdx] || [];
          const noteLen = getNoteLength(hitIdx);
          for (const midi of hitNotes) {
            const rowIdx = rows.indexOf(midi);
            if (rowIdx === -1) continue;
            // Note pixel bounds
            const nx1 = step * colWidth;
            const ny1 = topOffset + rowIdx * ROW_H;
            const nx2 = nx1 + colWidth * noteLen;
            const ny2 = ny1 + ROW_H;
            // AABB intersection
            if (nx1 < rx2 && nx2 > rx1 && ny1 < ry2 && ny2 > ry1) {
              newSelected.add(noteKey(step, midi));
            }
          }
        }
        setSelectedNotes(newSelected);
      }

      setSelectionRect(null);
      selRectRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // ── Scale selector (shared) ──────────────────────────────────────────
  const scaleSelector = (
    <div className="flex items-center gap-1">
      <select
        value={scaleRoot}
        onChange={(e) => useStore.getState().setScaleRoot(parseInt(e.target.value))}
        className="text-[9px] px-1 py-0.5 rounded border border-border bg-bg-tertiary
                   text-text-secondary hover:border-accent cursor-pointer outline-none"
      >
        {NOTE_NAMES.map((name, i) => (
          <option key={i} value={i}>{name}</option>
        ))}
      </select>
      <select
        value={scaleType}
        onChange={(e) => useStore.getState().setScaleType(e.target.value)}
        className="text-[9px] px-1 py-0.5 rounded border border-border bg-bg-tertiary
                   text-text-secondary hover:border-accent cursor-pointer outline-none"
      >
        {SCALE_KEYS.map((key) => (
          <option key={key} value={key}>{SCALES[key].name}</option>
        ))}
      </select>
    </div>
  );

  // ── Toolbar (shared) ─────────────────────────────────────────────────
  const gridResButtons = (
    <div className="flex items-center gap-0.5">
      {GRID_RESOLUTIONS.map((r) => (
        <button
          key={r.value}
          onClick={() => useStore.getState().setGridResolution(r.value)}
          className={`text-[9px] px-1.5 py-0.5 rounded transition-colors
            ${gridRes === r.value
              ? 'bg-white/10 text-text-primary'
              : 'text-text-secondary/50 hover:text-text-secondary hover:bg-white/5'}`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );

  const octaveButtons = (
    <div className="flex items-center gap-1">
      <button
        onClick={() => useStore.getState().setOctaveOffset(Math.max(0, octaveOffset - 1))}
        className="text-xs px-1.5 py-0.5 rounded border border-border hover:border-accent text-text-secondary"
      >-</button>
      <span className="text-[10px] text-text-secondary w-12 text-center">
        Oct {octaveOffset}-{octaveOffset + 1}
      </span>
      <button
        onClick={() => useStore.getState().setOctaveOffset(Math.min(7, octaveOffset + 1))}
        className="text-xs px-1.5 py-0.5 rounded border border-border hover:border-accent text-text-secondary"
      >+</button>
    </div>
  );

  // ── Selection rectangle overlay ──────────────────────────────────────
  const selectionOverlay = selectionRect && (() => {
    const x = Math.min(selectionRect.startX, selectionRect.currentX);
    const y = Math.min(selectionRect.startY, selectionRect.currentY);
    const w = Math.abs(selectionRect.currentX - selectionRect.startX);
    const h = Math.abs(selectionRect.currentY - selectionRect.startY);
    return (
      <div
        className="absolute pointer-events-none"
        style={{
          left: x,
          top: y,
          width: w,
          height: h,
          border: '1px solid rgba(255,255,255,0.5)',
          background: 'rgba(255,255,255,0.05)',
          zIndex: 20,
        }}
      />
    );
  })();

  // ── Velocity lane renderer ──────────────────────────────────────
  const renderVelocityLane = () => {
    if (!showVelocity) return null;
    const colPercent = 100 / totalSteps;
    return (
      <div className="flex shrink-0 border-t border-border" style={{ height: 64 }}>
        <div className="w-10 shrink-0 flex items-center justify-center">
          <span className="text-[8px] text-white/30 uppercase tracking-wider">vel</span>
        </div>
        <div className="flex-1 relative">
          {Array.from(stepToHit.entries()).map(([stepIndex, hitIdx]) => {
            const vel = gridVelocities[instrument.id]?.[hitIdx] ?? 100;
            const barH = (vel / 127) * 56;
            return (
              <div
                key={`vel-${stepIndex}`}
                className="absolute bottom-0"
                style={{
                  left: `${stepIndex * colPercent}%`,
                  width: `calc(${colPercent}% - 2px)`,
                  height: barH,
                  background: instrument.color,
                  opacity: 0.7,
                  borderRadius: '2px 2px 0 0',
                  cursor: 'ns-resize',
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  velDragRef.current = { hitIndex: hitIdx, startY: e.clientY, startVel: vel };
                }}
              />
            );
          })}
        </div>
      </div>
    );
  };

  // ── Note block renderer ──────────────────────────────────────────────
  const renderNoteBlock = (
    stepIndex: number,
    hitIdx: number,
    midiNote: number,
    colPercent: number,
    noteLen: number,
    topOffset: number,
  ) => {
    const rowIndex = rows.indexOf(midiNote);
    if (rowIndex === -1) return null;
    const key = noteKey(stepIndex, midiNote);
    const isNoteSelected = selectedNotes.has(key);
    const vel = gridVelocities[instrument.id]?.[hitIdx] ?? 100;
    const noteOpacity = 0.3 + (vel / 127) * 0.7; // 0.3-1.0

    return (
      <div
        key={`${stepIndex}-${midiNote}`}
        className="absolute group"
        style={{
          left: `${stepIndex * colPercent}%`,
          top: topOffset + rowIndex * ROW_H,
          width: `${colPercent * noteLen}%`,
          height: ROW_H,
          pointerEvents: 'auto',
          zIndex: isNoteSelected ? 11 : 10,
        }}
        onMouseEnter={() => {
          hoveredHitRef.current = { instrumentId: instrument.id, hitIndex: hitIdx };
        }}
        onMouseLeave={() => {
          hoveredHitRef.current = null;
        }}
      >
        {/* Note body */}
        <div
          className="absolute inset-0 m-px cursor-grab active:cursor-grabbing transition-opacity hover:opacity-90 overflow-hidden flex items-center justify-center"
          style={{
            backgroundColor: instrument.color + 'cc',
            borderRadius: 12,
            boxShadow: `0 0 4px ${instrument.color}40`,
            outline: isNoteSelected ? '2px solid rgba(255,255,255,0.8)' : 'none',
            outlineOffset: -1,
            opacity: noteOpacity,
          }}
          onMouseDown={(e) => handleNoteMouseDown(e, stepIndex, midiNote)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            const currentNotes = notes[hitIdx] || [];
            if (currentNotes.length <= 1) {
              useStore.getState().removeHit(instrument.id, hitIdx);
            } else {
              useStore.getState().toggleGridNote(instrument.id, hitIdx, midiNote);
            }
          }}
        >
          <span
            className="text-[10px] text-black/70 leading-none select-none whitespace-nowrap font-semibold"
          >
            {noteNameWithOctave(midiNote)}
          </span>
        </div>
        {/* Resize handle */}
        <div
          className="absolute top-0 bottom-0 cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity"
          style={{
            right: 0,
            width: RESIZE_HANDLE_W,
            background: `linear-gradient(90deg, transparent, ${instrument.color}80)`,
            borderRadius: '0 12px 12px 0',
          }}
          onMouseDown={(e) => handleResizeMouseDown(e, hitIdx, midiNote, stepIndex)}
        />
      </div>
    );
  };

  // ── Note labels column ───────────────────────────────────────────────
  const noteLabels = (
    <div className="grid-note-labels shrink-0 w-10">
      {rows.map((midiNote) => {
        const isBlackKey = [1, 3, 6, 8, 10].includes(midiNote % 12);
        return (
          <div
            key={midiNote}
            className={`flex items-center justify-end pr-1 text-[9px]
              ${isBlackKey ? 'text-text-secondary/50' : 'text-text-secondary'}`}
            style={{ height: ROW_H }}
          >
            {noteNameWithOctave(midiNote)}
          </div>
        );
      })}
    </div>
  );

  // ── Grid cells ───────────────────────────────────────────────────────
  const renderGridCells = (showGlide: boolean) => (
    <div className="flex">
      {Array.from({ length: totalSteps }, (_, stepIndex) => {
        const beatHighlight = getBeatClass(stepIndex, totalSteps, gridRes);
        const beatBorder = getBeatBorder(stepIndex, totalSteps, gridRes);
        const hitIdx = stepToHit.get(stepIndex);
        return (
          <div
            key={stepIndex}
            className={`flex-1 min-w-[28px] border-r border-border/30 ${beatBorder}
              ${activeStep === stepIndex ? 'bg-white/5' : beatHighlight}`}
          >
            {showGlide && (
              <div
                onClick={(e) => { if (hitIdx !== undefined) handleGlideToggle(e, hitIdx); }}
                className={`border-b border-border/30 cursor-pointer text-center text-[8px]
                  ${hitIdx !== undefined && glides[hitIdx]
                    ? 'bg-accent/30 text-accent'
                    : 'text-transparent hover:text-text-secondary/30'}`}
                style={{ height: 14 }}
              >
                G
              </div>
            )}
            {rows.map((midiNote) => {
              const isBlackKey = [1, 3, 6, 8, 10].includes(midiNote % 12);
              const isC = midiNote % 12 === 0;
              return (
                <div
                  key={midiNote}
                  onClick={() => handleCellClick(stepIndex, midiNote)}
                  className={`border-b cursor-pointer transition-colors
                    ${isC ? 'border-border/60' : 'border-border/20'}
                    ${isBlackKey ? 'bg-white/[0.02] hover:bg-white/5' : 'hover:bg-white/5'}`}
                  style={{ height: ROW_H }}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );

  // ── Note blocks overlay ──────────────────────────────────────────────
  const renderNoteBlocks = (topOffset: number) => (
    <div className="absolute inset-0" style={{ top: topOffset, pointerEvents: 'none' }}>
      {Array.from(stepToHit.entries()).map(([stepIndex, hitIdx]) => {
        const hitNotes = notes[hitIdx] || [];
        const colPercent = 100 / totalSteps;
        const noteLen = getNoteLength(hitIdx);
        return hitNotes.map((midiNote) =>
          renderNoteBlock(stepIndex, hitIdx, midiNote, colPercent, noteLen, 0),
        );
      })}
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════
  // SAMPLER PIANO ROLL
  // ═══════════════════════════════════════════════════════════════════════
  if (isSampler) {
    return (
      <div
        ref={gridContainerRef}
        className="grid-sequencer bg-bg-secondary flex flex-col flex-1 min-w-0 outline-none"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <div className="grid-toolbar flex items-center gap-2 px-4 py-1.5 border-b border-border">
          <span className="text-[10px] text-text-secondary">{instrument.name}</span>
          <GenerateButton genOpen={genOpen} onToggleGen={() => setGenOpen(!genOpen)} />
          {gridResButtons}
          <button
            onClick={() => setShowVelocity(v => !v)}
            className={`text-[9px] px-1.5 py-0.5 rounded transition-colors
              ${showVelocity
                ? 'bg-white/10 text-text-primary'
                : 'text-text-secondary/50 hover:text-text-secondary hover:bg-white/5'}`}
            title="Toggle velocity lane"
          >
            VEL
          </button>
          {scaleSelector}
          <div className="ml-auto flex items-center gap-1">
            <span className="text-[10px] text-text-secondary mr-2">{loopSize} steps</span>
          </div>
        </div>

        {/* Main content: optional gen sidebar + scrollable grid */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {genOpen && (
            <>
              <GenSidebar
                instrumentId={instrument.id}
                instrumentType="sampler"
                color={instrument.color}
                width={genWidth}
              />
              <div
                className="resize-handle cursor-ew-resize shrink-0 flex items-center justify-center group hover:bg-accent/10 transition-colors"
                style={{ width: 4, borderRight: '1px solid rgba(255,255,255,0.1)' }}
                onMouseDown={onGenResize}
              >
                <div className="h-10 w-0.5 rounded-full bg-border/60 group-hover:bg-accent/60 transition-colors" />
              </div>
            </>
          )}
          <div className="grid-body flex flex-col flex-1 overflow-x-auto">
            <div className="flex flex-1 min-h-0">
              {noteLabels}
              <div
                ref={gridBodyRef}
                className="grid-cells flex-1 relative"
                onMouseDown={handleGridMouseDown}
              >
                {renderGridCells(false)}
                {renderNoteBlocks(0)}
                {selectionOverlay}
              </div>
            </div>
            {renderVelocityLane()}
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SYNTH PIANO ROLL
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div
      ref={gridContainerRef}
      className="grid-sequencer bg-bg-secondary flex flex-col flex-1 min-w-0 outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div className="grid-toolbar flex items-center gap-2 px-4 py-1.5 border-b border-border">
        {/* Chord presets dropdown */}
        <select
          value=""
          onChange={(e) => {
            const idx = parseInt(e.target.value);
            if (!isNaN(idx)) {
              const preset = CHORD_PRESETS[idx];
              useStore.getState().applyChordPreset(instrument.id, preset.chords, preset.steps);
            }
            e.target.value = '';
          }}
          className="text-[10px] px-2 py-0.5 rounded border border-border bg-bg-tertiary
                     text-text-secondary hover:border-accent cursor-pointer outline-none"
        >
          <option value="" disabled>Chords</option>
          {CHORD_PRESETS.map((preset, i) => (
            <option key={preset.name} value={i}>{preset.name}</option>
          ))}
        </select>

        <GenerateButton genOpen={genOpen} onToggleGen={() => setGenOpen(!genOpen)} />

        {gridResButtons}
        <button
          onClick={() => setShowVelocity(v => !v)}
          className={`text-[9px] px-1.5 py-0.5 rounded transition-colors
            ${showVelocity
              ? 'bg-white/10 text-text-primary'
              : 'text-text-secondary/50 hover:text-text-secondary hover:bg-white/5'}`}
          title="Toggle velocity lane"
        >
          VEL
        </button>
        {scaleSelector}

        <div className="ml-auto flex items-center gap-1">
          <span className="text-[10px] text-text-secondary mr-2">{loopSize} steps</span>
          {octaveButtons}
        </div>
      </div>

      {/* Main content: optional gen sidebar + scrollable grid */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {genOpen && (
          <>
            <GenSidebar
              instrumentId={instrument.id}
              instrumentType="synth"
              color={instrument.color}
              width={genWidth}
            />
            <div
              className="resize-handle cursor-ew-resize shrink-0 flex items-center justify-center group hover:bg-accent/10 transition-colors"
              style={{ width: 4, borderRight: '1px solid rgba(255,255,255,0.1)' }}
              onMouseDown={onGenResize}
            >
              <div className="h-10 w-0.5 rounded-full bg-border/60 group-hover:bg-accent/60 transition-colors" />
            </div>
          </>
        )}
        <div className="grid-body flex flex-col flex-1 overflow-x-auto">
          <div className="flex flex-1 min-h-0">
            {/* Synth note labels need extra top padding for glide row */}
            <div className="grid-note-labels shrink-0 w-10">
              <div style={{ height: 14 }} />
              {rows.map((midiNote) => {
                const isBlackKey = [1, 3, 6, 8, 10].includes(midiNote % 12);
                return (
                  <div
                    key={midiNote}
                    className={`flex items-center justify-end pr-1 text-[9px]
                      ${isBlackKey ? 'text-text-secondary/50' : 'text-text-secondary'}`}
                    style={{ height: ROW_H }}
                  >
                    {noteNameWithOctave(midiNote)}
                  </div>
                );
              })}
            </div>

            <div
              ref={gridBodyRef}
              className="grid-cells flex-1 relative"
              onMouseDown={handleGridMouseDown}
            >
              {renderGridCells(true)}
              {renderNoteBlocks(14)}
              {selectionOverlay}
            </div>
          </div>
          {renderVelocityLane()}
        </div>
      </div>
    </div>
  );
}
