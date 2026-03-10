import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

interface Props {
  instrumentId: string;
  instrumentType: 'synth' | 'sampler';
  anchorRect: DOMRect;
  onClose: () => void;
}

const SYNTH_MODES: { label: string; value: GenerationMode }[] = [
  { label: 'Random', value: 'random' },
  { label: 'Scale', value: 'scaleBased' },
  { label: 'Chords', value: 'chordBased' },
  { label: 'Bass', value: 'bassline' },
];

const SAMPLER_MODES: { label: string; value: GenerationMode }[] = [
  { label: 'Rhythm', value: 'drumPattern' },
  { label: 'Random', value: 'random' },
];

function computeStyle(anchor: DOMRect): React.CSSProperties {
  const W = 260;
  const GAP = 4;
  const MARGIN = 8;
  let left = anchor.left;
  let top = anchor.bottom + GAP;
  if (left + W > window.innerWidth - MARGIN) left = window.innerWidth - MARGIN - W;
  if (left < MARGIN) left = MARGIN;
  if (top + 400 > window.innerHeight - MARGIN) top = anchor.top - 400 - GAP;
  if (top < MARGIN) top = MARGIN;
  return { position: 'fixed', left, top, width: W, zIndex: 9999 };
}

// ── Slider component ─────────────────────────────────────────────────────
function Slider({ label, value, onChange, min = 0, max = 1, step = 0.05 }: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] text-text-secondary w-20 shrink-0">{label}</span>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1 accent-accent"
      />
      <span className="text-[9px] text-text-secondary/60 w-8 text-right">
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}

