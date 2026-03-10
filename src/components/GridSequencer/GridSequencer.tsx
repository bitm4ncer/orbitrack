import { useRef } from 'react';
import { useStore } from '../../state/store';
import { noteNameWithOctave } from '../../utils/music';
import { CHORD_PRESETS } from '../../utils/chordPresets';

const ROW_H = 20;

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

function getBeatClass(hitIndex: number, hitCount: number): string {
  const colsPerQuarter = hitCount / 4;
  const colsPerEighth = hitCount / 8;
  if (colsPerQuarter >= 1 && hitIndex % colsPerQuarter === 0) {
    return 'bg-white/[0.06]';
  }
  if (colsPerEighth >= 1 && hitIndex % colsPerEighth === 0) {
    return 'bg-white/[0.03]';
  }
  return '';
}

function getBeatBorder(hitIndex: number, hitCount: number): string {
  const colsPerQuarter = hitCount / 4;
  if (colsPerQuarter >= 1 && hitIndex % colsPerQuarter === 0 && hitIndex > 0) {
    return 'border-l border-l-white/15';
  }
  const colsPerEighth = hitCount / 8;
  if (colsPerEighth >= 1 && hitIndex % colsPerEighth === 0 && hitIndex > 0) {
    return 'border-l border-l-white/8';
  }
  return '';
}

