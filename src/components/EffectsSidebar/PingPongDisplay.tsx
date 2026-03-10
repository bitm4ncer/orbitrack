import { useEffect, useRef, useCallback } from 'react';

interface Props {
  time: number;     // delay time in seconds
  feedback: number; // 0–0.9
  color: string;
}

const W = 240;
const H = 64;
const MAX_ECHOES = 8;

export function PingPongDisplay({ time, feedback, color }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);
  const propsRef  = useRef({ time, feedback, color });
  useEffect(() => { propsRef.current = { time, feedback, color }; });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { time: t, feedback: fb, color: col } = propsRef.current;

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#0e0e18';
    ctx.fillRect(0, 0, W, H);

    // L / R labels
    ctx.fillStyle = `${col}50`;
    ctx.font = '8px monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText('L', 2, H * 0.25);
    ctx.fillText('R', 2, H * 0.75);

    // Center divider
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.strokeStyle = '#2a2a3a';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Echo dots + bounce lines
    // Fixed 2s window so dot spacing visually reflects the time knob
    const totalTime = 2.0;
    const timeToX   = (ts: number) => 12 + (ts / totalTime) * (W - 24);

    const points: { x: number; y: number; amp: number }[] = [];
    let amp = 1;
    for (let i = 0; i < MAX_ECHOES; i++) {
      const ts = (i + 1) * t;
      const x  = timeToX(ts);
      const y  = i % 2 === 0 ? H * 0.25 : H * 0.75;
      points.push({ x, y, amp });
      amp *= fb;
      if (amp < 0.01) break;
    }

    // Bounce path
    if (points.length > 1) {
      ctx.beginPath();
      ctx.moveTo(timeToX(0), H / 2);
      for (const pt of points) {
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.strokeStyle = `${col}30`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Echo dots
    for (const pt of points) {
      const r = Math.max(2, pt.amp * 5);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
      ctx.fillStyle = `${col}${Math.round(pt.amp * 200 + 55).toString(16).padStart(2, '0')}`;
      ctx.fill();
    }

    // Input dot
    ctx.beginPath();
    ctx.arc(timeToX(0), H / 2, 3, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();

    rafRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      style={{ width: W, height: H, display: 'block', borderRadius: 4 }}
    />
  );
}
