import { useEffect, useRef } from 'react';
import { getMasterAnalyser } from '../../audio/routingEngine';

export function VUMeter() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const peakRef = useRef<{ level: number; holdFrames: number }>({ level: 0, holdFrames: 0 });
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const analyser = getMasterAnalyser();
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, W, H);

      if (!analyser) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const data = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(data);

      // RMS calculation
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length);
      const db = 20 * Math.log10(Math.max(rms, 1e-6));

      // Map -60dB → 0dB to 0 → H
      const level = Math.max(0, Math.min(1, (db + 60) / 60));
      const barH = Math.round(level * H);

      // Peak hold
      const peak = peakRef.current;
      if (level > peak.level) {
        peak.level = level;
        peak.holdFrames = 60;
      } else if (peak.holdFrames > 0) {
        peak.holdFrames--;
      } else {
        peak.level = Math.max(0, peak.level - 0.005);
      }

      // Draw gradient bar (bottom to top)
      const gradient = ctx.createLinearGradient(0, H, 0, 0);
      gradient.addColorStop(0, '#22c55e');    // green
      gradient.addColorStop(0.7, '#22c55e');
      gradient.addColorStop(0.85, '#f59e0b'); // amber
      gradient.addColorStop(1, '#ef4444');     // red

      ctx.fillStyle = gradient;
      ctx.fillRect(0, H - barH, W, barH);

      // Tick marks
      ctx.fillStyle = '#0f172a';
      for (let i = 1; i < 6; i++) {
        const y = Math.round(H * (i / 6));
        ctx.fillRect(0, y, W, 1);
      }

      // Peak indicator
      const peakY = Math.round(H - peak.level * H);
      ctx.fillStyle = peak.level > 0.9 ? '#ef4444' : '#f8fafc';
      ctx.fillRect(0, peakY, W, 2);

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={12}
      height={80}
      className="rounded-sm"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
