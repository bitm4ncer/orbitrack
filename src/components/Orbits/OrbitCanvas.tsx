import { useRef, useEffect, useCallback } from 'react';
import { OrbitRenderer } from '../../canvas/OrbitRenderer';
import { useStore } from '../../state/store';

export function OrbitCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<OrbitRenderer | null>(null);
  const isDragging = useRef(false);
  const didDrag = useRef(false);
  const dragTarget = useRef<{ instrumentId: string; hitIndex: number } | null>(null);
  const selectedInstrumentId = useStore((s) => s.selectedInstrumentId);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new OrbitRenderer(canvas);
    rendererRef.current = renderer;

    renderer.resize();
    renderer.start();

    const handleResize = () => renderer.resize();
    window.addEventListener('resize', handleResize);

    // Use ResizeObserver for container resize
    const observer = new ResizeObserver(handleResize);
    observer.observe(canvas.parentElement!);

    return () => {
      renderer.stop();
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
    };
  }, []);

  const handleRandomize = () => {
    if (selectedInstrumentId) {
      useStore.getState().randomizeHits(selectedInstrumentId);
    }
  };

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const renderer = rendererRef.current;
    const canvas = canvasRef.current;
    if (!renderer || !canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const hit = renderer.getHitAt(x, y);
    if (hit) {
      isDragging.current = true;
      didDrag.current = false;
      dragTarget.current = hit;
      canvas.style.cursor = 'grabbing';
      useStore.getState().selectInstrument(hit.instrumentId);
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const renderer = rendererRef.current;
    const canvas = canvasRef.current;
    if (!renderer || !canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (isDragging.current && dragTarget.current) {
      didDrag.current = true;
      canvas.style.cursor = 'grabbing';

      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const dx = x - cx;
      const dy = y - cy;
      const angle = Math.atan2(dy, dx);

      const state = useStore.getState();
      const rotation = state.isPlaying ? state.transportProgress * Math.PI * 2 : 0;
      const dotRotation = state.spinMode ? 0 : rotation;
      let normalizedPos = (angle - Math.PI / 2 + dotRotation) / (Math.PI * 2);
      normalizedPos = ((normalizedPos % 1) + 1) % 1;

      useStore.getState().setHitPosition(
        dragTarget.current.instrumentId,
        dragTarget.current.hitIndex,
        normalizedPos
      );
    } else {
      // Update cursor based on what's under the mouse
      const hit = renderer.getHitAt(x, y);
      if (hit) {
        canvas.style.cursor = 'grab';
      } else {
        const orbit = renderer.getOrbitAt(x, y);
        canvas.style.cursor = orbit ? 'copy' : 'default';
      }
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    dragTarget.current = null;
    if (canvasRef.current) {
      canvasRef.current.style.cursor = 'default';
    }
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (didDrag.current) return;
    if (!rendererRef.current) return;

    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Don't add hit if clicking on existing hit
    const existingHit = rendererRef.current.getHitAt(x, y);
    if (existingHit) return;

    const orbitInfo = rendererRef.current.getOrbitAt(x, y);
    if (orbitInfo) {
      const store = useStore.getState();
      const inst = store.instruments.find((i) => i.id === orbitInfo.instrumentId);
      if (inst?.type === 'sampler') {
        store.addSamplerHit(orbitInfo.instrumentId, orbitInfo.angle);
      } else {
        store.addHit(orbitInfo.instrumentId, orbitInfo.angle);
      }
    }
  }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (!rendererRef.current) return;

    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const hit = rendererRef.current.getHitAt(x, y);
    if (hit) {
      useStore.getState().removeHit(hit.instrumentId, hit.hitIndex);
    }
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const renderer = rendererRef.current;
    if (!renderer) return;
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    renderer.zoom = Math.max(0.3, Math.min(3, renderer.zoom + delta));
  }, []);

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="orbit-canvas w-full h-full"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
      />
      <button
        onClick={handleRandomize}
        disabled={!selectedInstrumentId}
        className="absolute bottom-4 right-4 bg-bg-tertiary text-text-secondary
                   px-3 py-1.5 text-xs rounded border border-border
                   hover:bg-bg-secondary hover:text-text-primary disabled:opacity-50
                   disabled:cursor-not-allowed transition-colors"
        title="Randomize selected instrument hits"
      >
        Randomize
      </button>
    </div>
  );
}
