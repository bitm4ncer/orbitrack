import React, { useState, useRef } from 'react';
import { useStore } from '../../state/store';
import type { InstrumentScene } from '../../types/scene';

const BAR_PX = 60; // pixels per bar

interface SceneBlockProps {
  step: { id: string; sceneId: string; bars: number };
  scene: InstrumentScene;
  isSelected: boolean;
  isPlaying: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onResize: (newBars: number) => void;
  onDragStart: (e: React.DragEvent) => void;
}

function SceneBlock({
  step,
  scene,
  isSelected,
  isPlaying,
  onSelect,
  onDelete,
  onResize,
  onDragStart,
}: SceneBlockProps) {
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState(0);
  const [originalBars, setOriginalBars] = useState(0);

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsResizing(true);
    setResizeStart(e.clientX);
    setOriginalBars(step.bars);
  };

  React.useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizeStart;
      const barDelta = Math.round(delta / BAR_PX);
      const newBars = Math.max(1, Math.min(64, originalBars + barDelta));
      onResize(newBars);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizeStart, originalBars, onResize]);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Delete') {
          onDelete();
        }
      }}
      tabIndex={0}
      className={`relative flex items-center gap-2 px-3 py-2 cursor-move select-none transition-all
        rounded border min-w-max
        ${isSelected ? 'ring-2 ring-white' : ''} ${isPlaying ? 'ring-2 ring-yellow-400' : ''}`}
      style={{
        width: `${step.bars * BAR_PX}px`,
        backgroundColor: scene.color + '99',
        borderColor: 'rgba(255, 255, 255, 0.2)',
      }}
    >
      {/* Scene name */}
      <span className="text-sm font-semibold truncate flex-1">{scene.name}</span>

      {/* Bar count badge */}
      <span className="text-xs font-mono bg-black/30 px-1.5 py-0.5 rounded whitespace-nowrap">
        {step.bars} bar{step.bars !== 1 ? 's' : ''}
      </span>

      {/* Delete button */}
      {isSelected && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-0.5 hover:bg-black/30 rounded transition-colors"
          title="Delete (Delete key)"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <path d="M1 3h12v1H1V3zm2-2h8v1H3V1zm0 4v7c0 .55.45 1 1 1h6c.55 0 1-.45 1-1V5H3z" />
          </svg>
        </button>
      )}

      {/* Resize handle */}
      <div
        onMouseDown={handleResizeMouseDown}
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:w-1.5 bg-white/30 hover:bg-white/60 transition-all"
        title="Drag to resize"
      />
    </div>
  );
}

