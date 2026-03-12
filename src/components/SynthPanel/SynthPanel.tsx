import { useState, useMemo, useReducer, useEffect, useRef } from 'react';
import { useStore } from '../../state/store';
import { getSynthEngine } from '../../audio/synthManager';
import type { SynthParams } from '../../audio/synth/types';
import { DEFAULT_LFO_SLOT } from '../../audio/synth/types';
import { ALL_WAVE_SHAPES, ALL_WAVE_LABELS } from '../../audio/synth/wavetables';
import { WAVETABLE_BANKS } from '../../audio/synth/wavetableBanks';
import { EffectKnob } from '../EffectsSidebar/EffectKnob';
import type { KnobModulation, KnobContextItem } from '../EffectsSidebar/EffectKnob';
import { FilterCurveDisplay } from '../EffectsSidebar/FilterCurveDisplay';
import { EnvelopeDisplay } from './EnvelopeDisplay';
import { OscDisplay } from './OscDisplay';
import { SynthVisualizer } from './SynthVisualizer';
import { PresetBrowser } from './PresetBrowser';
import { LFOPanel } from './LFOPanel';
import { ModulationProvider } from './ModulationContext';
import { usePresetStore } from '../../state/presetStore';
import { useMidiLearn } from '../../hooks/useMidiLearn';

// ─── Shared sub-components ───────────────────────────────────────────────────

