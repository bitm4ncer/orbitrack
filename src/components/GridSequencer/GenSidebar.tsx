import { useState } from 'react';
import { useStore } from '../../state/store';
import { generateAndApply } from '../../generation/generate';
import { randomSeed } from '../../generation/rng';
import type {
  GenerationMode,
  GenerationParams,
  RandomParams,
  ScaleBasedParams,
  ChordBasedParams,
  BasslineParams,
  DrumPatternParams,
} from '../../generation/types';
import {
  DEFAULT_RANDOM_PARAMS,
  DEFAULT_SCALE_PARAMS,
  DEFAULT_CHORD_PARAMS,
  DEFAULT_BASSLINE_PARAMS,
  DEFAULT_DRUM_PARAMS,
} from '../../generation/types';
import { EffectKnob } from '../EffectsSidebar/EffectKnob';
import { GenPreview } from './GenPreview';

const GEN_KNOB_COLOR = '#9b5de5';

interface Props {
  instrumentId: string;
  instrumentType: 'synth' | 'sampler';
  color: string;
  width: number;
}

const SYNTH_MODES: { label: string; value: GenerationMode; info: string }[] = [
  { label: 'Random', value: 'random', info: 'Places notes randomly across the grid at set density' },
  { label: 'Scale', value: 'scaleBased', info: 'Generates melodic patterns from the selected scale' },
  { label: 'Chords', value: 'chordBased', info: 'Stacks chord progressions with configurable voicings' },
  { label: 'Bass', value: 'bassline', info: 'Creates bass lines in Root, Octave, Walk, Acid or Arp style' },
];

const SAMPLER_MODES: { label: string; value: GenerationMode; info: string }[] = [
  { label: 'Rhythm', value: 'drumPattern', info: 'Generates drum patterns based on genre templates' },
  { label: 'Random', value: 'random', info: 'Places hits randomly across the grid at set density' },
];

// ── Random Panel ───────────────────────────────────────────────────────────

function RandomPanel({ params, onChange }: {
  params: RandomParams; onChange: (p: RandomParams) => void;
}) {
  return (
    <div className="flex flex-col gap-4 px-3 py-3">
      <div className="flex flex-wrap justify-center gap-4">
        <EffectKnob
          label="Density"
          value={params.density}
          min={0}
          max={1}
          step={0.05}
          color={GEN_KNOB_COLOR}
          size="sm"
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => onChange({ ...params, density: v })}
        />
      </div>
      <label className="flex items-center gap-2 text-[9px] text-text-secondary cursor-pointer px-1">
        <input
          type="checkbox"
          checked={params.allowChords}
          onChange={(e) => onChange({ ...params, allowChords: e.target.checked })}
          className="w-3 h-3 accent-accent"
        />
        Allow Chords
      </label>
      {params.allowChords && (
        <EffectKnob
          label="Chord Prob"
          value={params.chordProbability}
          min={0}
          max={1}
          step={0.05}
          color={GEN_KNOB_COLOR}
          size="sm"
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => onChange({ ...params, chordProbability: v })}
        />
      )}
    </div>
  );
}

// ── Scale Panel ────────────────────────────────────────────────────────────

