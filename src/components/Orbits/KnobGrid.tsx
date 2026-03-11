import { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../../state/store';
import { KnobCanvas } from './KnobCanvas';
import { PASTEL_COLORS } from '../../canvas/colors';
import { fetchSampleTree, type SampleEntry } from '../../audio/sampleApi';
import { DEFAULT_SAMPLER_PARAMS, DEFAULT_SYNTH_PARAMS } from '../../types/superdough';
import { DEFAULT_LOOPER_PARAMS } from '../../types/looper';
import { SYNTH_PRESETS } from '../../audio/synth/presets';
import { generateName, type NamePattern } from '../../utils/nameGenerator';
import { serializeSet } from '../../storage/serializer';
import { storage } from '../../storage/LocalStorageProvider';


// Slider maps left→right to small→large cards: 120px – 480px
const MIN_CARD = 120;
const MAX_CARD = 480;

function createId(): string {
  return Math.random().toString(36).slice(2, 9);
}

function flattenFiles(entries: SampleEntry[]): SampleEntry[] {
  const result: SampleEntry[] = [];
  for (const e of entries) {
    if (e.type === 'file') result.push(e);
    else if (e.children) result.push(...flattenFiles(e.children));
  }
  return result;
}

function AddInstrumentCard() {
  const instruments = useStore((s) => s.instruments);
  const [sampleFiles, setSampleFiles] = useState<SampleEntry[]>([]);

  useEffect(() => {
    fetchSampleTree().then((tree) => setSampleFiles(flattenFiles(tree)));
  }, []);

  // Get the color that the next instrument will have
  const nextColor = PASTEL_COLORS[instruments.length % PASTEL_COLORS.length];

  const createInstrument = (type: 'synth' | 'sampler' | 'looper') => {
    const store = useStore.getState();
    const id = createId();
    const color = PASTEL_COLORS[store.instruments.length % PASTEL_COLORS.length];
    const orbitIndex = store.instruments.reduce((max, i) => Math.max(max, i.orbitIndex), -1) + 1;
    const loopSize = 16;

    if (type === 'synth') {
      const newInst = {
        id,
        name: `Synth ${store.instruments.filter((i) => i.type === 'synth').length + 1}`,
        type: 'synth' as const,
        color,
        hits: loopSize,
        hitPositions: Array.from({ length: loopSize }, (_, i) => i / loopSize),
        loopSize,
        loopSizeLocked: false,
        muted: true,
        solo: false,
        volume: 0,
        orbitIndex,
        synthParams: { ...DEFAULT_SYNTH_PARAMS },
        engineParams: { ...SYNTH_PRESETS['INIT'] },
      };
      useStore.setState({
        instruments: [...store.instruments, newInst],
        gridNotes: { ...store.gridNotes, [id]: Array.from({ length: loopSize }, () => [60]) },
      });
      store.selectInstrument(id);
    } else if (type === 'looper') {
      const newInst = {
        id,
        name: `Loop ${store.instruments.filter((i) => i.type === 'looper').length + 1}`,
        type: 'looper' as const,
        color,
        hits: 0,
        hitPositions: [] as number[],
        loopSize,
        loopSizeLocked: false,
        muted: false,
        solo: false,
        volume: 0,
        orbitIndex,
        looperParams: { ...DEFAULT_LOOPER_PARAMS },
      };
      store.setInstruments([...store.instruments, newInst]);
      store.selectInstrument(id);
    } else {
      const fallback: SampleEntry = { type: 'file', name: 'kick.wav', path: 'samples/kick.wav' };
      const randomFile = sampleFiles.length > 0
        ? sampleFiles[Math.floor(Math.random() * sampleFiles.length)]
        : fallback;
      const displayName = randomFile.name.replace(/\.[^.]+$/, '');

      const newInst = {
        id,
        name: displayName,
        type: 'sampler' as const,
        sampleName: 'kick',
        color,
        hits: 4,
        hitPositions: [0, 0.25, 0.5, 0.75],
        loopSize,
        loopSizeLocked: false,
        muted: true,
        solo: false,
        volume: 0,
        orbitIndex,
        samplerParams: { ...DEFAULT_SAMPLER_PARAMS },
      };
      useStore.setState({
        instruments: [...store.instruments, newInst],
        gridNotes: { ...store.gridNotes, [id]: Array.from({ length: 4 }, () => [60]) },
      });
      store.assignSample(id, randomFile.path, displayName);
      store.selectInstrument(id);
    }
  };

  return (
    <div
      className="knob-cell flex flex-col items-center justify-center gap-4 p-4 rounded-lg select-none"
      style={{ background: 'transparent', border: '1px solid rgba(255, 217, 186, 0.133)' }}
    >
      {/* 3 big buttons */}
      <div className="w-full flex flex-col gap-2.5" onClick={(e) => e.stopPropagation()}>
        {([
          { type: 'synth' as const,   label: '+ Synth' },
          { type: 'sampler' as const, label: '+ Sampler' },
          { type: 'looper' as const,  label: '+ Looper' },
        ]).map(({ type, label }) => (
          <button
            key={type}
            onClick={() => createInstrument(type)}
            className="text-[13px] uppercase tracking-wider transition-all cursor-pointer font-medium w-full"
            style={{
              color: '#777',
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'transparent',
              padding: '12px 16px',
              borderRadius: '6px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = nextColor;
              e.currentTarget.style.color = nextColor;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
              e.currentTarget.style.color = '#777';
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ProjectName() {
  const name = useStore((s) => s.currentSetName);
  const setName = useStore((s) => s.setCurrentSetName);
  const isPlaying = useStore((s) => s.isPlaying);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [pattern, setPattern] = useState<NamePattern>('of');
  const popRef = useRef<HTMLDivElement>(null);

  const [saving, setSaving] = useState(false);

  // Track cumulative playback seconds
  const [playSeconds, setPlaySeconds] = useState(0);
  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => setPlaySeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [isPlaying]);
  const shouldBlink = playSeconds >= 300; // 5 minutes

  const reroll = useCallback(() => {
    setName(generateName(pattern));
  }, [pattern, setName]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const store = useStore.getState();
      const state = store.getSerializableState();
      const set = await serializeSet(state, {
        name: store.currentSetName,
        embedSamples: true,
        includeInstruments: true,
        includeEffects: true,
        includeSynthParams: true,
      });
      const id = store.currentSetId ?? set.id;
      set.id = id;
      set.meta.id = id;
      await storage.saveSet(set);
      useStore.setState({ currentSetId: id });
    } finally {
      setSaving(false);
    }
  }, []);

  // Close popover on outside click
  useEffect(() => {
    if (!popoverOpen) return;
    const handler = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [popoverOpen]);

  const PATTERNS: { value: NamePattern; label: string; example: string }[] = [
    { value: '2',  label: '2 words', example: 'Adj Noun' },
    { value: 'of', label: '3 words', example: 'Adj Noun of Noun' },
    { value: '3',  label: '3 words', example: 'Adj Noun Noun' },
  ];

  return (
    <div className="relative flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        spellCheck={false}
        className="bg-transparent border-none outline-none text-white/60 text-[11px] font-medium tracking-wide w-44 px-1 py-0.5 rounded hover:text-white/80 focus:text-white/90 focus:bg-white/[0.04] transition-colors placeholder:text-white/20"
        placeholder="Project name..."
      />
      <button
        onClick={() => setPopoverOpen((o) => !o)}
        title={shouldBlink ? "You've been jamming for 5+ min \u2014 save your set!" : 'Name generator'}
        className={`flex items-center justify-center w-5 h-5 rounded text-[11px] transition-colors cursor-pointer ${
          shouldBlink
            ? 'text-red-400 animate-[nameGenBlink_1.2s_ease-in-out_infinite]'
            : 'text-white/30 hover:text-white/60 hover:bg-white/[0.06]'
        }`}
      >
        !
      </button>

      {popoverOpen && (
        <div
          ref={popRef}
          className="absolute top-full left-0 mt-1.5 bg-bg-secondary border border-border rounded-lg shadow-xl z-50 p-3 min-w-[200px]"
        >
          {/* Pattern selector */}
          <div className="text-[9px] text-white/30 uppercase tracking-wider mb-1.5">Pattern</div>
          <div className="flex gap-1 mb-3">
            {PATTERNS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPattern(p.value)}
                className={`px-2 py-1 rounded text-[10px] transition-colors cursor-pointer ${
                  pattern === p.value
                    ? 'bg-white/10 text-white/80'
                    : 'text-white/30 hover:text-white/50 hover:bg-white/[0.04]'
                }`}
                title={p.example}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Reroll button */}
          <button
            onClick={reroll}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-white/[0.06] hover:bg-white/10 text-white/60 hover:text-white/80 text-[10px] transition-colors cursor-pointer"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
            </svg>
            Reroll
          </button>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 mt-1.5 rounded bg-white/[0.06] hover:bg-white/10 text-white/60 hover:text-white/80 text-[10px] transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
}

export function KnobGrid({ isResizing }: { isResizing?: boolean }) {
  const instruments = useStore((s) => s.instruments);
  const snapEnabled = useStore((s) => s.snapEnabled);
  // sliderVal: 1 (left = small cards) … 12 (right = big cards)
  const [sliderVal, setSliderVal] = useState(4);
  const cardMinWidth = Math.round(MIN_CARD + (sliderVal - 1) * (MAX_CARD - MIN_CARD) / 11);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.shiftKey) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? -1 : 1;
      setSliderVal((v) => Math.max(1, Math.min(12, v + delta)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const selectInstrument = useStore((s) => s.selectInstrument);

  return (
    <div className="relative w-full h-full">
      <div
        ref={containerRef}
        className="relative w-full h-full overflow-auto"
        style={{ padding: 50 }}
        onClick={() => selectInstrument(null)}
      >
        {/* Toolbar: card-size slider + project name */}
        <div className="absolute top-3 left-3 flex items-center gap-4 z-20">
          <input
            type="range"
            min={1}
            max={12}
            value={sliderVal}
            onChange={(e) => setSliderVal(Number(e.target.value))}
            className="w-20 h-1 accent-white/40 cursor-pointer opacity-40 hover:opacity-80 transition-opacity"
          />
          <ProjectName />
        </div>

        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cardMinWidth}px, 1fr))` }}
        >
          {instruments.map((inst) => (
            <KnobCanvas key={inst.id} instrumentId={inst.id} isResizing={isResizing} />
          ))}
          <AddInstrumentCard />
        </div>
      </div>

      {/* Snap toggle — anchored to outer wrapper, stays visible while scrolling */}
      <button
        onClick={(e) => { e.stopPropagation(); useStore.getState().setSnapEnabled(!snapEnabled); }}
        title="Snap to grid"
        style={{ padding: '3px 8px' }}
        className={`absolute bottom-3 right-3 z-20 text-[10px] transition-opacity
                   ${snapEnabled ? 'opacity-60 hover:opacity-90' : 'opacity-20 hover:opacity-50'}`}
      >
        Snap
      </button>
    </div>
  );
}
