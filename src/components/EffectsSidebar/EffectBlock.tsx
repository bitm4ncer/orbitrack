import { useStore } from '../../state/store';
import type { Effect } from '../../types/effects';
import { EFFECT_PARAM_DEFS } from '../../audio/effectParams';
import { EffectKnob } from './EffectKnob';
import { EQCurveDisplay } from './EQCurveDisplay';

export const EFFECT_COLORS: Record<string, string> = {
  eq3:         '#BAF2FF',
  compressor:  '#FFB3BA',
  reverb:      '#E8BAFF',
  delay:       '#BAE1FF',
  chorus:      '#BAFFC9',
  phaser:      '#FFD9BA',
  distortion:  '#FFFFBA',
  filter:      '#FFB3E6',
};

const EFFECT_ICONS: Record<string, string> = {
  eq3: '≡', compressor: '⊓', reverb: '~', delay: '◷',
  chorus: '≈', phaser: '⊕', distortion: '⋀', filter: '◡',
};

// ── per-effect body components ─────────────────────────────────────────────

interface BodyProps {
  effect: Effect;
  color: string;
  onChange: (key: string, val: number) => void;
}

function knobFor(
  effect: Effect, key: string, color: string,
  onChange: (k: string, v: number) => void,
  size: 'sm' | 'md' | 'lg' = 'md',
) {
  const defs = EFFECT_PARAM_DEFS[effect.type] ?? [];
  const def  = defs.find((d) => d.key === key);
  if (!def) return null;
  const val = effect.params[key] ?? def.defaultValue;
  return (
    <EffectKnob
      key={key}
      value={val} min={def.min} max={def.max} step={def.step}
      defaultValue={def.defaultValue}
      label={def.label} color={color} unit={def.unit}
      size={size}
      onChange={(v) => onChange(key, v)}
    />
  );
}

function EQ3Body({ effect, color, onChange }: BodyProps) {
  const p = effect.params;
  return (
    <div className="flex flex-col gap-2">
      <EQCurveDisplay
        lowGain={p.low ?? 0} midGain={p.mid ?? 0} highGain={p.high ?? 0}
        lowFreq={p.lowFreq ?? 200} midFreq={p.midFreq ?? 1000} highFreq={p.highFreq ?? 4000}
        color={color}
      />
      <div className="flex justify-around pt-1">
        {knobFor(effect, 'low',  color, onChange, 'md')}
        {knobFor(effect, 'mid',  color, onChange, 'md')}
        {knobFor(effect, 'high', color, onChange, 'md')}
      </div>
      <div className="flex justify-around">
        {knobFor(effect, 'lowFreq',  color, onChange, 'sm')}
        {knobFor(effect, 'midFreq',  color, onChange, 'sm')}
        {knobFor(effect, 'highFreq', color, onChange, 'sm')}
      </div>
    </div>
  );
}

function CompressorBody({ effect, color, onChange }: BodyProps) {
  const defs    = EFFECT_PARAM_DEFS.compressor;
  const thDef   = defs.find((d) => d.key === 'threshold')!;
  const thresh  = effect.params.threshold ?? thDef.defaultValue;
  const threshT = (thresh - thDef.min) / (thDef.max - thDef.min);
  return (
    <div className="flex flex-col gap-3">
      {/* Threshold — horizontal slider (dB range is clearer linearly) */}
      <div className="flex flex-col gap-1">
        <div className="flex justify-between">
          <span className="fx-param-label">Threshold</span>
          <span className="fx-param-value" style={{ color }}>{thresh.toFixed(0)} dB</span>
        </div>
        <div className="relative h-3 flex items-center">
          <div className="w-full h-[3px] rounded-full" style={{ background: `${color}28` }} />
          <div
            className="absolute left-0 h-[3px] rounded-full"
            style={{ width: `${threshT * 100}%`, background: color }}
          />
          <input
            type="range"
            min={thDef.min} max={thDef.max} step={thDef.step}
            value={thresh}
            onChange={(e) => onChange('threshold', parseFloat(e.target.value))}
            className="absolute inset-0 opacity-0 w-full cursor-pointer"
          />
        </div>
      </div>
      <div className="flex justify-around">
        {knobFor(effect, 'ratio',   color, onChange, 'sm')}
        {knobFor(effect, 'attack',  color, onChange, 'sm')}
        {knobFor(effect, 'release', color, onChange, 'sm')}
        {knobFor(effect, 'knee',    color, onChange, 'sm')}
      </div>
      <div className="flex justify-start">
        {knobFor(effect, 'makeupGain', color, onChange, 'sm')}
      </div>
    </div>
  );
}

function ReverbBody({ effect, color, onChange }: BodyProps) {
  return (
    <div className="flex justify-around">
      {knobFor(effect, 'amount', color, onChange, 'lg')}
      {knobFor(effect, 'size',   color, onChange, 'md')}
      {knobFor(effect, 'fade',   color, onChange, 'md')}
    </div>
  );
}

function DelayBody({ effect, color, onChange }: BodyProps) {
  return (
    <div className="flex justify-around">
      {knobFor(effect, 'time',     color, onChange, 'lg')}
      {knobFor(effect, 'amount',   color, onChange, 'md')}
      {knobFor(effect, 'feedback', color, onChange, 'md')}
      {knobFor(effect, 'tone',     color, onChange, 'sm')}
    </div>
  );
}

