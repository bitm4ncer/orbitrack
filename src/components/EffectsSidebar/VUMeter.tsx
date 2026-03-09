import { useEffect, useRef } from 'react';
import { getMasterAnalyser } from '../../audio/routingEngine';

const HOLD_FRAMES = 120; // ~2 seconds at 60fps
const DECAY_RATE = 0.003;
const CLIP_FLASH_FRAMES = 45; // how long the clip indicator stays red

export function VUMeter() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    level: 0,
    peakLevel: 0,
    peakHoldFrames: 0,
    clipFlashFrames: 0,
  });
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const analyser = getMasterAnalyser();
      const ctx = canvas.getContext('2d');
      if (!ctx) { rafRef.current = requestAnimationFrame(draw); return; }

      const W = canvas.width;
      const H = canvas.height;

      if (!analyser) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, W, H);
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const data = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(data);

      // RMS calculation
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length);
      const db = 20 * Math.log10(Math.max(rms, 1e-9));

      // Map -60dB → 0dB to 0 → 1
      const level = Math.max(0, Math.min(1, (db + 60) / 60));
      const s = stateRef.current;

      // Smooth meter (fast attack, slow release)
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

      // Clip detection (level >= 1.0 means 0dBFS or above)
      if (level >= 0.999) {
        s.clipFlashFrames = CLIP_FLASH_FRAMES;
      } else if (s.clipFlashFrames > 0) {
        s.clipFlashFrames--;
      }

      // --- Draw ---
      ctx.fillStyle = '#0c0c14';
      ctx.fillRect(0, 0, W, H);

      const meterH = H - 4; // leave 4px at top for clip indicator
      const meterY = 4;
      const barH = Math.round(s.level * meterH);

      // Background trough
      ctx.fillStyle = '#1e1e2e';
      ctx.fillRect(1, meterY, W - 2, meterH);

      // Gradient bar (bottom to top)
      const gradient = ctx.createLinearGradient(0, meterY + meterH, 0, meterY);
      gradient.addColorStop(0, '#22c55e');
      gradient.addColorStop(0.65, '#22c55e');
      gradient.addColorStop(0.8, '#f59e0b');
      gradient.addColorStop(0.92, '#f97316');
      gradient.addColorStop(1.0, '#ef4444');

      ctx.fillStyle = gradient;
      ctx.fillRect(1, meterY + meterH - barH, W - 2, barH);

      // dBFS tick marks (-48, -36, -24, -12, -6, 0)
      const ticks = [60, 48, 36, 24, 12, 6].map((v) => ({
        db: -v,
        y: meterY + Math.round(meterH * (1 - v / 60)),
      }));
      ctx.fillStyle = '#0c0c14';
      for (const { y } of ticks) {
        ctx.fillRect(0, y, W, 1);
      }

      // Peak hold indicator line
      if (s.peakLevel > 0.01) {
        const peakY = meterY + Math.round(meterH * (1 - s.peakLevel));
        ctx.fillStyle = s.peakLevel > 0.9 ? '#ef4444' : '#e2e8f0';
        ctx.fillRect(0, peakY, W, 2);
      }

      // Clip indicator strip (top 4px)
      ctx.fillStyle = s.clipFlashFrames > 0 ? '#ef4444' : '#1e293b';
      ctx.fillRect(0, 0, W, 3);

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={14}
      height={88}
      className="rounded-sm shrink-0"
      title="Master level (dBFS) — red strip = clip"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
