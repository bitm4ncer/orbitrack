/**
 * Lightweight performance monitor for Orbeat.
 *
 * Toggle via console:  window.__orbeatPerf.start() / .stop()
 * Or keyboard:         Ctrl+Shift+P
 *
 * Logs every 2 seconds:
 *   FPS | Orbit chains | Synth engines | Heap MB | AudioContext state
 */

import { getActiveChainCount } from '../audio/orbitEffects';
import { getActiveSynthCount } from '../audio/synthManager';
import { getAudioContext } from 'superdough';

const LOG_INTERVAL_MS = 2000;

interface PerfSnapshot {
  fps: number;
  orbitChains: number;
  synthEngines: number;
  heapMB: number | null;
  audioState: string;
}

class PerfMonitor {
  private _enabled = false;
  private _frameCount = 0;
  private _lastTime = 0;
  private _rafId: number | null = null;
  private _logIntervalId: ReturnType<typeof setInterval> | null = null;
  private _snapshot: PerfSnapshot = {
    fps: 0, orbitChains: 0, synthEngines: 0, heapMB: null, audioState: 'unknown',
  };

  /** Start the performance monitor. */
  start(): void {
    if (this._enabled) return;
    this._enabled = true;
    this._frameCount = 0;
    this._lastTime = performance.now();

    // RAF loop just counts frames
    const tick = () => {
      this._frameCount++;
      if (this._enabled) this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);

    // Log on a fixed interval
    this._logIntervalId = setInterval(() => this._log(), LOG_INTERVAL_MS);

    console.log(
      '%c[PerfMon] Started — logging every 2s. Call window.__orbeatPerf.stop() to disable.',
      'color: #22c55e; font-weight: bold',
    );
  }

  /** Stop the performance monitor. */
  stop(): void {
    if (!this._enabled) return;
    this._enabled = false;
    if (this._rafId !== null) cancelAnimationFrame(this._rafId);
    if (this._logIntervalId !== null) clearInterval(this._logIntervalId);
    this._rafId = null;
    this._logIntervalId = null;
    console.log('%c[PerfMon] Stopped.', 'color: #f59e0b; font-weight: bold');
  }

  /** Toggle on/off. */
  toggle(): void {
    this._enabled ? this.stop() : this.start();
  }

  /** Returns the latest snapshot (useful for programmatic access). */
  get snapshot(): Readonly<PerfSnapshot> {
    return { ...this._snapshot };
  }

  private _log(): void {
    const now = performance.now();
    const elapsed = (now - this._lastTime) / 1000;
    const fps = elapsed > 0 ? Math.round(this._frameCount / elapsed) : 0;

    this._snapshot.fps = fps;
    this._snapshot.orbitChains = getActiveChainCount();
    this._snapshot.synthEngines = getActiveSynthCount();

    // Chrome-only heap info
    const perfMemory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    this._snapshot.heapMB = perfMemory
      ? Math.round(perfMemory.usedJSHeapSize / 1048576)
      : null;

    // Audio context state
    try {
      const ctx = getAudioContext() as AudioContext;
      this._snapshot.audioState = ctx.state;
    } catch {
      this._snapshot.audioState = 'unavailable';
    }

    // Color-code FPS
    const fpsColor = fps >= 55 ? '#22c55e' : fps >= 30 ? '#f59e0b' : '#ef4444';

    const parts = [
      `%cFPS: %c${fps}`,
      `%c| Chains: %c${this._snapshot.orbitChains}`,
      `%c| Synths: %c${this._snapshot.synthEngines}`,
      this._snapshot.heapMB !== null ? `%c| Heap: %c${this._snapshot.heapMB} MB` : '',
      `%c| Audio: %c${this._snapshot.audioState}`,
    ].filter(Boolean).join(' ');

    const styles = [
      'color: #888', fpsColor,
      'color: #888', 'color: #60a5fa',
      'color: #888', 'color: #60a5fa',
      ...(this._snapshot.heapMB !== null ? ['color: #888', 'color: #c084fc'] : []),
      'color: #888', this._snapshot.audioState === 'running' ? 'color: #22c55e' : 'color: #ef4444',
    ];

    console.log(`%c[PerfMon] ${parts}`, 'font-weight: bold', ...styles);

    // Reset counters
    this._frameCount = 0;
    this._lastTime = now;
  }
}

// Singleton
export const perfMonitor = new PerfMonitor();
