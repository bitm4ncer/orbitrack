import { useState, useRef } from 'react';
import { useStore } from '../../state/store';
import type { Effect } from '../../types/effects';
import { EFFECT_PARAM_DEFS } from '../../audio/effectParams';
import { EffectKnob } from './EffectKnob';
import { EQCurveDisplay } from './EQCurveDisplay';
import { FilterCurveDisplay } from './FilterCurveDisplay';
import { ParamEQDisplay, ParamEQTypeRow } from './ParamEQDisplay';
import type { BandParam } from './ParamEQDisplay';
import { CompressorDisplay } from './CompressorDisplay';
import { TranceGateDisplay } from './TranceGateDisplay';
import { DelayDisplay } from './DelayDisplay';
import { DELAY_SYNC_DIVS, DELAY_MODE_LABELS } from '../../audio/effectParams';
import { EffectPresetDropdown } from './EffectPresetDropdown';

export const EFFECT_COLORS: Record<string, string> = {
  eq3:         '#BAF2FF',
  parame:      '#A0E8FF',
  compressor:  '#FFB3BA',
  reverb:      '#E8BAFF',
  delay:       '#BAE1FF',
  chorus:      '#BAFFC9',
  phaser:      '#FFD9BA',
  distortion:  '#FFFFBA',
  filter:      '#FFB3E6',
  bitcrusher:  '#C8BAFF',
  tremolo:     '#FFE0BA',
  ringmod:     '#BAFFF0',
  trancegate:  '#FF9EBA',
  limiter:     '#FFB3B3',
  drumbuss:    '#FFD4A3',
  stereoimage: '#B3D4FF',
};

export const EFFECT_ICONS: Record<string, string> = {
  eq3: '≡', parame: '≋', compressor: '⊓', reverb: '~', delay: '◷',
  chorus: '≈', phaser: '⊕', distortion: '⋀', filter: '◡',
  bitcrusher: '⊞', tremolo: '∿', ringmod: '⊗',
  trancegate: '◉',
  limiter: '⊔', drumbuss: '⊚', stereoimage: '↔',
};

// ── per-effect body components ─────────────────────────────────────────────

interface BodyProps {
  effect: Effect;
  color: string;
  instrumentId: string;
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

// Shared discrete button row (filter type, distortion type, phaser stages)
function TypeButtons({
  labels, value, color, onChange,
}: { labels: string[]; value: number; color: string; onChange: (i: number) => void }) {
  return (
    <>
      {labels.map((label, i) => (
        <button
          key={i}
          onClick={() => onChange(i)}
          className="fx-stages-btn"
          style={{
            background: value === i ? `${color}28` : 'transparent',
            border: `1px solid ${value === i ? color : '#2a2a3a'}`,
            color: value === i ? color : '#8888a0',
          }}
        >
          {label}
        </button>
      ))}
    </>
  );
}

// ── EQ3 — 3-band parametric with adjustable mid Q ─────────────────────────

function EQ3Body({ effect, color, onChange, instrumentId }: BodyProps) {
  const orbitIndex = useStore(s => s.instruments.find(i => i.id === instrumentId)?.orbitIndex ?? 0);
  const p = effect.params;
  return (
    <div className="flex flex-col gap-2">
      <EQCurveDisplay
        orbitIndex={orbitIndex}
        lowGain={p.low ?? 0} midGain={p.mid ?? 0} highGain={p.high ?? 0}
        lowFreq={p.lowFreq ?? 200} midFreq={p.midFreq ?? 1000} midQ={p.midQ ?? 1} highFreq={p.highFreq ?? 4000}
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
        {knobFor(effect, 'midQ',     color, onChange, 'sm')}
        {knobFor(effect, 'highFreq', color, onChange, 'sm')}
      </div>
    </div>
  );
}

// ── Compressor ─────────────────────────────────────────────────────────────

function CompressorBody({ effect, color, onChange, instrumentId }: BodyProps) {
  const orbitIndex = useStore(s => s.instruments.find(i => i.id === instrumentId)?.orbitIndex ?? 0);
  const p = effect.params;
  return (
    <div className="flex flex-col gap-2">
      <CompressorDisplay
        orbitIndex={orbitIndex}
        color={color}
        threshold={p.threshold ?? -24}
        knee={p.knee ?? 6}
        ratio={p.ratio ?? 4}
        onThresholdChange={(db) => onChange('threshold', db)}
      />
      <div className="flex justify-around">
        {knobFor(effect, 'ratio',      color, onChange, 'sm')}
        {knobFor(effect, 'attack',     color, onChange, 'sm')}
        {knobFor(effect, 'release',    color, onChange, 'sm')}
        {knobFor(effect, 'makeupGain', color, onChange, 'sm')}
      </div>
    </div>
  );
}

// ── Reverb ─────────────────────────────────────────────────────────────────

function ReverbBody({ effect, color, onChange }: BodyProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-around">
        {knobFor(effect, 'amount',   color, onChange, 'lg')}
        {knobFor(effect, 'predelay', color, onChange, 'md')}
      </div>
      <div className="flex justify-around">
        {knobFor(effect, 'size', color, onChange, 'md')}
        {knobFor(effect, 'damp', color, onChange, 'md')}
      </div>
    </div>
  );
}

