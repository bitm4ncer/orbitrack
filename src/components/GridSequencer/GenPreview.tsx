import { useEffect, useRef } from 'react';

interface GenPreviewProps {
  mode: string;
  color: string;
  params: any;
  height?: number;
}

const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 100, g: 100, b: 100 };
};

const drawRandom = (ctx: CanvasRenderingContext2D, w: number, h: number, color: string, params: any) => {
  const rgb = hexToRgb(color);
  ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.7)`;

  // Seeded random for consistency
  const seed = (params?.density || 0.5) * 1000 + (params?.variation || 0) * 100;
  const pseudoRandom = (i: number) => Math.sin(seed + i * 12.9898) * 0.5 + 0.5;

  const density = params?.density || 0.5;
  const dotCount = Math.ceil(density * 12);

  for (let i = 0; i < dotCount; i++) {
    const x = (pseudoRandom(i * 2) * w * 0.8) + w * 0.1;
    const y = (pseudoRandom(i * 2 + 1) * h * 0.8) + h * 0.1;
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  }
};

const drawScale = (ctx: CanvasRenderingContext2D, w: number, h: number, color: string, params: any) => {
  const rgb = hexToRgb(color);
  ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.8)`;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';

  const steps = 8;
  const descending = params?.descending || false;

  ctx.beginPath();
  for (let i = 0; i < steps; i++) {
    const x = (i / (steps - 1)) * w;
    const y = descending ? (i / (steps - 1)) * h * 0.7 + h * 0.15 : h * 0.85 - (i / (steps - 1)) * h * 0.7;

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
};

const drawChords = (ctx: CanvasRenderingContext2D, w: number, h: number, color: string, params: any) => {
  const rgb = hexToRgb(color);
  ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.6)`;

  const chordCount = 4;
  const voicing = params?.voicing || 'root';

  for (let i = 0; i < chordCount; i++) {
    const x = (i / chordCount) * w + w / (chordCount * 2);
    const barWidth = (w / chordCount) * 0.6;
    const notes = voicing === 'close' ? 2 : voicing === 'wide' ? 4 : 3;

    for (let j = 0; j < notes; j++) {
      const dotY = h * 0.8 - (j / (notes - 1)) * (h * 0.6);
      ctx.fillRect(x - barWidth / 2, dotY - 2, barWidth, 4);
    }
  }
};

const drawBass = (ctx: CanvasRenderingContext2D, w: number, h: number, color: string, params: any) => {
  const rgb = hexToRgb(color);
  ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.7)`;

  const style = params?.style || 'root';
  const notes = style === 'walk' ? 6 : style === 'octave' ? 4 : style === 'acid' ? 5 : 4;

  for (let i = 0; i < notes; i++) {
    const x = (i / (notes - 1)) * w * 0.8 + w * 0.1;
    let y = h * 0.8;

    if (style === 'octave' && i % 2 === 1) y = h * 0.3;
    else if (style === 'walk') y = h * 0.7 - (i / notes) * h * 0.4;
    else if (style === 'acid') y = h * 0.75 - Math.sin((i / notes) * Math.PI) * h * 0.4;

    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
};

const drawDrums = (ctx: CanvasRenderingContext2D, w: number, h: number, color: string, params: any) => {
  const rgb = hexToRgb(color);
  ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.7)`;

  const genre = params?.rhythm || 'four-on-floor';
  const seed = genre.charCodeAt(0) + (params?.density || 0.5) * 100;
  const pseudoRandom = (i: number) => Math.sin(seed + i * 12.9898) * 0.5 + 0.5;

  const beatCount = 16;
  const dotSize = 2;

  for (let i = 0; i < beatCount; i++) {
    const x = (i / beatCount) * w;
    let y: number;

    if (i % 4 === 0) y = h * 0.3; // kick
    else if (i % 8 === 4) y = h * 0.5; // snare
    else if (pseudoRandom(i) > 0.6) y = h * 0.7; // hats
    else continue;

    ctx.beginPath();
    ctx.arc(x, y, dotSize, 0, Math.PI * 2);
    ctx.fill();
  }
};

const drawArp = (ctx: CanvasRenderingContext2D, w: number, h: number, color: string, params: any) => {
  const rgb = hexToRgb(color);
  ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.8)`;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';

  const pattern = params?.arpPattern || 'up';
  const steps = 12;

  ctx.beginPath();
  for (let i = 0; i < steps; i++) {
    const x = (i / steps) * w;
    let y: number;

    if (pattern === 'up') {
      y = h * 0.8 - (i % 4) / 3 * h * 0.6;
    } else if (pattern === 'down') {
      y = h * 0.2 + (i % 4) / 3 * h * 0.6;
    } else if (pattern === 'updown') {
      const phase = (i % 8) / 8;
      y = phase < 0.5
        ? h * 0.8 - (phase * 2) * h * 0.6
        : h * 0.2 + ((phase - 0.5) * 2) * h * 0.6;
    } else {
      y = h * 0.5 + Math.sin((i / steps) * Math.PI * 4) * h * 0.3;
    }

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
};

export function GenPreview({ mode, color, params, height = 56 }: GenPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const w = canvasRef.current.width;
    const h = canvasRef.current.height;

    // Clear with subtle background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, w, h);

    switch (mode.toLowerCase()) {
      case 'random':
        drawRandom(ctx, w, h, color, params);
        break;
      case 'scale':
        drawScale(ctx, w, h, color, params);
        break;
      case 'chords':
        drawChords(ctx, w, h, color, params);
        break;
      case 'bass':
        drawBass(ctx, w, h, color, params);
        break;
      case 'rhythm':
      case 'drums':
        drawDrums(ctx, w, h, color, params);
        break;
      case 'arp':
      case 'arpeggio':
        drawArp(ctx, w, h, color, params);
        break;
      default:
        break;
    }
  }, [mode, color, params]);

  return (
    <canvas
      ref={canvasRef}
      width={300}
      height={height}
      className="w-full border-b border-border/50"
      style={{ imageRendering: 'crisp-edges' }}
    />
  );
}
