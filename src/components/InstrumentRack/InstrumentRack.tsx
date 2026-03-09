import { useState, useRef } from 'react';
import { useStore } from '../../state/store';
import { PASTEL_COLORS } from '../../canvas/colors';

function createId(): string {
  return Math.random().toString(36).slice(2, 9);
}


export function InstrumentRack() {
  const instruments = useStore((s) => s.instruments);
  const selectedId = useStore((s) => s.selectedInstrumentId);
  const dragIdx = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  // Per-instrument size slider step: 1 = 32nd, 2 = 16th, 4 = 8th
  const [sizeSteps, setSizeSteps] = useState<Record<string, 1 | 2 | 4>>({});
  const getSizeStep = (id: string): 1 | 2 | 4 => sizeSteps[id] ?? 1;
  const toggleSizeStep = (id: string, step: 2 | 4) => {
    setSizeSteps((prev) => ({ ...prev, [id]: prev[id] === step ? 1 : step }));
  };

  const addSampler = () => {
    const store = useStore.getState();
    const color = PASTEL_COLORS[store.instruments.length % PASTEL_COLORS.length];
    const newInst = {
      id: createId(),
      name: 'Kick',
      type: 'sampler' as const,
      sampleName: 'kick',
      color,
      hits: 4,
      hitPositions: Array.from({ length: 4 }, (_, i) => i / 4),
      loopSize: 16,
      loopSizeLocked: false,
      muted: false,
      solo: false,
      volume: 0,
      orbitIndex: store.instruments.length,
    };
    store.setInstruments([...store.instruments, newInst]);
    store.selectInstrument(newInst.id);
    store.openSampleBank(newInst.id);
  };

  const addSynth = () => {
    const store = useStore.getState();
    const color = PASTEL_COLORS[store.instruments.length % PASTEL_COLORS.length];
    const loopSize = 16;
    const newInst = {
      id: createId(),
      name: `Synth ${store.instruments.filter((i) => i.type === 'synth').length + 1}`,
      type: 'synth' as const,
      color,
      hits: loopSize,
      hitPositions: Array.from({ length: loopSize }, (_, i) => i / loopSize),
      loopSize,
      loopSizeLocked: false,
      muted: false,
      solo: false,
      volume: 0,
      orbitIndex: store.instruments.length,
    };
    useStore.setState({
      instruments: [...store.instruments, newInst],
      gridNotes: {
        ...store.gridNotes,
        [newInst.id]: Array.from({ length: loopSize }, () => [60]),
      },
    });
    store.selectInstrument(newInst.id);
  };

  const removeInstrument = (id: string) => {
    const store = useStore.getState();
    store.setInstruments(store.instruments.filter((i) => i.id !== id));
    if (store.selectedInstrumentId === id) {
      store.selectInstrument(null);
    }
  };

  return (
    <div className="layers-sidebar bg-bg-secondary border-l border-border flex flex-col shrink-0 h-full" style={{ padding: 20, width: 300 }}>
      {/* Layers header */}
      <div className="layers-header px-4 py-3 border-b border-border/50">
        <span className="text-[10px] text-text-secondary uppercase tracking-wider font-medium">Layers</span>
      </div>

      {/* Instrument list */}
      <div className="layers-list flex-1 flex flex-col overflow-y-auto pb-3">
        {instruments.map((inst, index) => (
          <div
            key={inst.id}
            onDragOver={(e) => { e.preventDefault(); setDragOverIdx(index); }}
            onDragLeave={() => { if (dragOverIdx === index) setDragOverIdx(null); }}
            onDrop={() => {
              if (dragIdx.current !== null && dragIdx.current !== index) {
                const reordered = [...instruments];
                const [moved] = reordered.splice(dragIdx.current, 1);
                reordered.splice(index, 0, moved);
                useStore.getState().setInstruments(reordered);
              }
              dragIdx.current = null;
              setDragOverIdx(null);
            }}
            onDragEnd={() => { dragIdx.current = null; setDragOverIdx(null); }}
            onClick={() => useStore.getState().selectInstrument(inst.id)}
            className={`layer-card layer-${inst.type} flex flex-col gap-2 mx-3 mt-3 rounded cursor-pointer transition-colors relative
                        ${selectedId === inst.id
                          ? 'layer-selected bg-white/5'
                          : 'hover:bg-white/[0.03]'}
                        ${dragOverIdx === index ? 'opacity-50' : ''}`}
            style={{ border: `1px solid ${inst.color}`, padding: 22, marginBottom: 10 }}
          >
            {/* Top-right: remove + drag handle */}
            <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeInstrument(inst.id);
                }}
                className="layer-remove-btn p-1 rounded hover:bg-red-500/20 transition-colors text-white/25 hover:text-red-400"
                title="Remove"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <line x1="2" y1="2" x2="8" y2="8" />
                  <line x1="8" y1="2" x2="2" y2="8" />
                </svg>
              </button>
              <div
                draggable
                onDragStart={(e) => {
                  dragIdx.current = index;
                  e.dataTransfer.effectAllowed = 'move';
                }}
                className="layer-drag-handle cursor-grab active:cursor-grabbing
                           p-1 rounded hover:bg-white/10 transition-colors"
                title="Drag to reorder"
                onClick={(e) => e.stopPropagation()}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="text-white/25">
                  <rect x="1" y="1" width="2" height="2" rx="0.5" />
                  <rect x="5" y="1" width="2" height="2" rx="0.5" />
                  <rect x="1" y="5" width="2" height="2" rx="0.5" />
                  <rect x="5" y="5" width="2" height="2" rx="0.5" />
                </svg>
              </div>
            </div>

            {/* Row 1: color dot, solo, name, type */}
            <div className="layer-header flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  useStore.getState().toggleMute(inst.id);
                }}
                className="layer-mute-btn w-3 h-3 rounded-full shrink-0 transition-all hover:scale-125 border border-transparent hover:border-white/20"
                style={{ backgroundColor: inst.muted ? '#555' : inst.color }}
                title={inst.muted ? 'Unmute' : 'Mute'}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  useStore.getState().toggleSolo(inst.id);
                }}
                className={`layer-solo-btn text-[8px] font-bold px-1 py-0.5 rounded shrink-0 transition-colors
                           ${inst.solo
                             ? 'bg-yellow-500/30 text-yellow-400'
                             : 'text-white/25 hover:text-white/50'}`}
                title={inst.solo ? 'Unsolo' : 'Solo'}
              >
                S
              </button>
              <span className="layer-name text-[11px] text-text-primary truncate flex-1">{inst.name}</span>
              <span className="layer-type text-[9px] text-text-secondary shrink-0">{inst.type}</span>
            </div>

            {/* Row 2: size slider (loop length) */}
            <div className="layer-size flex items-center gap-1.5">
              <span className="text-[9px] text-text-secondary w-6">steps</span>
              <input
                type="range"
                min={1}
                max={64}
                step={getSizeStep(inst.id)}
                value={inst.loopSize}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => useStore.getState().setLoopSize(inst.id, Number(e.target.value))}
                className="layer-size-slider inst-slider flex-1 h-1"
                style={{ '--slider-color': inst.color } as React.CSSProperties}
              />
              <span className="text-[9px] text-text-secondary w-4 text-right">{inst.loopSize}</span>
              {([4, 2] as const).map((step) => {
                const label = step === 4 ? 'Q' : '8th';
                const active = getSizeStep(inst.id) === step;
                return (
                  <button
                    key={step}
                    onClick={(e) => { e.stopPropagation(); toggleSizeStep(inst.id, step); }}
                    className={`text-[8px] px-1 py-0.5 rounded transition-colors shrink-0
                               ${active ? 'text-white/80 bg-white/10' : 'text-white/25 hover:text-white/50'}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Row 3: hits slider */}
            <div className="layer-hits flex items-center gap-1.5">
              <span className="text-[9px] text-text-secondary w-6">hits</span>
              <input
                type="range"
                min={1}
                max={64}
                value={inst.hits}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => useStore.getState().setHitCount(inst.id, Number(e.target.value))}
                className="layer-hits-slider inst-slider flex-1 h-1"
                style={{ '--slider-color': inst.color } as React.CSSProperties}
              />
              <span className="text-[9px] text-text-secondary w-4 text-right">{inst.hits}</span>
            </div>

            {/* Row 4: volume slider */}
            <div className="layer-volume flex items-center gap-1.5">
              <span className="text-[9px] text-text-secondary w-6">vol</span>
              <input
                type="range"
                min={-20}
                max={6}
                value={inst.volume}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => useStore.getState().updateInstrument(inst.id, { volume: Number(e.target.value) })}
                className="layer-vol-slider inst-slider flex-1 h-1"
                style={{ '--slider-color': inst.color } as React.CSSProperties}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Add buttons */}
      <div className="layers-add-bar flex items-center gap-2 px-3 py-3 border-t border-border/50">
        <button
          onClick={addSynth}
          style={{ padding: '3px 10px' }}
          className="add-synth-btn text-[10px] rounded border border-border
                     hover:border-white/20 text-text-secondary hover:text-text-primary transition-colors flex-1"
        >
          + Synth
        </button>

        <button
          onClick={addSampler}
          style={{ padding: '3px 10px' }}
          className="add-sampler-btn text-[10px] rounded border border-border
                     hover:border-white/20 text-text-secondary hover:text-text-primary transition-colors flex-1"
        >
          + Sampler
        </button>
      </div>
    </div>
  );
}
