import { useStore } from '../../state/store';
import type { Effect } from '../../types/effects';
import { EFFECT_PARAM_DEFS } from '../../audio/effectParams';

const EFFECT_COLORS: Record<string, string> = {
  eq3:         '#BAF2FF', // cyan
  compressor:  '#FFB3BA', // pink
  reverb:      '#E8BAFF', // purple
  delay:       '#BAE1FF', // blue
  chorus:      '#BAFFC9', // green
  phaser:      '#FFD9BA', // orange
  distortion:  '#FFFFBA', // yellow
  filter:      '#FFB3E6', // magenta
};

const EFFECT_ICONS: Record<string, string> = {
  eq3: '≡', compressor: '⊓', reverb: '~', delay: '◷',
  chorus: '≈', phaser: '⊕', distortion: '⚡', filter: '◡',
};

interface EffectBlockProps {
  effect: Effect;
  instrumentId: string;
}

export function EffectBlock({ effect, instrumentId }: EffectBlockProps) {
  const toggleEffectEnabled = useStore((s) => s.toggleEffectEnabled);
  const toggleEffectCollapsed = useStore((s) => s.toggleEffectCollapsed);
  const setEffectParam = useStore((s) => s.setEffectParam);
  const removeEffect = useStore((s) => s.removeEffect);

  const paramDefs = EFFECT_PARAM_DEFS[effect.type] ?? [];
  const color = EFFECT_COLORS[effect.type] ?? '#94a3b8';

  return (
    <div
      className={`mx-3 mt-3 rounded cursor-default transition-colors ${
        effect.enabled ? '' : 'opacity-50'
      }`}
      style={{
        border: `1px solid ${color}`,
        padding: 16,
        marginBottom: 8,
      }}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 mb-1">
        {/* Enable dot */}
        <button
          onClick={() => toggleEffectEnabled(instrumentId, effect.id)}
          className="shrink-0 transition-all hover:scale-125 border border-transparent hover:border-white/20"
          style={{
            width: 10, height: 10, borderRadius: '50%',
            backgroundColor: effect.enabled ? color : '#555',
          }}
          title={effect.enabled ? 'Disable' : 'Enable'}
        />

        {/* Icon */}
        <span className="text-[10px] opacity-50 shrink-0 w-3 text-center">
          {EFFECT_ICONS[effect.type] ?? '?'}
        </span>

        {/* Label */}
        <span className="flex-1 text-[11px] text-text-primary truncate min-w-0">
          {effect.label}
        </span>

        {/* Collapse */}
        <button
          onClick={() => toggleEffectCollapsed(instrumentId, effect.id)}
          className="text-white/25 hover:text-white/50 text-[10px] shrink-0 transition-colors"
          title={effect.collapsed ? 'Expand' : 'Collapse'}
        >
          {effect.collapsed ? '+' : '−'}
        </button>

        {/* Remove */}
        <button
          onClick={() => removeEffect(instrumentId, effect.id)}
          className="text-white/25 hover:text-red-400 text-[10px] shrink-0 transition-colors"
          title="Remove"
        >
          ×
        </button>
      </div>

      {/* Parameter sliders */}
      {!effect.collapsed && paramDefs.length > 0 && (
        <div className="flex flex-col gap-2 mt-2">
          {paramDefs.map((def) => {
            const val = effect.params[def.key] ?? def.defaultValue;
            const displayVal = def.unit
              ? `${(def.unit === 'dB' || def.unit === 'Hz')
                  ? val.toFixed(def.step < 1 ? 1 : 0)
                  : val.toFixed(def.step < 0.01 ? 3 : 2)} ${def.unit}`
              : val.toFixed(def.step < 0.01 ? 3 : 2);
            return (
              <div key={def.key} className="flex items-center gap-1.5">
                <span className="text-[9px] text-text-secondary w-14 shrink-0 truncate">
                  {def.label}
                </span>
                <input
                  type="range"
                  min={def.min}
                  max={def.max}
                  step={def.step}
                  value={val}
                  onChange={(e) => setEffectParam(instrumentId, effect.id, def.key, parseFloat(e.target.value))}
                  className="inst-slider flex-1 h-1"
                  style={{ '--slider-color': color } as React.CSSProperties}
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