export function TrackTimeline() {
  const scenes = useStore((s) => s.scenes);
  const arrangement = useStore((s) => s.arrangement);
  const trackPosition = useStore((s) => s.trackPosition);
  const addArrangementStep = useStore((s) => s.addArrangementStep);
  const removeArrangementStep = useStore((s) => s.removeArrangementStep);
  const reorderArrangementSteps = useStore((s) => s.reorderArrangementSteps);
  const setArrangementStepBars = useStore((s) => s.setArrangementStepBars);
  const duplicateArrangementStep = useStore((s) => s.duplicateArrangementStep);

  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<{ id: string; sceneId: string; bars: number } | null>(null);
  const [showSceneDropdown, setShowSceneDropdown] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleAddScene = (sceneId: string) => {
    addArrangementStep(sceneId, 4);
    setShowSceneDropdown(false);
  };

  const handleDelete = (stepId: string) => {
    removeArrangementStep(stepId);
    if (selectedStepId === stepId) {
      setSelectedStepId(null);
    }
  };

  const handleCopy = () => {
    if (!selectedStepId) return;
    const step = arrangement.find((s) => s.id === selectedStepId);
    if (step) {
      setClipboard(step);
    }
  };

  const handlePaste = () => {
    if (!clipboard) return;
    duplicateArrangementStep(clipboard.id);
  };

  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedStepId) return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault();
        handleCopy();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault();
        handlePaste();
      }
      if (e.key === 'Delete') {
        e.preventDefault();
        handleDelete(selectedStepId);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedStepId, clipboard, arrangement]);

  // Close dropdowns on click outside
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowSceneDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDragStart = (index: number, e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (index: number, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDrop = (toIndex: number, e: React.DragEvent) => {
    e.preventDefault();
    const fromIndexStr = e.dataTransfer.getData('text/plain');
    const fromIndex = parseInt(fromIndexStr, 10);

    if (!isNaN(fromIndex) && fromIndex !== toIndex) {
      reorderArrangementSteps(fromIndex, toIndex);
    }

    setDragOverIndex(null);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  // Calculate playhead position
  const playheadX =
    trackPosition >= 0 && arrangement.length > 0
      ? arrangement.slice(0, trackPosition).reduce((sum, step) => sum + step.bars * BAR_PX, 0)
      : 0;

  const availableScenes = scenes.filter(
    (s) => !arrangement.some((a) => a.sceneId === s.id) || true, // Allow adding same scene multiple times
  );

  return (
    <div className="flex flex-col h-[200px] bg-background border-t border-border">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background/50">
        {/* Add Scene Button */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowSceneDropdown(!showSceneDropdown)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" fill="none" />
            </svg>
            Add Scene
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <path d="M3.5 5.5l3.5 4 3.5-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {showSceneDropdown && (
            <div className="absolute top-full left-0 mt-1 bg-popover border border-border rounded shadow-lg z-50 min-w-max">
              {availableScenes.length > 0 ? (
                availableScenes.map((scene) => (
                  <button
                    key={scene.id}
                    onClick={() => handleAddScene(scene.id)}
                    className="w-full text-left px-3 py-2 text-sm transition-colors flex items-center gap-2 hover:opacity-80"
                    style={{ backgroundColor: scene.color + '1a' }}
                  >
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{
                        backgroundColor: scene.color,
                      }}
                    />
                    {scene.name}
                  </button>
                ))
              ) : (
                <div className="px-3 py-2 text-xs text-muted-foreground">No scenes available</div>
              )}
            </div>
          )}
        </div>

        {/* Scene palette chips */}
        <div className="flex items-center gap-1 flex-1 overflow-x-auto">
          {scenes.map((scene) => (
            <div
              key={scene.id}
              className="px-2 py-1 rounded text-xs font-medium whitespace-nowrap cursor-default transition-colors hover:opacity-80"
              style={{
                backgroundColor: scene.color + '4d',
                color: 'white',
              }}
              title={scene.name}
            >
              {scene.name}
            </div>
          ))}
        </div>
      </div>

      {/* Timeline scroll area */}
      <div
        ref={scrollAreaRef}
        className="flex-1 overflow-x-auto overflow-y-hidden bg-background/50 relative"
      >
        {/* Playhead */}
        {trackPosition >= 0 && arrangement.length > 0 && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-yellow-400 pointer-events-none z-20"
            style={{ left: `${playheadX}px` }}
          />
        )}

        {/* Arrangement blocks container */}
        <div className="flex gap-2 p-2 min-w-min">
          {arrangement.length > 0 ? (
            arrangement.map((step, idx) => {
              const scene = scenes.find((s) => s.id === step.sceneId);
              if (!scene) return null;

              return (
                <div
                  key={step.id}
                  onDragOver={(e) => handleDragOver(idx, e)}
                  onDrop={(e) => handleDrop(idx, e)}
                  onDragLeave={handleDragLeave}
                  className={`transition-all ${dragOverIndex === idx ? 'opacity-50' : 'opacity-100'}`}
                >
                  <SceneBlock
                    step={step}
                    scene={scene}
                    isSelected={selectedStepId === step.id}
                    isPlaying={trackPosition === idx}
                    onSelect={() => setSelectedStepId(step.id)}
                    onDelete={() => handleDelete(step.id)}
                    onResize={(newBars) => setArrangementStepBars(step.id, newBars)}
                    onDragStart={(e) => handleDragStart(idx, e)}
                  />
                </div>
              );
            })
          ) : (
            <div className="flex items-center justify-center w-full h-full text-muted-foreground text-sm">
              No arrangement steps. Click "Add Scene" to get started.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
