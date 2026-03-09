import { KnobGrid } from './components/Orbits/KnobGrid';
import { TransportBar } from './components/Transport/TransportBar';
import { InstrumentRack } from './components/InstrumentRack/InstrumentRack';
import { GridSequencer } from './components/GridSequencer/GridSequencer';
import { SynthPanel } from './components/SynthPanel/SynthPanel';
import { SampleBank } from './components/SampleBank/SampleBank';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useResizable } from './hooks/useResizable';
import { useStore } from './state/store';
import { useEffect, useState } from 'react';
import * as Tone from 'tone';

function App() {
  useKeyboardShortcuts();
  const selectedId = useStore((s) => s.selectedInstrumentId);
  const instruments = useStore((s) => s.instruments);
  const selectedInstrument = instruments.find((i) => i.id === selectedId);
  const isSynthSelected = selectedInstrument?.type === 'synth';
  const isSamplerSelected = selectedInstrument?.type === 'sampler';
  const hasSelection = !!selectedInstrument;

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const DEFAULT_BOTTOM_H = 24 * 20 + 33; // 513px — 2 octaves + toolbar
  const { height: bottomHeight, onMouseDown: onResizeMouseDown } = useResizable(DEFAULT_BOTTOM_H);

  useEffect(() => {
    const startAudio = async () => {
      await Tone.start();
      console.log('Audio context started');
      window.removeEventListener('mousedown', startAudio);
    };
    window.addEventListener('mousedown', startAudio);
    return () => {
      window.removeEventListener('mousedown', startAudio);
    };
  }, []);

  return (
    <div className="app-root flex flex-col h-full bg-bg">
      {/* Main area: orbits + sidebar */}
      <div className="app-main flex flex-1 min-h-0">
        {/* Orbit visualization */}
        <div className="orbit-viewport flex-1 relative overflow-hidden min-h-0">
          <KnobGrid />
        </div>

        {/* Sidebar toggle tab */}
        <button
          className="flex items-center justify-center w-4 shrink-0 bg-bg-secondary border-l border-border hover:bg-white/5 transition-colors cursor-pointer"
          onClick={() => setSidebarOpen((o) => !o)}
          title={sidebarOpen ? 'Hide layers' : 'Show layers'}
        >
          <span className="text-text-secondary text-[10px] leading-none">
            {sidebarOpen ? '›' : '‹'}
          </span>
        </button>

        {/* Right sidebar: layers */}
        <div
          className="overflow-hidden transition-all duration-300 shrink-0 h-full"
          style={{ width: sidebarOpen ? 300 : 0 }}
        >
          <InstrumentRack />
        </div>
      </div>

      {/* Grid sequencer + synth panel (shown when instrument selected) */}
      {hasSelection && (
        <>
          {/* Drag handle */}
          <div
            className="resize-handle h-1.5 cursor-ns-resize border-t border-border flex items-center justify-center group shrink-0 hover:bg-accent/10 transition-colors"
            onMouseDown={onResizeMouseDown}
          >
            <div className="w-10 h-0.5 rounded-full bg-border/60 group-hover:bg-accent/60 transition-colors" />
          </div>
          <div
            className="synth-bottom-bar flex overflow-hidden shrink-0"
            style={{ height: bottomHeight }}
          >
            <GridSequencer />
            {isSynthSelected && <SynthPanel />}
            {isSamplerSelected && <SampleBank />}
          </div>
        </>
      )}

      {/* Transport bar */}
      <TransportBar />
    </div>
  );
}

export default App;
