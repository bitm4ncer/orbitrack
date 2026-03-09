import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../../state/store';
import { KnobRenderer } from '../../canvas/KnobRenderer';

interface Props {
  instrumentId: string;
}

export function KnobCanvas({ instrumentId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cellRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<KnobRenderer | null>(null);
  const isDragging = useRef(false);
  const hasDragged = useRef(false);
  const dragHitIndex = useRef<number | null>(null);

  const isSelected = useStore((s) => s.selectedInstrumentId === instrumentId);
  const inst = useStore((s) => s.instruments.find((i) => i.id === instrumentId));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new KnobRenderer(canvas, instrumentId);
    rendererRef.current = renderer;
    renderer.resize();
    renderer.start();

    const handleResize = () => renderer.resize();
    const observer = new ResizeObserver(handleResize);
    observer.observe(canvas);

    return () => {
      renderer.stop();
      observer.disconnect();
    };
  }, [instrumentId]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    isDragging.current = true;
    hasDragged.current = false;
    dragHitIndex.current = renderer.getHitAt(x, y);
    useStore.getState().selectInstrument(instrumentId);
  }, [instrumentId]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging.current || dragHitIndex.current === null) return;
    const renderer = rendererRef.current;
    if (!renderer) return;
    hasDragged.current = true;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const angle = renderer.getAngleAt(x, y);
    useStore.getState().setHitPosition(instrumentId, dragHitIndex.current, angle);
  }, [instrumentId]);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    dragHitIndex.current = null;
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (hasDragged.current) return;
    const renderer = rendererRef.current;
    if (!renderer) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    // Add hit only if clicking near the ring and not on an existing hit
    if (renderer.isOnRing(x, y) && renderer.getHitAt(x, y) === null) {
      const angle = renderer.getAngleAt(x, y);
      const store = useStore.getState();
      const inst = store.instruments.find((i) => i.id === instrumentId);
      if (inst?.type === 'sampler') {
        store.addSamplerHit(instrumentId, angle);
      } else {
        store.addHit(instrumentId, angle);
      }
    }
  }, [instrumentId]);

  useEffect(() => {
    const cell = cellRef.current;
    if (!cell) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const store = useStore.getState();
      const inst = store.instruments.find((i) => i.id === instrumentId);
      if (!inst) return;
      const delta = e.deltaY < 0 ? 1 : -1;
      if (e.ctrlKey) {
        store.setLoopSize(instrumentId, inst.loopSize + delta);
      } else if (e.altKey) {
        const newVol = Math.max(-20, Math.min(6, inst.volume + delta));
        store.updateInstrument(instrumentId, { volume: newVol });
      } else {
        const newHits = Math.max(1, Math.min(inst.loopSize, inst.hits + delta));
        store.setHitCount(instrumentId, newHits);
      }
    };
    cell.addEventListener('wheel', onWheel, { passive: false });
    return () => cell.removeEventListener('wheel', onWheel);
  }, [instrumentId]);

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hitIndex = renderer.getHitAt(x, y);
    if (hitIndex !== null) {
      e.stopPropagation();
      useStore.getState().removeHit(instrumentId, hitIndex);
    }
  }, [instrumentId]);

  if (!inst) return null;

  return (
    <div
      ref={cellRef}
      className={`knob-cell relative flex flex-col items-center gap-1 p-2 rounded-lg select-none
                  ${isSelected ? 'ring-1 ring-white/20 bg-white/5' : 'hover:bg-white/[0.02]'}`}
      style={{ border: `1px solid ${inst.color}22` }}
    >
      {/* Solo (top-left) */}
      <button
        className="absolute top-1 left-1 w-[18px] h-[18px] rounded-full border border-white/20 cursor-pointer z-10 flex items-center justify-center transition-all hover:!opacity-90 hover:![background:#ffd700]"
        style={{ background: inst.solo ? '#ffd700' : inst.color, opacity: inst.solo ? 0.9 : 0.4 }}
        title="Solo"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); useStore.getState().toggleSolo(instrumentId); }}
      >
        <span className="text-[9px] font-bold text-black/70 leading-none select-none">S</span>
      </button>
      {/* Mute (top-right) */}
      <button
        className="absolute top-1 right-1 w-[18px] h-[18px] rounded-full border border-white/20 cursor-pointer z-10 flex items-center justify-center transition-all hover:!opacity-90"
        style={{ background: inst.muted ? '#555' : inst.color, opacity: inst.muted ? 0.9 : 0.4 }}
        title="Mute"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); useStore.getState().toggleMute(instrumentId); }}
      >
        <span className="text-[9px] font-bold text-black/70 leading-none select-none">M</span>
      </button>
      {/* Delete (bottom-left) */}
      <button
        className="absolute bottom-5 left-1 w-[18px] h-[18px] rounded-full border border-white/20 cursor-pointer z-10 flex items-center justify-center transition-all hover:!bg-red-500 hover:!opacity-90"
        style={{ background: '#444', opacity: 0.4 }}
        title="Delete"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); useStore.getState().removeInstrument(instrumentId); }}
      >
        <span className="text-[11px] font-bold text-white/70 leading-none select-none">×</span>
      </button>
      {/* Duplicate (bottom-right) */}
      <button
        className="absolute bottom-5 right-1 w-[18px] h-[18px] rounded-full border border-white/20 cursor-pointer z-10 flex items-center justify-center transition-all hover:!bg-emerald-500 hover:!opacity-90"
        style={{ background: '#444', opacity: 0.4 }}
        title="Duplicate (muted)"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); useStore.getState().duplicateInstrument(instrumentId); }}
      >
        <span className="text-[11px] font-bold text-white/70 leading-none select-none">+</span>
      </button>
      <canvas
        ref={canvasRef}
        className="w-full aspect-square cursor-pointer"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      />
      <span className="text-[9px] text-text-secondary truncate max-w-full px-1">
        {inst.name}
      </span>
    </div>
  );
}
