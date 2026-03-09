import { useEffect, useRef } from 'react';
import { getMasterAnalyser } from '../../audio/routingEngine';

const HOLD_FRAMES = 120;
const DECAY_RATE = 0.003;
const CLIP_FLASH_FRAMES = 45;
const CANVAS_H = 18;
const CLIP_W = 4; // rightmost pixels reserved for clip indicator

// dB ticks shown on the scale — positions are fractions of the meter width (0 = -60dB, 1 = 0dB)
const DB_TICKS = [-60, -48, -36, -24, -18, -12, -6, 0].map((db) => ({
  db,
  frac: (db + 60) / 60,
}));

export function VUMeter() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ level: 0, peakLevel: 0, peakHoldFrames: 0, clipFlashFrames: 0 });
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // Set canvas buffer to match its CSS display width
    const W = container.clientWidth || 220;
    canvas.width = W;
    canvas.height = CANVAS_H;
    const meterW = W - CLIP_W; // usable meter width (excl. clip strip on right)

    const draw = () => {
      const analyser = getMasterAnalyser();
      const ctx = canvas.getContext('2d');
      if (!ctx) { rafRef.current = requestAnimationFrame(draw); return; }

      const s = stateRef.current;

      if (!analyser) {
        ctx.fillStyle = '#0c0c14';
        ctx.fillRect(0, 0, W, CANVAS_H);
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      // --- Read level ---
      const data = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(data);

      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length);
      const db = 20 * Math.log10(Math.max(rms, 1e-9));
      const level = Math.max(0, Math.min(1, (db + 60) / 60));

      // Fast attack, slow release
      s.level = level > s.level ? level : Math.max(0, s.level - 0.02);

      // Peak hold
      if (level >= s.peakLevel) {
        s.peakLevel = level;
        s.peakHoldFrames = HOLD_FRAMES;
      } else if (s.peakHoldFrames > 0) {
        s.peakHoldFrames--;
      } else {
        s.peakLevel = Math.max(0, s.peakLevel - DECAY_RATE);
      }

      // Clip detection
      if (level >= 0.999) {
        s.clipFlashFrames = CLIP_FLASH_FRAMES;
      } else if (s.clipFlashFrames > 0) {
        s.clipFlashFrames--;
      }

      // --- Draw ---
      ctx.fillStyle = '#0c0c14';
      ctx.fillRect(0, 0, W, CANVAS_H);

      // Background trough
      ctx.fillStyle = '#1a1a28';
      ctx.fillRect(0, 1, meterW, CANVAS_H - 2);

      // Level bar (left → right)
      const barW = Math.round(s.level * meterW);
      if (barW > 0) {
        const gradient = ctx.createLinearGradient(0, 0, meterW, 0);
        gradient.addColorStop(0,    '#16a34a'); // dark green
        gradient.addColorStop(0.55, '#22c55e'); // green
        gradient.addColorStop(0.75, '#f59e0b'); // amber
        gradient.addColorStop(0.88, '#f97316'); // orange
        gradient.addColorStop(1.0,  '#ef4444'); // red
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 1, barW, CANVAS_H - 2);
      }

      // dB tick lines (dark notches)
      ctx.fillStyle = '#0c0c14';
      for (const { frac } of DB_TICKS) {
        const x = Math.round(frac * meterW);
        if (x > 0 && x < meterW) {
          ctx.fillRect(x, 0, 1, CANVAS_H);
        }
      }

      // Peak hold indicator (vertical line)
      if (s.peakLevel > 0.01) {
        const peakX = Math.round(s.peakLevel * meterW);
        ctx.fillStyle = s.peakLevel > 0.9 ? '#ef4444' : '#cbd5e1';
        ctx.fillRect(peakX, 0, 2, CANVAS_H);
      }

      // Clip indicator strip (rightmost pixels)
      ctx.fillStyle = s.clipFlashFrames > 0 ? '#ef4444' : '#1e293b';
      ctx.fillRect(meterW, 0, CLIP_W, CANVAS_H);

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div ref={containerRef} className="w-full">
      {/* Meter canvas */}
      <canvas
        ref={canvasRef}
        height={CANVAS_H}
        className="w-full block rounded-sm"
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
