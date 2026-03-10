import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../state/store';
import { EffectBlock } from './EffectBlock';
import { AddEffectMenu } from './AddEffectMenu';
import { VUMeter } from './VUMeter';
import { WaveformView } from './WaveformView';

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function RecordButton() {
  const isRecording = useStore((s) => s.isRecording);
  const startRecording = useStore((s) => s.startRecording);
  const stopRecording = useStore((s) => s.stopRecording);

  return (
    <button
      onClick={() => (isRecording ? stopRecording() : startRecording())}
      className="shrink-0 rounded-full flex items-center justify-center cursor-pointer"
      style={{
        width: 26,
        height: 26,
        background: isRecording ? 'rgba(220,60,60,0.15)' : 'rgba(255,255,255,0.08)',
        border: isRecording ? '1px solid rgba(220,60,60,0.4)' : '1px solid rgba(255,255,255,0.06)',
      }}
      title={isRecording ? 'Stop recording' : 'Record'}
    >
      <span
        className="rounded-full"
        style={{
          width: 10,
          height: 10,
          background: isRecording ? '#dc3c3c' : '#7a2020',
          animation: isRecording ? 'recPulse 1.2s ease-in-out infinite' : 'none',
        }}
      />
    </button>
  );
}

function RecordingsMenu() {
  const recordings = useStore((s) => s.recordings);
  const deleteRecording = useStore((s) => s.deleteRecording);
  const [open, setOpen] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    };
  }, []);

  const play = (rec: { id: string; blob: Blob }) => {
    if (audioRef.current) { audioRef.current.pause(); }
    const url = URL.createObjectURL(rec.blob);
    const audio = new Audio(url);
    audio.onended = () => { setPlayingId(null); URL.revokeObjectURL(url); };
    audio.play();
    audioRef.current = audio;
    setPlayingId(rec.id);
  };

  const stop = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setPlayingId(null);
  };

  const download = (rec: { blob: Blob; name: string }) => {
    const url = URL.createObjectURL(rec.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${rec.name}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasRecordings = recordings.length > 0;

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="cursor-pointer rounded-full"
        style={{
          width: 8,
          height: 8,
          background: hasRecordings ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.12)',
        }}
        title="Recordings"
      />

      {open && (
        <div
          className="absolute right-0 bottom-full mb-2 bg-bg-secondary border border-border rounded shadow-xl z-50"
          style={{ minWidth: 200 }}
        >
          {recordings.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-text-secondary/50">No recordings yet</div>
          ) : (
            <div className="py-1">
              {recordings.map((rec) => (
                <div
                  key={rec.id}
                  className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-text-secondary hover:bg-white/5"
                >
                  {/* Play/Stop */}
                  <button
                    className="shrink-0 cursor-pointer hover:text-text-primary"
                    onClick={() => (playingId === rec.id ? stop() : play(rec))}
                    title={playingId === rec.id ? 'Stop' : 'Play'}
                  >
                    {playingId === rec.id ? '■' : '▶'}
                  </button>
                  {/* Name + duration */}
                  <span className="flex-1 truncate">{rec.name}</span>
                  <span className="text-text-secondary/40 font-mono">{formatDuration(rec.duration)}</span>
                  {/* Download */}
                  <button
                    className="shrink-0 cursor-pointer hover:text-text-primary"
                    onClick={() => download(rec)}
                    title="Download"
                  >
                    ↓
                  </button>
                  {/* Delete */}
                  <button
                    className="shrink-0 cursor-pointer hover:text-red-400"
                    onClick={() => deleteRecording(rec.id)}
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function EffectsSidebar() {
  const selectedId = useStore((s) => s.selectedInstrumentId);
  const instruments = useStore((s) => s.instruments);
  const instrumentEffects = useStore((s) => s.instrumentEffects);
  const masterVolume = useStore((s) => s.masterVolume);
  const setMasterVolume = useStore((s) => s.setMasterVolume);
  const reorderEffects = useStore((s) => s.reorderEffects);
  const isRecording = useStore((s) => s.isRecording);

  const selectedInstrument = instruments.find((i) => i.id === selectedId);
  const effects = selectedId ? (instrumentEffects[selectedId] ?? []) : [];

  const dragIndex = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  return (
    <div className="flex flex-col h-full w-[300px] bg-bg-secondary border-l border-border shrink-0 select-none">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0 min-w-0">
        {selectedInstrument && (
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: selectedInstrument.color }}
          />
        )}
        <span className="fx-header-text text-text-secondary truncate">
          {selectedInstrument ? `${selectedInstrument.name} FX` : 'FX Chain'}
        </span>
      </div>

      {/* Effect blocks list — scroll container must NOT include the dropdown */}
      <div className="fx-scroll flex-1 overflow-y-auto overflow-x-hidden min-h-0">
        {!selectedId ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
            <span className="text-[28px] opacity-20">≡</span>
            <span className="fx-empty-text text-text-secondary/60">
              Select a layer to see<br />its effect chain.
            </span>
          </div>
        ) : effects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
            <span className="text-[28px] opacity-20">≡</span>
            <span className="fx-empty-text text-text-secondary/60">No effects yet.</span>
          </div>
        ) : (
          effects.map((effect, i) => (
            <EffectBlock
              key={effect.id}
              effect={effect}
              instrumentId={selectedId}
              index={i}
              isDragOver={dragOverIndex === i}
              onDragStart={() => { dragIndex.current = i; }}
              onDragOver={(e) => { e.preventDefault(); setDragOverIndex(i); }}
              onDrop={() => {
                if (dragIndex.current !== null && dragIndex.current !== i) {
                  reorderEffects(selectedId, dragIndex.current, i);
                }
                setDragOverIndex(null);
              }}
              onDragEnd={() => { dragIndex.current = null; setDragOverIndex(null); }}
            />
          ))
        )}
      </div>

      {/* Add Effect button — outside scroll container so dropdown is not clipped */}
      {selectedId && (
        <div className="px-3 py-2 border-t border-border/30">
          <AddEffectMenu instrumentId={selectedId} />
        </div>
      )}

      {/* Master section */}
      <div className="shrink-0 border-t border-border" style={{ padding: 20 }}>
        <span className="fx-master-label text-text-primary block mb-2">Master</span>
        <VUMeter />
        <div className="flex items-center gap-1.5 mt-3">
          <span className="fx-vol-label text-text-secondary w-6">vol</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={masterVolume}
            onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
            className="inst-slider flex-1 h-1"
            style={{ '--slider-color': '#94a3b8' } as React.CSSProperties}
          />
          <span className="fx-vol-label text-text-secondary w-8 text-right font-mono shrink-0">
            {Math.round(masterVolume * 100)}%
          </span>
        </div>
      </div>

      {/* Waveform view with record button and recordings dot */}
      <div className="shrink-0 flex items-center gap-2" style={{ padding: 20 }}>
        <RecordButton />
        <WaveformView isRecording={isRecording} />
        <RecordingsMenu />
      </div>
    </div>
  );
}
