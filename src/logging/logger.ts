/**
 * Orbeat Logger — structured diagnostics with ring buffer, zero overhead when disabled.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'perf';

export interface LogEntry {
  id: number;
  timestamp: number;      // performance.now()
  wallTime: string;       // HH:MM:SS.mmm
  level: LogLevel;
  module: string;
  message: string;
  data?: unknown;
  durationMs?: number;
}

const BUFFER_SIZE = 5000;

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0, info: 1, warn: 2, error: 3, perf: 1,
};

function wallTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

class Logger {
  isEnabled = false;

  private _buffer: (LogEntry | null)[] = new Array(BUFFER_SIZE).fill(null);
  private _head = 0;
  private _count = 0;
  private _nextId = 1;
  private _sessionStart = performance.now();
  private _snapshotCount = 0;
  private _snapshotInterval: ReturnType<typeof setInterval> | null = null;
  private _listeners = new Set<(entry: LogEntry) => void>();

  // ── Public API ──

  debug(module: string, message: string, data?: unknown) {
    if (!this.isEnabled) return;
    this._push({ level: 'debug', module, message, data });
  }

  info(module: string, message: string, data?: unknown) {
    if (!this.isEnabled) return;
    this._push({ level: 'info', module, message, data });
  }

  warn(module: string, message: string, data?: unknown) {
    if (!this.isEnabled) return;
    this._push({ level: 'warn', module, message, data });
  }

  error(module: string, message: string, data?: unknown) {
    if (!this.isEnabled) return;
    this._push({ level: 'error', module, message, data });
  }

  perf(module: string, message: string, durationMs: number, data?: unknown) {
    if (!this.isEnabled) return;
    this._push({ level: 'perf', module, message, data, durationMs });
  }

  enable() {
    this.isEnabled = true;
    this._sessionStart = performance.now();
    this._snapshotCount = 0;
    this._push({ level: 'info', module: 'logger', message: 'Logging enabled' });
    // Periodic performance snapshots every 30s
    if (!this._snapshotInterval) {
      this._snapshotInterval = setInterval(() => {
        if (this.isEnabled) this.takePerformanceSnapshot();
      }, 30_000);
    }
  }

  disable() {
    this._push({ level: 'info', module: 'logger', message: 'Logging disabled' });
    this.isEnabled = false;
    if (this._snapshotInterval) {
      clearInterval(this._snapshotInterval);
      this._snapshotInterval = null;
    }
  }

  clear() {
    this._buffer.fill(null);
    this._head = 0;
    this._count = 0;
    this._nextId = 1;
    this._snapshotCount = 0;
    // Notify listeners of clear (they should re-read)
    for (const fn of this._listeners) fn(null as unknown as LogEntry);
  }

  getEntries(filter?: { levels?: LogLevel[]; module?: string; search?: string }): LogEntry[] {
    const entries: LogEntry[] = [];
    const start = this._count < BUFFER_SIZE ? 0 : this._head;
    const len = Math.min(this._count, BUFFER_SIZE);
    for (let i = 0; i < len; i++) {
      const idx = (start + i) % BUFFER_SIZE;
      const e = this._buffer[idx];
      if (!e) continue;
      if (filter) {
        if (filter.levels && !filter.levels.includes(e.level)) continue;
        if (filter.module && e.module !== filter.module) continue;
        if (filter.search && !e.message.toLowerCase().includes(filter.search.toLowerCase())) continue;
      }
      entries.push(e);
    }
    return entries;
  }

  getCount(): number { return Math.min(this._count, BUFFER_SIZE); }

  getSessionDuration(): number { return performance.now() - this._sessionStart; }

  getSnapshotCount(): number { return this._snapshotCount; }

  getModules(): string[] {
    const mods = new Set<string>();
    const start = this._count < BUFFER_SIZE ? 0 : this._head;
    const len = Math.min(this._count, BUFFER_SIZE);
    for (let i = 0; i < len; i++) {
      const e = this._buffer[(start + i) % BUFFER_SIZE];
      if (e) mods.add(e.module);
    }
    return [...mods].sort();
  }

  subscribe(listener: (entry: LogEntry) => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  // ── Performance Snapshot ──

  takePerformanceSnapshot() {
    this._snapshotCount++;
    // Lazy import to avoid circular deps
    const snap: Record<string, unknown> = {};

    try {
      // AudioContext
      const ctx = (globalThis as any).__orbeat_audioContext as AudioContext | undefined;
      if (ctx) {
        snap.audioState = ctx.state;
        snap.sampleRate = ctx.sampleRate;
        snap.baseLatencyMs = Math.round((ctx.baseLatency || 0) * 1000 * 100) / 100;
        snap.outputLatencyMs = Math.round(((ctx as any).outputLatency || 0) * 1000 * 100) / 100;
        snap.currentTime = Math.round(ctx.currentTime * 100) / 100;
      }

      // Store state (lazy access)
      let state: any = null;
      try {
        // Dynamic require to avoid circular
        const { useStore } = require('../state/store');
        state = useStore.getState();
      } catch { /* ignore */ }

      if (state) {
        // Transport
        snap.bpm = state.bpm;
        snap.isPlaying = state.isPlaying;
        snap.stepsPerBeat = state.stepsPerBeat;
        snap.currentStep = state.currentStep;
        snap.trackMode = state.trackMode;
        snap.liveMode = state.liveMode;

        // Instruments
        const insts: any[] = state.instruments || [];
        snap.totalInstruments = insts.length;
        snap.mutedCount = insts.filter((i: any) => i.muted).length;
        snap.soloCount = insts.filter((i: any) => i.solo).length;
        const byType: Record<string, number> = {};
        for (const inst of insts) {
          byType[inst.type] = (byType[inst.type] || 0) + 1;
        }
        snap.instrumentsByType = byType;

        // Effects
        const instFx = state.instrumentEffects || {};
        let totalFx = 0;
        let activeFxChains = 0;
        const fxByType: Record<string, number> = {};
        for (const instId of Object.keys(instFx)) {
          const effects: any[] = instFx[instId] || [];
          const enabledEffects = effects.filter((e: any) => e.enabled);
          totalFx += enabledEffects.length;
          if (enabledEffects.length > 0) activeFxChains++;
          for (const fx of enabledEffects) {
            fxByType[fx.type] = (fxByType[fx.type] || 0) + 1;
          }
        }
        snap.totalActiveEffects = totalFx;
        snap.activeFxChains = activeFxChains;
        snap.effectsByType = fxByType;

        // Master effects
        const masterFx = (state.masterEffects || []).filter((e: any) => e.enabled);
        snap.masterEffects = masterFx.length;

        // Scenes
        snap.sceneCount = (state.scenes || []).length;
        snap.activeSceneId = state.liveActiveSceneId || null;

        // Volume
        snap.masterVolume = Math.round((state.masterVolume || 0) * 100);
      }

      // Memory (Chrome only)
      const perf = performance as any;
      if (perf.memory) {
        snap.heapUsedMB = Math.round(perf.memory.usedJSHeapSize / 1048576 * 10) / 10;
        snap.heapTotalMB = Math.round(perf.memory.totalJSHeapSize / 1048576 * 10) / 10;
        snap.heapLimitMB = Math.round(perf.memory.jsHeapSizeLimit / 1048576);
      }

      // Buffer stats
      snap.logBufferUsed = this.getCount();
      snap.logBufferMax = BUFFER_SIZE;
      snap.sessionDurationSec = Math.round(this.getSessionDuration() / 1000);

    } catch (e) {
      snap.error = String(e);
    }

    // Build formatted message
    const lines = ['── Performance Snapshot ──'];
    if (snap.audioState) lines.push(`  AudioCtx: ${snap.audioState} ${snap.sampleRate}Hz  base=${snap.baseLatencyMs}ms  out=${snap.outputLatencyMs}ms  t=${snap.currentTime}s`);
    if (snap.bpm !== undefined) lines.push(`  Transport: ${snap.isPlaying ? 'PLAYING' : 'stopped'}  BPM=${snap.bpm}  steps=${snap.stepsPerBeat}  step=${snap.currentStep}  ${snap.trackMode ? 'TRACK' : snap.liveMode ? 'LIVE' : 'ORBIT'}`);
    if (snap.totalInstruments !== undefined) lines.push(`  Instruments: ${snap.totalInstruments} total  ${snap.mutedCount} muted  ${snap.soloCount} solo  [${Object.entries(snap.instrumentsByType as Record<string, number>).map(([k, v]) => `${k}:${v}`).join(' ')}]`);
    if (snap.totalActiveEffects !== undefined) lines.push(`  Effects: ${snap.totalActiveEffects} active in ${snap.activeFxChains} chains  master:${snap.masterEffects}  [${Object.entries(snap.effectsByType as Record<string, number>).map(([k, v]) => `${k}:${v}`).join(' ')}]`);
    if (snap.heapUsedMB !== undefined) lines.push(`  Memory: ${snap.heapUsedMB}MB / ${snap.heapTotalMB}MB  (limit ${snap.heapLimitMB}MB)`);
    lines.push(`  Volume: ${snap.masterVolume}%  Scenes: ${snap.sceneCount || 0}  Buffer: ${snap.logBufferUsed}/${snap.logBufferMax}  Session: ${snap.sessionDurationSec}s`);

    this.perf('snapshot', lines.join('\n'), 0, snap);
  }

  // ── Download ──

  downloadAsJSON() {
    const entries = this.getEntries();
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
    this._download(blob, `orbitrack-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  }

  downloadAsText() {
    const entries = this.getEntries();
    const lines = entries.map(e => {
      const dur = e.durationMs !== undefined ? ` [${e.durationMs.toFixed(2)}ms]` : '';
      const data = e.data ? `  ${JSON.stringify(e.data)}` : '';
      return `${e.wallTime} ${e.level.toUpperCase().padEnd(5)} [${e.module}] ${e.message}${dur}${data}`;
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    this._download(blob, `orbitrack-log-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
  }

  // ── Internals ──

  private _push(partial: Omit<LogEntry, 'id' | 'timestamp' | 'wallTime'> & { durationMs?: number }) {
    const entry: LogEntry = {
      id: this._nextId++,
      timestamp: performance.now(),
      wallTime: wallTime(),
      level: partial.level,
      module: partial.module,
      message: partial.message,
      data: partial.data,
      durationMs: partial.durationMs,
    };
    this._buffer[this._head] = entry;
    this._head = (this._head + 1) % BUFFER_SIZE;
    this._count++;
    for (const fn of this._listeners) {
      try { fn(entry); } catch { /* swallow */ }
    }
  }

  private _download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export const log = new Logger();

// Expose audio context reference for snapshot (set by engine.ts)
export function setLogAudioContext(ctx: AudioContext) {
  (globalThis as any).__orbeat_audioContext = ctx;
}
