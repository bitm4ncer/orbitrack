import { useEffect, useRef, useCallback, useState } from 'react';
import { useStore } from '../../state/store';
import { KnobRenderer } from '../../canvas/KnobRenderer';
import { getOrbitAnalyser } from '../../audio/orbitEffects';
import { fetchSampleTree, type SampleEntry } from '../../audio/sampleApi';
import { previewSample } from '../../audio/sampler';
import { findSiblings, preloadNeighbors } from '../../audio/sampleCache';
import { SamplePickerPopup } from '../SampleBank/SamplePickerPopup';
import { EFFECT_PARAM_DEFS, QUICK_PARAM_KEYS } from '../../audio/effectParams';
import { EFFECT_COLORS, EFFECT_ICONS } from '../EffectsSidebar/EffectBlock';
import { EffectKnob } from '../EffectsSidebar/EffectKnob';
import type { Effect } from '../../types/effects';

// ── EffectPill ───────────────────────────────────────────────────────────────

function EffectPill({ effect, instrumentId }: { effect: Effect; instrumentId: string }) {
  const toggleEffectEnabled = useStore((s) => s.toggleEffectEnabled);
  const setEffectParam = useStore((s) => s.setEffectParam);
  const [hovered, setHovered] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const color = EFFECT_COLORS[effect.type] ?? '#94a3b8';
  const icon = EFFECT_ICONS[effect.type] ?? '?';
  const quickKeys = QUICK_PARAM_KEYS[effect.type] ?? [];
  const defs = EFFECT_PARAM_DEFS[effect.type as keyof typeof EFFECT_PARAM_DEFS] ?? [];

  const handleEnter = useCallback(() => {
    if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null; }
    setHovered(true);
    hoverTimer.current = setTimeout(() => setShowPopup(true), 300);
  }, []);

  const handleLeave = useCallback(() => {
    if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null; }
    setHovered(false);
    leaveTimer.current = setTimeout(() => setShowPopup(false), 200);
  }, []);

  const handlePopupEnter = useCallback(() => {
    if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null; }
  }, []);

  const handlePopupLeave = useCallback(() => {
    leaveTimer.current = setTimeout(() => { setShowPopup(false); setHovered(false); }, 200);
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    };
  }, []);

  return (
    <div className="relative" style={{ zIndex: showPopup ? 50 : 'auto' }}>
      <button
        onClick={(e) => { e.stopPropagation(); toggleEffectEnabled(instrumentId, effect.id); }}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        className="flex items-center justify-center rounded-full transition-all cursor-pointer"
        style={{
          width: 18, height: 18,
          background: effect.enabled ? color : `${color}44`,
          border: `1px solid ${effect.enabled ? color : `${color}66`}`,
          boxShadow: effect.enabled && hovered ? `0 0 6px ${color}60` : 'none',
          transform: hovered ? 'scale(1.15)' : 'scale(1)',
          opacity: effect.enabled ? 1 : 0.5,
        }}
        title={`${effect.label} — click to ${effect.enabled ? 'disable' : 'enable'}`}
      >
        <span className="select-none leading-none font-bold" style={{
          fontSize: 9, color: 'rgba(0,0,0,0.6)',
        }}>{icon}</span>
      </button>

      {/* Quick-access popup */}
      {showPopup && quickKeys.length > 0 && (
        <div
          ref={(el) => {
            if (!el) return;
            // Native wheel listener to block cellRef's hits/volume handler
            el.onwheel = (ev) => { ev.stopPropagation(); };
          }}
          onMouseEnter={handlePopupEnter}
          onMouseLeave={handlePopupLeave}
          className="absolute left-1/2 rounded shadow-xl border border-border"
          style={{
            top: 'calc(100% + 6px)',
            transform: 'translateX(-50%)',
            background: '#1a1a28',
            borderTop: `2px solid ${color}`,
            padding: '8px 10px 6px',
            minWidth: 100,
            animation: 'fxPopIn 150ms ease-out',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Arrow */}
          <div style={{
            position: 'absolute', top: -6, left: '50%', transform: 'translateX(-50%)',
            width: 0, height: 0,
            borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
            borderBottom: `5px solid ${color}`,
          }} />
          {/* Effect label */}
          <div className="text-[8px] uppercase tracking-wider text-center mb-1.5 font-medium"
            style={{ color: `${color}cc` }}>{effect.label}</div>
          {/* Knobs */}
          <div className="flex gap-1 justify-center">
            {quickKeys.map((key) => {
              const def = defs.find((d) => d.key === key);
              if (!def) return null;
              const val = effect.params[key] ?? def.defaultValue;
              return (
                <EffectKnob
                  key={key}
                  value={val} min={def.min} max={def.max} step={def.step}
                  defaultValue={def.defaultValue}
                  label={def.label} color={color} unit={def.unit}
                  size="sm"
                  onChange={(v) => setEffectParam(instrumentId, effect.id, key, v)}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── EffectStrip ──────────────────────────────────────────────────────────────

function EffectStrip({ instrumentId }: { instrumentId: string }) {
  const effects = useStore((s) => s.instrumentEffects[instrumentId]);

  return (
    <div
      className="flex flex-wrap gap-1 justify-center w-full px-1 min-h-[20px]"
      onClick={(e) => e.stopPropagation()}
    >
      {effects?.map((fx) => (
        <EffectPill key={fx.id} effect={fx} instrumentId={instrumentId} />
      ))}
    </div>
  );
}

// ── KnobCanvas ───────────────────────────────────────────────────────────────

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

  // Sample picker popup
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupAnchor, setPopupAnchor] = useState<DOMRect | null>(null);
  const [tree, setTree] = useState<SampleEntry[]>([]);
  const nameSpanRef = useRef<HTMLSpanElement>(null);
  const isHoveringName = useRef(false);
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Fetch sample tree once (module-level cached, near-instant on repeat calls)
  useEffect(() => {
    fetchSampleTree().then(setTree).catch(() => {/* silently ignore */});
  }, []);

  // Wheel on name span: browse siblings without triggering the cellRef handler
  useEffect(() => {
    const span = nameSpanRef.current;
    if (!span || tree.length === 0) return;

    const onNameWheel = (e: WheelEvent) => {
      if (!isHoveringName.current) return;
      e.stopPropagation(); // block cellRef's hits/volume/loop handler
      e.preventDefault();  // block page scroll

      // Read live store to avoid stale-closure issues on rapid scrolling
      const liveInst = useStore.getState().instruments.find((i) => i.id === instrumentId);
      const currentPath = liveInst?.samplePath ?? '';
      if (!currentPath) return; // no path to browse from yet

      const siblings = findSiblings(currentPath, tree);
      if (siblings.length === 0) return;

      const idx = siblings.findIndex((s) => s.path === currentPath);
      const delta = e.deltaY < 0 ? -1 : 1;
      const nextIdx = Math.max(0, Math.min(siblings.length - 1, (idx < 0 ? 0 : idx) + delta));
      const next = siblings[nextIdx];
      if (!next || next.path === currentPath) return;

      const displayName = next.name.replace(/\.[^.]+$/, '');
      useStore.getState().assignSample(instrumentId, next.path, displayName);

      // Debounced preview so rapid scroll doesn't spam audio
      if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
      previewDebounceRef.current = setTimeout(() => previewSample(next.path), 150);

      // Preload neighbors around the new position
      preloadNeighbors(next.path, tree);
    };

    span.addEventListener('wheel', onNameWheel, { passive: false });
    return () => span.removeEventListener('wheel', onNameWheel);
  }, [instrumentId, tree]);

  const handleNameClick = useCallback((e: React.MouseEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    setPopupAnchor(e.currentTarget.getBoundingClientRect());
    setPopupOpen(true);
  }, []);

  const handleNameMouseEnter = useCallback(() => {
    isHoveringName.current = true;
    const liveInst = useStore.getState().instruments.find((i) => i.id === instrumentId);
    if (liveInst?.samplePath && tree.length > 0) {
      preloadNeighbors(liveInst.samplePath, tree);
    }
  }, [instrumentId, tree]);

  const handleNameMouseLeave = useCallback(() => {
    isHoveringName.current = false;
  }, []);

  const handleNameWheelPassthrough = useCallback((e: React.WheelEvent) => {
    // Prevent React's synthetic wheel from propagating while native listener handles it
    e.stopPropagation();
  }, []);

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
        className="absolute top-1 right-1 w-[18px] h-[18px] rounded-full border border-white/20 cursor-pointer z-10 flex items-center justify-center transition-all hover:opacity-70"
        style={{ background: inst.color, opacity: inst.muted ? 0.3 : 1 }}
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
      <span
        ref={nameSpanRef}
        className="text-[9px] text-text-secondary truncate max-w-full px-1 cursor-pointer hover:text-text-primary transition-colors"
        title="Click to pick sample · Scroll to browse"
        onClick={handleNameClick}
        onMouseEnter={handleNameMouseEnter}
        onMouseLeave={handleNameMouseLeave}
        onWheel={handleNameWheelPassthrough}
      >
        {inst.name}
      </span>
      {/* Effect quick-access strip */}
      <EffectStrip instrumentId={instrumentId} />
      {popupOpen && popupAnchor && tree.length > 0 && (
        <SamplePickerPopup
          instrumentId={instrumentId}
          anchorRect={popupAnchor}
          tree={tree}
          onClose={() => setPopupOpen(false)}
        />
      )}
    </div>
  );
}
