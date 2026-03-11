import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../state/store';
import type { EffectType } from '../../types/effects';

const EFFECT_OPTIONS: { type: EffectType; label: string; icon: string }[] = [
  { type: 'eq3',        label: 'EQ 3-Band',  icon: '≡' },
  { type: 'parame',     label: 'Param EQ',   icon: '≋' },
  { type: 'compressor', label: 'Compressor', icon: '⊓' },
  { type: 'reverb',     label: 'Reverb',     icon: '~' },
  { type: 'delay',      label: 'Delay',      icon: '◷' },
  { type: 'chorus',     label: 'Chorus',     icon: '≈' },
  { type: 'phaser',     label: 'Phaser',     icon: '⊕' },
  { type: 'distortion', label: 'Distortion', icon: '⋀' },
  { type: 'filter',     label: 'Filter',     icon: '◡' },
  { type: 'bitcrusher', label: 'Bit Crusher', icon: '⊞' },
  { type: 'tremolo',    label: 'Tremolo',     icon: '∿' },
  { type: 'ringmod',    label: 'Ring Mod',    icon: '⊗' },
  { type: 'trancegate', label: 'Orb Gate',    icon: '◉' },
  { type: 'limiter',     label: 'Limiter',      icon: '⊔' },
  { type: 'drumbuss',    label: 'Drum Buss',    icon: '⊚' },
  { type: 'stereoimage', label: 'Stereo Image', icon: '↔' },
];

export function AddEffectMenu({ instrumentId }: { instrumentId: string }) {
  const [open, setOpen] = useState(false);
  const addEffect = useStore((s) => s.addEffect);
  const instColor = useStore((s) => s.instruments.find((i) => i.id === instrumentId)?.color ?? '#8888a0');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative w-full">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-center gap-1.5 rounded
                   border border-dashed transition-colors text-[13px] cursor-pointer"
        style={{
          padding: '6px 0',
          borderColor: `${instColor}30`,
          color: `${instColor}99`,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = `${instColor}60`;
          e.currentTarget.style.color = instColor;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = `${instColor}30`;
          e.currentTarget.style.color = `${instColor}99`;
        }}
        title="Add effect"
      >
        <span className="text-[12px] leading-none">+</span>
        Add Effect
      </button>

      {open && (
        <div className="absolute left-0 right-0 bottom-full mb-1 bg-bg-secondary border border-border rounded shadow-xl z-50">
          <div className="grid grid-cols-2 gap-px p-1">
            {EFFECT_OPTIONS.map(({ type, label, icon }) => (
              <button
                key={type}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded text-left text-[14px]
                           text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors cursor-pointer"
                onClick={() => {
                  addEffect(instrumentId, type);
                  setOpen(false);
                }}
              >
                <span className="opacity-60 w-3 text-center shrink-0">{icon}</span>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
