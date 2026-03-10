import { useEffect, useRef } from 'react';

const H = 52;

interface EnvelopeDisplayProps {
  attack: number;   // 0–2s
  decay: number;    // 0–2s
  sustain: number;  // 0–1
  release: number;  // 0–2s
  color: string;
}

export function EnvelopeDisplay({ attack, decay, sustain, release, color }: EnvelopeDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const W = container.clientWidth || 260;
    canvas.width = W;
    canvas.height = H;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#0e0e18';
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 1;
    for (const y of [H * 0.25, H * 0.5, H * 0.75]) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Segment widths (normalize so total = W, min 6px each)
    const total = attack + decay + 0.18 + release; // 0.18 = sustain hold visual segment
    const pad = 8;
    const usable = W - pad * 2;

    const wa = Math.max(6, (attack / total) * usable);
    const wd = Math.max(6, (decay / total) * usable);
    const ws = Math.max(6, (0.18 / total) * usable);
    const wr = Math.max(6, (release / total) * usable);

    const x0 = pad;
    const x1 = x0 + wa; // end of attack
    const x2 = x1 + wd; // end of decay
    const x3 = x2 + ws; // end of sustain hold
    const x4 = Math.min(W - pad, x3 + wr); // end of release

    const yTop  = 4;
    const yBot  = H - 4;
    const ySus  = yTop + (1 - sustain) * (yBot - yTop);

    // Draw envelope shape
    ctx.beginPath();
    ctx.moveTo(x0, yBot);
    ctx.lineTo(x1, yTop);       // attack — rise to peak
    ctx.lineTo(x2, ySus);       // decay — fall to sustain
    ctx.lineTo(x3, ySus);       // sustain hold
    ctx.lineTo(x4, yBot);       // release — fall to 0

    // Fill
    ctx.lineTo(x4, yBot);
    ctx.lineTo(x0, yBot);
    ctx.closePath();
    ctx.fillStyle = `${color}22`;
    ctx.fill();

    // Stroke
    ctx.beginPath();
    ctx.moveTo(x0, yBot);
    ctx.lineTo(x1, yTop);
    ctx.lineTo(x2, ySus);
    ctx.lineTo(x3, ySus);
    ctx.lineTo(x4, yBot);
    ctx.strokeStyle = `${color}cc`;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Segment labels
    ctx.fillStyle = `${color}66`;
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('A', x0 + wa / 2, H - 1);
    ctx.fillText('D', x1 + wd / 2, H - 1);
    ctx.fillText('S', x2 + ws / 2, H - 1);
    ctx.fillText('R', x3 + (x4 - x3) / 2, H - 1);

  }, [attack, decay, sustain, release, color]);

  return (
    <div ref={containerRef} className="w-full rounded overflow-hidden" style={{ height: H }}>
      <canvas ref={canvasRef} height={H} className="w-full block" style={{ imageRendering: 'pixelated' }} />
    </div>
  );
}
