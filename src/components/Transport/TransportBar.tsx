import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../state/store';
import { toggleTransport, setBpm } from '../../audio/transport';
import { initAudio } from '../../audio/engine';
import { loadSamples } from '../../audio/sampler';
import { FilesMenu } from './FilesMenu';
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

function ShareMenu({ anchorRef }: { anchorRef: React.RefObject<HTMLButtonElement | null> }) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle');
  const [zipStatus, setZipStatus] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [hasCustomSamples, setHasCustomSamples] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  // Position above the anchor button
  const rect = anchorRef.current?.getBoundingClientRect();
  const style: React.CSSProperties = rect
    ? { position: 'fixed', bottom: window.innerHeight - rect.top + 8, left: rect.left, zIndex: 10000 }
    : {};

  const handleCopyLink = async () => {
    if (copyStatus === 'copying') return;
    setCopyStatus('copying');
    try {
      const state = useStore.getState().getSerializableState();
      const { encoded, hasCustomSamples: hcs } = await encodeSetToUrl(state);
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
    <div style={{ ...style, width: 260 }} className="bg-bg-secondary border border-border rounded-lg shadow-2xl py-3 px-4">
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
                : 'bg-accent/20 text-accent border border-accent/40 hover:bg-accent/30'
          }
          disabled:opacity-50`}
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
  const trackMode = useStore((s) => s.trackMode);
  const toggleTrackMode = useStore((s) => s.toggleTrackMode);
  const [infoOpen, setInfoOpen] = useState(false);
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
        {shareOpen && <ShareMenu anchorRef={shareRef} />}
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
          className={`px-2 py-1 text-xs rounded font-mono tracking-wide transition-colors
            ${trackMode ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}`}
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
