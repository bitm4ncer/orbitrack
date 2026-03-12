import { useEffect, useRef, useState, useCallback } from 'react';
import { getAudioContext } from 'superdough';
import { getMasterAnalyser } from '../../audio/routingEngine';
import { getMasterOutputNode } from '../../audio/masterEffectsChain';

// ── VU meter constants (same as VUMeter.tsx) ─────────────────────────────────
const HOLD_FRAMES = 120;
const DECAY_RATE = 0.003;
const CLIP_FLASH_FRAMES = 45;
const VU_H = 18;
const CLIP_W = 4;
const DB_FLOOR = 48;
const DB_TICKS = [-48, -36, -24, -18, -12, -6, 0].map((db) => ({
  db,
  frac: (db + DB_FLOOR) / DB_FLOOR,
}));

// ── LUFS meter constants ──────────────────────────────────────────────────────
const LUFS_H = 32;
const LUFS_FLOOR = 23; // -23 to 0 LUFS range (EBU R128 reference)
const LUFS_BLOCK_MS = 100; // accumulate power every 100ms → 4 blocks = 400ms momentary
const MOMENTARY_BLOCKS = 4; // 400ms window
const SHORT_TERM_BLOCKS = 30; // 3s window

const PRESETS = [
  { label: 'Spotify', lufs: -14, color: '#1DB954' },
  { label: 'Apple',   lufs: -16, color: '#fc3c44' },
  { label: 'Vinyl',   lufs: -10, color: '#d4a76a' },
  { label: 'CD',      lufs: -12, color: '#94a3b8' },
] as const;