function ScalePanel({ params, onChange }: {
  params: ScaleBasedParams; onChange: (p: ScaleBasedParams) => void;
}) {
  const patternOptions = [
    { label: 'Asc', value: 'ascending' as const },
    { label: 'Desc', value: 'descending' as const },
    { label: 'Pend', value: 'pendulum' as const },
    { label: 'Arp↑', value: 'arpUp' as const },
    { label: 'Arp↓', value: 'arpDown' as const },
    { label: 'Arp↕', value: 'arpUpDown' as const },
  ];

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <div className="flex gap-0.5 flex-wrap">
        {patternOptions.map((p) => (
          <button
            key={p.value}
            onClick={() => onChange({ ...params, pattern: p.value })}
            className={`text-[8px] px-1.5 py-0.5 rounded transition-colors
              ${params.pattern === p.value
                ? 'bg-white/10 text-text-primary'
                : 'text-text-secondary/50 hover:text-text-secondary hover:bg-white/5'}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap justify-center gap-4">
        <EffectKnob
          label="Density"
          value={params.density}
          min={0}
          max={1}
          step={0.05}
          color={GEN_KNOB_COLOR}
          size="sm"
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => onChange({ ...params, density: v })}
        />
      </div>

      <div className="flex gap-0.5">
        <span className="text-[8px] text-text-secondary/60 w-12 shrink-0">Step:</span>
        <div className="flex gap-0.5">
          {[1, 2, 3].map((s) => (
            <button
              key={s}
              onClick={() => onChange({ ...params, stepSize: s as any })}
              className={`text-[8px] px-1.5 py-0.5 rounded transition-colors
                ${params.stepSize === s
                  ? 'bg-white/10 text-text-primary'
                  : 'text-text-secondary/50 hover:text-text-secondary hover:bg-white/5'}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-0.5">
        <span className="text-[8px] text-text-secondary/60 w-12 shrink-0">Oct:</span>
        <div className="flex gap-0.5">
          {[1, 2, 3].map((o) => (
            <button
              key={o}
              onClick={() => onChange({ ...params, octaves: o as any })}
              className={`text-[8px] px-1.5 py-0.5 rounded transition-colors
                ${params.octaves === o
                  ? 'bg-white/10 text-text-primary'
                  : 'text-text-secondary/50 hover:text-text-secondary hover:bg-white/5'}`}
            >
              {o}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Chord Panel ────────────────────────────────────────────────────────────

function ChordPanel({ params, onChange }: {
  params: ChordBasedParams; onChange: (p: ChordBasedParams) => void;
}) {
  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <div>
        <label className="text-[8px] text-text-secondary block mb-1">Progression</label>
        <select
          value={params.progression}
          onChange={(e) => onChange({ ...params, progression: e.target.value as any })}
          className="w-full text-[8px] px-1.5 py-1 rounded bg-bg-tertiary border border-border text-text-secondary outline-none"
        >
          <option value="common">Common</option>
          <option value="circle5">Circle 5th</option>
          <option value="random">Random</option>
          <option value="chromatic">Chromatic</option>
        </select>
      </div>

      <div className="flex gap-0.5">
        <span className="text-[8px] text-text-secondary/60 w-12 shrink-0">Voicing:</span>
        <div className="flex gap-0.5 flex-wrap">
          {['Close', 'Open', 'Drop2', 'Spread'].map((v) => (
            <button
              key={v}
              onClick={() => onChange({ ...params, voicing: v.toLowerCase() as any })}
              className={`text-[8px] px-1 py-0.5 rounded transition-colors
                ${params.voicing === v.toLowerCase()
                  ? 'bg-white/10 text-text-primary'
                  : 'text-text-secondary/50 hover:text-text-secondary hover:bg-white/5'}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-0.5">
        <span className="text-[8px] text-text-secondary/60 w-12 shrink-0">Rhythm:</span>
        <div className="flex gap-0.5 flex-wrap">
          {['Sustain', 'Stabs', 'Offbeat', 'Arp'].map((r) => (
            <button
              key={r}
              onClick={() => onChange({ ...params, rhythm: r.toLowerCase() as any })}
              className={`text-[8px] px-1 py-0.5 rounded transition-colors
                ${params.rhythm === r.toLowerCase()
                  ? 'bg-white/10 text-text-primary'
                  : 'text-text-secondary/50 hover:text-text-secondary hover:bg-white/5'}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-0.5">
        <span className="text-[8px] text-text-secondary/60 w-12 shrink-0">Bar:</span>
        <div className="flex gap-0.5">
          {[1, 2, 4].map((cb) => (
            <button
              key={cb}
              onClick={() => onChange({ ...params, chordsPerBar: cb as any })}
              className={`text-[8px] px-1.5 py-0.5 rounded transition-colors
                ${params.chordsPerBar === cb
                  ? 'bg-white/10 text-text-primary'
                  : 'text-text-secondary/50 hover:text-text-secondary hover:bg-white/5'}`}
            >
              {cb}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Bass Panel ─────────────────────────────────────────────────────────────

function BassPanel({ params, onChange }: {
  params: BasslineParams; onChange: (p: BasslineParams) => void;
}) {
  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <div className="flex gap-0.5 flex-wrap">
        {['Root', 'Octave', 'Walk', 'Acid', 'Arp'].map((s) => (
          <button
            key={s}
            onClick={() => onChange({ ...params, style: s.toLowerCase() as any })}
            className={`text-[8px] px-1.5 py-0.5 rounded transition-colors
              ${params.style === s.toLowerCase()
                ? 'bg-white/10 text-text-primary'
                : 'text-text-secondary/50 hover:text-text-secondary hover:bg-white/5'}`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap justify-center gap-4">
        <EffectKnob
          label="Density"
          value={params.density}
          min={0}
          max={1}
          step={0.05}
          color={GEN_KNOB_COLOR}
          size="sm"
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => onChange({ ...params, density: v })}
        />
        <EffectKnob
          label="Syncopation"
          value={params.syncopation}
          min={0}
          max={1}
          step={0.05}
          color={GEN_KNOB_COLOR}
          size="sm"
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => onChange({ ...params, syncopation: v })}
        />
        <EffectKnob
          label="Oct Jump"
          value={params.octaveJumpProb}
          min={0}
          max={1}
          step={0.05}
          color={GEN_KNOB_COLOR}
          size="sm"
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => onChange({ ...params, octaveJumpProb: v })}
        />
        <EffectKnob
          label="Slide"
          value={params.slideProb}
          min={0}
          max={1}
          step={0.05}
          color={GEN_KNOB_COLOR}
          size="sm"
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => onChange({ ...params, slideProb: v })}
        />
      </div>
    </div>
  );
}

// ── Drum Panel ─────────────────────────────────────────────────────────────

function DrumPanel({ params, onChange }: {
  params: DrumPatternParams; onChange: (p: DrumPatternParams) => void;
}) {
  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <div>
        <label className="text-[8px] text-text-secondary block mb-1">Genre</label>
        <select
          value={params.genre}
          onChange={(e) => onChange({ ...params, genre: e.target.value as any })}
          className="w-full text-[8px] px-1.5 py-1 rounded bg-bg-tertiary border border-border text-text-secondary outline-none"
        >
          <option value="house">House</option>
          <option value="techno">Techno</option>
          <option value="breakbeat">Breakbeat</option>
          <option value="hiphop">Hip-Hop</option>
          <option value="dnb">D&B</option>
          <option value="trap">Trap</option>
          <option value="jungle">Jungle</option>
          <option value="garage">UK Garage</option>
          <option value="afrobeat">Afrobeat</option>
          <option value="ambient">Ambient</option>
          <option value="random">Random</option>
        </select>
      </div>

      <div className="flex flex-wrap justify-center gap-4">
        <EffectKnob
          label="Density"
          value={params.density}
          min={0}
          max={1}
          step={0.05}
          color={GEN_KNOB_COLOR}
          size="sm"
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => onChange({ ...params, density: v })}
        />
        <EffectKnob
          label="Variation"
          value={params.variation}
          min={0}
          max={1}
          step={0.05}
          color={GEN_KNOB_COLOR}
          size="sm"
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => onChange({ ...params, variation: v })}
        />
      </div>
    </div>
  );
}

// ── Main GenSidebar ────────────────────────────────────────────────────────

export function GenSidebar({ instrumentId, instrumentType, color, width }: Props) {
  const hasUndo = useStore((s) => !!s.generationUndo[instrumentId]);

  const modes = instrumentType === 'sampler' ? SAMPLER_MODES : SYNTH_MODES;
  const [mode, setMode] = useState<GenerationMode>(modes[0].value);
  const [seed, setSeed] = useState(randomSeed());

  // Octave frame controls
  const [octaveBase, setOctaveBase] = useState(3);
  const [octaveSpan, setOctaveSpan] = useState(2);

  // Per-mode params
  const [randomParams, setRandomParams] = useState<RandomParams>({ ...DEFAULT_RANDOM_PARAMS });
  const [scaleParams, setScaleParams] = useState<ScaleBasedParams>({ ...DEFAULT_SCALE_PARAMS });
  const [chordParams, setChordParams] = useState<ChordBasedParams>({ ...DEFAULT_CHORD_PARAMS });
  const [bassParams, setBassParams] = useState<BasslineParams>({ ...DEFAULT_BASSLINE_PARAMS });
  const [drumParams, setDrumParams] = useState<DrumPatternParams>({ ...DEFAULT_DRUM_PARAMS });

  const handleGenerate = () => {
    const genParams = buildGenParams();
    generateAndApply(instrumentId, genParams, seed, { base: octaveBase, span: octaveSpan });
    setSeed(randomSeed());
  };

  const handleUndo = () => {
    useStore.getState().undoGeneration(instrumentId);
  };

  function buildGenParams(): GenerationParams {
    switch (mode) {
      case 'random': return { mode: 'random', params: randomParams };
      case 'scaleBased': return { mode: 'scaleBased', params: scaleParams };
      case 'chordBased': return { mode: 'chordBased', params: chordParams };
      case 'bassline': return { mode: 'bassline', params: bassParams };
      case 'drumPattern': return { mode: 'drumPattern', params: drumParams };
      default: return { mode: 'random', params: randomParams };
    }
  }

  const currentModeInfo = modes.find((m) => m.value === mode)?.info || '';

  return (
    <div
      className="flex flex-col h-full border-r border-border bg-bg-secondary overflow-y-auto shrink-0"
      style={{ width }}
    >
      {/* Mode tabs with info */}
      <div className="border-b border-border/50 px-2 py-2">
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-0.5 flex-wrap">
            {modes.map((m) => (
              <button
                key={m.value}
                onClick={() => setMode(m.value)}
                className={`text-[8px] px-1.5 py-0.5 rounded transition-colors flex-1
                  ${mode === m.value
                    ? 'bg-accent/20 text-accent'
                    : 'text-text-secondary/60 hover:text-text-secondary hover:bg-white/5'}`}
                title={m.info}
              >
                {m.label}
              </button>
            ))}
          </div>
          {currentModeInfo && (
            <p className="text-[7px] text-text-secondary/60 px-1 leading-tight italic">
              {currentModeInfo}
            </p>
          )}
        </div>
      </div>

      {/* Mode preview */}
      <div className="px-2 py-2 border-b border-border/50">
        {(() => {
          const params =
            mode === 'random' ? randomParams :
            mode === 'scaleBased' ? scaleParams :
            mode === 'chordBased' ? chordParams :
            mode === 'bassline' ? bassParams :
            drumParams;
          return <GenPreview mode={mode} color={color} params={params} />;
        })()}
      </div>

      {/* Mode-specific controls */}
      <div className="flex-1 overflow-y-auto">
        {mode === 'random' && <RandomPanel params={randomParams} onChange={setRandomParams} />}
        {mode === 'scaleBased' && <ScalePanel params={scaleParams} onChange={setScaleParams} />}
        {mode === 'chordBased' && <ChordPanel params={chordParams} onChange={setChordParams} />}
        {mode === 'bassline' && <BassPanel params={bassParams} onChange={setBassParams} />}
        {mode === 'drumPattern' && <DrumPanel params={drumParams} onChange={setDrumParams} />}
      </div>

      {/* Octave frame controls */}
      <div className="border-t border-border/50 px-2 py-2">
        <div className="flex flex-wrap justify-center gap-2">
          <EffectKnob
            label="Base Oct"
            value={octaveBase}
            min={0}
            max={8}
            step={1}
            color={GEN_KNOB_COLOR}
            size="sm"
            format={(v) => `${v}`}
            onChange={setOctaveBase}
          />
          <EffectKnob
            label="Span"
            value={octaveSpan}
            min={1}
            max={4}
            step={1}
            color={GEN_KNOB_COLOR}
            size="sm"
            format={(v) => `${v}`}
            onChange={setOctaveSpan}
          />
        </div>
      </div>

      {/* Seed + Generate footer */}
      <div className="border-t border-border/50 px-3 py-2 flex flex-col gap-2">
        <div className="flex items-center gap-1">
          <span className="text-[8px] text-text-secondary/60 shrink-0">Seed</span>
          <input
            type="number"
            value={seed}
            onChange={(e) => setSeed(parseInt(e.target.value) || 0)}
            className="text-[8px] flex-1 px-1 py-0.5 rounded border border-border bg-bg-tertiary
                       text-text-secondary outline-none focus:border-accent"
          />
          <button
            onClick={() => setSeed(randomSeed())}
            className="text-[8px] px-1 py-0.5 rounded border border-border
                       text-text-secondary/60 hover:text-text-primary hover:border-accent transition-colors"
            title="Randomize seed"
          >
            🎲
          </button>
        </div>

        <button
          onClick={handleGenerate}
          className="text-[9px] py-1.5 rounded bg-accent/20 text-accent
                     hover:bg-accent/30 transition-colors font-medium"
        >
          GENERATE
        </button>
        {hasUndo && (
          <button
            onClick={handleUndo}
            className="text-[8px] px-2 py-1 rounded border border-border
                       text-text-secondary hover:text-text-primary hover:border-accent transition-colors"
          >
            UNDO
          </button>
        )}
      </div>
    </div>
  );
}
