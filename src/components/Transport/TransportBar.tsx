import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../state/store';
import { toggleTransport, setBpm } from '../../audio/transport';
import { initAudio } from '../../audio/engine';
import { loadSamples } from '../../audio/sampler';
import { useClickOutside } from '../../hooks/useClickOutside';
import { FilesMenu } from './FilesMenu';
import { SettingsPopup } from './SettingsPopup';
import { encodeSetToUrl, buildShareUrl, exportSamplesZip, importSamplesZip } from '../../storage/urlShare';
const orbeatLogo = `${import.meta.env.BASE_URL}ORBEAT_Logo.svg`;

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
  { key: 'Shift + Click', action: 'Select multiple Orbs' },
  { key: 'Ctrl + G', action: 'Group selected Orbs to Scene' },
  { key: 'Shift + Ctrl + G', action: 'Ungroup' },
];

function InfoPopup({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-end"
      style={{ paddingBottom: 70, paddingRight: 20 }}
      onClick={onClose}
    >
      <div
        className="bg-bg-secondary border border-border rounded-lg shadow-2xl overflow-y-auto"
        style={{ width: 340, maxHeight: 600, padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4">
          <img src={orbeatLogo} alt="ORBEAT" className="h-5" />
          <div className="text-[10px] text-text-secondary uppercase tracking-widest mt-0.5">Polyrhythmic Web Sequencer</div>
        </div>

        {/* General Shortcuts */}
        <table className="w-full border-collapse mb-6">
          <tbody>
            {SHORTCUTS.map(({ key, action }) => (
              <tr key={key} className="border-t border-border/30">
                <td className="py-1 pr-4 text-[10px] font-mono text-accent/80 whitespace-nowrap">{key}</td>
                <td className="py-1 text-[10px] text-text-secondary">{action}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Piano Keyboard Section */}
        <div className="border-t border-border/30 pt-4">
          <div className="text-[9px] text-accent/80 font-mono uppercase mb-2 tracking-wider">Piano Keys (Synth selected)</div>

          {/* Visual Keyboard */}
          <div className="mb-3 space-y-1">
            {/* Top row - black keys */}
            <div className="flex gap-0.5 justify-start text-[8px]">
              <div className="text-center">
                <div className="bg-accent/20 border border-accent/40 rounded px-1.5 py-0.5 text-accent/80 font-mono whitespace-nowrap">W</div>
                <div className="text-text-secondary/60 mt-0.5">C#</div>
              </div>
              <div className="text-center">
                <div className="bg-accent/20 border border-accent/40 rounded px-1.5 py-0.5 text-accent/80 font-mono whitespace-nowrap">E</div>
                <div className="text-text-secondary/60 mt-0.5">D#</div>
              </div>
              <div className="w-2" />
              <div className="text-center">
                <div className="bg-accent/20 border border-accent/40 rounded px-1.5 py-0.5 text-accent/80 font-mono whitespace-nowrap">T</div>
                <div className="text-text-secondary/60 mt-0.5">F#</div>
              </div>
              <div className="text-center">
                <div className="bg-accent/20 border border-accent/40 rounded px-1.5 py-0.5 text-accent/80 font-mono whitespace-nowrap">Y</div>
                <div className="text-text-secondary/60 mt-0.5">G#</div>
              </div>
              <div className="text-center">
                <div className="bg-accent/20 border border-accent/40 rounded px-1.5 py-0.5 text-accent/80 font-mono whitespace-nowrap">U</div>
                <div className="text-text-secondary/60 mt-0.5">A#</div>
              </div>
            </div>

            {/* Home row - white keys */}
            <div className="flex gap-0.5 justify-start text-[8px]">
              <div className="text-center">
                <div className="bg-accent/10 border border-accent/30 rounded px-1.5 py-0.5 text-accent/80 font-mono whitespace-nowrap">A</div>
                <div className="text-text-secondary/60 mt-0.5">C</div>
              </div>
              <div className="text-center">
                <div className="bg-accent/10 border border-accent/30 rounded px-1.5 py-0.5 text-accent/80 font-mono whitespace-nowrap">S</div>
                <div className="text-text-secondary/60 mt-0.5">D</div>
              </div>
              <div className="text-center">
                <div className="bg-accent/10 border border-accent/30 rounded px-1.5 py-0.5 text-accent/80 font-mono whitespace-nowrap">D</div>
                <div className="text-text-secondary/60 mt-0.5">E</div>
              </div>
              <div className="text-center">
                <div className="bg-accent/10 border border-accent/30 rounded px-1.5 py-0.5 text-accent/80 font-mono whitespace-nowrap">F</div>
                <div className="text-text-secondary/60 mt-0.5">F</div>
              </div>
              <div className="text-center">
                <div className="bg-accent/10 border border-accent/30 rounded px-1.5 py-0.5 text-accent/80 font-mono whitespace-nowrap">G</div>
                <div className="text-text-secondary/60 mt-0.5">G</div>
              </div>
              <div className="text-center">
                <div className="bg-accent/10 border border-accent/30 rounded px-1.5 py-0.5 text-accent/80 font-mono whitespace-nowrap">H</div>
                <div className="text-text-secondary/60 mt-0.5">A</div>
              </div>
              <div className="text-center">
                <div className="bg-accent/10 border border-accent/30 rounded px-1.5 py-0.5 text-accent/80 font-mono whitespace-nowrap">J</div>
                <div className="text-text-secondary/60 mt-0.5">B</div>
              </div>
            </div>

            {/* Octave & velocity controls */}
            <div className="flex gap-0.5 justify-start text-[8px] pt-1">
              <div className="text-center">
                <div className="bg-blue-500/20 border border-blue-500/40 rounded px-1 py-0.5 text-blue-400/80 font-mono text-xs">Z</div>
                <div className="text-text-secondary/60 mt-0.5">Oct▼</div>
              </div>
              <div className="text-center">
                <div className="bg-blue-500/20 border border-blue-500/40 rounded px-1 py-0.5 text-blue-400/80 font-mono text-xs">X</div>
                <div className="text-text-secondary/60 mt-0.5">Oct▲</div>
              </div>
              <div className="w-2" />
              <div className="text-center">
                <div className="bg-red-500/20 border border-red-500/40 rounded px-1 py-0.5 text-red-400/80 font-mono text-xs">C</div>
                <div className="text-text-secondary/60 mt-0.5">Vel▼</div>
              </div>
              <div className="text-center">
                <div className="bg-red-500/20 border border-red-500/40 rounded px-1 py-0.5 text-red-400/80 font-mono text-xs">V</div>
                <div className="text-text-secondary/60 mt-0.5">Vel▲</div>
              </div>
            </div>
          </div>
        </div>

        {/* Scenes & Track View Section */}
        <div className="border-t border-border/30 pt-4">
          <div className="text-[9px] text-accent/80 font-mono uppercase mb-2 tracking-wider">Scenes & Track View</div>

          <div className="space-y-2 text-[10px] text-text-secondary leading-relaxed">
            <div>
              <div className="text-accent/80 font-mono mb-0.5">Creating Scenes:</div>
              <div>Select one or more Orbs (Shift+Click), then press <span className="text-accent/80 font-mono">Ctrl+G</span> to group them into a Scene. Scenes appear as colored blocks at the bottom.</div>
            </div>

            <div>
              <div className="text-accent/80 font-mono mb-0.5">Track View:</div>
              <div>Click the <span className="text-accent/80">▶▶</span> icon to enter Track Mode. Drag scene blocks in the timeline to arrange the order and length of each scene. Each scene bar shows how many bars it loops for.</div>
            </div>

            <div>
              <div className="text-accent/80 font-mono mb-0.5">Scene Controls:</div>
              <div>Within each scene block: • Click to select • Drag to reorder • Use the colored label to rename. Right-click to remove from scene.</div>
            </div>
          </div>
        </div>

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

function ShareMenu({ anchorRef, onClose }: { anchorRef: React.RefObject<HTMLButtonElement | null>; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle');
  const [zipStatus, setZipStatus] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [hasCustomSamples, setHasCustomSamples] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  useClickOutside(ref, onClose);

  // Position above the anchor button
  const rect = anchorRef.current?.getBoundingClientRect();
  const style: React.CSSProperties = rect
    ? { position: 'fixed', bottom: window.innerHeight - rect.top + 8, left: rect.left, zIndex: 10000 }
    : {};

  const handleCopyLink = async () => {
    if (copyStatus === 'copying') return;
    setCopyStatus('copying');
    try {
      const store = useStore.getState();
      const state = store.getSerializableState();
      const { encoded, hasCustomSamples: hcs } = await encodeSetToUrl(state, store.currentSetName);
      setHasCustomSamples(hcs);
      await navigator.clipboard.writeText(buildShareUrl(encoded));
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2500);
    } catch (e) {
      console.error('[Share] Copy failed:', e);
      setCopyStatus('error');
      setTimeout(() => setCopyStatus('idle'), 3000);
    }
  };

  const handleDownloadSamples = async () => {
    if (zipStatus === 'working') return;
    setZipStatus('working');
    try {
      const { customSamples } = useStore.getState().getSerializableState();
      const blob = await exportSamplesZip(customSamples);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${useStore.getState().currentSetName}-samples.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
      setZipStatus('done');
      setTimeout(() => setZipStatus('idle'), 2000);
    } catch (e) {
      console.error('[Share] ZIP export failed:', e);
      setZipStatus('error');
      setTimeout(() => setZipStatus('idle'), 3000);
    }
  };

  const handleImportSamples = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const samples = await importSamplesZip(file);
      const store = useStore.getState();
      for (const s of samples) {
        store.addCustomSample(s);
      }
    } catch (err) {
      console.error('[Share] ZIP import failed:', err);
    }
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const copyLabel =
    copyStatus === 'copying' ? 'Encoding…' : copyStatus === 'copied' ? 'Copied!' : copyStatus === 'error' ? 'Failed' : 'Copy link';

  return createPortal(
    <div ref={ref} style={{ ...style, width: 260 }} className="bg-bg-secondary border border-border rounded-lg shadow-2xl py-3 px-4">
      <div className="text-[11px] uppercase tracking-wider text-text-secondary/50 mb-3">Share Track</div>

      {/* Copy link */}
      <button
        onClick={handleCopyLink}
        disabled={copyStatus === 'copying'}
        className={`w-full text-[12px] px-4 py-2 rounded font-medium transition-colors mb-2
          ${
            copyStatus === 'copied'
              ? 'bg-green-500/20 text-green-400 border border-green-500/40'
              : copyStatus === 'error'
                ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                : 'border disabled:opacity-50'
          }`}
        style={
          copyStatus !== 'copied' && copyStatus !== 'error'
            ? {
                backgroundColor: '#c1eeca',
                color: '#1a1a1a',
                borderColor: '#a8dab0',
              }
            : copyStatus === 'copied'
              ? {}
              : {}
        }
      >
        {copyLabel}
      </button>

      {hasCustomSamples && copyStatus === 'copied' && (
        <div className="mb-2 px-3 py-2 rounded bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-400/80">
          Custom samples not in URL — download & share the samples ZIP too.
        </div>
      )}

      {/* Samples ZIP section */}
      <div className="border-t border-border/30 mt-2 pt-2 flex gap-2">
        <button
          onClick={handleDownloadSamples}
          disabled={zipStatus === 'working'}
          className="flex-1 text-[11px] px-3 py-1.5 rounded border border-border text-text-secondary hover:text-text-primary hover:border-white/30 transition-colors disabled:opacity-50"
        >
          {zipStatus === 'working' ? 'Packing…' : zipStatus === 'done' ? 'Downloaded!' : 'Download Samples'}
        </button>
        <button
          onClick={() => importRef.current?.click()}
          className="flex-1 text-[11px] px-3 py-1.5 rounded border border-border text-text-secondary hover:text-text-primary hover:border-white/30 transition-colors"
        >
          Import Samples
        </button>
        <input ref={importRef} type="file" accept=".zip" className="hidden" onChange={handleImportSamples} />
      </div>

      <div className="mt-2 text-[10px] text-text-secondary/40 leading-snug">
        Factory sounds load by name. Share the ZIP for custom samples.
      </div>
    </div>,
    document.body
  );
}

export function TransportBar() {
  const isPlaying = useStore((s) => s.isPlaying);
  const bpm = useStore((s) => s.bpm);
  const stepsPerBeat = useStore((s) => s.stepsPerBeat);
  const setStepsPerBeat = useStore((s) => s.setStepsPerBeat);
  const trackMode = useStore((s) => s.trackMode);
  const toggleTrackMode = useStore((s) => s.toggleTrackMode);
  const [infoOpen, setInfoOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const filesRef = useRef<HTMLButtonElement>(null);
  const shareRef = useRef<HTMLButtonElement>(null);

  const handlePlayStop = async () => {
    await ensureAudio();
    toggleTransport();
  };

  const handleBpmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBpm(Number(e.target.value));
  };

  const handleGridChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStepsPerBeat(Number(e.target.value));
  };

  return (
    <div className="transport-bar relative flex items-center bg-bg-secondary border-t border-border">
      <div className="transport-logo flex items-center gap-3">
        <img src={orbeatLogo} alt="ORBEAT" className="h-6" />
        <button
          ref={filesRef}
          onClick={() => setFilesOpen((o) => !o)}
          className="text-[10px] uppercase tracking-wider text-text-secondary/60 hover:text-text-primary px-2 py-1 transition-colors"
        >
          Files
        </button>
        {filesOpen && <FilesMenu anchorRef={filesRef} onClose={() => setFilesOpen(false)} />}
        <button
          ref={shareRef}
          onClick={() => setShareOpen((o) => !o)}
          className="text-[10px] uppercase tracking-wider text-text-secondary/60 hover:text-text-primary px-2 py-1 transition-colors"
        >
          Share
        </button>
        {shareOpen && <ShareMenu anchorRef={shareRef} onClose={() => setShareOpen(false)} />}
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

      <div className="flex items-center gap-3 pr-4">
        <button
          onClick={toggleTrackMode}
          className={`px-2 py-1 text-xs rounded font-mono tracking-wide transition-colors border cursor-pointer
            ${trackMode ? 'border-current' : 'text-muted-foreground hover:text-foreground border-transparent'}`}
          style={
            trackMode
              ? {
                  backgroundColor: '#c1eeca',
                  color: '#1a1a1a',
                  borderColor: '#a8dab0',
                }
              : {}
          }
          title="Toggle Track Mode"
        >
          TRACK
        </button>
      </div>

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
        <select
          value={stepsPerBeat}
          onChange={handleGridChange}
          className="bg-bg-tertiary border border-border rounded px-2 py-0.5 text-xs text-text-primary font-mono focus:outline-none focus:border-white/30"
          title="Grid resolution"
        >
          <option value={4}>16th</option>
          <option value={8}>32nd</option>
          <option value={16}>64th</option>
        </select>
        <button
          className="text-[10px] uppercase tracking-wider text-text-secondary/60 hover:text-text-primary px-2 py-1 transition-colors"
          title="Settings"
        >
          Settings
        </button>
        <button
          onClick={() => setSettingsOpen(true)}
          className="px-2 py-1 rounded border border-border text-text-secondary hover:border-white/30 hover:text-text-primary transition-colors text-[11px] font-semibold cursor-pointer"
          title="Settings"
        >
          Settings
        </button>
        <button
          onClick={() => setInfoOpen((o) => !o)}
          className="w-5 h-5 rounded-full border border-border text-text-secondary hover:border-white/30 hover:text-text-primary transition-colors flex items-center justify-center text-[10px] font-bold leading-none cursor-pointer"
          title="About Orbeat"
        >
          i
        </button>
      </div>

      {infoOpen && <InfoPopup onClose={() => setInfoOpen(false)} />}
      {settingsOpen && <SettingsPopup onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