// ── Delay ──────────────────────────────────────────────────────────────────

// Compact subdivision buttons for delay sync
const SYNC_BUTTON_INDICES = [2, 5, 7, 8, 11, 14]; // 1/16, 1/8, 1/8D, 1/4, 1/2, 1/1

function DelayBody({ effect, color, onChange, instrumentId }: BodyProps) {
  const bpm = useStore((s) => s.bpm);
  const orbitIndex = useStore((s) => s.instruments.find((i) => i.id === instrumentId)?.orbitIndex ?? -1);
  const p = effect.params;
  const mode    = Math.round(p.mode    ?? 0);
  const sync    = Math.round(p.sync    ?? 0);
  const syncDiv = Math.round(p.syncDiv ?? 8);

  // Compute display time (sync overrides free time)
  let displayTime = p.time ?? 0.25;
  if (sync === 1 && bpm > 0) {
    const beatSec = 60 / bpm;
    const div = DELAY_SYNC_DIVS[Math.min(syncDiv, DELAY_SYNC_DIVS.length - 1)];
    displayTime = Math.min(2.0, beatSec * div.mult);
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Echo visualization */}
      <DelayDisplay
        time={displayTime}
        feedback={p.feedback ?? 0.4}
        mode={mode}
        sync={sync}
        syncDiv={syncDiv}
        bpm={bpm}
        orbitIndex={orbitIndex}
        color={color}
      />

      {/* Mode selector */}
      <div className="flex items-center gap-1">
        <TypeButtons
          labels={DELAY_MODE_LABELS}
          value={mode}
          color={color}
          onChange={(i) => onChange('mode', i)}
        />
      </div>

      {/* Sync toggle + time control */}
      <div className="flex items-center gap-2" style={{ minHeight: 76 }}>
        <button
          onClick={() => onChange('sync', sync === 1 ? 0 : 1)}
          className="fx-stages-btn shrink-0"
          style={{
            background: sync === 1 ? `${color}28` : 'transparent',
            border: `1px solid ${sync === 1 ? color : '#2a2a3a'}`,
            color: sync === 1 ? color : '#8888a0',
            fontWeight: sync === 1 ? 600 : 400,
          }}
        >
          Sync
        </button>
        {sync === 1 ? (
          <div className="flex items-center gap-1 flex-1 flex-wrap">
            {SYNC_BUTTON_INDICES.map((idx) => (
              <button
                key={idx}
                onClick={() => onChange('syncDiv', idx)}
                className="fx-stages-btn"
                style={{
                  background: syncDiv === idx ? `${color}28` : 'transparent',
                  border: `1px solid ${syncDiv === idx ? color : '#2a2a3a'}`,
                  color: syncDiv === idx ? color : '#8888a0',
                  fontSize: 8,
                  padding: '1px 4px',
                }}
              >
                {DELAY_SYNC_DIVS[idx].label}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex-1">
            {knobFor(effect, 'time', color, onChange, 'md')}
          </div>
        )}
      </div>

      {/* Core knobs */}
      <div className="flex justify-around">
        {knobFor(effect, 'amount',   color, onChange, 'lg')}
        {knobFor(effect, 'feedback', color, onChange, 'md')}
        {knobFor(effect, 'tone',     color, onChange, 'md')}
      </div>
    </div>
  );
}

// ── Chorus ─────────────────────────────────────────────────────────────────

function ChorusBody({ effect, color, onChange }: BodyProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-around">
        {knobFor(effect, 'amount', color, onChange, 'lg')}
        {knobFor(effect, 'rate',   color, onChange, 'md')}
        {knobFor(effect, 'depth',  color, onChange, 'md')}
      </div>
      <div className="flex justify-around">
        {knobFor(effect, 'delay',  color, onChange, 'sm')}
        {knobFor(effect, 'spread', color, onChange, 'sm')}
      </div>
    </div>
  );
}

// ── Phaser ─────────────────────────────────────────────────────────────────

const STAGE_VALUES = [2, 4, 6, 8, 10, 12];

function PhaserBody({ effect, color, onChange }: BodyProps) {
  const stages   = Math.round(effect.params.stages ?? 4);
  const stageIdx = STAGE_VALUES.indexOf(stages);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-around">
        {knobFor(effect, 'amount',   color, onChange, 'md')}
        {knobFor(effect, 'rate',     color, onChange, 'md')}
        {knobFor(effect, 'depth',    color, onChange, 'md')}
        {knobFor(effect, 'baseFreq', color, onChange, 'sm')}
      </div>
      <div className="flex items-center gap-2">
        {knobFor(effect, 'feedback', color, onChange, 'sm')}
        <div className="flex flex-col gap-1 flex-1">
          <div className="flex items-center gap-1">
            <span className="fx-param-label" style={{ marginRight: 2, flexShrink: 0 }}>Stages</span>
            <TypeButtons
              labels={STAGE_VALUES.map(String)}
              value={stageIdx >= 0 ? stageIdx : 1}
              color={color}
              onChange={(i) => onChange('stages', STAGE_VALUES[i])}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Distortion ─────────────────────────────────────────────────────────────

const DISTORT_TYPE_LABELS = ['Soft', 'Hard', 'Tube', 'Fuzz'];

function DistortionBody({ effect, color, onChange }: BodyProps) {
  const distType = Math.round(effect.params.type ?? 0);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <span className="fx-param-label" style={{ marginRight: 2, flexShrink: 0 }}>Type</span>
        <TypeButtons
          labels={DISTORT_TYPE_LABELS}
          value={distType}
          color={color}
          onChange={(i) => onChange('type', i)}
        />
      </div>
      <div className="flex justify-around">
        {knobFor(effect, 'drive',  color, onChange, 'lg')}
        {knobFor(effect, 'tone',   color, onChange, 'md')}
      </div>
      <div className="flex justify-around">
        {knobFor(effect, 'output', color, onChange, 'sm')}
        {knobFor(effect, 'amount', color, onChange, 'sm')}
      </div>
    </div>
  );
}

// ── Filter ─────────────────────────────────────────────────────────────────

const FILTER_TYPE_LABELS = ['LP', 'HP', 'BP', 'Notch'];

function FilterBody({ effect, color, onChange }: BodyProps) {
  const filterType = Math.round(effect.params.filterType ?? 0);
  const lfoDepth   = effect.params.lfoDepth ?? 0;
  return (
    <div className="flex flex-col gap-2">
      <FilterCurveDisplay
        filterType={filterType}
        frequency={effect.params.frequency ?? 2000}
        q={effect.params.q ?? 1}
        color={color}
      />
      <div className="flex items-center gap-1">
        <span className="fx-param-label" style={{ marginRight: 2, flexShrink: 0 }}>Type</span>
        <TypeButtons
          labels={FILTER_TYPE_LABELS}
          value={filterType}
          color={color}
          onChange={(i) => onChange('filterType', i)}
        />
      </div>
      <div className="flex justify-around">
        {knobFor(effect, 'frequency', color, onChange, 'lg')}
        {knobFor(effect, 'q',         color, onChange, 'md')}
        {knobFor(effect, 'amount',    color, onChange, 'md')}
      </div>
      <div className="flex items-center gap-2 pt-0.5">
        <span className="fx-param-label" style={{ flexShrink: 0 }}>LFO</span>
        <div
          className="h-px flex-1 rounded-full"
          style={{ background: lfoDepth > 0.01 ? `${color}50` : '#2a2a3a' }}
        />
      </div>
      <div className="flex justify-around">
        {knobFor(effect, 'lfoRate',  color, onChange, 'sm')}
        {knobFor(effect, 'lfoDepth', color, onChange, 'sm')}
      </div>
    </div>
  );
}

// ── Bit Crusher ─────────────────────────────────────────────────────────────

function BitCrusherBody({ effect, color, onChange }: BodyProps) {
  return (
    <div className="flex justify-around">
      {knobFor(effect, 'bits',       color, onChange, 'lg')}
      {knobFor(effect, 'downsample', color, onChange, 'md')}
      {knobFor(effect, 'amount',     color, onChange, 'md')}
    </div>
  );
}

// ── Param EQ — 6-band parametric with live canvas + drag interaction ────────

function ParaEQBody({ effect, color, instrumentId, onChange }: BodyProps) {
  const orbitIndex = useStore(
    (s) => s.instruments.find((i) => i.id === instrumentId)?.orbitIndex ?? 0,
  );
  const p = effect.params;

  const bands: BandParam[] = [
    { type: p.b1type ?? 1, freq: p.b1freq ?? 30,    gain: p.b1gain ?? 0, q: p.b1q ?? 0.707 },
    { type: p.b2type ?? 3, freq: p.b2freq ?? 120,   gain: p.b2gain ?? 0, q: p.b2q ?? 0.707 },
    { type: p.b3type ?? 2, freq: p.b3freq ?? 500,   gain: p.b3gain ?? 0, q: p.b3q ?? 1.0 },
    { type: p.b4type ?? 2, freq: p.b4freq ?? 3000,  gain: p.b4gain ?? 0, q: p.b4q ?? 1.0 },
    { type: p.b5type ?? 4, freq: p.b5freq ?? 10000, gain: p.b5gain ?? 0, q: p.b5q ?? 0.707 },
    { type: p.b6type ?? 0, freq: p.b6freq ?? 20000, gain: p.b6gain ?? 0, q: p.b6q ?? 0.707 },
  ];

  const keys = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'] as const;
  const handleChange = (bi: number, key: 'type' | 'freq' | 'gain' | 'q', val: number) => {
    onChange(`${keys[bi]}${key}`, val);
  };

  return (
    <div className="flex flex-col gap-1">
      <ParamEQDisplay
        orbitIndex={orbitIndex}
        color={color}
        bands={bands}
        onChange={handleChange}
      />
      <ParamEQTypeRow bands={bands} color={color} onChange={handleChange} />
    </div>
  );
}

// ── Tremolo — amplitude modulation via LFO ─────────────────────────────────

const TREMOLO_WAVE_LABELS = ['Sine', 'Tri', 'Sq'];

function TremoloBody({ effect, color, onChange }: BodyProps) {
  const waveform = Math.round(effect.params.waveform ?? 0);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <span className="fx-param-label" style={{ marginRight: 2, flexShrink: 0 }}>Wave</span>
        <TypeButtons
          labels={TREMOLO_WAVE_LABELS}
          value={waveform}
          color={color}
          onChange={(i) => onChange('waveform', i)}
        />
      </div>
      <div className="flex justify-around">
        {knobFor(effect, 'rate',   color, onChange, 'lg')}
        {knobFor(effect, 'amount', color, onChange, 'md')}
      </div>
    </div>
  );
}

