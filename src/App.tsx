import { KnobGrid } from './components/Orbits/KnobGrid';
import { TransportBar } from './components/Transport/TransportBar';
import { InstrumentRack } from './components/InstrumentRack/InstrumentRack';
import { GridSequencer } from './components/GridSequencer/GridSequencer';
import { SynthPanel } from './components/SynthPanel/SynthPanel';
import { SampleBank } from './components/SampleBank/SampleBank';
import { LooperEditor } from './components/LooperPanel/LooperEditor';
import { LoopBrowser } from './components/LooperPanel/LoopBrowser';
import { EffectsSidebar } from './components/EffectsSidebar/EffectsSidebar';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useResizable } from './hooks/useResizable';
import { useStore } from './state/store';
import { fetchSampleTree, type SampleEntry } from './audio/sampleApi';
import { useEffect, useRef, useState } from 'react';
import * as Tone from 'tone';
import { seedFactory } from './storage/seedFactory';
import { initRecordingSync } from './storage/recordingSync';
import { restoreAutosave, initSessionAutosave } from './storage/sessionAutosave';
import { initUndoHistory } from './state/undoHistory';

function flattenFiles(entries: SampleEntry[]): SampleEntry[] {
  const result: SampleEntry[] = [];
  for (const e of entries) {
    if (e.type === 'file') result.push(e);
    else if (e.children) result.push(...flattenFiles(e.children));
  }
  return result;
}

function App() {
  useKeyboardShortcuts();
  const selectedId = useStore((s) => s.selectedInstrumentId);
  const instruments = useStore((s) => s.instruments);
  const selectedInstrument = instruments.find((i) => i.id === selectedId);
  const isSynthSelected = selectedInstrument?.type === 'synth';
  const isSamplerSelected = selectedInstrument?.type === 'sampler';
  const isLooperSelected = selectedInstrument?.type === 'looper';
  const hasSelection = !!selectedInstrument;

  const [layerSidebarOpen, setLayerSidebarOpen] = useState(true);
  const [fxSidebarOpen, setFxSidebarOpen] = useState(true);
  const DEFAULT_BOTTOM_H = 24 * 20 + 33;
  const { height: bottomHeight, onMouseDown: onResizeMouseDown } = useResizable(DEFAULT_BOTTOM_H);

  // Delayed unmount: keep content rendered during the close animation
  const [bottomContentMounted, setBottomContentMounted] = useState(hasSelection);
  const unmountTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (hasSelection) {
      clearTimeout(unmountTimer.current);
      setBottomContentMounted(true);
    } else {
      // Keep content mounted during the 250ms close animation, then unmount
      unmountTimer.current = setTimeout(() => setBottomContentMounted(false), 260);
    }
    return () => clearTimeout(unmountTimer.current);
  }, [hasSelection]);

  useEffect(() => {
    const startAudio = async () => {
      await Tone.start();
      window.removeEventListener('mousedown', startAudio);
    };
    window.addEventListener('mousedown', startAudio);
    return () => window.removeEventListener('mousedown', startAudio);
  }, []);

  const initDone = useRef(false);
  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;

    (async () => {
      // Restore session from IDB (instruments, effects, BPM, grid, etc.)
      const restored = await restoreAutosave();

      // Seed factory presets & hydrate recordings
      seedFactory();
      useStore.getState().hydrateRecordings();
      initRecordingSync();
      initSessionAutosave();
      initUndoHistory();

      // Only assign random samples on fresh launch (no saved session)
      if (!restored) {
        const CATEGORIES = [
          { keywords: ['kick'],          index: 0 },
          { keywords: ['snare', 'clap'], index: 1 },
          { keywords: ['hat', 'hh'],     index: 2 },
          { keywords: ['conga'],         index: 3 },
        ];
        const tree = await fetchSampleTree();
        const files = flattenFiles(tree);
        const store = useStore.getState();
        const instruments = store.instruments;
        for (const { keywords, index } of CATEGORIES) {
          const inst = instruments[index];
          if (!inst) continue;
          const matches = files.filter((f) =>
            keywords.some((kw) => f.name.toLowerCase().includes(kw))
          );
          if (matches.length === 0) continue;
          const pick = matches[Math.floor(Math.random() * matches.length)];
          store.assignSample(inst.id, pick.path, pick.name.replace(/\.[^.]+$/, ''));
        }
      }
    })();
  }, []);

  return (
    <div className="app-root flex flex-col h-full bg-bg">
      {/* Main area */}
      <div className="app-main flex flex-1 min-h-0 overflow-hidden">

        {/* Orbit visualization */}
        <div className="orbit-viewport flex-1 relative overflow-hidden min-h-0">
          <KnobGrid />
        </div>

        {/* Layers toggle tab */}
        <button
          className="flex items-center justify-center w-4 shrink-0 bg-bg-secondary border-l border-border hover:bg-white/5 transition-colors cursor-pointer"
          onClick={() => setLayerSidebarOpen((o) => !o)}
          title={layerSidebarOpen ? 'Hide layers' : 'Show layers'}
        >
          <span className="text-text-secondary text-[10px] leading-none">
            {layerSidebarOpen ? '›' : '‹'}
          </span>
        </button>

        {/* Layers sidebar */}
        <div
          className="overflow-hidden transition-all duration-300 shrink-0 h-full"
          style={{ width: layerSidebarOpen ? 300 : 0 }}
        >
          <InstrumentRack />
        </div>

        {/* FX toggle tab */}
        <button
          className="flex items-center justify-center w-4 shrink-0 bg-bg-secondary border-l border-border hover:bg-white/5 transition-colors cursor-pointer"
          onClick={() => setFxSidebarOpen((o) => !o)}
          title={fxSidebarOpen ? 'Hide FX' : 'Show FX'}
        >
          <span className="text-text-secondary text-[10px] leading-none">
            {fxSidebarOpen ? '›' : '‹'}
          </span>
        </button>

        {/* FX Chain sidebar */}
        <div
          className="overflow-hidden transition-all duration-300 shrink-0 h-full"
          style={{ width: fxSidebarOpen ? 300 : 0 }}
        >
          <EffectsSidebar />
        </div>
      </div>

      {/* Grid sequencer + instrument panel — animated slide */}
      <div
        className="grid shrink-0 overflow-hidden"
        style={{
          gridTemplateRows: hasSelection ? '1fr' : '0fr',
          transition: 'grid-template-rows 250ms cubic-bezier(0.25, 0.1, 0.25, 1)',
        }}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            className="resize-handle h-1.5 cursor-ns-resize border-t border-border flex items-center justify-center group shrink-0 hover:bg-accent/10 transition-colors"
            onMouseDown={onResizeMouseDown}
          >
            <div className="w-10 h-0.5 rounded-full bg-border/60 group-hover:bg-accent/60 transition-colors" />
          </div>
          {bottomContentMounted && (
            <div
              className="synth-bottom-bar flex overflow-hidden"
              style={{ height: bottomHeight }}
            >
              {isLooperSelected ? <LooperEditor /> : <GridSequencer />}
              {isSynthSelected && <SynthPanel />}
              {isSamplerSelected && <SampleBank />}
              {isLooperSelected && <LoopBrowser />}
            </div>
          )}
        </div>
      </div>

      <TransportBar />
    </div>
  );
}

export default App;
