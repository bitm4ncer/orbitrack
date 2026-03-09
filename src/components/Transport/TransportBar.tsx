import { useState } from 'react';
import { useStore } from '../../state/store';
import { toggleTransport, setBpm } from '../../audio/transport';
import { initAudio } from '../../audio/engine';
import { loadSamples } from '../../audio/sampler';
import orbeatLogo from '/ORBEAT_Logo.svg';

const SHORTCUTS = [
  { key: 'Space', action: 'Play / Stop' },
  { key: 'Click ring', action: 'Add hit' },
  { key: 'Double-click hit', action: 'Remove hit' },
  { key: 'Drag hit', action: 'Reposition hit' },
  { key: 'Scroll', action: 'Adjust hit count' },
  { key: 'Ctrl + Scroll', action: 'Adjust step count' },
  { key: 'Alt + Scroll', action: 'Adjust volume' },
  { key: 'Shift + Scroll', action: 'Zoom grid view' },
  { key: 'S button', action: 'Solo instrument' },
  { key: 'M button', action: 'Mute instrument' },
];

function InfoPopup({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-end"
      style={{ paddingBottom: 70, paddingRight: 20 }}
      onClick={onClose}
    >
      <div
        className="bg-bg-secondary border border-border rounded-lg shadow-2xl"
        style={{ width: 300, padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4">
          <img src={orbeatLogo} alt="ORBEAT" className="h-5" />
          <div className="text-[10px] text-text-secondary uppercase tracking-widest mt-0.5">Polyrhythmic Web Sequencer</div>
        </div>
        <table className="w-full border-collapse">
          <tbody>
            {SHORTCUTS.map(({ key, action }) => (
              <tr key={key} className="border-t border-border/30">
                <td className="py-1 pr-4 text-[10px] font-mono text-accent/80 whitespace-nowrap">{key}</td>
                <td className="py-1 text-[10px] text-text-secondary">{action}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          onClick={onClose}
          className="mt-4 w-full text-[9px] text-text-secondary/50 hover:text-text-secondary transition-colors"
        >
          close
        </button>
      </div>
    </div>
  );
}

const audioInitRef = { initialized: false };

async function ensureAudio() {
  if (audioInitRef.initialized) return;
  await initAudio();
  await loadSamples();
  audioInitRef.initialized = true;
}

export function TransportBar() {
  const isPlaying = useStore((s) => s.isPlaying);
  const bpm = useStore((s) => s.bpm);
  const [infoOpen, setInfoOpen] = useState(false);

  const handlePlayStop = async () => {
    await ensureAudio();
    toggleTransport();
  };

  const handleBpmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBpm(Number(e.target.value));
  };

  return (
    <div className="transport-bar relative flex items-center gap-6 bg-bg-secondary" style={{ padding: 40 }}>
      <div className="transport-logo flex items-center gap-3">
        <img src={orbeatLogo} alt="ORBEAT" className="h-6" />
      </div>

      <button
        onClick={handlePlayStop}
        className="transport-play-btn absolute left-1/2 -translate-x-1/2 flex items-center justify-center w-16 h-16 rounded-full
                   bg-bg-tertiary hover:bg-white/10 transition-colors
                   border border-border hover:border-white/30"
      >
        {isPlaying ? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <rect x="1" y="1" width="4" height="12" rx="1" />
            <rect x="9" y="1" width="4" height="12" rx="1" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <polygon points="2,0 14,7 2,14" />
          </svg>
        )}
      </button>

      <div className="transport-spacer flex-1" />

      <div className="transport-bpm flex items-center gap-2">
        <span className="transport-bpm-label text-xs text-text-secondary uppercase tracking-wide">BPM</span>
        <input
          type="number"
          min={40}
          max={240}
          value={bpm}
          onChange={handleBpmChange}
          className="transport-bpm-input w-16 bg-bg-tertiary border border-border rounded px-2 py-0.5 text-sm text-text-primary font-mono text-center focus:outline-none focus:border-white/30"
        />
        <button
          onClick={() => setInfoOpen((o) => !o)}
          className="w-5 h-5 rounded-full border border-border text-text-secondary hover:border-white/30 hover:text-text-primary transition-colors flex items-center justify-center text-[10px] font-bold leading-none"
          title="About Orbeat"
        >
          i
        </button>
      </div>

      {infoOpen && <InfoPopup onClose={() => setInfoOpen(false)} />}
    </div>
  );
}
