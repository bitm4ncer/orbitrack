import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../state/store';
import { EffectBlock } from './EffectBlock';
import { AddEffectMenu } from './AddEffectMenu';
import { LUFSMeter } from './LUFSMeter';
import { WaveformView } from './WaveformView';
import { EffectKnob } from './EffectKnob';
import { type RecordingFormat } from '../../audio/recorder';

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

/* ── Recording row (used inside RecordingsMenu) ── */
function RecordingRow({
  rec,
  playingId,
  onPlay,
  onStop,
  onDownload,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragOver,
}: {
  rec: { id: string; blob: Blob; name: string; duration: number; timestamp: number; folderId: string | null };
  playingId: string | null;
  onPlay: () => void;
  onStop: () => void;
  onDownload: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
  isDragOver: boolean;
}) {
  const renameRecording = useStore((s) => s.renameRecording);
  const deleteRecording = useStore((s) => s.deleteRecording);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(rec.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  const commitRename = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== rec.name) renameRecording(rec.id, trimmed);
    else setEditName(rec.name);
    setEditing(false);
  };

  return (
    <div
      className="flex items-center gap-1 px-2 py-1 text-[11px] text-text-secondary hover:bg-white/5 relative"
      style={{ borderTop: isDragOver ? '2px solid rgba(255,255,255,0.3)' : '2px solid transparent' }}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('recording-id', rec.id);
        onDragStart();
      }}
      onDragOver={(e) => { e.preventDefault(); onDragOver(e); }}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {/* Drag handle */}
      <span className="shrink-0 cursor-grab opacity-20 hover:opacity-50 text-[9px]" title="Drag to reorder or onto a folder">⋮⋮</span>
      {/* Play/Stop */}
      <button
        className="shrink-0 cursor-pointer hover:text-text-primary text-[10px]"
        onClick={() => (playingId === rec.id ? onStop() : onPlay())}
        title={playingId === rec.id ? 'Stop' : 'Play'}
      >
        {playingId === rec.id ? '■' : '▶'}
      </button>
      {/* Name (editable) */}
      {editing ? (
        <input
          ref={inputRef}
          className="flex-1 min-w-0 bg-transparent border-b border-white/20 outline-none text-[11px] text-text-primary px-0.5"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setEditName(rec.name); setEditing(false); } }}
        />
      ) : (
        <span className="flex-1 truncate">{rec.name}</span>
      )}
      {/* Duration */}
      <span className="text-text-secondary/40 font-mono text-[10px] shrink-0">{formatDuration(rec.duration)}</span>
      {/* Rename */}
      <button
        className="shrink-0 cursor-pointer hover:text-text-primary text-[10px] opacity-30 hover:opacity-70"
        onClick={() => { setEditName(rec.name); setEditing(true); }}
        title="Rename"
      >
        ✎
      </button>
      {/* Download */}
      <button className="shrink-0 cursor-pointer hover:text-text-primary text-[10px]" onClick={onDownload} title="Download">↓</button>
      {/* Delete */}
      <button className="shrink-0 cursor-pointer hover:text-red-400 text-[10px]" onClick={() => deleteRecording(rec.id)} title="Delete">×</button>
    </div>
  );
}

/* ── Recording settings (gear icon trigger) ── */
const FORMAT_OPTIONS: { value: RecordingFormat; label: string }[] = [
  { value: 'wav', label: 'WAV' },
  { value: 'mp3', label: 'MP3' },
  { value: 'webm', label: 'WebM' },
];

function formatInfoText(format: RecordingFormat, quality: number): string {
  if (format === 'wav') return quality >= 0.5 ? 'Lossless 32-bit float · ~10MB/min' : 'Lossless 16-bit PCM · ~5MB/min';
  if (format === 'mp3') return `${`${qualityToMp3Bitrate(quality)}k`}bps · ~${Math.round(qualityToMp3Bitrate(quality) * 60 / 8 / 1024 * 10) / 10}MB/min`;
  return `WebM Opus · ~${Math.round(quality * 200 + 60)}kbps`;
}

