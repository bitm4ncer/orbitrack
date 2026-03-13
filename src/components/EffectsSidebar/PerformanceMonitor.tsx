import { useEffect, useRef } from 'react';
import { getAudioContext } from 'superdough';
import { getActiveSynthCount } from '../../audio/synthManager';
import { getActiveChainCount } from '../../audio/orbitEffects';

/**
 * Compact real-time performance overlay for the Effects panel.
 * Uses direct DOM mutation (not React state) to avoid re-render overhead.
 * Metrics sampled at RAF rate, display updated at 4Hz.
 */
export function PerformanceMonitor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Grab span refs for direct DOM updates
    const fpsEl = el.querySelector('[data-m="fps"]') as HTMLSpanElement;
    const hzEl = el.querySelector('[data-m="hz"]') as HTMLSpanElement;
    const latEl = el.querySelector('[data-m="lat"]') as HTMLSpanElement;
    const voicesEl = el.querySelector('[data-m="voices"]') as HTMLSpanElement;
    const chainsEl = el.querySelector('[data-m="chains"]') as HTMLSpanElement;
    const glitchEl = el.querySelector('[data-m="glitch"]') as HTMLSpanElement;
    const stateEl = el.querySelector('[data-m="state"]') as HTMLSpanElement;

    // Sampling state
    let lastTime = performance.now();
    let fpsEma = 60; // exponential moving average
    const EMA_ALPHA = 0.1;
    let lastDisplayUpdate = 0;
    const DISPLAY_INTERVAL = 250; // 4Hz display updates
    let glitchCount = 0;
    let glitchWindowStart = performance.now();

    function tick() {
      const now = performance.now();
      const delta = now - lastTime;
      lastTime = now;

      // FPS EMA
      if (delta > 0) {
        const instantFps = 1000 / delta;
        fpsEma = EMA_ALPHA * instantFps + (1 - EMA_ALPHA) * fpsEma;
      }

      // Glitch detection: RAF delta > 50ms indicates main-thread stall
      if (delta > 50) glitchCount++;

      // Reset glitch count every 5 seconds
      if (now - glitchWindowStart > 5000) {
        glitchWindowStart = now;
        glitchCount = 0;
      }

      // Update display at 4Hz
      if (now - lastDisplayUpdate >= DISPLAY_INTERVAL) {
        lastDisplayUpdate = now;

        const fps = Math.round(fpsEma);
        let ac: AudioContext | null = null;
        try { ac = getAudioContext() as AudioContext; } catch { /* not ready */ }

        // FPS
        if (fpsEl) {
          fpsEl.textContent = String(fps);
          fpsEl.style.color = fps < 15 ? '#ef4444' : fps < 30 ? '#f59e0b' : '#4ade80';
        }

        // Sample rate
        if (hzEl && ac) {
          hzEl.textContent = `${(ac.sampleRate / 1000).toFixed(0)}k`;
        }

        // Latency
        if (latEl && ac) {
          const base = (ac as unknown as { baseLatency?: number }).baseLatency ?? 0;
          const output = (ac as unknown as { outputLatency?: number }).outputLatency ?? 0;
          const totalMs = ((base + output) * 1000).toFixed(1);
          const totalNum = base + output;
          latEl.textContent = `${totalMs}ms`;
          latEl.style.color = totalNum > 0.05 ? '#ef4444' : totalNum > 0.02 ? '#f59e0b' : '#4ade80';
        }

        // Voices & chains
        if (voicesEl) voicesEl.textContent = String(getActiveSynthCount());
        if (chainsEl) chainsEl.textContent = String(getActiveChainCount());

        // Glitches
        if (glitchEl) {
          glitchEl.textContent = String(glitchCount);
          glitchEl.style.color = glitchCount > 3 ? '#ef4444' : glitchCount > 0 ? '#f59e0b' : '#4ade80';
        }

        // Audio context state
        if (stateEl && ac) {
          const state = ac.state;
          stateEl.textContent = state;
          stateEl.style.color = state === 'running' ? '#4ade80' : '#ef4444';
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div
      ref={containerRef}
      className="border-b border-border/30"
      style={{
        padding: '6px 12px',
        background: 'rgba(0,0,0,0.3)',
        fontFamily: 'ui-monospace, monospace',
        fontSize: '10px',
        lineHeight: '16px',
        color: '#94a3b8',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span>FPS <span data-m="fps" style={{ color: '#4ade80' }}>--</span></span>
        <span style={{ color: '#334155' }}>|</span>
        <span data-m="state" style={{ color: '#4ade80' }}>--</span>
        <span><span data-m="hz">--</span>Hz</span>
        <span style={{ color: '#334155' }}>|</span>
        <span><span data-m="lat" style={{ color: '#4ade80' }}>--</span></span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span>V:<span data-m="voices">0</span></span>
        <span>C:<span data-m="chains">0</span></span>
        <span style={{ color: '#334155' }}>|</span>
        <span>Drops:<span data-m="glitch" style={{ color: '#4ade80' }}>0</span></span>
      </div>
    </div>
  );
}
