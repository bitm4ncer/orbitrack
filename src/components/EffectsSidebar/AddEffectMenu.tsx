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
  { type: 'distortion', label: 'Distortion', icon: '⚡' },
  { type: 'filter', label: 'Filter', icon: '◡' },
];

export function AddEffectMenu() {
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
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-6 h-6 rounded flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-white/10 transition-colors text-sm font-bold"
        title="Add effect"
      >
        +
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-bg-secondary border border-border rounded shadow-xl z-50 min-w-[160px]">
          {EFFECT_OPTIONS.map(({ type, label, icon }) => (
            <button
              key={type}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-[11px] text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors"
              onClick={() => {
                addEffect(type);
                setOpen(false);
              }}
            >
              <span className="w-4 text-center opacity-60">{icon}</span>
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
