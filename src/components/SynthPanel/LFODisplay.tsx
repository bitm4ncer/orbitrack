import { useEffect, useRef } from 'react';
import type { LFOShape } from '../../audio/synth/types';
import { sampleLFOShape } from '../../audio/synth/modConstants';

const H = 22;

interface Props {
  shape: LFOShape;
  rate:  number; // Hz
  color: string;
}

export function LFODisplay({ shape, rate, color }: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef       = useRef(0);
  const propsRef     = useRef({ shape, rate, color });

  useEffect(() => { propsRef.current = { shape, rate, color }; }, [shape, rate, color]);

  useEffect(() => {
    const canvas    = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const W = container.clientWidth || 220;
    canvas.width  = W;
    canvas.height = H;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const { shape, rate, color } = propsRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = '#0e0e18';
      ctx.fillRect(0, 0, W, H);

      const pad = 3;

      // Waveform fill
      ctx.beginPath();
      ctx.moveTo(0, H / 2);
      for (let i = 0; i <= W; i++) {
        const t = i / W;
        const y = H / 2 - sampleLFOShape(t, shape) * (H / 2 - pad);
        ctx.lineTo(i, y);
      }
      ctx.lineTo(W, H / 2);
      ctx.closePath();
      ctx.fillStyle = `${color}12`;
      ctx.fill();

      // Waveform stroke
      ctx.beginPath();
      for (let i = 0; i <= W; i++) {
        const t = i / W;
        const y = H / 2 - sampleLFOShape(t, shape) * (H / 2 - pad);
        i === 0 ? ctx.moveTo(i, y) : ctx.lineTo(i, y);
      }
      ctx.strokeStyle = `${color}55`;
      ctx.lineWidth   = 1;
      ctx.stroke();

      // Phase position (wraps based on wall clock × LFO rate)
      const phase  = (performance.now() / 1000 * rate) % 1;
      const phaseX = phase * W;
      const phaseY = H / 2 - sampleLFOShape(phase, shape) * (H / 2 - pad);

      // Glowing scan line
      ctx.save();
      ctx.filter = 'blur(4px)';
      ctx.strokeStyle = `${color}60`;
      ctx.lineWidth   = 4;
      ctx.beginPath();
      ctx.moveTo(phaseX, 0);
      ctx.lineTo(phaseX, H);
      ctx.stroke();
      ctx.restore();

      ctx.strokeStyle = `${color}38`;
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(phaseX, 0);
      ctx.lineTo(phaseX, H);
      ctx.stroke();

      // Phase dot at current waveform value
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(phaseX, phaseY, 2.5, 0, Math.PI * 2);
      ctx.fill();
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []); // mount once; prop updates flow through propsRef

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