export function LUFSMeter() {
  const containerRef  = useRef<HTMLDivElement>(null);
  const vuCanvasRef   = useRef<HTMLCanvasElement>(null);
  const lufsCanvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef        = useRef<number>(0);

  // VU meter state
  const vuState = useRef({ level: 0, peakLevel: 0, peakHoldFrames: 0, clipFlashFrames: 0 });

  // LUFS state — ring buffers avoid O(n) shift() on every block
  const lufsState = useRef({
    // Ring buffer storage: fixed-size Float64Arrays + write head + count
    momentaryData: new Float64Array(MOMENTARY_BLOCKS),
    momentaryHead: 0,
    momentaryCount: 0,
    shortTermData: new Float64Array(SHORT_TERM_BLOCKS),
    shortTermHead: 0,
    shortTermCount: 0,
    gatedData: new Float64Array(600),
    gatedHead: 0,
    gatedCount: 0,
    momentaryLUFS: -Infinity,
    integratedLUFS: -Infinity,
    lastBlockTime: 0,
    silenceBlocks: 0,                 // consecutive below-gate blocks (for decay)
    lufsAnalyser: null as AnalyserNode | null,
    lufsBuffer: null as Float32Array | null,
    kwSetup: false,
  });

  const [activePreset, setActivePreset] = useState<number | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const infoRef = useRef<HTMLDivElement>(null);
  const resetRef = useRef(false);

  const closeInfo = useCallback((e: MouseEvent) => {
    if (infoRef.current && !infoRef.current.contains(e.target as Node)) setShowInfo(false);
  }, []);

  useEffect(() => {
    if (!showInfo) return;
    document.addEventListener('mousedown', closeInfo);
    return () => document.removeEventListener('mousedown', closeInfo);
  }, [showInfo, closeInfo]);

  // Set up K-weighting side-tap once masterOutputNode is available
  useEffect(() => {
    const ls = lufsState.current;
    let rafId = 0;

    const trySetup = () => {
      if (ls.kwSetup) return;
      const outputNode = getMasterOutputNode();
      if (!outputNode) { rafId = requestAnimationFrame(trySetup); return; }

      try {
        const ac = getAudioContext() as AudioContext;
        // Stage 1: high-shelf pre-filter (head-related transfer function model)
        const kw1 = ac.createBiquadFilter();
        kw1.type = 'highshelf'; kw1.frequency.value = 1681; kw1.gain.value = 4;
        // Stage 2: RLB high-pass
        const kw2 = ac.createBiquadFilter();
        kw2.type = 'highpass'; kw2.frequency.value = 60; kw2.Q.value = 0.5;
        // Leaf analyser — never connected to destination
        const analyser = ac.createAnalyser();
        analyser.fftSize = 4096;
        analyser.smoothingTimeConstant = 0;
        outputNode.connect(kw1); kw1.connect(kw2); kw2.connect(analyser);
        ls.lufsAnalyser = analyser;
        ls.lufsBuffer = new Float32Array(analyser.fftSize);
        ls.kwSetup = true;
      } catch {
        rafId = requestAnimationFrame(trySetup);
      }
    };

    rafId = requestAnimationFrame(trySetup);
    return () => cancelAnimationFrame(rafId);
  }, []);

  useEffect(() => {
    const vuCanvas   = vuCanvasRef.current;
    const lufsCanvas = lufsCanvasRef.current;
    const container  = containerRef.current;
    if (!vuCanvas || !lufsCanvas || !container) return;

    let W = 0;
    let vuDataBuffer: Float32Array | null = null;
    // Cache gradients — recreated only when meter width changes
    let cachedVuGrad: CanvasGradient | null = null;
    let cachedLufsGrad: CanvasGradient | null = null;
    let cachedGradW = 0;

    const draw = (timestamp: number) => {
      const cw = container.clientWidth || 220;
      if (cw !== W) {
        W = cw;
        vuCanvas.width   = W; vuCanvas.height   = VU_H;
        lufsCanvas.width = W; lufsCanvas.height = LUFS_H;
      }

      const vuCtx   = vuCanvas.getContext('2d');
      const lufsCtx = lufsCanvas.getContext('2d');
      if (!vuCtx || !lufsCtx) { rafRef.current = requestAnimationFrame(draw); return; }

      const meterW = W - CLIP_W;

      // Rebuild cached gradients when width changes
      if (cachedGradW !== meterW) {
        const vuCtx0 = vuCanvas.getContext('2d');
        const lufsCtx0 = lufsCanvas.getContext('2d');
        if (vuCtx0 && lufsCtx0) {
          cachedVuGrad = vuCtx0.createLinearGradient(0, 0, meterW, 0);
          cachedVuGrad.addColorStop(0,    '#16a34a'); cachedVuGrad.addColorStop(0.55, '#22c55e');
          cachedVuGrad.addColorStop(0.75, '#f59e0b'); cachedVuGrad.addColorStop(0.88, '#f97316');
          cachedVuGrad.addColorStop(1.0,  '#ef4444');
          cachedLufsGrad = lufsCtx0.createLinearGradient(0, 0, W - CLIP_W, 0);
          cachedLufsGrad.addColorStop(0,    '#1e3a1e'); cachedLufsGrad.addColorStop(0.55, '#22c55e');
          cachedLufsGrad.addColorStop(0.75, '#f59e0b'); cachedLufsGrad.addColorStop(1.0,  '#ef4444');
          cachedGradW = meterW;
        }
      }

      const ls = lufsState.current;
      const vs = vuState.current;

      // ── VU meter (fast dBFS, same logic as VUMeter.tsx) ─────────────────
      const analyser = getMasterAnalyser();
      if (analyser) {
        if (!vuDataBuffer || vuDataBuffer.length !== analyser.fftSize) {
          vuDataBuffer = new Float32Array(analyser.fftSize);
        }
        analyser.getFloatTimeDomainData(vuDataBuffer as Float32Array<ArrayBuffer>);
        let sum = 0;
        for (let i = 0; i < vuDataBuffer.length; i++) sum += vuDataBuffer[i] * vuDataBuffer[i];
        const rms = Math.sqrt(sum / vuDataBuffer.length);
        const db  = 20 * Math.log10(Math.max(rms, 1e-9));
        const lvl = Math.max(0, Math.min(1, (db + DB_FLOOR) / DB_FLOOR));

        vs.level = lvl > vs.level ? lvl : Math.max(0, vs.level - 0.02);
        if (lvl >= vs.peakLevel) { vs.peakLevel = lvl; vs.peakHoldFrames = HOLD_FRAMES; }
        else if (vs.peakHoldFrames > 0) vs.peakHoldFrames--;
        else vs.peakLevel = Math.max(0, vs.peakLevel - DECAY_RATE);
        if (lvl >= 0.999) vs.clipFlashFrames = CLIP_FLASH_FRAMES;
        else if (vs.clipFlashFrames > 0) vs.clipFlashFrames--;
      }

      // draw VU
      vuCtx.fillStyle = '#0c0c14'; vuCtx.fillRect(0, 0, W, VU_H);
      vuCtx.fillStyle = '#1a1a28'; vuCtx.fillRect(0, 1, meterW, VU_H - 2);
      const barW = Math.round(vs.level * meterW);
      if (barW > 0 && cachedVuGrad) {
        vuCtx.fillStyle = cachedVuGrad; vuCtx.fillRect(0, 1, barW, VU_H - 2);
      }
      vuCtx.fillStyle = '#0c0c14';
      for (const { frac } of DB_TICKS) { const x = Math.round(frac * meterW); if (x > 0 && x < meterW) vuCtx.fillRect(x, 0, 1, VU_H); }
      if (vs.peakLevel > 0.01) {
        vuCtx.fillStyle = vs.peakLevel > 0.9 ? '#ef4444' : '#cbd5e1';
        vuCtx.fillRect(Math.round(vs.peakLevel * meterW), 0, 2, VU_H);
      }
      vuCtx.fillStyle = vs.clipFlashFrames > 0 ? '#ef4444' : '#1e293b';
      vuCtx.fillRect(meterW, 0, CLIP_W, VU_H);

      // ── LUFS metering ────────────────────────────────────────────────────
      if (ls.lufsAnalyser && ls.lufsBuffer) {
        if (resetRef.current) {
          ls.momentaryHead = 0; ls.momentaryCount = 0;
          ls.shortTermHead = 0; ls.shortTermCount = 0;
          ls.gatedHead = 0; ls.gatedCount = 0;
          ls.momentaryLUFS = -Infinity; ls.integratedLUFS = -Infinity;
          ls.silenceBlocks = 0;
          ls.lastBlockTime = timestamp;
          resetRef.current = false;
        }

        // Accumulate 100ms blocks
        const blockElapsed = timestamp - ls.lastBlockTime;
        if (blockElapsed >= LUFS_BLOCK_MS) {
          ls.lastBlockTime = timestamp;
          ls.lufsAnalyser.getFloatTimeDomainData(ls.lufsBuffer as Float32Array<ArrayBuffer>);
          let blockPower = 0;
          for (let i = 0; i < ls.lufsBuffer.length; i++) blockPower += ls.lufsBuffer[i] * ls.lufsBuffer[i];
          blockPower /= ls.lufsBuffer.length;

          // Ring buffer push helper (O(1) instead of shift's O(n))
          ls.momentaryData[ls.momentaryHead] = blockPower;
          ls.momentaryHead = (ls.momentaryHead + 1) % MOMENTARY_BLOCKS;
          if (ls.momentaryCount < MOMENTARY_BLOCKS) ls.momentaryCount++;

          ls.shortTermData[ls.shortTermHead] = blockPower;
          ls.shortTermHead = (ls.shortTermHead + 1) % SHORT_TERM_BLOCKS;
          if (ls.shortTermCount < SHORT_TERM_BLOCKS) ls.shortTermCount++;

          // Momentary LUFS (400ms window)
          if (ls.momentaryCount >= MOMENTARY_BLOCKS) {
            let sum = 0;
            for (let i = 0; i < MOMENTARY_BLOCKS; i++) sum += ls.momentaryData[i];
            const avgPower = sum / MOMENTARY_BLOCKS;
            ls.momentaryLUFS = avgPower > 0 ? -0.691 + 10 * Math.log10(avgPower) : -Infinity;
          }

          // Gate and accumulate for integrated LUFS (>-70 LUFS blocks only)
          // After 2s of consecutive silence, drain one old block per tick so the reading falls
          if (ls.momentaryLUFS > -70) {
            ls.silenceBlocks = 0;
            ls.gatedData[ls.gatedHead] = blockPower;
            ls.gatedHead = (ls.gatedHead + 1) % 600;
            if (ls.gatedCount < 600) ls.gatedCount++;
          } else {
            ls.silenceBlocks++;
            if (ls.silenceBlocks > 20 && ls.gatedCount > 0) {
              ls.gatedCount--; // drain oldest block → reading descends toward -∞
            }
          }

          // Integrated LUFS (gated average since reset)
          if (ls.gatedCount > 0) {
            let sum = 0;
            for (let i = 0; i < ls.gatedCount; i++) {
              const idx = (ls.gatedHead - ls.gatedCount + i + 600) % 600;
              sum += ls.gatedData[idx];
            }
            const intAvg = sum / ls.gatedCount;
            ls.integratedLUFS = intAvg > 0 ? -0.691 + 10 * Math.log10(intAvg) : -Infinity;
          }
        }
      }

      // ── Draw LUFS canvas ─────────────────────────────────────────────────
      const intLUFS  = isFinite(ls.integratedLUFS)  ? ls.integratedLUFS  : -Infinity;
      const momLUFS  = isFinite(ls.momentaryLUFS)   ? ls.momentaryLUFS   : -Infinity;

      lufsCtx.fillStyle = '#0c0c14';
      lufsCtx.fillRect(0, 0, W, LUFS_H);

      const barH = LUFS_H - 14; // leave room for text at bottom
      lufsCtx.fillStyle = '#1a1a28';
      lufsCtx.fillRect(0, 0, W - CLIP_W, barH);

      // LUFS bar (integrated) — gradient from green (safe) to red (over target)
      const intFrac = isFinite(intLUFS) ? Math.max(0, Math.min(1, (intLUFS + LUFS_FLOOR) / LUFS_FLOOR)) : 0;
      if (intFrac > 0 && cachedLufsGrad) {
        lufsCtx.fillStyle = cachedLufsGrad;
        lufsCtx.fillRect(0, 0, Math.round(intFrac * (W - CLIP_W)), barH);
      }

      // Momentary LUFS indicator (thin line)
      const momFrac = isFinite(momLUFS) ? Math.max(0, Math.min(1, (momLUFS + LUFS_FLOOR) / LUFS_FLOOR)) : 0;
      if (momFrac > 0) {
        lufsCtx.fillStyle = 'rgba(255,255,255,0.5)';
        lufsCtx.fillRect(Math.round(momFrac * (W - CLIP_W)) - 1, 0, 2, barH);
      }

      // Preset target line
      if (activePreset !== null) {
        const preset = PRESETS[activePreset];
        const targetFrac = Math.max(0, Math.min(1, (preset.lufs + LUFS_FLOOR) / LUFS_FLOOR));
        const tx = Math.round(targetFrac * (W - CLIP_W));
        lufsCtx.strokeStyle = preset.color;
        lufsCtx.lineWidth = 1.5;
        lufsCtx.setLineDash([3, 2]);
        lufsCtx.beginPath(); lufsCtx.moveTo(tx, 0); lufsCtx.lineTo(tx, barH);
        lufsCtx.stroke(); lufsCtx.setLineDash([]);
      }

      // dB tick notches
      const LUFS_TICKS = [-23, -18, -14, -12, -10, -6, 0];
      lufsCtx.fillStyle = '#0c0c14';
      for (const tick of LUFS_TICKS) {
        const x = Math.round(((tick + LUFS_FLOOR) / LUFS_FLOOR) * (W - CLIP_W));
        if (x > 0 && x < W - CLIP_W) lufsCtx.fillRect(x, 0, 1, barH);
      }

      // Clip strip (reuse for "over" detection)
      lufsCtx.fillStyle = isFinite(intLUFS) && intLUFS >= -0.5 ? '#ef4444' : '#1e293b';
      lufsCtx.fillRect(W - CLIP_W, 0, CLIP_W, barH);

      // Text row
      lufsCtx.font = '8px monospace';
      lufsCtx.textBaseline = 'middle';
      const ty = barH + 7;

      // Integrated LUFS value — colored by proximity to target
      let intColor = '#6b7280';
      if (activePreset !== null && isFinite(intLUFS)) {
        const diff = Math.abs(intLUFS - PRESETS[activePreset].lufs);
        intColor = diff <= 1 ? '#22c55e' : diff <= 3 ? '#f59e0b' : '#ef4444';
      }
      lufsCtx.fillStyle = intColor;
      lufsCtx.textAlign = 'left';
      lufsCtx.fillText(isFinite(intLUFS) ? `${intLUFS.toFixed(1)} LUFS` : '--- LUFS', 2, ty);

      // Momentary value (right side)
      lufsCtx.fillStyle = '#4b5563';
      lufsCtx.textAlign = 'right';
      lufsCtx.fillText(isFinite(momLUFS) ? `M ${momLUFS.toFixed(1)}` : 'M ---', W - CLIP_W - 2, ty);

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [activePreset]);

  return (
    <div ref={containerRef} className="w-full">

      {/* ── Preset buttons row (above meters) ── */}
      <div className="flex items-center gap-1 mb-1.5">
        {/* Info button */}
        <div ref={infoRef} className="relative shrink-0">
          <button
            onClick={() => setShowInfo((v) => !v)}
            className="rounded cursor-pointer flex items-center justify-center transition-colors"
            style={{
              width: 14, height: 14,
              fontSize: 8, lineHeight: '14px',
              background: showInfo ? 'rgba(148,163,184,0.15)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${showInfo ? 'rgba(148,163,184,0.4)' : 'rgba(255,255,255,0.08)'}`,
              color: showInfo ? '#94a3b8' : '#4b5563',
            }}
            title="What is LUFS?"
          >
            ?
          </button>

          {showInfo && (
            <div
              className="absolute left-0 bottom-full mb-1.5 rounded shadow-xl z-50"
              style={{
                width: 210,
                background: '#111120',
                border: '1px solid rgba(255,255,255,0.1)',
                padding: '10px 12px',
              }}
            >
              <p className="text-[10px] font-semibold text-text-primary mb-1.5" style={{ color: '#94a3b8' }}>
                What is LUFS?
              </p>
              <p className="text-[9px] leading-relaxed" style={{ color: '#6b7280' }}>
                <span style={{ color: '#94a3b8' }}>LUFS</span> (Loudness Units Full Scale) measures perceived loudness using the <span style={{ color: '#94a3b8' }}>ITU-R BS.1770</span> standard. Unlike peak level, it reflects how loud a track <em>feels</em> to your ears.
              </p>
              <p className="text-[9px] leading-relaxed mt-1.5" style={{ color: '#6b7280' }}>
                Streaming platforms normalize all tracks to a target — louder mixes get turned down, so extra loudness is wasted. Match your target and preserve your dynamics.
              </p>
              <div className="mt-2 flex flex-col gap-0.5">
                {PRESETS.map((p) => (
                  <div key={p.label} className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.color }} />
                    <span className="text-[9px] font-mono" style={{ color: p.color, minWidth: 40 }}>{p.label}</span>
                    <span className="text-[9px]" style={{ color: '#4b5563' }}>{p.lufs} LUFS</span>
                  </div>
                ))}
              </div>
              <p className="text-[8px] mt-2" style={{ color: '#374151' }}>
                Bar = integrated (full session) · White line = momentary (400ms)
              </p>
            </div>
          )}
        </div>

        {PRESETS.map((preset, i) => (
          <button
            key={preset.label}
            onClick={() => setActivePreset(activePreset === i ? null : i)}
            className="flex-1 text-[8px] font-mono rounded cursor-pointer transition-colors"
            style={{
              padding: '2px 0',
              background: activePreset === i ? `${preset.color}20` : 'rgba(255,255,255,0.04)',
              border: `1px solid ${activePreset === i ? preset.color : 'rgba(255,255,255,0.06)'}`,
              color: activePreset === i ? preset.color : '#4b5563',
            }}
            title={`${preset.label} target: ${preset.lufs} LUFS`}
          >
            {preset.label}
          </button>
        ))}
        <button
          onClick={() => { resetRef.current = true; }}
          className="text-[8px] font-mono rounded cursor-pointer transition-colors"
          style={{
            padding: '2px 5px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
            color: '#4b5563',
          }}
          title="Reset integrated LUFS"
        >
          ↺
        </button>
      </div>

      {/* LUFS bar */}
      <canvas
        ref={lufsCanvasRef}
        height={LUFS_H}
        className="w-full block rounded-sm"
        title="LUFS — integrated (bar) | momentary (white line)"
        style={{ imageRendering: 'pixelated' }}
      />

      {/* VU/dBFS bar */}
      <canvas
        ref={vuCanvasRef}
        height={VU_H}
        className="w-full block rounded-sm mt-0.5"
        title="Master level (dBFS) — red strip = clip"
        style={{ imageRendering: 'pixelated' }}
      />

      {/* dB scale labels */}
      <div className="relative mt-0.5" style={{ height: 10 }}>
        {DB_TICKS.map(({ db, frac }) => (
          <span
            key={db}
            className="absolute text-[7px] font-mono text-text-secondary leading-none"
            style={{ left: `${frac * 100}%`, transform: 'translateX(-50%)', top: 0 }}
          >
            {db === 0 ? '0' : db}
          </span>
        ))}
      </div>
    </div>
  );
}
