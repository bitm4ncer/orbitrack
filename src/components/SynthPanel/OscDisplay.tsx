import { useEffect, useRef } from 'react';
import { sampleWaveShape } from '../../audio/synth/wavetables';
import { sampleWTWaveShape } from '../../audio/synth/wavetableEngine';

const H = 64;

function ySample(t: number, shape: string, wtPosition?: number): number {
  if (shape.startsWith('wt:')) {
    return sampleWTWaveShape(shape.slice(3), wtPosition ?? 0, t);
  }
  switch (shape) {
    case 'sine':     return Math.sin(t * Math.PI * 2);
    case 'triangle': return 1 - 4 * Math.abs(t - Math.round(t));
    case 'square':   return t < 0.5 ? 1 : -1;
    case 'sawtooth': return 2 * (t - Math.floor(t + 0.5));
    default:         return sampleWaveShape(t, shape);
  }
}

// Per-shape peak amplitude cache (for normalization in display)
const peakCache = new Map<string, number>();
function getPeak(shape: string, wtPosition?: number): number {
  const key = shape.startsWith('wt:')
    ? `${shape}:${Math.round((wtPosition ?? 0) * 256)}`
    : shape;
  if (peakCache.has(key)) return peakCache.get(key)!;
  let peak = 0;
  const steps = 512;
  for (let i = 0; i < steps; i++) {
    const v = Math.abs(ySample(i / steps, shape, wtPosition));
    if (v > peak) peak = v;
  }
  const p = Math.max(0.001, peak);
  // Limit cache for WT shapes (they vary by position)
  if (shape.startsWith('wt:') && peakCache.size > 64) {
    const firstKey = peakCache.keys().next().value;
    if (firstKey !== undefined) peakCache.delete(firstKey);
  }
  peakCache.set(key, p);
  return p;
}

interface Props {
  waveType: string;
  color:    string;
  wtPosition?: number;
}

export function OscDisplay({ waveType, color, wtPosition }: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas    = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const W = container.clientWidth || 260;
    canvas.width  = W;
    canvas.height = H;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const peak = getPeak(waveType, wtPosition);
    const pad  = 4;

    // Background
    ctx.fillStyle = '#0e0e18';
    ctx.fillRect(0, 0, W, H);

    // Center line
    ctx.strokeStyle = '#2a2a3a';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();

    // Waveform fill
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    for (let i = 0; i <= W; i++) {
      const t = i / W;
      const y = H / 2 - (ySample(t, waveType, wtPosition) / peak) * (H / 2 - pad);
      ctx.lineTo(i, y);
    }
    ctx.lineTo(W, H / 2);
    ctx.closePath();
    ctx.fillStyle = `${color}18`;
    ctx.fill();

    // Waveform stroke
    ctx.beginPath();
    for (let i = 0; i <= W; i++) {
      const t = i / W;
      const y = H / 2 - (ySample(t, waveType, wtPosition) / peak) * (H / 2 - pad);
      i === 0 ? ctx.moveTo(i, y) : ctx.lineTo(i, y);
    }
    ctx.strokeStyle = `${color}cc`;
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';
    ctx.stroke();
  }, [waveType, color, wtPosition]);

  return (
    <div ref={containerRef} className="w-full rounded overflow-hidden" style={{ height: H }}>
      <canvas
        ref={canvasRef}
        height={H}
        className="w-full block"
        style={{ imageRendering: 'pixelated' }}
      />
    </div>
  );
}