function SynthKnob({
  label, value, min, max, step = 0.01, unit, color, defaultValue, onChange,
  size = 'sm', modulations, contextItems,
}: {
  label: string; value: number; min: number; max: number; step?: number;
  unit?: string; color: string; defaultValue: number;
  onChange: (v: number) => void; size?: 'sm' | 'md' | 'lg';
  modulations?: KnobModulation[]; contextItems?: KnobContextItem[];
}) {
  return (
    <EffectKnob
      value={value} min={min} max={max} step={step}
      defaultValue={defaultValue} label={label} color={color}
      unit={unit} size={size} onChange={onChange}
      modulations={modulations} contextItems={contextItems}
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

// ─── Main component ──────────────────────────────────────────────────────────

export function SynthPanel() {
  const selectedId = useStore((s) => s.selectedInstrumentId);
  const instruments = useStore((s) => s.instruments);
  const instrument = instruments.find((i) => i.id === selectedId);

  // useMemo so engine creation (side-effect: starts oscillators) only runs
  // when the instrument id/orbit actually changes, not on every render.
  const engine = useMemo(() => {
    if (!instrument || instrument.type !== 'synth') return null;
    try { return getSynthEngine(instrument.id, instrument.orbitIndex, instrument.engineParams); }
    catch (e) { console.error('[SynthPanel] Failed to create engine:', e); return null; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instrument?.id, instrument?.orbitIndex]);

  // Force re-render when a param is mutated directly on the engine.
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
  const updateEngineParams = useStore((s) => s.updateEngineParams);
  const [synthCollapsed, setSynthCollapsed] = useState(false);

  // Track the engineParams ref we last wrote, so we can detect external changes
  // (undo/redo/preset load) and sync them back to the live engine.
  const lastWrittenParams = useRef<SynthParams | null>(null);
  const storeEngineParams = instrument?.type === 'synth' ? instrument.engineParams : undefined;

  useEffect(() => {
    if (!engine || !storeEngineParams) return;
    // If the store's engineParams changed but we didn't write them, it's an external
    // update (undo/redo/set load) — re-apply all params to the live engine.
    if (storeEngineParams !== lastWrittenParams.current) {
      for (const key of Object.keys(storeEngineParams) as (keyof SynthParams)[]) {
        engine.setParam(key, storeEngineParams[key] as never);
      }
      lastWrittenParams.current = storeEngineParams;
      forceUpdate();
    }
  }, [engine, storeEngineParams]);

  // Track selected preset name from presetStore
  const selectedPresetId = usePresetStore((s) => s.selectedPresetId);
  const presets = usePresetStore((s) => s.presets);
  const currentPresetName = presets.find((p) => p.id === selectedPresetId)?.name ?? 'INIT';

  // MIDI learn
  const { startLearn: startMidiLearn, cancelLearn: cancelMidiLearn, learningTarget: midiLearning, removeCCMapping } = useMidiLearn();
  const midiMappings = useStore((s) => s.midiSettings.ccMappings);

  if (!instrument || instrument.type !== 'synth' || !engine) return null;

  const params = engine.getParams();
  const color = instrument.color;

  const set = <K extends keyof SynthParams>(key: K, value: SynthParams[K]) => {
    engine.setParam(key, value);
    const newParams = engine.getParams();
    lastWrittenParams.current = newParams;
    updateEngineParams(instrument.id, newParams);
    forceUpdate();
  };

  const filterTypeIdx = FILTER_TYPES.indexOf(params.filterType);

  // Modulation: get assignments and build knob modulation indicators
  const lfos = params.lfos ?? [DEFAULT_LFO_SLOT, DEFAULT_LFO_SLOT, DEFAULT_LFO_SLOT, DEFAULT_LFO_SLOT] as [typeof DEFAULT_LFO_SLOT, typeof DEFAULT_LFO_SLOT, typeof DEFAULT_LFO_SLOT, typeof DEFAULT_LFO_SLOT];
  const modAssignments = params.modAssignments ?? [];

  const getModsForParam = (key: keyof SynthParams): KnobModulation[] => {
    return modAssignments
      .filter((a) => a.target === key)
      .map((a) => ({ color: color, depth: a.depth }));
  };

  const handleModAssignmentsChange = (newAssignments: typeof modAssignments) => {
    set('modAssignments' as keyof SynthParams, newAssignments as never);
  };

  const assignLfo = (key: keyof SynthParams, lfoSource: string) => {
    const existing = modAssignments.find((a) => a.source === lfoSource && a.target === key);
    if (existing) return;
    const newAssignment = {
      id: `mod_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      source: lfoSource as 'lfo1' | 'lfo2' | 'lfo3' | 'lfo4',
      target: key,
      depth: 0.5,
    };
    set('modAssignments' as keyof SynthParams, [...modAssignments, newAssignment] as never);
  };

  const removeLfo = (key: keyof SynthParams, lfoSource: string) => {
    set('modAssignments' as keyof SynthParams,
      modAssignments.filter((a) => !(a.source === lfoSource && a.target === key)) as never);
  };

  const getContextItems = (key: keyof SynthParams, knobLabel: string): KnobContextItem[] => {
    const lfoIds = ['lfo1', 'lfo2', 'lfo3', 'lfo4'] as const;
    const items: KnobContextItem[] = [];

    // LFO assignments
    for (const lfo of lfoIds) {
      const assigned = modAssignments.some((a) => a.source === lfo && a.target === key);
      items.push({
        label: assigned ? `Remove ${lfo.toUpperCase()}` : `Assign ${lfo.toUpperCase()}`,
        icon: assigned ? 'remove' : 'lfo',
        active: assigned,
        color,
        onClick: () => assigned ? removeLfo(key, lfo) : assignLfo(key, lfo),
      });
    }

    // Separator via disabled item
    items.push({ label: '—', disabled: true, onClick: () => {} });

    // MIDI Learn
    items.push({
      label: midiLearning?.paramName === key ? 'Cancel MIDI Learn' : 'MIDI Learn',
      icon: 'midi',
      active: midiLearning?.paramName === key,
      onClick: () => {
        if (midiLearning?.paramName === key) {
          cancelMidiLearn();
        } else {
          startMidiLearn({
            targetType: 'synthParam',
            paramName: key,
            label: knobLabel,
            minValue: undefined,
            maxValue: undefined,
          });
        }
      },
    });

    // Show existing MIDI CC mapping
    const ccMapping = midiMappings.find((m) => m.targetType === 'synthParam' && m.paramName === key);
    if (ccMapping) {
      items.push({
        label: `Remove CC ${ccMapping.cc}`,
        icon: 'remove',
        onClick: () => {
          const idx = midiMappings.indexOf(ccMapping);
          if (idx >= 0) removeCCMapping(idx);
        },
      });
    }

    return items;
  };

  return (
    <ModulationProvider assignments={modAssignments} onAssignmentsChange={handleModAssignmentsChange}>
    <div
      className="synth-panel bg-bg-secondary border-l border-border overflow-y-auto shrink-0 flex flex-col w-full"
    >
      {/* ─── Header: name + collapse ──────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 py-2 shrink-0"
        style={{ borderBottom: `1px solid ${color}30` }}
      >
        <span className="text-[11px] font-semibold uppercase tracking-wider truncate" style={{ color }}>
          {instrument.name}
        </span>
        <button
          onClick={() => setSynthCollapsed(c => !c)}
          title={synthCollapsed ? 'Expand synth' : 'Collapse synth'}
          className="flex-shrink-0 p-1 hover:bg-white/10 rounded transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"
            className="text-text-secondary/60 hover:text-text-primary transition-colors"
            style={{ transform: `rotate(${synthCollapsed ? 180 : 0}deg)`, transition: 'transform 0.2s' }}>
            <polyline points="3 10 7 6 11 10" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {!synthCollapsed && <>
      {/* ─── Visualizer ─────────────────────────────────────────────── */}
      <div className="shrink-0" style={{ borderBottom: `1px solid ${color}20` }}>
        <SynthVisualizer orbitIndex={instrument.orbitIndex} color={color} />
      </div>

      {/* ─── Preset bar ─────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-2 px-4 py-2 shrink-0"
        style={{ borderBottom: `1px solid ${color}30` }}
      >
        <span className="text-[9px] uppercase tracking-wider shrink-0" style={{ color }}>
          Preset
        </span>
        <PresetBrowser
          engine={engine}
          color={color}
          currentPresetName={currentPresetName}
          onPresetLoaded={() => {
            updateEngineParams(instrument.id, engine.getParams());
            forceUpdate();
          }}
        />
      </div>

      {/* ─── OSC ────────────────────────────────────────────────────── */}
      <Section label="Oscillator" color={color} defaultOpen>
        {/* Mode toggle: CLASSIC / WAVETABLE */}
        {(() => {
          const isWT = params.vcoType.startsWith('wt:');
          const bankId = isWT ? params.vcoType.slice(3) : 'basic_shapes';
          return (
            <>
              <div className="flex gap-0.5 w-full">
                <button
                  onClick={() => { if (isWT) set('vcoType', 'sawtooth'); }}
                  className="flex-1 text-[8px] uppercase tracking-wider py-0.5 rounded transition-all"
                  style={{
                    background: !isWT ? `${color}28` : 'transparent',
                    border: `1px solid ${!isWT ? color : '#2a2a3a'}`,
                    color: !isWT ? color : '#8888a0',
                  }}
                >
                  Classic
                </button>
                <button
                  onClick={() => { if (!isWT) set('vcoType', `wt:${bankId}`); }}
                  className="flex-1 text-[8px] uppercase tracking-wider py-0.5 rounded transition-all"
                  style={{
                    background: isWT ? `${color}28` : 'transparent',
                    border: `1px solid ${isWT ? color : '#2a2a3a'}`,
                    color: isWT ? color : '#8888a0',
                  }}
                >
                  Wavetable
                </button>
              </div>

              {isWT ? (
                <>
                  {/* Bank selector */}
                  <select
                    value={bankId}
                    onChange={(e) => set('vcoType', `wt:${e.target.value}`)}
                    className="w-full text-[9px] py-1 px-2 rounded border bg-transparent outline-none cursor-pointer"
                    style={{
                      borderColor: `${color}40`,
                      color,
                    }}
                  >
                    {WAVETABLE_BANKS.map((b) => (
                      <option key={b.id} value={b.id} style={{ background: '#0e0e18', color: '#ccc' }}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  <OscDisplay waveType={params.vcoType} color={color} wtPosition={params.wtPosition ?? 0} />
                  <KnobRow>
                    <SynthKnob label="Pos" value={params.wtPosition ?? 0} min={0} max={1} step={0.005} defaultValue={0} color={color} onChange={(v) => set('wtPosition', v)} modulations={getModsForParam('wtPosition')} contextItems={getContextItems('wtPosition', 'Pos')} />
                  </KnobRow>
                </>
              ) : (
                <>
                  {/* Classic shape selector — 2 rows of 5 */}
                  {[0, 1].map((row) => (
                    <div key={row} className="flex gap-0.5 w-full">
                      {ALL_WAVE_SHAPES.slice(row * 5, row * 5 + 5).map((shape, i) => {
                        const idx = row * 5 + i;
                        const active = params.vcoType === shape;
                        return (
                          <button
                            key={shape}
                            onClick={() => set('vcoType', shape)}
                            className="flex-1 text-[8px] uppercase tracking-wider py-0.5 rounded transition-all"
                            style={{
                              background: active ? `${color}28` : 'transparent',
                              border: `1px solid ${active ? color : '#2a2a3a'}`,
                              color: active ? color : '#8888a0',
                            }}
                          >
                            {ALL_WAVE_LABELS[idx]}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                  <OscDisplay waveType={params.vcoType} color={color} />
                </>
              )}
            </>
          );
        })()}
        <KnobRow>
          <SynthKnob label="Gain" value={params.vcoGain} min={0} max={1} defaultValue={1} color={color} onChange={(v) => set('vcoGain', v)} modulations={getModsForParam('vcoGain')} contextItems={getContextItems('vcoGain', 'Gain')} />
          <SynthKnob label="Pan" value={params.vcoPan} min={-1} max={1} defaultValue={0} color={color} onChange={(v) => set('vcoPan', v)} modulations={getModsForParam('vcoPan')} contextItems={getContextItems('vcoPan', 'Pan')} />
          <SynthKnob label="Tune" value={params.vcoDetune} min={-100} max={100} step={1} unit="¢" defaultValue={0} color={color} onChange={(v) => set('vcoDetune', v)} modulations={getModsForParam('vcoDetune')} contextItems={getContextItems('vcoDetune', 'Tune')} />
        </KnobRow>
        {/* Octave */}
        <div>
          <span className="text-[8px] text-text-secondary/60 uppercase tracking-wider">Octave</span>
          <div className="flex gap-0.5 mt-1">
            {[-2, -1, 0, 1, 2].map((n) => (
              <button
                key={n}
                onClick={() => set('vcoOctave', n)}
                className="flex-1 text-[8px] py-0.5 rounded transition-all"
                style={{
                  background: Math.round(params.vcoOctave ?? 0) === n ? `${color}28` : 'transparent',
                  border: `1px solid ${Math.round(params.vcoOctave ?? 0) === n ? color : '#2a2a3a'}`,
                  color: Math.round(params.vcoOctave ?? 0) === n ? color : '#8888a0',
                }}
              >
                {n > 0 ? `+${n}` : n}
              </button>
            ))}
          </div>
        </div>

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
          <SynthKnob label="Freq" value={params.filterFreq} min={20} max={20000} step={10} unit="Hz" defaultValue={8000} color={color} onChange={(v) => set('filterFreq', v)} modulations={getModsForParam('filterFreq')} contextItems={getContextItems('filterFreq', 'Freq')} />
          <SynthKnob label="Q" value={params.filterQ} min={0} max={20} defaultValue={0} color={color} onChange={(v) => set('filterQ', v)} modulations={getModsForParam('filterQ')} contextItems={getContextItems('filterQ', 'Q')} />
          <SynthKnob label="Env" value={params.filterEnvAmount} min={-12000} max={12000} step={10} unit="¢" defaultValue={0} color={color} onChange={(v) => set('filterEnvAmount', v)} modulations={getModsForParam('filterEnvAmount')} contextItems={getContextItems('filterEnvAmount', 'Env')} />
        </KnobRow>
        <KnobRow>
          <SynthKnob label="Atk" value={params.filterAttack} min={0} max={2} unit="s" defaultValue={0} color={color} onChange={(v) => set('filterAttack', v)} />
          <SynthKnob label="Dec" value={params.filterDecay} min={0.001} max={2} unit="s" defaultValue={0.1} color={color} onChange={(v) => set('filterDecay', v)} />
        </KnobRow>
      </Section>

      {/* ─── LFO (Serum/Vital style) ────────────────────────────────── */}
      <LFOPanel
        lfos={lfos as [typeof DEFAULT_LFO_SLOT, typeof DEFAULT_LFO_SLOT, typeof DEFAULT_LFO_SLOT, typeof DEFAULT_LFO_SLOT]}
        onLFOChange={(idx, lfoParams) => {
          const newLfos = [...lfos] as typeof lfos;
          newLfos[idx] = lfoParams;
          set('lfos' as keyof SynthParams, newLfos as never);
        }}
        assignments={modAssignments}
        instrumentColor={color}
      />

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
          <SynthKnob label="Amt" value={params.delayAmount} min={0} max={1} defaultValue={0} color={color} onChange={(v) => set('delayAmount', v)} modulations={getModsForParam('delayAmount')} contextItems={getContextItems('delayAmount', 'Amt')} />
          <SynthKnob label="Time" value={params.delayTime} min={0} max={1} unit="s" defaultValue={0} color={color} onChange={(v) => set('delayTime', v)} modulations={getModsForParam('delayTime')} contextItems={getContextItems('delayTime', 'Time')} />
          <SynthKnob label="FB" value={params.delayFeedback} min={0} max={0.95} defaultValue={0} color={color} onChange={(v) => set('delayFeedback', v)} modulations={getModsForParam('delayFeedback')} contextItems={getContextItems('delayFeedback', 'FB')} />
          <SynthKnob label="Tone" value={params.delayTone} min={200} max={12000} step={50} unit="Hz" defaultValue={4400} color={color} onChange={(v) => set('delayTone', v)} modulations={getModsForParam('delayTone')} contextItems={getContextItems('delayTone', 'Tone')} />
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

      </>}
    </div>
    </ModulationProvider>
  );
}