function ChorusBody({ effect, color, onChange }: BodyProps) {
  return (
    <div className="flex justify-around">
      {knobFor(effect, 'amount', color, onChange, 'md')}
      {knobFor(effect, 'rate',   color, onChange, 'md')}
      {knobFor(effect, 'depth',  color, onChange, 'md')}
      {knobFor(effect, 'delay',  color, onChange, 'sm')}
    </div>
  );
}

function PhaserBody({ effect, color, onChange }: BodyProps) {
  const stages = effect.params.stages ?? 4;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-around">
        {knobFor(effect, 'amount',   color, onChange, 'md')}
        {knobFor(effect, 'rate',     color, onChange, 'md')}
        {knobFor(effect, 'depth',    color, onChange, 'md')}
        {knobFor(effect, 'baseFreq', color, onChange, 'sm')}
      </div>
      {/* Stages — discrete button group */}
      <div className="flex items-center gap-1">
        <span className="fx-param-label" style={{ marginRight: 2, flexShrink: 0 }}>Stages</span>
        {[2, 4, 6, 8, 10, 12].map((n) => (
          <button
            key={n}
            onClick={() => onChange('stages', n)}
            className="fx-stages-btn"
            style={{
              background: stages === n ? `${color}28` : 'transparent',
              border: `1px solid ${stages === n ? color : '#2a2a3a'}`,
              color: stages === n ? color : '#8888a0',
            }}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function DistortionBody({ effect, color, onChange }: BodyProps) {
  return (
    <div className="flex justify-around items-end">
      {knobFor(effect, 'drive',  color, onChange, 'lg')}
      {knobFor(effect, 'amount', color, onChange, 'md')}
    </div>
  );
}

function FilterBody({ effect, color, onChange }: BodyProps) {
  return (
    <div className="flex justify-around">
      {knobFor(effect, 'frequency', color, onChange, 'lg')}
      {knobFor(effect, 'q',         color, onChange, 'md')}
      {knobFor(effect, 'amount',    color, onChange, 'md')}
    </div>
  );
}

const BODY_MAP: Record<string, React.ComponentType<BodyProps>> = {
  eq3:        EQ3Body,
  compressor: CompressorBody,
  reverb:     ReverbBody,
  delay:      DelayBody,
  chorus:     ChorusBody,
  phaser:     PhaserBody,
  distortion: DistortionBody,
  filter:     FilterBody,
};

// ── main component ─────────────────────────────────────────────────────────

interface EffectBlockProps {
  effect: Effect;
  instrumentId: string;
  index: number;
  totalEffects: number;
}

export function EffectBlock({ effect, instrumentId, index, totalEffects }: EffectBlockProps) {
  const toggleEffectEnabled   = useStore((s) => s.toggleEffectEnabled);
  const toggleEffectCollapsed = useStore((s) => s.toggleEffectCollapsed);
  const setEffectParam        = useStore((s) => s.setEffectParam);
  const removeEffect          = useStore((s) => s.removeEffect);
  const reorderEffects        = useStore((s) => s.reorderEffects);

  const color    = EFFECT_COLORS[effect.type] ?? '#94a3b8';
  const onChange = (key: string, val: number) =>
    setEffectParam(instrumentId, effect.id, key, val);

  const BodyComponent = BODY_MAP[effect.type] ?? null;

  return (
    <div
      className={`rounded transition-opacity select-none overflow-hidden ${effect.enabled ? '' : 'opacity-40'}`}
      style={{
        border: `1px solid ${color}50`,
        background: `${color}07`,
        padding: '10px 10px 12px',
        marginBottom: 6,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={() => toggleEffectEnabled(instrumentId, effect.id)}
          className="shrink-0 transition-all hover:scale-125"
          style={{
            width: 9, height: 9, borderRadius: '50%',
            background: effect.enabled ? color : '#444',
            border: `1px solid ${effect.enabled ? color : '#555'}`,
            boxShadow: effect.enabled ? `0 0 5px ${color}90` : 'none',
          }}
          title={effect.enabled ? 'Disable' : 'Enable'}
        />
        <span className="fx-block-icon">{EFFECT_ICONS[effect.type]}</span>
        <span className="fx-block-label flex-1 truncate min-w-0" style={{ color }}>
          {effect.label}
        </span>
        <button
          onClick={() => reorderEffects(instrumentId, index, index - 1)}
          disabled={index === 0}
          className="fx-block-btn text-white/20 hover:text-white/50 disabled:opacity-10 disabled:cursor-default"
          title="Move up"
        >
          ↑
        </button>
        <button
          onClick={() => reorderEffects(instrumentId, index, index + 1)}
          disabled={index === totalEffects - 1}
          className="fx-block-btn text-white/20 hover:text-white/50 disabled:opacity-10 disabled:cursor-default"
          title="Move down"
        >
          ↓
        </button>
        <button
          onClick={() => toggleEffectCollapsed(instrumentId, effect.id)}
          className="fx-block-btn text-white/20 hover:text-white/50"
        >
          {effect.collapsed ? '+' : '−'}
        </button>
        <button
          onClick={() => removeEffect(instrumentId, effect.id)}
          className="fx-block-btn text-white/20 hover:text-red-400"
        >
          ×
        </button>
      </div>

      {!effect.collapsed && BodyComponent && (
        <BodyComponent effect={effect} color={color} onChange={onChange} />
      )}
    </div>
  );
}
