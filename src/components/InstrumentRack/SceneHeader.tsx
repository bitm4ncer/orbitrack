import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../state/store';
import type { InstrumentScene } from '../../types/scene';

// Reuse Knob28 inline (same pattern as InstrumentRack)
function Knob28({ value, min, max, step = 1, color, format, onChange }: {
  label?: string; value: number; min: number; max: number; step?: number;
  color: string; format?: (v: number) => string; onChange: (v: number) => void;
}) {
  const norm = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const angleDeg = -135 + norm * 270;
  const angleRad = (angleDeg * Math.PI) / 180;
  const lx = Math.sin(angleRad) * 0.62;
  const ly = -Math.cos(angleRad) * 0.62;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startVal = value;
    const range = max - min;
    const onMove = (ev: MouseEvent) => {
      const dy = startY - ev.clientY;
      const raw = startVal + Math.round((dy / 80) * range / step) * step;
      onChange(Math.max(min, Math.min(max, raw)));
    };
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const displayVal = format ? format(value) : String(value);

  return (
    <div className="flex flex-col items-center gap-0" onClick={(e) => e.stopPropagation()}>
      <svg width="22" height="22" viewBox="-1 -1 2 2" onMouseDown={handleMouseDown} style={{ cursor: 'ns-resize' }}>
        <circle cx="0" cy="0" r="0.80" fill="none" stroke={color} strokeWidth="0.10" opacity="0.6" />
        <line x1="0" y1="0" x2={lx} y2={ly} stroke={color} strokeWidth="0.14" strokeLinecap="round" />
      </svg>
      <span className="text-[7px] text-text-secondary font-mono">{displayVal}</span>
    </div>
  );
}

export function SceneHeader({ scene }: { scene: InstrumentScene }) {
  const selectedSceneId = useStore((s) => s.selectedSceneId);
  const renamingId = useStore((s) => s.renamingId);
  const isSelected = selectedSceneId === scene.id;
  const isRenaming = renamingId === scene.id;
  const [nameVal, setNameVal] = useState(scene.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming) {
      setNameVal(scene.name);
      requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.select(); });
    }
  }, [isRenaming]);

  const commitName = () => {
    const trimmed = nameVal.trim();
    if (trimmed && trimmed !== scene.name) useStore.getState().renameScene(scene.id, trimmed);
    useStore.getState().setRenamingId(null);
  };

  return (
    <div
      onClick={() => useStore.getState().selectScene(scene.id)}
      className={`flex items-center gap-2 px-3 py-2 rounded-t-lg cursor-pointer transition-colors
                  ${isSelected ? 'bg-white/[0.07]' : 'hover:bg-white/[0.03]'}`}
      style={{
        background: isSelected ? `${scene.color}12` : undefined,
      }}
    >
      {/* Collapse toggle */}
      <button
        onClick={(e) => { e.stopPropagation(); useStore.getState().toggleSceneCollapsed(scene.id); }}
        className="p-0.5 rounded hover:bg-white/10 transition-colors cursor-pointer"
        title={scene.collapsed ? 'Expand' : 'Collapse'}
      >
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="currentColor"
          className="text-white/40 transition-transform"
          style={{ transform: scene.collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
        >
          <path d="M2 3 L5 7 L8 3" />
        </svg>
      </button>

      {/* Mute dot */}
      <button
        onClick={(e) => { e.stopPropagation(); useStore.getState().toggleSceneMute(scene.id); }}
        className={`w-[10px] h-[10px] rounded-full shrink-0 transition-all hover:scale-125 cursor-pointer ${scene.muted ? '' : 'hover:opacity-70'}`}
        style={{
          backgroundColor: scene.muted ? '#555' : scene.color,
          border: `1px solid ${scene.muted ? '#666' : scene.color}`,
        }}
        title={scene.muted ? 'Unmute scene' : 'Mute scene'}
      />

      {/* Scene name */}
      {isRenaming ? (
        <input
          ref={inputRef}
          value={nameVal}
          onChange={(e) => setNameVal(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitName();
            if (e.key === 'Escape') useStore.getState().setRenamingId(null);
          }}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 text-[10px] font-medium bg-bg-tertiary border border-border rounded px-1 py-0.5 text-text-primary outline-none"
          style={{ color: scene.color, minWidth: 0 }}
        />
      ) : (
        <span
          className="flex-1 text-[10px] font-medium truncate"
          style={{ color: scene.color }}
          onDoubleClick={(e) => { e.stopPropagation(); useStore.getState().setRenamingId(scene.id); }}
          title="Double-click to rename"
        >
          {scene.name}
        </span>
      )}

      {/* Solo dot */}
      <button
        onClick={(e) => { e.stopPropagation(); useStore.getState().toggleSceneSolo(scene.id); }}
        className="w-[12px] h-[12px] rounded-full border border-white/20 flex items-center justify-center shrink-0 transition-all hover:opacity-90 cursor-pointer"
        style={{
          background: scene.solo ? '#ffd700' : scene.color,
          opacity: scene.solo ? 1 : 0.3,
          boxShadow: scene.solo ? '0 0 6px #ffd70070' : 'none',
        }}
        title={scene.solo ? 'Unsolo scene' : 'Solo scene'}
      >
        <span className="text-[7px] font-bold text-black/70 leading-none select-none">S</span>
      </button>

      {/* Gain knob */}
      <Knob28
        label=""
        value={scene.volume}
        min={-20}
        max={20}
        color={scene.color}
        format={(v) => `${v > 0 ? '+' : ''}${v}`}
        onChange={(v) => useStore.getState().setSceneVolume(scene.id, v)}
      />
    </div>
  );
}