export function GridSequencer() {
  const selectedId = useStore((s) => s.selectedInstrumentId);
  const instruments = useStore((s) => s.instruments);
  const gridNotes = useStore((s) => s.gridNotes);
  const gridGlide = useStore((s) => s.gridGlide);
  const octaveOffset = useStore((s) => s.octaveOffset);
  const instrumentProgress = useStore((s) => s.instrumentProgress);
  const isPlaying = useStore((s) => s.isPlaying);
  const snapEnabled = useStore((s) => s.snapEnabled);

  const dragRef = useRef<DragState | null>(null);
  const gridBodyRef = useRef<HTMLDivElement>(null);

  const instrument = instruments.find((i) => i.id === selectedId);
  if (!instrument) {
    return (
      <div className="grid-empty h-48 flex items-center justify-center text-text-secondary text-sm bg-bg-secondary flex-1 min-w-0">
        Select an instrument to edit
      </div>
    );
  }

  const isSampler = instrument.type === 'sampler';
  const loopSize = instrument.loopSize;
  const notes = gridNotes[instrument.id] || [];
  const glides = gridGlide[instrument.id] || [];

  // 2 octaves of MIDI notes, from high to low
  const startNote = (octaveOffset + 1) * 12;
  const rows: number[] = [];
  for (let i = 23; i >= 0; i--) {
    rows.push(startNote + i);
  }

  // Active grid step for both sampler and synth
  const activeSamplerStep = isPlaying ? (() => {
    const instProg = instrumentProgress[instrument.id] ?? 0;
    return Math.floor(instProg * loopSize) % loopSize;
  })() : -1;

  const handleGlideToggle = (e: React.MouseEvent, hitIndex: number) => {
    e.preventDefault();
    const current = glides[hitIndex] ?? false;
    useStore.getState().setGridGlide(instrument.id, hitIndex, !current);
  };

  // --- Sampler step mapping ---
  const samplerSteps = loopSize;

  // --- Sampler Unified Piano Roll ---
  if (isSampler) {
    // Build step → hitIndex map
    const stepToHit = new Map<number, number>();
    for (let i = 0; i < instrument.hitPositions.length; i++) {
      const step = Math.round(instrument.hitPositions[i] * samplerSteps) % samplerSteps;
      stepToHit.set(step, i);
    }

    const handleSamplerCellClick = (stepIndex: number, midiNote: number) => {
      const store = useStore.getState();
      const hitIdx = stepToHit.get(stepIndex);
      if (hitIdx !== undefined) {
        // Hit exists at this step — toggle the note
        const currentNotes = notes[hitIdx] || [];
        if (currentNotes.includes(midiNote)) {
          // Removing this note — if it's the last one, remove the hit entirely
          if (currentNotes.length === 1) {
            store.removeHit(instrument.id, hitIdx);
          } else {
            store.toggleGridNote(instrument.id, hitIdx, midiNote);
          }
        } else {
          // Replace existing note with clicked note (sampler = one note per hit)
          store.setGridNote(instrument.id, hitIdx, [midiNote]);
        }
      } else {
        // No hit at this step — create one with this note
        store.addSamplerHit(instrument.id, stepIndex / samplerSteps, midiNote);
      }
    };

    const handleSamplerNoteMouseDown = (
      e: React.MouseEvent,
      stepIndex: number,
      midiNote: number,
    ) => {
      e.stopPropagation();
      e.preventDefault();

      const colWidth = gridBodyRef.current ? gridBodyRef.current.clientWidth / samplerSteps : 1;
      let currentStep = stepIndex;

      // Find hitIndex fresh from store
      const hitIdx = stepToHit.get(stepIndex);
      if (hitIdx === undefined) return;

      dragRef.current = {
        mode: 'move',
        hitIndex: hitIdx,
        origHitIndex: hitIdx,
        midiNote,
        startY: e.clientY,
        startNote: midiNote,
        startLength: 1,
        startX: e.clientX,
        colWidth,
      };

      const handleMouseMove = (ev: MouseEvent) => {
        const drag = dragRef.current;
        if (!drag) return;

        // Vertical drag: change pitch
        const dy = ev.clientY - drag.startY;
        const rowDelta = Math.round(dy / ROW_H);
        if (rowDelta !== 0) {
          const newNote = drag.startNote - rowDelta;
          if (newNote >= rows[rows.length - 1] && newNote <= rows[0]) {
            // For sampler, get fresh hitIndex from store state
            const state = useStore.getState();
            const inst = state.instruments.find((i) => i.id === instrument.id);
            if (!inst) return;
            // Rebuild step→hit for current state
            const freshMap = new Map<number, number>();
            for (let i = 0; i < inst.hitPositions.length; i++) {
              const s = Math.round(inst.hitPositions[i] * samplerSteps) % samplerSteps;
              freshMap.set(s, i);
            }
            const freshHitIdx = freshMap.get(currentStep);
            if (freshHitIdx !== undefined) {
              state.moveGridNote(instrument.id, freshHitIdx, drag.midiNote, newNote);
              drag.hitIndex = freshHitIdx;
            }
            drag.midiNote = newNote;
            drag.startY = ev.clientY;
            drag.startNote = newNote;
          }
        }

        // Horizontal drag: move to different step (disabled when snap is off — use orbit for free positioning)
        if (snapEnabled) {
          const dx = ev.clientX - drag.startX;
          const stepDelta = Math.round(dx / drag.colWidth);
          const newStep = Math.max(0, Math.min(samplerSteps - 1, stepIndex + stepDelta));
          if (newStep !== currentStep) {
            useStore.getState().moveSamplerNoteToStep(
              instrument.id, currentStep, newStep, drag.midiNote
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

    return (
      <div className="grid-sequencer bg-bg-secondary flex-1 min-w-0">
        {/* Toolbar */}
        <div className="grid-toolbar flex items-center gap-2 px-4 py-1.5 border-b border-border">
          <span className="text-[10px] text-text-secondary">
            {instrument.name}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <span className="text-[10px] text-text-secondary mr-2">{loopSize} steps</span>
            <button
              onClick={() => useStore.getState().setOctaveOffset(Math.max(0, octaveOffset - 1))}
              className="text-xs px-1.5 py-0.5 rounded border border-border
                         hover:border-accent text-text-secondary"
            >
              -
            </button>
            <span className="text-[10px] text-text-secondary w-12 text-center">
              Oct {octaveOffset}-{octaveOffset + 1}
            </span>
            <button
              onClick={() => useStore.getState().setOctaveOffset(Math.min(7, octaveOffset + 1))}
              className="text-xs px-1.5 py-0.5 rounded border border-border
                         hover:border-accent text-text-secondary"
            >
              +
            </button>
          </div>
        </div>

        {/* Piano roll grid */}
        <div className="grid-body flex overflow-x-auto">
          {/* Note labels */}
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

          {/* Grid cells */}
          <div ref={gridBodyRef} className="grid-cells flex-1 relative">
            <div className="flex">
              {Array.from({ length: samplerSteps }, (_, stepIndex) => {
                const beatHighlight = getBeatClass(stepIndex, samplerSteps);
                const beatBorder = getBeatBorder(stepIndex, samplerSteps);
                return (
                  <div
                    key={stepIndex}
                    className={`flex-1 min-w-[28px] border-r border-border/30 ${beatBorder}
                               ${activeSamplerStep === stepIndex ? 'bg-white/5' : beatHighlight}`}
                  >
                    {rows.map((midiNote) => {
                      const isBlackKey = [1, 3, 6, 8, 10].includes(midiNote % 12);
                      const isC = midiNote % 12 === 0;
                      return (
                        <div
                          key={midiNote}
                          onClick={() => handleSamplerCellClick(stepIndex, midiNote)}
                          className={`border-b cursor-pointer transition-colors
                                     ${isC ? 'border-border/60' : 'border-border/20'}
                                     ${isBlackKey
                                       ? 'bg-white/[0.02] hover:bg-white/5'
                                       : 'hover:bg-white/5'}`}
                          style={{ height: ROW_H }}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Note blocks overlay */}
            <div className="absolute inset-0" style={{ pointerEvents: 'none' }}>
              {Array.from(stepToHit.entries()).map(([stepIndex, hitIdx]) => {
                const hitNotes = notes[hitIdx] || [];
                const colPercent = 100 / samplerSteps;

                return hitNotes.map((midiNote) => {
                  const rowIndex = rows.indexOf(midiNote);
                  if (rowIndex === -1) return null;

                  return (
                    <div
                      key={`${stepIndex}-${midiNote}`}
                      className="absolute group"
                      style={{
                        left: `${stepIndex * colPercent}%`,
                        top: rowIndex * ROW_H,
                        width: `${colPercent}%`,
                        height: ROW_H,
                        pointerEvents: 'auto',
                        zIndex: 10,
                      }}
                    >
                      <div
                        className="absolute inset-0 m-px cursor-grab active:cursor-grabbing transition-opacity hover:opacity-90"
                        style={{
                          backgroundColor: instrument.color + 'cc',
                          borderRadius: 4,
                          boxShadow: `0 0 4px ${instrument.color}40`,
                        }}
                        onMouseDown={(e) => handleSamplerNoteMouseDown(e, stepIndex, midiNote)}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          // Remove note; if last note, remove hit
                          const currentNotes = notes[hitIdx] || [];
                          if (currentNotes.length <= 1) {
                            useStore.getState().removeHit(instrument.id, hitIdx);
                          } else {
                            useStore.getState().toggleGridNote(instrument.id, hitIdx, midiNote);
                          }
                        }}
                      >
                        <span
                          className="text-[8px] text-black/70 pl-1 leading-none select-none"
                          style={{ lineHeight: `${ROW_H - 2}px` }}
                        >
                          {noteNameWithOctave(midiNote)}
                        </span>
                      </div>
                    </div>
                  );
                });
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- Synth Piano Roll (step-based, like sampler) ---
  const synthSteps = loopSize;
  const synthStepToHit = new Map<number, number>();
  for (let i = 0; i < instrument.hitPositions.length; i++) {
    const step = Math.round(instrument.hitPositions[i] * synthSteps) % synthSteps;
    synthStepToHit.set(step, i);
  }

  const handleSynthCellClick = (stepIndex: number, midiNote: number) => {
    const store = useStore.getState();
    const hitIdx = synthStepToHit.get(stepIndex);
    if (hitIdx !== undefined) {
      const currentNotes = notes[hitIdx] || [];
      if (currentNotes.includes(midiNote)) {
        if (currentNotes.length === 1) {
          store.removeHit(instrument.id, hitIdx);
        } else {
          store.toggleGridNote(instrument.id, hitIdx, midiNote);
        }
      } else {
        store.setGridNote(instrument.id, hitIdx, [midiNote]);
      }
    } else {
      const newHitIdx = instrument.hits;
      store.addHit(instrument.id, stepIndex / synthSteps);
      store.setGridNote(instrument.id, newHitIdx, [midiNote]);
    }
  };

  const handleSynthNoteMouseDown = (
    e: React.MouseEvent,
    stepIndex: number,
    midiNote: number,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const colWidth = gridBodyRef.current ? gridBodyRef.current.clientWidth / synthSteps : 1;
    let currentStep = stepIndex;
    const hitIdx = synthStepToHit.get(stepIndex);
    if (hitIdx === undefined) return;

    dragRef.current = {
      mode: 'move',
      hitIndex: hitIdx,
      origHitIndex: hitIdx,
      midiNote,
      startY: e.clientY,
      startNote: midiNote,
      startLength: 1,
      startX: e.clientX,
      colWidth,
    };

    const handleMouseMove = (ev: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dy = ev.clientY - drag.startY;
      const rowDelta = Math.round(dy / ROW_H);
      if (rowDelta !== 0) {
        const newNote = drag.startNote - rowDelta;
        if (newNote >= rows[rows.length - 1] && newNote <= rows[0]) {
          useStore.getState().moveGridNote(instrument.id, drag.hitIndex, drag.midiNote, newNote);
          drag.midiNote = newNote;
          drag.startY = ev.clientY;
          drag.startNote = newNote;
        }
      }
      // Horizontal drag: move to different step (disabled when snap is off — use orbit for free positioning)
      if (snapEnabled) {
        const dx = ev.clientX - drag.startX;
        const stepDelta = Math.round(dx / drag.colWidth);
        const newStep = Math.max(0, Math.min(synthSteps - 1, stepIndex + stepDelta));
        if (newStep !== currentStep) {
          useStore.getState().moveSamplerNoteToStep(instrument.id, currentStep, newStep, drag.midiNote);
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

  return (
    <div className="grid-sequencer bg-bg-secondary flex-1 min-w-0">
      {/* Toolbar */}
      <div className="grid-toolbar flex items-center gap-2 px-4 py-1.5 border-b border-border">
        <span className="text-[10px] text-text-secondary uppercase tracking-wide">Chords:</span>
        {CHORD_PRESETS.map((preset) => (
          <button
            key={preset.name}
            onClick={() =>
              useStore.getState().applyChordPreset(instrument.id, preset.chords, preset.steps)
            }
            className="text-[10px] px-2 py-0.5 rounded border border-border
                       hover:border-accent text-text-secondary hover:text-accent transition-colors"
          >
            {preset.name}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <span className="text-[10px] text-text-secondary mr-2">{loopSize} steps</span>
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
      </div>

      {/* Grid */}
      <div className="grid-body flex overflow-x-auto">
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

        <div ref={gridBodyRef} className="grid-cells flex-1 relative">
          <div className="flex">
            {Array.from({ length: synthSteps }, (_, stepIndex) => {
              const beatHighlight = getBeatClass(stepIndex, synthSteps);
              const beatBorder = getBeatBorder(stepIndex, synthSteps);
              const hitIdx = synthStepToHit.get(stepIndex);
              return (
                <div
                  key={stepIndex}
                  className={`flex-1 min-w-[28px] border-r border-border/30 ${beatBorder}
                             ${activeSamplerStep === stepIndex ? 'bg-white/5' : beatHighlight}`}
                >
                  {/* Glide indicator */}
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
                  {rows.map((midiNote) => {
                    const isBlackKey = [1, 3, 6, 8, 10].includes(midiNote % 12);
                    const isC = midiNote % 12 === 0;
                    return (
                      <div
                        key={midiNote}
                        onClick={() => handleSynthCellClick(stepIndex, midiNote)}
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

          {/* Note blocks overlay */}
          <div className="absolute inset-0" style={{ top: 14, pointerEvents: 'none' }}>
            {Array.from(synthStepToHit.entries()).map(([stepIndex, hitIdx]) => {
              const hitNotes = notes[hitIdx] || [];
              const colPercent = 100 / synthSteps;
              return hitNotes.map((midiNote) => {
                const rowIndex = rows.indexOf(midiNote);
                if (rowIndex === -1) return null;
                return (
                  <div
                    key={`${stepIndex}-${midiNote}`}
                    className="absolute group"
                    style={{
                      left: `${stepIndex * colPercent}%`,
                      top: rowIndex * ROW_H,
                      width: `${colPercent}%`,
                      height: ROW_H,
                      pointerEvents: 'auto',
                      zIndex: 10,
                    }}
                  >
                    <div
                      className="absolute inset-0 m-px cursor-grab active:cursor-grabbing transition-opacity hover:opacity-90"
                      style={{
                        backgroundColor: instrument.color + 'cc',
                        borderRadius: 4,
                        boxShadow: `0 0 4px ${instrument.color}40`,
                      }}
                      onMouseDown={(e) => handleSynthNoteMouseDown(e, stepIndex, midiNote)}
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
                        className="text-[8px] text-black/70 pl-1 leading-none select-none"
                        style={{ lineHeight: `${ROW_H - 2}px` }}
                      >
                        {noteNameWithOctave(midiNote)}
                      </span>
                    </div>
                  </div>
                );
              });
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
