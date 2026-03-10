import { useState, useMemo, useReducer } from 'react';
import { useStore } from '../../state/store';
import { getSynthEngine } from '../../audio/synthManager';
import { SYNTH_PRESETS } from '../../audio/synth/presets';
import type { SynthParams, LFODestination } from '../../audio/synth/types';
import { EffectKnob } from '../EffectsSidebar/EffectKnob';
import { FilterCurveDisplay } from '../EffectsSidebar/FilterCurveDisplay';
import { EnvelopeDisplay } from './EnvelopeDisplay';

// ─── Shared sub-components ───────────────────────────────────────────────────

function SynthKnob({
  label, value, min, max, step = 0.01, unit, color, defaultValue, onChange,
  size = 'sm',
}: {
  label: string; value: number; min: number; max: number; step?: number;
  unit?: string; color: string; defaultValue: number;
  onChange: (v: number) => void; size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <EffectKnob
      value={value} min={min} max={max} step={step}
      defaultValue={defaultValue} label={label} color={color}
      unit={unit} size={size} onChange={onChange}
    />
  );
}

/** Segmented button row (waveform, filter type, etc.) */
function TypeButtons({
  labels, value, color, onChange,
}: { labels: string[]; value: number; color: string; onChange: (i: number) => void }) {
  return (
    <div className="flex gap-0.5 w-full">
      {labels.map((label, i) => (
        <button
          key={i}
          onClick={() => onChange(i)}
          className="flex-1 text-[8px] uppercase tracking-wider py-0.5 rounded transition-all"
          style={{
            background: value === i ? `${color}28` : 'transparent',
            border: `1px solid ${value === i ? color : '#2a2a3a'}`,
            color: value === i ? color : '#8888a0',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Collapsible section with colored header. */
function Section({
  label, color, defaultOpen = false, children,
}: { label: string; color: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: `1px solid ${color}20` }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-1.5 text-[9px] uppercase tracking-wider font-medium hover:opacity-80 transition-colors"
        style={{ color }}
      >
        {label}
        <span className="text-text-secondary/40 text-[8px]">{open ? '▼' : '▶'}</span>
      </button>
      {open && <div className="px-4 pb-3 flex flex-col gap-2">{children}</div>}
    </div>
  );
}

/** Evenly spaced knob row */
function KnobRow({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-around items-end gap-1">{children}</div>;
}

// Waveform type → index helpers
const WAVE_TYPES: OscillatorType[] = ['sine', 'triangle', 'square', 'sawtooth'];
const WAVE_LABELS = ['SIN', 'TRI', 'SQR', 'SAW'];
const FILTER_TYPES: BiquadFilterType[] = ['lowpass', 'highpass', 'bandpass', 'notch'];
const FILTER_LABELS = ['LP', 'HP', 'BP', 'NT'];
const LFO_DESTS: LFODestination[] = ['none', 'filter', 'pitch'];
const LFO_DEST_LABELS = ['OFF', 'FILT', 'PTCH'];

// ─── Main component ──────────────────────────────────────────────────────────

export function SynthPanel() {
  const selectedId = useStore((s) => s.selectedInstrumentId);
  const instruments = useStore((s) => s.instruments);
  const instrument = instruments.find((i) => i.id === selectedId);

  // useMemo so engine creation (side-effect: starts oscillators) only runs
  // when the instrument id/orbit actually changes, not on every render.
  const engine = useMemo(() => {
    if (!instrument || instrument.type !== 'synth') return null;
    try { return getSynthEngine(instrument.id, instrument.orbitIndex); }
    catch { return null; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instrument?.id, instrument?.orbitIndex]);

  // Force re-render when a param is mutated directly on the engine.
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  if (!instrument || instrument.type !== 'synth' || !engine) return null;

  const params = engine.getParams();
  const color = instrument.color;

  const set = <K extends keyof SynthParams>(key: K, value: SynthParams[K]) => {
    engine.setParam(key, value);
    forceUpdate();
  };

  const filterTypeIdx = FILTER_TYPES.indexOf(params.filterType);
  const lfo1DestIdx = LFO_DESTS.indexOf(params.lfo1Dest);
  const lfo2DestIdx = LFO_DESTS.indexOf(params.lfo2Dest);

  return (
    <div
      className="synth-panel bg-bg-secondary border-l border-border overflow-y-auto shrink-0 flex flex-col"
      style={{ width: 300 }}
    >
      {/* ─── Preset bar ─────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-2 px-4 py-2 shrink-0"
        style={{ borderBottom: `1px solid ${color}30` }}
      >
        <span className="text-[9px] uppercase tracking-wider shrink-0" style={{ color }}>
          Preset
        </span>
        <select
          onChange={(e) => {
            const preset = SYNTH_PRESETS[e.target.value];
            if (preset) { engine.loadPreset(preset); forceUpdate(); }
          }}
          className="flex-1 bg-bg-tertiary text-text-primary text-[10px] px-2 py-1 rounded border border-border"
        >
          {Object.keys(SYNTH_PRESETS).map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>

      {/* ─── OSC ────────────────────────────────────────────────────── */}
      <Section label="Oscillator" color={color} defaultOpen>
        <TypeButtons
          labels={WAVE_LABELS}
          value={WAVE_TYPES.indexOf(params.vcoType)}
          color={color}
          onChange={(i) => set('vcoType', WAVE_TYPES[i])}
        />
        <KnobRow>
          <SynthKnob label="Gain" value={params.vcoGain} min={0} max={1} defaultValue={1} color={color} onChange={(v) => set('vcoGain', v)} />
          <SynthKnob label="Pan" value={params.vcoPan} min={-1} max={1} defaultValue={0} color={color} onChange={(v) => set('vcoPan', v)} />
          <SynthKnob label="Tune" value={params.vcoDetune} min={-100} max={100} step={1} unit="¢" defaultValue={0} color={color} onChange={(v) => set('vcoDetune', v)} />
        </KnobRow>

        {/* Unison */}
        <div>
          <span className="text-[8px] text-text-secondary/60 uppercase tracking-wider">Unison</span>
          <div className="flex gap-0.5 mt-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => set('unisonVoices', n)}
                className="flex-1 text-[8px] py-0.5 rounded transition-all"
                style={{
                  background: Math.round(params.unisonVoices) === n ? `${color}28` : 'transparent',
                  border: `1px solid ${Math.round(params.unisonVoices) === n ? color : '#2a2a3a'}`,
                  color: Math.round(params.unisonVoices) === n ? color : '#8888a0',
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        {params.unisonVoices > 1 && (
          <KnobRow>
            <SynthKnob label="Det" value={params.unisonDetune} min={0} max={50} unit="¢" defaultValue={10} color={color} onChange={(v) => set('unisonDetune', v)} />
            <SynthKnob label="Sprd" value={params.unisonSpread} min={0} max={1} defaultValue={0.7} color={color} onChange={(v) => set('unisonSpread', v)} />
          </KnobRow>
        )}
      </Section>

      {/* ─── Sub oscillators ────────────────────────────────────────── */}
      <Section label="Sub Oscillators" color={color}>
        <span className="text-[8px] text-text-secondary/60 uppercase tracking-wider">Sub 1</span>
        <TypeButtons
          labels={WAVE_LABELS}
          value={WAVE_TYPES.indexOf(params.sub1Type)}
          color={color}
          onChange={(i) => set('sub1Type', WAVE_TYPES[i])}
        />
        <KnobRow>
          <SynthKnob label="Gain" value={params.sub1Gain} min={0} max={1} defaultValue={0} color={color} onChange={(v) => set('sub1Gain', v)} />
          <SynthKnob label="Oct" value={params.sub1Offset} min={-24} max={24} step={1} unit="st" defaultValue={0} color={color} onChange={(v) => set('sub1Offset', Math.round(v))} />
          <SynthKnob label="Pan" value={params.sub1Pan} min={-1} max={1} defaultValue={0} color={color} onChange={(v) => set('sub1Pan', v)} />
        </KnobRow>

        <span className="text-[8px] text-text-secondary/60 uppercase tracking-wider mt-1">Sub 2</span>
        <TypeButtons
          labels={WAVE_LABELS}
          value={WAVE_TYPES.indexOf(params.sub2Type)}
          color={color}
          onChange={(i) => set('sub2Type', WAVE_TYPES[i])}
        />
        <KnobRow>
          <SynthKnob label="Gain" value={params.sub2Gain} min={0} max={1} defaultValue={0} color={color} onChange={(v) => set('sub2Gain', v)} />
          <SynthKnob label="Oct" value={params.sub2Offset} min={-24} max={24} step={1} unit="st" defaultValue={0} color={color} onChange={(v) => set('sub2Offset', Math.round(v))} />
          <SynthKnob label="Pan" value={params.sub2Pan} min={-1} max={1} defaultValue={0} color={color} onChange={(v) => set('sub2Pan', v)} />
        </KnobRow>
      </Section>

      {/* ─── Envelope ───────────────────────────────────────────────── */}
      <Section label="Envelope" color={color} defaultOpen>
        <EnvelopeDisplay
          attack={params.gainAttack}
          decay={params.gainDecay}
          sustain={params.gainSustain}
          release={params.gainRelease}
          color={color}
        />
        <KnobRow>
          <SynthKnob label="Atk" value={params.gainAttack} min={0} max={2} unit="s" defaultValue={0.001} color={color} onChange={(v) => set('gainAttack', v)} />
          <SynthKnob label="Dec" value={params.gainDecay} min={0.001} max={2} unit="s" defaultValue={0.1} color={color} onChange={(v) => set('gainDecay', v)} />
          <SynthKnob label="Sus" value={params.gainSustain} min={0} max={1} defaultValue={0.7} color={color} onChange={(v) => set('gainSustain', v)} />
          <SynthKnob label="Rel" value={params.gainRelease} min={0.01} max={3} unit="s" defaultValue={0.15} color={color} onChange={(v) => set('gainRelease', v)} />
        </KnobRow>
      </Section>

      {/* ─── Filter ─────────────────────────────────────────────────── */}
      <Section label="Filter" color={color}>
        <TypeButtons
          labels={FILTER_LABELS}
          value={filterTypeIdx >= 0 ? filterTypeIdx : 0}
          color={color}
          onChange={(i) => set('filterType', FILTER_TYPES[i])}
        />
        <FilterCurveDisplay
          filterType={filterTypeIdx >= 0 ? filterTypeIdx : 0}
          frequency={params.filterFreq}
          q={params.filterQ}
          color={color}
        />
        <KnobRow>
          <SynthKnob label="Freq" value={params.filterFreq} min={20} max={20000} step={10} unit="Hz" defaultValue={8000} color={color} onChange={(v) => set('filterFreq', v)} />
          <SynthKnob label="Q" value={params.filterQ} min={0} max={20} defaultValue={0} color={color} onChange={(v) => set('filterQ', v)} />
          <SynthKnob label="Env" value={params.filterEnvAmount} min={-12000} max={12000} step={10} unit="¢" defaultValue={0} color={color} onChange={(v) => set('filterEnvAmount', v)} />
        </KnobRow>
        <KnobRow>
          <SynthKnob label="Atk" value={params.filterAttack} min={0} max={2} unit="s" defaultValue={0} color={color} onChange={(v) => set('filterAttack', v)} />
          <SynthKnob label="Dec" value={params.filterDecay} min={0.001} max={2} unit="s" defaultValue={0.1} color={color} onChange={(v) => set('filterDecay', v)} />
        </KnobRow>
      </Section>

      {/* ─── LFO ────────────────────────────────────────────────────── */}
      <Section label="LFO" color={color}>
        <span className="text-[8px] text-text-secondary/60 uppercase tracking-wider">LFO 1</span>
        <TypeButtons
          labels={WAVE_LABELS}
          value={WAVE_TYPES.indexOf(params.lfo1Shape)}
          color={color}
          onChange={(i) => set('lfo1Shape', WAVE_TYPES[i])}
        />
        <TypeButtons
          labels={LFO_DEST_LABELS}
          value={lfo1DestIdx >= 0 ? lfo1DestIdx : 0}
          color={color}
          onChange={(i) => set('lfo1Dest', LFO_DESTS[i])}
        />
        <KnobRow>
          <SynthKnob label="Rate" value={params.lfo1Rate} min={0.1} max={20} unit="Hz" defaultValue={4} color={color} onChange={(v) => set('lfo1Rate', v)} />
          <SynthKnob label="Depth" value={params.lfo1Depth} min={0} max={1000} step={5} defaultValue={0} color={color} onChange={(v) => set('lfo1Depth', v)} />
        </KnobRow>

        <span className="text-[8px] text-text-secondary/60 uppercase tracking-wider mt-1">LFO 2</span>
        <TypeButtons
          labels={WAVE_LABELS}
          value={WAVE_TYPES.indexOf(params.lfo2Shape)}
          color={color}
          onChange={(i) => set('lfo2Shape', WAVE_TYPES[i])}
        />
        <TypeButtons
          labels={LFO_DEST_LABELS}
          value={lfo2DestIdx >= 0 ? lfo2DestIdx : 0}
          color={color}
          onChange={(i) => set('lfo2Dest', LFO_DESTS[i])}
        />
        <KnobRow>
          <SynthKnob label="Rate" value={params.lfo2Rate} min={0.1} max={20} unit="Hz" defaultValue={0.5} color={color} onChange={(v) => set('lfo2Rate', v)} />
          <SynthKnob label="Depth" value={params.lfo2Depth} min={0} max={1000} step={5} defaultValue={0} color={color} onChange={(v) => set('lfo2Depth', v)} />
        </KnobRow>
      </Section>

      {/* ─── FM ─────────────────────────────────────────────────────── */}
      <Section label="FM Synthesis" color={color}>
        <div className="flex items-center gap-2">
          <button
            onClick={() => set('fmEnabled', !params.fmEnabled)}
            className="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded transition-all"
            style={{
              background: params.fmEnabled ? `${color}28` : 'transparent',
              border: `1px solid ${params.fmEnabled ? color : '#2a2a3a'}`,
              color: params.fmEnabled ? color : '#8888a0',
            }}
          >
            {params.fmEnabled ? 'On' : 'Off'}
          </button>
          <span className="text-[8px] text-text-secondary/50">FM mod → carrier freq</span>
        </div>
        <KnobRow>
          <SynthKnob label="Ratio" value={params.fmRatio} min={0.5} max={8} step={0.1} defaultValue={2} color={color} onChange={(v) => set('fmRatio', v)} />
          <SynthKnob label="Depth" value={params.fmDepth} min={0} max={500} step={5} unit="Hz" defaultValue={0} color={color} onChange={(v) => set('fmDepth', v)} />
        </KnobRow>
      </Section>

      {/* ─── FX ─────────────────────────────────────────────────────── */}
      <Section label="FX" color={color}>
        <span className="text-[8px] text-text-secondary/60 uppercase tracking-wider">Delay</span>
        <KnobRow>
          <SynthKnob label="Amt" value={params.delayAmount} min={0} max={1} defaultValue={0} color={color} onChange={(v) => set('delayAmount', v)} />
          <SynthKnob label="Time" value={params.delayTime} min={0} max={1} unit="s" defaultValue={0} color={color} onChange={(v) => set('delayTime', v)} />
          <SynthKnob label="FB" value={params.delayFeedback} min={0} max={0.95} defaultValue={0} color={color} onChange={(v) => set('delayFeedback', v)} />
          <SynthKnob label="Tone" value={params.delayTone} min={200} max={12000} step={50} unit="Hz" defaultValue={4400} color={color} onChange={(v) => set('delayTone', v)} />
        </KnobRow>
        <span className="text-[8px] text-text-secondary/60 uppercase tracking-wider mt-1">Reverb</span>
        <KnobRow>
          <SynthKnob label="Amt" value={params.reverbAmount} min={0} max={1} defaultValue={0} color={color} onChange={(v) => set('reverbAmount', v)} />
        </KnobRow>
        <span className="text-[8px] text-text-secondary/60 uppercase tracking-wider mt-1">Distortion</span>
        <KnobRow>
          <SynthKnob label="Drive" value={params.distortionDist} min={0} max={50} step={0.5} defaultValue={0} color={color} onChange={(v) => set('distortionDist', v)} />
          <SynthKnob label="Amt" value={params.distortionAmount} min={0} max={1} defaultValue={0} color={color} onChange={(v) => set('distortionAmount', v)} />
        </KnobRow>
        <span className="text-[8px] text-text-secondary/60 uppercase tracking-wider mt-1">Bit Crush</span>
        <KnobRow>
          <SynthKnob label="Bits" value={params.bitCrushDepth} min={1} max={16} step={1} defaultValue={8} color={color} onChange={(v) => set('bitCrushDepth', v)} />
          <SynthKnob label="Amt" value={params.bitCrushAmount} min={0} max={1} defaultValue={0} color={color} onChange={(v) => set('bitCrushAmount', v)} />
        </KnobRow>
      </Section>

      {/* ─── Master ─────────────────────────────────────────────────── */}
      <Section label="Master" color={color} defaultOpen>
        <KnobRow>
          <SynthKnob label="Vol" value={params.masterVolume} min={0} max={1} defaultValue={0.75} color={color} size="md" onChange={(v) => set('masterVolume', v)} />
          <SynthKnob label="Glide" value={params.portamentoSpeed} min={0} max={0.5} unit="s" defaultValue={0} color={color} size="md" onChange={(v) => set('portamentoSpeed', v)} />
        </KnobRow>
      </Section>

    </div>
  );
}