function qualityToMp3Bitrate(q: number): number {
  if (q < 0.25) return 128;
  if (q < 0.5) return 192;
  if (q < 0.75) return 256;
  return 320;
}

function qualityDisplayValue(format: RecordingFormat, quality: number): string {
  if (format === 'wav') return quality >= 0.5 ? '32-bit' : '16-bit';
  if (format === 'mp3') return `${qualityToMp3Bitrate(quality)}k`;
  return `${Math.round(quality * 100)}%`;
}

function RecordingSettings() {
  const format = useStore((s) => s.recordingFormat);
  const quality = useStore((s) => s.recordingQuality);
  const setFormat = useStore((s) => s.setRecordingFormat);
  const setQuality = useStore((s) => s.setRecordingQuality);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="cursor-pointer flex items-center justify-center"
        style={{ width: 20, height: 20, opacity: open ? 0.7 : 0.3 }}
        title="Recording settings"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path d="M6.5 1h3l.4 2.1a5.5 5.5 0 0 1 1.3.7L13.2 3l1.5 2.6-1.7 1.4a5.6 5.6 0 0 1 0 1.5l1.7 1.4-1.5 2.6-2-.8a5.5 5.5 0 0 1-1.3.7L9.5 15h-3l-.4-2.1a5.5 5.5 0 0 1-1.3-.7L2.8 13l-1.5-2.6 1.7-1.4a5.6 5.6 0 0 1 0-1.5L1.3 6.1 2.8 3.5l2 .8a5.5 5.5 0 0 1 1.3-.7L6.5 1zM8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"/>
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 bottom-full mb-2 bg-bg-secondary border border-border rounded shadow-xl z-50 overflow-hidden"
          style={{ width: 180 }}
        >
          {/* Header */}
          <div className="px-3 py-1.5 border-b border-border/30">
            <span className="text-[10px] text-text-secondary/60 uppercase tracking-wider font-semibold">Rec Settings</span>
          </div>

          <div className="px-3 py-2 flex flex-col gap-3">
            {/* Format selector */}
            <div>
              <span className="text-[9px] text-text-secondary/50 uppercase tracking-wider block mb-1">Format</span>
              <div className="flex gap-1">
                {FORMAT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    className="flex-1 text-[10px] py-1 rounded cursor-pointer transition-colors font-mono"
                    style={{
                      background: format === opt.value ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.03)',
                      color: format === opt.value ? '#e8e8ed' : '#8888a0',
                      border: format === opt.value ? '1px solid rgba(255,255,255,0.15)' : '1px solid transparent',
                    }}
                    onClick={() => setFormat(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Quality knob */}
            <div className="flex flex-col items-center">
              <EffectKnob
                value={quality}
                min={0}
                max={1}
                step={0.01}
                defaultValue={0.75}
                label="Quality"
                color="#94a3b8"
                size="sm"
                onChange={setQuality}
              />
            </div>

            {/* Quality value label */}
            <div className="text-center -mt-1">
              <span className="text-[10px] font-mono text-text-secondary/70">{qualityDisplayValue(format, quality)}</span>
            </div>

            {/* Info text */}
            <div className="text-[9px] text-text-secondary/40 text-center leading-tight">
              {formatInfoText(format, quality)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Recordings menu (folder icon trigger) ── */
function RecordingsMenu() {
  const recordings = useStore((s) => s.recordings);
  const folders = useStore((s) => s.recordingFolders);
  const createRecordingFolder = useStore((s) => s.createRecordingFolder);
  const renameRecordingFolder = useStore((s) => s.renameRecordingFolder);
  const deleteRecordingFolder = useStore((s) => s.deleteRecordingFolder);
  const reorderRecordings = useStore((s) => s.reorderRecordings);
  const moveRecordingToFolder = useStore((s) => s.moveRecordingToFolder);

  const [open, setOpen] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [folderEditName, setFolderEditName] = useState('');
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const dragIdx = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  useEffect(() => {
    return () => { if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; } };
  }, []);

  const play = (rec: { id: string; blob: Blob }) => {
    if (audioRef.current) audioRef.current.pause();
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

  const download = (rec: { blob: Blob; name: string; format: RecordingFormat }) => {
    const ext = rec.format === 'wav' ? 'wav' : rec.format === 'mp3' ? 'mp3' : 'webm';
    const url = URL.createObjectURL(rec.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${rec.name}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleFolder = (id: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const commitFolderRename = (id: string) => {
    const trimmed = folderEditName.trim();
    if (trimmed) renameRecordingFolder(id, trimmed);
    setEditingFolderId(null);
  };

  const hasRecordings = recordings.length > 0;
  const unfolderedRecs = recordings.filter((r) => r.folderId === null);

  return (
    <div ref={menuRef} className="relative shrink-0">
      {/* Folder icon button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="cursor-pointer flex items-center justify-center"
        style={{
          width: 20,
          height: 20,
          opacity: hasRecordings ? 0.5 : 0.2,
        }}
        title="Recordings"
      >
        <svg width="14" height="12" viewBox="0 0 14 12" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M1 2C1 1.44772 1.44772 1 2 1H5L6.5 3H12C12.5523 3 13 3.44772 13 4V10C13 10.5523 12.5523 11 12 11H2C1.44772 11 1 10.5523 1 10V2Z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 bottom-full mb-2 bg-bg-secondary border border-border rounded shadow-xl z-50 overflow-hidden"
          style={{ minWidth: 220, maxHeight: 300 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-2 py-1.5 border-b border-border/30">
            <span className="text-[10px] text-text-secondary/60 uppercase tracking-wider font-semibold">Recordings</span>
            <button
              className="text-[10px] text-text-secondary/40 hover:text-text-primary cursor-pointer"
              onClick={() => createRecordingFolder(`Folder ${folders.length + 1}`)}
              title="New folder"
            >
              + Folder
            </button>
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: 260 }}>
            {recordings.length === 0 && folders.length === 0 ? (
              <div className="px-3 py-3 text-[11px] text-text-secondary/40 text-center">No recordings yet</div>
            ) : (
              <>
                {/* Folders */}
                {folders.map((folder) => {
                  const folderRecs = recordings.filter((r) => r.folderId === folder.id);
                  const collapsed = collapsedFolders.has(folder.id);
                  return (
                    <div key={folder.id}>
                      {/* Folder header — drop target for recordings */}
                      <div
                        className="flex items-center gap-1 px-2 py-1 text-[11px] text-text-secondary hover:bg-white/5"
                        style={{ background: dragOverFolderId === folder.id ? 'rgba(255,255,255,0.08)' : undefined }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          setDragOverFolderId(folder.id);
                        }}
                        onDragLeave={() => setDragOverFolderId(null)}
                        onDrop={(e) => {
                          e.preventDefault();
                          const recId = e.dataTransfer.getData('recording-id');
                          if (recId) moveRecordingToFolder(recId, folder.id);
                          setDragOverFolderId(null);
                        }}
                      >
                        <button className="shrink-0 cursor-pointer text-[8px] opacity-40" onClick={() => toggleFolder(folder.id)}>
                          {collapsed ? '▸' : '▾'}
                        </button>
                        <span className="text-[10px] opacity-30">📁</span>
                        {editingFolderId === folder.id ? (
                          <input
                            className="flex-1 min-w-0 bg-transparent border-b border-white/20 outline-none text-[11px] text-text-primary px-0.5"
                            value={folderEditName}
                            autoFocus
                            onChange={(e) => setFolderEditName(e.target.value)}
                            onBlur={() => commitFolderRename(folder.id)}
                            onKeyDown={(e) => { if (e.key === 'Enter') commitFolderRename(folder.id); if (e.key === 'Escape') setEditingFolderId(null); }}
                          />
                        ) : (
                          <span
                            className="flex-1 truncate cursor-pointer hover:text-text-primary font-medium"
                            onDoubleClick={() => { setFolderEditName(folder.name); setEditingFolderId(folder.id); }}
                            title="Double-click to rename"
                          >
                            {folder.name}
                          </span>
                        )}
                        <span className="text-[9px] text-text-secondary/30 font-mono">{folderRecs.length}</span>
                        <button
                          className="shrink-0 cursor-pointer hover:text-red-400 text-[10px]"
                          onClick={() => deleteRecordingFolder(folder.id)}
                          title="Delete folder (recordings move to root)"
                        >
                          ×
                        </button>
                      </div>
                      {/* Folder contents */}
                      {!collapsed && folderRecs.map((rec) => {
                        const globalIdx = recordings.indexOf(rec);
                        return (
                          <div key={rec.id} className="pl-3">
                            <RecordingRow
                              rec={rec}

                              playingId={playingId}
                              onPlay={() => play(rec)}
                              onStop={stop}
                              onDownload={() => download(rec)}
                              onDragStart={() => { dragIdx.current = globalIdx; }}
                              onDragOver={(e) => { e.preventDefault(); setDragOverIdx(globalIdx); }}
                              onDrop={() => {
                                if (dragIdx.current !== null && dragIdx.current !== globalIdx) reorderRecordings(dragIdx.current, globalIdx);
                                setDragOverIdx(null);
                              }}
                              onDragEnd={() => { dragIdx.current = null; setDragOverIdx(null); }}
                              isDragOver={dragOverIdx === globalIdx}
                            />
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

                {/* Unfoldered recordings */}
                {unfolderedRecs.map((rec) => {
                  const globalIdx = recordings.indexOf(rec);
                  return (
                    <RecordingRow
                      key={rec.id}
                      rec={rec}

                      playingId={playingId}
                      onPlay={() => play(rec)}
                      onStop={stop}
                      onDownload={() => download(rec)}
                      onDragStart={() => { dragIdx.current = globalIdx; }}
                      onDragOver={(e) => { e.preventDefault(); setDragOverIdx(globalIdx); }}
                      onDrop={() => {
                        if (dragIdx.current !== null && dragIdx.current !== globalIdx) reorderRecordings(dragIdx.current, globalIdx);
                        setDragOverIdx(null);
                      }}
                      onDragEnd={() => { dragIdx.current = null; setDragOverIdx(null); }}
                      isDragOver={dragOverIdx === globalIdx}
                    />
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const MASTER_FX_OPTIONS: { type: import('../../types/effects').EffectType; label: string; icon: string }[] = [
  { type: 'eq3',        label: 'EQ 3-Band',   icon: '≡' },
  { type: 'parame',     label: 'Param EQ',    icon: '≋' },
  { type: 'compressor', label: 'Compressor',  icon: '⊓' },
  { type: 'reverb',     label: 'Reverb',      icon: '~' },
  { type: 'delay',      label: 'Delay',       icon: '◷' },
  { type: 'chorus',     label: 'Chorus',      icon: '≈' },
  { type: 'phaser',     label: 'Phaser',      icon: '⊕' },
  { type: 'distortion', label: 'Distortion',  icon: '⋀' },
  { type: 'filter',     label: 'Filter',      icon: '◡' },
  { type: 'bitcrusher', label: 'Bit Crusher', icon: '⊞' },
  { type: 'tremolo',    label: 'Tremolo',     icon: '∿' },
  { type: 'ringmod',    label: 'Ring Mod',    icon: '⊗' },
  { type: 'limiter',     label: 'Limiter',      icon: '⊔' },
  { type: 'drumbuss',    label: 'Drum Buss',    icon: '⊚' },
  { type: 'stereoimage', label: 'Stereo Image', icon: '↔' },
];

function AddMasterEffectMenu() {
  const addMasterEffect = useStore((s) => s.addMasterEffect);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative w-full">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-center gap-1.5 rounded border border-dashed transition-colors text-[13px] cursor-pointer"
        style={{ padding: '5px 0', borderColor: 'rgba(148,163,184,0.2)', color: 'rgba(148,163,184,0.5)' }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(148,163,184,0.5)'; e.currentTarget.style.color = '#94a3b8'; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(148,163,184,0.2)'; e.currentTarget.style.color = 'rgba(148,163,184,0.5)'; }}
        title="Add master effect"
      >
        <span className="text-[12px] leading-none">+</span>
        Add Effect
      </button>
      {open && (
        <div className="absolute left-0 right-0 bottom-full mb-1 bg-bg-secondary border border-border rounded shadow-xl z-50">
          <div className="grid grid-cols-2 gap-px p-1">
            {MASTER_FX_OPTIONS.map(({ type, label, icon }) => (
              <button
                key={type}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded text-left text-[14px] text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors cursor-pointer"
                onClick={() => { addMasterEffect(type); setOpen(false); }}
              >
                <span className="opacity-60 w-3 text-center shrink-0">{icon}</span>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function EffectsSidebar() {
  const selectedId      = useStore((s) => s.selectedInstrumentId);
  const selectedGroupId = useStore((s) => s.selectedGroupId);
  const instruments     = useStore((s) => s.instruments);
  const instrumentEffects = useStore((s) => s.instrumentEffects);
  const groups          = useStore((s) => s.groups);
  const groupEffectsMap = useStore((s) => s.groupEffects);
  const masterVolume    = useStore((s) => s.masterVolume);
  const setMasterVolume = useStore((s) => s.setMasterVolume);
  const reorderEffects  = useStore((s) => s.reorderEffects);
  const reorderGroupEffects = useStore((s) => s.reorderGroupEffects);
  const masterEffects   = useStore((s) => s.masterEffects);
  const isRecording     = useStore((s) => s.isRecording);

  // 'master' | 'instrument' | 'group'
  const [fxView, setFxView] = useState<'master' | 'instrument' | 'group'>('master');
  const prevSelectedId = useRef<string | null>(null);
  const prevGroupId = useRef<string | null>(null);

  // Auto-switch to instrument view when a (new) instrument is selected
  useEffect(() => {
    if (selectedId && selectedId !== prevSelectedId.current) setFxView('instrument');
    prevSelectedId.current = selectedId;
  }, [selectedId]);

  // Auto-switch to group view when a group is selected
  useEffect(() => {
    if (selectedGroupId && selectedGroupId !== prevGroupId.current) setFxView('group');
    prevGroupId.current = selectedGroupId;
  }, [selectedGroupId]);

  const showMaster = fxView === 'master' || (!selectedId && !selectedGroupId);
  const showGroup = fxView === 'group' && selectedGroupId;
  const selectedInstrument = instruments.find((i) => i.id === selectedId);
  const selectedGroup = groups.find((g) => g.id === selectedGroupId);
  const instEffects = selectedId ? (instrumentEffects[selectedId] ?? []) : [];
  const grpEffects = selectedGroupId ? (groupEffectsMap[selectedGroupId] ?? []) : [];

  const dragIndex = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const masterDragIdx = useRef<number | null>(null);
  const [masterDragOver, setMasterDragOver] = useState<number | null>(null);
  const groupDragIdx = useRef<number | null>(null);
  const [groupDragOver, setGroupDragOver] = useState<number | null>(null);

  return (
    <div className="flex flex-col h-full w-full bg-bg-secondary border-l border-border shrink-0 select-none">

      {/* Header — shows which view is active */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0 min-w-0">
        {showGroup && selectedGroup ? (
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: selectedGroup.color }} />
        ) : !showMaster && selectedInstrument ? (
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: selectedInstrument.color }} />
        ) : null}
        <span className="fx-header-text text-text-secondary truncate">
          {showGroup && selectedGroup ? `${selectedGroup.name} FX` : showMaster ? 'Master FX' : (selectedInstrument ? `${selectedInstrument.name} FX` : 'FX Chain')}
        </span>
      </div>

      {/* Effect blocks list — scroll container must NOT include the dropdown */}
      <div className="fx-scroll flex-1 overflow-y-auto overflow-x-hidden min-h-0">
        {showMaster ? (
          masterEffects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
              <span className="text-[28px] opacity-20">◎</span>
              <span className="fx-empty-text text-text-secondary/60">No master effects yet.</span>
            </div>
          ) : (
            masterEffects.map((effect, i) => (
              <EffectBlock
                key={effect.id}
                effect={effect}
                instrumentId="__master__"
                index={i}
                isDragOver={masterDragOver === i}
                onDragStart={() => { masterDragIdx.current = i; }}
                onDragOver={(e) => { e.preventDefault(); setMasterDragOver(i); }}
                onDrop={() => {
                  if (masterDragIdx.current !== null && masterDragIdx.current !== i)
                    reorderEffects('__master__', masterDragIdx.current, i);
                  setMasterDragOver(null);
                }}
                onDragEnd={() => { masterDragIdx.current = null; setMasterDragOver(null); }}
              />
            ))
          )
        ) : showGroup && selectedGroupId ? (
          grpEffects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
              <span className="text-[28px] opacity-20">⊞</span>
              <span className="fx-empty-text text-text-secondary/60">No group effects yet.</span>
            </div>
          ) : (
            grpEffects.map((effect, i) => (
              <EffectBlock
                key={effect.id}
                effect={effect}
                instrumentId={`__group_${selectedGroupId}__`}
                index={i}
                isDragOver={groupDragOver === i}
                onDragStart={() => { groupDragIdx.current = i; }}
                onDragOver={(e) => { e.preventDefault(); setGroupDragOver(i); }}
                onDrop={() => {
                  if (groupDragIdx.current !== null && groupDragIdx.current !== i)
                    reorderGroupEffects(selectedGroupId, groupDragIdx.current, i);
                  setGroupDragOver(null);
                }}
                onDragEnd={() => { groupDragIdx.current = null; setGroupDragOver(null); }}
              />
            ))
          )
        ) : !selectedId ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
            <span className="text-[28px] opacity-20">≡</span>
            <span className="fx-empty-text text-text-secondary/60">Select a layer to see<br />its effect chain.</span>
          </div>
        ) : instEffects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
            <span className="text-[28px] opacity-20">≡</span>
            <span className="fx-empty-text text-text-secondary/60">No effects yet.</span>
          </div>
        ) : (
          instEffects.map((effect, i) => (
            <EffectBlock
              key={effect.id}
              effect={effect}
              instrumentId={selectedId}
              index={i}
              isDragOver={dragOverIndex === i}
              onDragStart={() => { dragIndex.current = i; }}
              onDragOver={(e) => { e.preventDefault(); setDragOverIndex(i); }}
              onDrop={() => {
                if (dragIndex.current !== null && dragIndex.current !== i)
                  reorderEffects(selectedId, dragIndex.current, i);
                setDragOverIndex(null);
              }}
              onDragEnd={() => { dragIndex.current = null; setDragOverIndex(null); }}
            />
          ))
        )}
      </div>

      {/* Add Effect button — outside scroll so dropdown isn't clipped */}
      <div className="px-3 py-2 border-t border-border/30">
        {showMaster
          ? <AddMasterEffectMenu />
          : showGroup && selectedGroupId
            ? <AddEffectMenu instrumentId={`__group_${selectedGroupId}__`} />
            : selectedId && <AddEffectMenu instrumentId={selectedId} />
        }
      </div>

      {/* Master section */}
      <div className="shrink-0 border-t border-border" style={{ padding: 20 }}>
        <div className="flex items-center justify-between mb-2">
          <span className="fx-master-label text-text-primary">Master</span>
          <button
            onClick={() => setFxView('master')}
            className="cursor-pointer transition-colors text-[10px] rounded"
            style={{
              padding: '2px 8px',
              border: `1px solid ${showMaster ? 'rgba(148,163,184,0.5)' : '#2a2a3a'}`,
              color: showMaster ? '#94a3b8' : '#4a4a5a',
              background: showMaster ? 'rgba(148,163,184,0.08)' : 'transparent',
            }}
          >
            FX{masterEffects.length > 0 ? ` (${masterEffects.length})` : ''}
          </button>
        </div>
        <LUFSMeter />
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

      {/* Waveform view with record button and recordings folder */}
      <div className="shrink-0 flex items-center gap-2" style={{ padding: '0 20px 20px' }}>
        <RecordButton />
        <WaveformView isRecording={isRecording} />
        <RecordingSettings />
        <RecordingsMenu />
      </div>
    </div>
  );
}
