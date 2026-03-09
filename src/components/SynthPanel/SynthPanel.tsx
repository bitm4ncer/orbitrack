import { useState } from 'react';
import { useStore } from '../../state/store';
import { getSynthEngine } from '../../audio/synthManager';
import { SYNTH_PRESETS } from '../../audio/synth/presets';
import type { SynthParams } from '../../audio/synth/types';

function Slider({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  color,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  color: string;
  onChange: (val: number) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] text-text-secondary w-10 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="inst-slider flex-1 h-1"
        style={{ '--slider-color': color } as React.CSSProperties}
      />
      <span className="text-[8px] text-text-secondary/60 w-8 text-right shrink-0">
        {typeof value === 'number' ? (Math.abs(value) >= 100 ? Math.round(value) : value.toFixed(2)) : value}
      </span>
    </div>
  );
}

function SelectRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (val: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] text-text-secondary w-10 shrink-0">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-bg-tertiary text-text-primary text-[10px] px-1 py-0.5 rounded border border-border"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  );
}

function Section({
  label,
  color,
  defaultOpen = false,
  children,
}: {
  label: string;
  color: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="synth-section" style={{ borderBottom: `1px solid ${color}20` }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-1.5 text-[9px] uppercase tracking-wider font-medium hover:opacity-80 transition-colors"
        style={{ color }}
      >
        {label}
        <span className="text-text-secondary/40 text-[8px]">{open ? '▼' : '▶'}</span>
      </button>
      {open && <div className="flex flex-col gap-1 pb-2">{children}</div>}
    </div>
  );
}

export function SynthPanel() {
  const selectedId = useStore((s) => s.selectedInstrumentId);
  const instruments = useStore((s) => s.instruments);
  const instrument = instruments.find((i) => i.id === selectedId);

  if (!instrument || instrument.type !== 'synth') {
    return null;
  }

  const engine = getSynthEngine(instrument.id);
  const params = engine.getParams();
  const color = instrument.color;

  const setParam = <K extends keyof SynthParams>(key: K, value: SynthParams[K]) => {
    engine.setParam(key, value);
    useStore.getState().updateInstrument(instrument.id, {});
  };

  return (
    <div className="synth-panel bg-bg-secondary border-l border-border overflow-y-auto shrink-0" style={{ padding: 20, width: 300 }}>
      <div className="synth-preset-bar flex items-center gap-2 pb-2 mb-1" style={{ borderBottom: `1px solid ${color}20` }}>
        <span className="text-[9px] text-text-secondary">Preset</span>
        <select
          onChange={(e) => {
            const preset = SYNTH_PRESETS[e.target.value];
            if (preset) engine.loadPreset(preset);
            useStore.getState().updateInstrument(instrument.id, {});
          }}
          className="flex-1 bg-bg-tertiary text-text-primary text-[10px] px-2 py-0.5 rounded border border-border"
        >
          {Object.keys(SYNTH_PRESETS).map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>

      <div className="synth-controls flex flex-col">
        <Section label="Oscillator" color={color} defaultOpen>
          <SelectRow label="Wave" value={params.vcoType} options={['sine', 'triangle', 'square', 'sawtooth']} onChange={(v) => setParam('vcoType', v as OscillatorType)} />
          <Slider label="Gain" value={params.vcoGain} color={color} onChange={(v) => setParam('vcoGain', v)} />
          <Slider label="Pan" value={params.vcoPan} min={-1} max={1} color={color} onChange={(v) => setParam('vcoPan', v)} />
        </Section>

        <Section label="Sub 1" color={color}>
          <SelectRow label="Wave" value={params.sub1Type} options={['sine', 'triangle', 'square', 'sawtooth']} onChange={(v) => setParam('sub1Type', v as OscillatorType)} />
          <Slider label="Gain" value={params.sub1Gain} color={color} onChange={(v) => setParam('sub1Gain', v)} />
          <Slider label="Offset" value={params.sub1Offset} min={-24} max={24} step={1} color={color} onChange={(v) => setParam('sub1Offset', v)} />
        </Section>

        <Section label="Sub 2" color={color}>
          <SelectRow label="Wave" value={params.sub2Type} options={['sine', 'triangle', 'square', 'sawtooth']} onChange={(v) => setParam('sub2Type', v as OscillatorType)} />
          <Slider label="Gain" value={params.sub2Gain} color={color} onChange={(v) => setParam('sub2Gain', v)} />
          <Slider label="Offset" value={params.sub2Offset} min={-24} max={24} step={1} color={color} onChange={(v) => setParam('sub2Offset', v)} />
        </Section>

        <Section label="Envelope" color={color} defaultOpen>
          <Slider label="Attack" value={params.gainAttack} max={2} color={color} onChange={(v) => setParam('gainAttack', v)} />
          <Slider label="Decay" value={params.gainDecay} max={2} color={color} onChange={(v) => setParam('gainDecay', v)} />
          <Slider label="Sustain" value={params.gainSustain} max={1} color={color} onChange={(v) => setParam('gainSustain', v)} />
          <Slider label="Release" value={params.gainRelease} max={2} color={color} onChange={(v) => setParam('gainRelease', v)} />
        </Section>

        <Section label="Filter" color={color}>
          <SelectRow label="Type" value={params.filterType} options={['lowpass', 'highpass', 'bandpass', 'notch']} onChange={(v) => setParam('filterType', v as BiquadFilterType)} />
          <Slider label="Cutoff" value={params.filterFreq} max={11000} step={10} color={color} onChange={(v) => setParam('filterFreq', v)} />
          <Slider label="Q" value={params.filterQ} max={10} color={color} onChange={(v) => setParam('filterQ', v)} />
          <Slider label="Env Amt" value={params.filterEnvAmount} min={-12000} max={12000} step={10} color={color} onChange={(v) => setParam('filterEnvAmount', v)} />
        </Section>

        <Section label="Effects" color={color}>
          <Slider label="Delay" value={params.delayAmount} color={color} onChange={(v) => setParam('delayAmount', v)} />
          <Slider label="D.Time" value={params.delayTime} color={color} onChange={(v) => setParam('delayTime', v)} />
          <Slider label="D.FB" value={params.delayFeedback} color={color} onChange={(v) => setParam('delayFeedback', v)} />
          <Slider label="Reverb" value={params.reverbAmount} color={color} onChange={(v) => setParam('reverbAmount', v)} />
          <Slider label="Dist" value={params.distortionAmount} color={color} onChange={(v) => setParam('distortionAmount', v)} />
        </Section>

        <Section label="Master" color={color} defaultOpen>
          <Slider label="Volume" value={params.masterVolume} color={color} onChange={(v) => setParam('masterVolume', v)} />
          <Slider label="Glide" value={params.portamentoSpeed} max={0.5} color={color} onChange={(v) => setParam('portamentoSpeed', v)} />
        </Section>
      </div>
    </div>
  );
}
