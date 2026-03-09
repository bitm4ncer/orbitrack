import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../state/store';
import { KnobCanvas } from './KnobCanvas';
import { PASTEL_COLORS } from '../../canvas/colors';
import { fetchSampleTree, type SampleEntry } from '../../audio/sampleApi';
import { DEFAULT_SAMPLER_PARAMS, DEFAULT_SYNTH_PARAMS } from '../../types/superdough';


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
  const [mode, setMode] = useState<'sampler' | 'synth'>('sampler');
  const [sampleFiles, setSampleFiles] = useState<SampleEntry[]>([]);

  useEffect(() => {
    fetchSampleTree().then((tree) => setSampleFiles(flattenFiles(tree)));
  }, []);

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    const store = useStore.getState();
    const id = createId();
    const color = PASTEL_COLORS[store.instruments.length % PASTEL_COLORS.length];
    const orbitIndex = store.instruments.reduce((max, i) => Math.max(max, i.orbitIndex), -1) + 1;
    const loopSize = 16;

    if (mode === 'synth') {
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
      };
      useStore.setState({
        instruments: [...store.instruments, newInst],
        gridNotes: { ...store.gridNotes, [id]: Array.from({ length: loopSize }, () => [60]) },
      });
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
      className="knob-cell flex flex-col items-center gap-1 p-2 rounded-lg select-none cursor-pointer hover:bg-white/[0.02]"
      style={{ border: '1px dashed rgba(255,255,255,0.08)' }}
      onClick={handleAdd}
    >
      {/* "Add" label — top */}
      <span className="text-[9px] text-white/30 tracking-wider uppercase self-center">Add</span>

      {/* Center "+" icon */}
      <div className="w-full aspect-square flex items-center justify-center">
        <span className="text-4xl text-white/20 leading-none">+</span>
      </div>

      {/* Discrete toggle switch — bottom, stops propagation */}
      <div
        className="flex flex-col items-center gap-1 pb-1"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-[8px] text-white/40 font-mono tracking-wide">
          {mode === 'sampler' ? 'Smp' : 'Syn'}
        </span>
        <button
          className="relative w-9 h-[18px] rounded-full transition-colors duration-200 focus:outline-none"
          style={{
            background: mode === 'synth'
              ? 'rgba(255,255,255,0.18)'
              : 'rgba(255,255,255,0.08)',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4)',
          }}
          onClick={() => setMode(mode === 'sampler' ? 'synth' : 'sampler')}
        >
          <span
            className="absolute top-[2px] left-0 w-[14px] h-[14px] rounded-full transition-transform duration-200"
            style={{
              background: 'rgba(255,255,255,0.7)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
              transform: mode === 'synth' ? 'translateX(20px)' : 'translateX(2px)',
            }}
          />
        </button>
      </div>
    </div>
  );
}

export function KnobGrid() {
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
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-auto"
      style={{ padding: 50 }}
      onClick={() => selectInstrument(null)}
    >
      {/* Card-size slider */}
      <div className="absolute top-3 left-3 flex items-center z-20">
        <input
          type="range"
          min={1}
          max={12}
          value={sliderVal}
          onChange={(e) => setSliderVal(Number(e.target.value))}
          className="w-20 h-1 accent-white/40 cursor-pointer opacity-40 hover:opacity-80 transition-opacity"
        />
      </div>

      {/* Snap button (bottom-right) */}
      <button
        onClick={() => useStore.getState().setSnapEnabled(!snapEnabled)}
        style={{ padding: '3px 10px' }}
        className={`absolute bottom-3 right-3 z-20 text-[10px] rounded border transition-colors
                   ${snapEnabled
                     ? 'border-white text-white bg-white/10'
                     : 'border-border text-text-secondary hover:border-white/20 hover:text-white'}`}
      >
        Snap
      </button>

      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cardMinWidth}px, 1fr))` }}
      >
        {instruments.map((inst) => (
          <KnobCanvas key={inst.id} instrumentId={inst.id} />
        ))}
        <AddInstrumentCard />
      </div>
    </div>
  );
}
