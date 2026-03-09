import { useStore } from '../../state/store';
import type { Effect } from '../../types/effects';
import { EFFECT_PARAM_DEFS } from '../../audio/effectParams';
import { PortDot } from '../CableEditor/PortDot';
import { effectInPortId, effectOutPortId } from '../CableEditor/PortContext';

const EFFECT_ICONS: Record<string, string> = {
  eq3: '≡',
  compressor: '⊓',
  reverb: '~',
  delay: '◷',
  chorus: '≈',
  phaser: '⊕',
  distortion: '⚡',
  filter: '◡',
};

interface EffectBlockProps {
  effect: Effect;
}

export function EffectBlock({ effect }: EffectBlockProps) {
  const toggleEffectEnabled = useStore((s) => s.toggleEffectEnabled);
  const toggleEffectCollapsed = useStore((s) => s.toggleEffectCollapsed);
  const setEffectParam = useStore((s) => s.setEffectParam);
  const removeEffect = useStore((s) => s.removeEffect);

  const paramDefs = EFFECT_PARAM_DEFS[effect.type] ?? [];

  return (
    <div
      className={`relative mx-2 my-1.5 rounded border transition-colors ${
        effect.enabled ? 'border-border bg-bg-tertiary/60' : 'border-border/40 bg-bg/40 opacity-60'
      }`}
    >
      {/* Left In-port */}
      <div className="absolute -left-2 top-1/2 -translate-y-1/2 z-10">
        <PortDot portId={effectInPortId(effect.id)} label="In" />
      </div>

      {/* Right Out-port */}
      <div className="absolute -right-2 top-1/2 -translate-y-1/2 z-10">
        <PortDot portId={effectOutPortId(effect.id)} label="Out" />
      </div>

      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-1.5">
        {/* Enable toggle */}
        <button
          onClick={() => toggleEffectEnabled(effect.id)}
          className={`w-2.5 h-2.5 rounded-full border transition-colors shrink-0 ${
            effect.enabled ? 'bg-accent border-accent' : 'bg-transparent border-white/30'
          }`}
          title={effect.enabled ? 'Disable' : 'Enable'}
        />

        {/* Icon */}
        <span className="text-[10px] opacity-50 shrink-0 w-4 text-center">
          {EFFECT_ICONS[effect.type] ?? '?'}
        </span>

        {/* Label */}
        <span className="flex-1 text-[10px] text-text-primary font-medium truncate min-w-0">
          {effect.label}
        </span>

        {/* Collapse chevron */}
        <button
          onClick={() => toggleEffectCollapsed(effect.id)}
          className="text-text-secondary hover:text-text-primary text-[10px] shrink-0 px-1 transition-colors"
          title={effect.collapsed ? 'Expand' : 'Collapse'}
        >
          {effect.collapsed ? '›' : '‹'}
        </button>

        {/* Remove */}
        <button
          onClick={() => removeEffect(effect.id)}
          className="text-text-secondary hover:text-red-400 text-[10px] shrink-0 transition-colors"
          title="Remove effect"
        >
          ×
        </button>
      </div>

      {/* Params */}
      {!effect.collapsed && paramDefs.length > 0 && (
        <div className="px-3 pb-2 flex flex-col gap-1.5">
          {paramDefs.map((def) => {
            const val = effect.params[def.key] ?? def.defaultValue;
            const displayVal = def.unit
              ? `${def.unit === 'dB' || def.unit === 'Hz' ? val.toFixed(def.step < 1 ? 1 : 0) : val.toFixed(def.step < 0.01 ? 3 : 2)} ${def.unit}`
              : val.toFixed(def.step < 0.01 ? 3 : 2);
            return (
              <div key={def.key} className="flex items-center gap-2">
                <span className="text-[9px] text-text-secondary w-14 shrink-0 truncate">
                  {def.label}
                </span>
                <input
                  type="range"
                  min={def.min}
                  max={def.max}
                  step={def.step}
                  value={val}
                  onChange={(e) => setEffectParam(effect.id, def.key, parseFloat(e.target.value))}
                  className="flex-1 h-0.5 accent-accent cursor-pointer"
                />
                <span className="text-[9px] text-text-secondary w-12 text-right shrink-0 font-mono">
                  {displayVal}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
