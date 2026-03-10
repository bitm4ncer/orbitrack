import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../../state/store';
import { KnobRenderer } from '../../canvas/KnobRenderer';
import { getOrbitAnalyser } from '../../audio/orbitEffects';

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
  const levelBarRef = useRef<HTMLDivElement>(null);
  const levelStateRef = useRef({ level: 0 });

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
        const newVol = Math.max(-20, Math.min(20, inst.volume + delta));
        store.updateInstrument(instrumentId, { volume: newVol });
      } else {
        const newHits = Math.max(0, Math.min(inst.loopSize, inst.hits + delta));
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

  const orbitIndex = inst?.orbitIndex ?? -1;
  useEffect(() => {
    if (orbitIndex < 0) return;
    const data = new Float32Array(1024);
    let rafId: number;
    const draw = () => {
      const analyser = getOrbitAnalyser(orbitIndex);
      if (analyser && levelBarRef.current) {
        analyser.getFloatTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / data.length);
        const db = 20 * Math.log10(Math.max(rms, 1e-9));
        const raw = Math.max(0, Math.min(1, (db + 48) / 48));
        const s = levelStateRef.current;
        s.level = raw > s.level ? raw : Math.max(0, s.level - 0.02);
        levelBarRef.current.style.clipPath = `inset(${(1 - s.level) * 100}% 0 0 0)`;
      }
      rafId = requestAnimationFrame(draw);
    };
    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [orbitIndex]);

  if (!inst) return null;

  return (
    <div
      ref={cellRef}
      onClick={(e) => e.stopPropagation()}
      className={`knob-cell relative flex flex-col items-center gap-1 p-2 rounded-lg select-none
                  ${isSelected ? 'ring-1 ring-white/20 bg-white/5' : 'hover:bg-white/[0.02]'}`}
      style={{ border: `1px solid ${inst.color}22` }}
    >
      {/* Per-orbit level indicator — 2px bar centered on right border */}
      <div
        className="absolute top-0 overflow-hidden pointer-events-none"
        style={{ right: -1, width: 2, height: '100%', borderRadius: '0 8px 8px 0' }}
      >
        <div
          ref={levelBarRef}
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to top, #16a34a, #22c55e 55%, #f59e0b 75%, #f97316 88%, #ef4444)',
            clipPath: 'inset(100% 0 0 0)',
          }}
        />
      </div>

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