// ── Toggle button row ────────────────────────────────────────────────────
function ToggleRow<T extends string>({ options, value, onChange }: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`text-[9px] px-1.5 py-0.5 rounded transition-colors
            ${value === o.value
              ? 'bg-white/10 text-text-primary'
              : 'text-text-secondary/50 hover:text-text-secondary hover:bg-white/5'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Mode-specific panels ─────────────────────────────────────────────────

function RandomPanel({ params, onChange }: {
  params: RandomParams; onChange: (p: RandomParams) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Slider label="Density" value={params.density} onChange={(v) => onChange({ ...params, density: v })} />
      <div className="flex items-center gap-2">
        <label className="text-[9px] text-text-secondary flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={params.allowChords}
            onChange={(e) => onChange({ ...params, allowChords: e.target.checked })}
            className="w-3 h-3 accent-accent"
          />
          Chords
        </label>
        {params.allowChords && (
          <div className="flex-1">
            <Slider label="Prob" value={params.chordProbability}
              onChange={(v) => onChange({ ...params, chordProbability: v })} />
          </div>
        )}
      </div>
    </div>
  );
}

function ScalePanel({ params, onChange }: {
  params: ScaleBasedParams; onChange: (p: ScaleBasedParams) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <ToggleRow
        options={[
          { label: 'Asc', value: 'ascending' as const },
          { label: 'Desc', value: 'descending' as const },
          { label: 'Pend', value: 'pendulum' as const },
          { label: 'Arp↑', value: 'arpUp' as const },
          { label: 'Arp↓', value: 'arpDown' as const },
          { label: 'Arp↕', value: 'arpUpDown' as const },
        ]}
        value={params.pattern}
        onChange={(v) => onChange({ ...params, pattern: v })}
      />
      <Slider label="Density" value={params.density} onChange={(v) => onChange({ ...params, density: v })} />
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-text-secondary w-20">Step Size</span>
        <ToggleRow
          options={[
            { label: '1', value: '1' },
            { label: '2', value: '2' },
            { label: '3', value: '3' },
          ]}
          value={String(params.stepSize)}
          onChange={(v) => onChange({ ...params, stepSize: parseInt(v) })}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-text-secondary w-20">Octaves</span>
        <ToggleRow
          options={[
            { label: '1', value: '1' },
            { label: '2', value: '2' },
            { label: '3', value: '3' },
          ]}
          value={String(params.octaves)}
          onChange={(v) => onChange({ ...params, octaves: parseInt(v) })}
        />
      </div>
    </div>
  );
}

function ChordPanel({ params, onChange }: {
  params: ChordBasedParams; onChange: (p: ChordBasedParams) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-text-secondary w-20">Progression</span>
        <select
          value={params.progression}
          onChange={(e) => onChange({ ...params, progression: e.target.value as ChordBasedParams['progression'] })}
          className="text-[9px] px-1 py-0.5 rounded border border-border bg-bg-tertiary text-text-secondary outline-none flex-1"
        >
          <option value="common">Common</option>
          <option value="circle5">Circle of 5ths</option>
          <option value="random">Random</option>
          <option value="chromatic">Chromatic</option>
        </select>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-text-secondary w-20">Voicing</span>
        <ToggleRow
          options={[
            { label: 'Close', value: 'close' as const },
            { label: 'Open', value: 'open' as const },
            { label: 'Drop2', value: 'drop2' as const },
            { label: 'Spread', value: 'spread' as const },
          ]}
          value={params.voicing}
          onChange={(v) => onChange({ ...params, voicing: v })}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-text-secondary w-20">Rhythm</span>
        <ToggleRow
          options={[
            { label: 'Sustain', value: 'sustained' as const },
            { label: 'Stabs', value: 'stabs' as const },
            { label: 'Offbeat', value: 'offbeat' as const },
            { label: 'Arp', value: 'arp' as const },
          ]}
          value={params.rhythm}
          onChange={(v) => onChange({ ...params, rhythm: v })}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-text-secondary w-20">Chords/Bar</span>
        <ToggleRow
          options={[
            { label: '1', value: '1' },
            { label: '2', value: '2' },
            { label: '4', value: '4' },
          ]}
          value={String(params.chordsPerBar)}
          onChange={(v) => onChange({ ...params, chordsPerBar: parseInt(v) })}
        />
      </div>
    </div>
  );
}

function BassPanel({ params, onChange }: {
  params: BasslineParams; onChange: (p: BasslineParams) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <ToggleRow
        options={[
          { label: 'Root', value: 'root' as const },
          { label: 'Octave', value: 'octave' as const },
          { label: 'Walk', value: 'walking' as const },
          { label: 'Acid', value: 'acid' as const },
          { label: 'Arp', value: 'arpeggiated' as const },
        ]}
        value={params.style}
        onChange={(v) => onChange({ ...params, style: v })}
      />
      <Slider label="Density" value={params.density} onChange={(v) => onChange({ ...params, density: v })} />
      <Slider label="Syncopation" value={params.syncopation} onChange={(v) => onChange({ ...params, syncopation: v })} />
      <Slider label="Oct Jump" value={params.octaveJumpProb} onChange={(v) => onChange({ ...params, octaveJumpProb: v })} />
      <Slider label="Slide" value={params.slideProb} onChange={(v) => onChange({ ...params, slideProb: v })} />
    </div>
  );
}

function DrumPanel({ params, onChange }: {
  params: DrumPatternParams; onChange: (p: DrumPatternParams) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-text-secondary w-20">Genre</span>
        <select
          value={params.genre}
          onChange={(e) => onChange({ ...params, genre: e.target.value as DrumPatternParams['genre'] })}
          className="text-[9px] px-1 py-0.5 rounded border border-border bg-bg-tertiary text-text-secondary outline-none flex-1"
        >
          <option value="house">House</option>
          <option value="techno">Techno</option>
          <option value="breakbeat">Breakbeat</option>
          <option value="hiphop">Hip-Hop</option>
          <option value="dnb">DnB</option>
          <option value="random">Random</option>
        </select>
      </div>
      <Slider label="Density" value={params.density} onChange={(v) => onChange({ ...params, density: v })} />
      <Slider label="Variation" value={params.variation} onChange={(v) => onChange({ ...params, variation: v })} />
    </div>
  );
}

// ── Main GeneratePanel ───────────────────────────────────────────────────

export function GeneratePanel({ instrumentId, instrumentType, anchorRect, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const hasUndo = useStore((s) => !!s.generationUndo[instrumentId]);

  const modes = instrumentType === 'sampler' ? SAMPLER_MODES : SYNTH_MODES;
  const [mode, setMode] = useState<GenerationMode>(modes[0].value);
  const [seed, setSeed] = useState(randomSeed());

  // Per-mode params
  const [randomParams, setRandomParams] = useState<RandomParams>({ ...DEFAULT_RANDOM_PARAMS });
  const [scaleParams, setScaleParams] = useState<ScaleBasedParams>({ ...DEFAULT_SCALE_PARAMS });
  const [chordParams, setChordParams] = useState<ChordBasedParams>({ ...DEFAULT_CHORD_PARAMS });
  const [bassParams, setBassParams] = useState<BasslineParams>({ ...DEFAULT_BASSLINE_PARAMS });
  const [drumParams, setDrumParams] = useState<DrumPatternParams>({ ...DEFAULT_DRUM_PARAMS });

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [onClose]);

  const handleGenerate = () => {
    const genParams = buildGenParams();
    generateAndApply(instrumentId, genParams, seed);
    // Auto-randomize seed for next generation
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

  return createPortal(
    <div
      ref={panelRef}
      className="bg-bg-secondary border border-border rounded-lg shadow-2xl"
      style={computeStyle(anchorRect)}
    >
      {/* Mode selector */}
      <div className="px-3 pt-3 pb-2 border-b border-border/50">
        <div className="flex gap-0.5">
          {modes.map((m) => (
            <button
              key={m.value}
              onClick={() => setMode(m.value)}
              className={`text-[9px] px-2 py-1 rounded transition-colors
                ${mode === m.value
                  ? 'bg-accent/20 text-accent'
                  : 'text-text-secondary/60 hover:text-text-secondary hover:bg-white/5'}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mode-specific controls */}
      <div className="px-3 py-2.5">
        {mode === 'random' && <RandomPanel params={randomParams} onChange={setRandomParams} />}
        {mode === 'scaleBased' && <ScalePanel params={scaleParams} onChange={setScaleParams} />}
        {mode === 'chordBased' && <ChordPanel params={chordParams} onChange={setChordParams} />}
        {mode === 'bassline' && <BassPanel params={bassParams} onChange={setBassParams} />}
        {mode === 'drumPattern' && <DrumPanel params={drumParams} onChange={setDrumParams} />}
      </div>

      {/* Seed + actions */}
      <div className="px-3 pb-3 flex flex-col gap-2 border-t border-border/50 pt-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-text-secondary/60">Seed</span>
          <input
            type="number"
            value={seed}
            onChange={(e) => setSeed(parseInt(e.target.value) || 0)}
            className="text-[9px] w-20 px-1.5 py-0.5 rounded border border-border bg-bg-tertiary
                       text-text-secondary outline-none focus:border-accent"
          />
          <button
            onClick={() => setSeed(randomSeed())}
            className="text-[10px] px-1.5 py-0.5 rounded border border-border
                       text-text-secondary/60 hover:text-text-primary hover:border-accent transition-colors"
            title="Randomize seed"
          >
            dice
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleGenerate}
            className="flex-1 text-[10px] py-1.5 rounded bg-accent/20 text-accent
                       hover:bg-accent/30 transition-colors font-medium"
          >
            GENERATE
          </button>
          {hasUndo && (
            <button
              onClick={handleUndo}
              className="text-[10px] px-3 py-1.5 rounded border border-border
                         text-text-secondary hover:text-text-primary hover:border-accent transition-colors"
            >
              UNDO
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