// ── Ring Mod — carrier OSC × signal (true ring modulation) ─────────────────

const RING_WAVE_LABELS = ['Sine', 'Tri', 'Saw'];

function RingModBody({ effect, color, onChange }: BodyProps) {
  const waveform = Math.round(effect.params.waveform ?? 0);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <span className="fx-param-label" style={{ marginRight: 2, flexShrink: 0 }}>Wave</span>
        <TypeButtons
          labels={RING_WAVE_LABELS}
          value={waveform}
          color={color}
          onChange={(i) => onChange('waveform', i)}
        />
      </div>
      <div className="flex justify-around">
        {knobFor(effect, 'frequency', color, onChange, 'lg')}
        {knobFor(effect, 'amount',    color, onChange, 'md')}
      </div>
    </div>
  );
}

// ── Trance Gate — circular step sequencer ──────────────────────────────────

const TRANCE_STEPS_OPTIONS = [4, 8, 12, 16];
const TRANCE_RATE_OPTIONS  = [{ label: '1/4', v: 4 }, { label: '1/8', v: 8 }, { label: '1/16', v: 16 }, { label: '1/32', v: 32 }];

function TranceGateBody({ effect, color, instrumentId, onChange }: BodyProps) {
  const orbitIndex = useStore((s) => s.instruments.find((i) => i.id === instrumentId)?.orbitIndex ?? 0);
  const steps   = Math.round(effect.params.steps ?? 8);
  const rate    = Math.round(effect.params.rate  ?? 8);
  const rateIdx = TRANCE_RATE_OPTIONS.findIndex((r) => r.v === rate);
  return (
    <div className="flex flex-col gap-2">
      <TranceGateDisplay
        params={effect.params}
        color={color}
        orbitIndex={orbitIndex}
        onChange={onChange}
      />
      <div className="flex items-center gap-2">
        <span className="fx-param-label shrink-0">Steps</span>
        <div className="flex gap-0.5 flex-1">
          {TRANCE_STEPS_OPTIONS.map((n) => (
            <button
              key={n}
              onClick={() => onChange('steps', n)}
              className="fx-stages-btn flex-1"
              style={{
                background: steps === n ? `${color}28` : 'transparent',
                border: `1px solid ${steps === n ? color : '#2a2a3a'}`,
                color: steps === n ? color : '#8888a0',
              }}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="fx-param-label shrink-0">Rate</span>
        <div className="flex gap-0.5 flex-1">
          {TRANCE_RATE_OPTIONS.map((r, i) => (
            <button
              key={r.v}
              onClick={() => onChange('rate', r.v)}
              className="fx-stages-btn flex-1"
              style={{
                background: rateIdx === i ? `${color}28` : 'transparent',
                border: `1px solid ${rateIdx === i ? color : '#2a2a3a'}`,
                color: rateIdx === i ? color : '#8888a0',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-around">
        {knobFor(effect, 'attack',  color, onChange, 'sm')}
        {knobFor(effect, 'release', color, onChange, 'sm')}
        {knobFor(effect, 'amount',  color, onChange, 'sm')}
      </div>
    </div>
  );
}

// ── Limiter ─────────────────────────────────────────────────────────────────

function LimiterBody({ effect, color, onChange }: BodyProps) {
  const ceiling = effect.params.ceiling ?? -0.3;
  const meterW  = 200;
  const meterH  = 28;
  // ceiling fraction on -24→0 scale
  const ceilFrac = Math.max(0, Math.min(1, (ceiling + 24) / 24));
  return (
    <div className="flex flex-col gap-2">
      <canvas
        width={meterW} height={meterH}
        style={{ width: '100%', height: meterH, display: 'block', borderRadius: 3 }}
        ref={(canvas) => {
          if (!canvas) return;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          const W = canvas.width;
          ctx.fillStyle = '#0e0e18';
          ctx.fillRect(0, 0, W, meterH);
          // Scale
          ctx.fillStyle = '#1a1a28';
          ctx.fillRect(0, 4, W, meterH - 8);
          // Gradient zone below ceiling
          const g = ctx.createLinearGradient(0, 0, W, 0);
          g.addColorStop(0, '#22c55e40'); g.addColorStop(1, '#ef444440');
          ctx.fillStyle = g;
          ctx.fillRect(0, 4, Math.round(ceilFrac * W), meterH - 8);
          // Ceiling line
          const cx = Math.round(ceilFrac * W);
          ctx.fillStyle = color;
          ctx.fillRect(cx - 1, 0, 2, meterH);
          // Label
          ctx.fillStyle = color; ctx.font = '8px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.fillText(`Ceil: ${ceiling.toFixed(1)} dBFS`, cx + 3, 2);
          // dB ticks
          ctx.fillStyle = '#0c0c14';
          for (const db of [-24, -18, -12, -6, 0]) {
            const x = Math.round(((db + 24) / 24) * W);
            ctx.fillRect(x, 4, 1, meterH - 8);
          }
        }}
      />
      <div className="flex gap-3 justify-center">
        {knobFor(effect, 'ceiling', color, onChange)}
        {knobFor(effect, 'release', color, onChange)}
      </div>
    </div>
  );
}

// ── Drum Buss ────────────────────────────────────────────────────────────────

function DrumBussBody({ effect, color, onChange }: BodyProps) {
  const drive = effect.params.drive ?? 0.3;
  const curveW = 80; const curveH = 32;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <canvas
          width={curveW} height={curveH}
          style={{ width: curveW, height: curveH, borderRadius: 3, flexShrink: 0 }}
          ref={(canvas) => {
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.fillStyle = '#0e0e18'; ctx.fillRect(0, 0, curveW, curveH);
            ctx.strokeStyle = `${color}60`; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(0, curveH); ctx.lineTo(curveW, 0); ctx.stroke();
            // tanh curve
            const k = 1 + drive * 50;
            ctx.strokeStyle = color; ctx.lineWidth = 1.5;
            ctx.beginPath();
            for (let i = 0; i < curveW; i++) {
              const x = (i / (curveW - 1)) * 2 - 1;
              const y = Math.tanh(x * k) / Math.tanh(k);
              const py = (1 - (y + 1) / 2) * curveH;
              if (i === 0) ctx.moveTo(i, py); else ctx.lineTo(i, py);
            }
            ctx.stroke();
          }}
        />
        <div className="flex flex-wrap gap-2 flex-1">
          {knobFor(effect, 'drive',    color, onChange, 'sm')}
          {knobFor(effect, 'low',      color, onChange, 'sm')}
          {knobFor(effect, 'compress', color, onChange, 'sm')}
          {knobFor(effect, 'mix',      color, onChange, 'sm')}
          {knobFor(effect, 'output',   color, onChange, 'sm')}
        </div>
      </div>
    </div>
  );
}

// ── Stereo Image ─────────────────────────────────────────────────────────────

function StereoImageBody({ effect, color, onChange }: BodyProps) {
  const width = effect.params.width ?? 1;
  return (
    <div className="flex flex-col gap-2">
      <canvas
        width={200} height={52}
        style={{ width: '100%', height: 52, borderRadius: 3, display: 'block' }}
        ref={(canvas) => {
          if (!canvas) return;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          const W = canvas.width; const H = 52;
          ctx.fillStyle = '#0e0e18'; ctx.fillRect(0, 0, W, H);
          const cx = W / 2; const cy = H / 2;
          // Axes
          ctx.strokeStyle = '#2a2a3a'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke();
          // Width indicator arc
          const maxAngle = Math.PI / 4 * Math.min(width, 2); // 0=mono, π/4=normal, π/2=max
          ctx.strokeStyle = `${color}80`; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(cx, cy, 18, -Math.PI / 2 - maxAngle, -Math.PI / 2 + maxAngle); ctx.stroke();
          // L / R zone shading
          const spread = (W / 2 - 8) * (width / 2);
          ctx.fillStyle = `${color}18`;
          ctx.fillRect(cx - spread, 4, spread * 2, H - 8);
          // Labels
          ctx.fillStyle = `${color}80`; ctx.font = '8px monospace'; ctx.textBaseline = 'middle';
          ctx.textAlign = 'left';  ctx.fillText('L', 3,     cy);
          ctx.textAlign = 'right'; ctx.fillText('R', W - 3, cy);
          ctx.textAlign = 'center';
          ctx.fillText(width === 0 ? 'MONO' : `${Math.round(width * 100)}%`, cx, cy);
        }}
      />
      <div className="flex gap-3 justify-center">
        {knobFor(effect, 'width',   color, onChange)}
        {knobFor(effect, 'monoLow', color, onChange)}
      </div>
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
  bitcrusher: BitCrusherBody,
  parame:     ParaEQBody,
  tremolo:    TremoloBody,
  ringmod:    RingModBody,
  trancegate: TranceGateBody,
  limiter:     LimiterBody,
  drumbuss:    DrumBussBody,
  stereoimage: StereoImageBody,
};

// ── main component ─────────────────────────────────────────────────────────

interface EffectBlockProps {
  effect: Effect;
  instrumentId: string;
  index: number;
  isDragOver: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}

export function EffectBlock({
  effect, instrumentId, index, isDragOver,
  onDragStart, onDragOver, onDrop, onDragEnd,
}: EffectBlockProps) {
  const toggleEffectEnabled   = useStore((s) => s.toggleEffectEnabled);
  const toggleEffectCollapsed = useStore((s) => s.toggleEffectCollapsed);
  const setEffectParam        = useStore((s) => s.setEffectParam);
  const removeEffect          = useStore((s) => s.removeEffect);
  const [presetOpen, setPresetOpen] = useState(false);
  const presetBtnRef = useRef<HTMLButtonElement>(null);

  const color    = EFFECT_COLORS[effect.type] ?? '#94a3b8';
  const onChange = (key: string, val: number) =>
    setEffectParam(instrumentId, effect.id, key, val);

  const BodyComponent = BODY_MAP[effect.type] ?? null;

  void index;

  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`rounded select-none overflow-hidden transition-all ${effect.enabled ? '' : 'opacity-40'}`}
      style={{
        border: `1px solid ${isDragOver ? color : `${color}50`}`,
        background: isDragOver ? `${color}14` : `${color}07`,
        padding: '10px 10px 12px',
        marginBottom: 6,
        opacity: effect.enabled ? 1 : 0.4,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          className="shrink-0 text-white/20 hover:text-white/50 cursor-grab active:cursor-grabbing transition-colors leading-none"
          style={{ fontSize: 13, letterSpacing: '-1px' }}
          title="Drag to reorder"
        >
          ⠿
        </span>
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
          ref={presetBtnRef}
          onClick={() => setPresetOpen(!presetOpen)}
          className="fx-block-btn text-white/20 hover:text-white/50"
          title="Presets"
          style={{ fontSize: 11 }}
        >
          ☰
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
        <BodyComponent
          effect={effect}
          color={color}
          instrumentId={instrumentId}
          onChange={onChange}
        />
      )}

      {presetOpen && presetBtnRef.current && (
        <EffectPresetDropdown
          effectType={effect.type}
          params={effect.params}
          color={color}
          anchorRect={presetBtnRef.current.getBoundingClientRect()}
          onApply={(params) => {
            for (const [key, val] of Object.entries(params)) {
              setEffectParam(instrumentId, effect.id, key, val);
            }
            setPresetOpen(false);
          }}
          onClose={() => setPresetOpen(false)}
        />
      )}
    </div>
  );
}
