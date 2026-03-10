import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../state/store';
import type { EffectType } from '../../types/effects';

const EFFECT_OPTIONS: { type: EffectType; label: string; icon: string }[] = [
  { type: 'eq3', label: 'EQ 3-Band', icon: '≡' },
  { type: 'compressor', label: 'Compressor', icon: '⊓' },
  { type: 'reverb', label: 'Reverb', icon: '~' },
  { type: 'delay', label: 'Delay', icon: '◷' },
  { type: 'chorus', label: 'Chorus', icon: '≈' },
  { type: 'phaser', label: 'Phaser', icon: '⊕' },
  { type: 'distortion', label: 'Distortion', icon: '⋀' },
  { type: 'filter', label: 'Filter', icon: '◡' },
];

export function AddEffectMenu({ instrumentId }: { instrumentId: string }) {
  const [open, setOpen] = useState(false);
  const addEffect = useStore((s) => s.addEffect);
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
        className="w-full flex items-center justify-center gap-1.5 py-2 rounded
                   border border-dashed border-border hover:border-white/30
                   text-[13px] text-text-secondary/60 hover:text-text-secondary
                   transition-colors"
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
                           text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors"
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
