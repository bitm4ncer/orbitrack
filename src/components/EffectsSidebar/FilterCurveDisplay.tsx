import { useEffect, useRef } from 'react';
import { getAudioContext } from 'superdough';

const N_FREQS = 200;
const MIN_FREQ = 20;
const MAX_FREQ = 20000;
const DB_MIN = -48;
const DB_MAX = 12;
const H = 64;

const FILTER_TYPES: BiquadFilterType[] = ['lowpass', 'highpass', 'bandpass', 'notch'];
const GRID_FREQS = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

const FREQS = new Float32Array(N_FREQS).map((_, i) =>
  MIN_FREQ * Math.pow(MAX_FREQ / MIN_FREQ, i / (N_FREQS - 1))
);

function freqToX(f: number, W: number): number {
  return (Math.log10(f / MIN_FREQ) / Math.log10(MAX_FREQ / MIN_FREQ)) * W;
}

function dbToY(db: number): number {
  return H - ((db - DB_MIN) / (DB_MAX - DB_MIN)) * H;
}

interface FilterCurveDisplayProps {
  filterType: number;
  frequency: number;
  q: number;
  color: string;
}

export function FilterCurveDisplay({ filterType, frequency, q, color }: FilterCurveDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const render = () => {
      const W = Math.round(container.clientWidth) || 260;
      canvas.width = W;
      canvas.height = H;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      let ac: AudioContext;
      try {
        ac = getAudioContext() as AudioContext;
      } catch {
        return;
      }

      const mag   = new Float32Array(N_FREQS);
      const phase = new Float32Array(N_FREQS);

      try {
        const filter = ac.createBiquadFilter();
        filter.type = FILTER_TYPES[filterType] ?? 'lowpass';
        filter.frequency.value = frequency;
        filter.Q.value = q;
        filter.getFrequencyResponse(FREQS, mag, phase);
      } catch {
        return;
      }

      const dbValues = new Float32Array(N_FREQS);
      for (let i = 0; i < N_FREQS; i++) {
        dbValues[i] = 20 * Math.log10(Math.max(mag[i], 1e-9));
      }

      ctx.clearRect(0, 0, W, H);

      // Background
      ctx.fillStyle = '#0e0e18';
      ctx.fillRect(0, 0, W, H);

      // dB grid
      ctx.strokeStyle = '#2a2a3a';
      ctx.lineWidth = 1;
      for (const db of [-36, -24, -12, 0]) {
        const y = Math.round(dbToY(db)) + 0.5;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      // Freq grid
      ctx.strokeStyle = '#222232';
      for (const f of GRID_FREQS) {
        const x = Math.round(freqToX(f, W)) + 0.5;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }

      // 0 dB line
      const y0 = Math.round(dbToY(0)) + 0.5;
      ctx.strokeStyle = '#3a3a55';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(W, y0); ctx.stroke();

      // Cutoff marker
      const xCutoff = freqToX(frequency, W);
      ctx.strokeStyle = `${color}40`;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(xCutoff, 0); ctx.lineTo(xCutoff, H); ctx.stroke();
      ctx.setLineDash([]);

      // Curve fill
      ctx.beginPath();
      ctx.moveTo(0, dbToY(dbValues[0]));
      for (let i = 1; i < N_FREQS; i++) {
        ctx.lineTo(freqToX(FREQS[i], W), dbToY(dbValues[i]));
      }
      ctx.lineTo(W, y0);
      ctx.lineTo(0, y0);
      ctx.closePath();
      ctx.fillStyle = `${color}22`;
      ctx.fill();

      // Curve stroke
      ctx.beginPath();
      ctx.moveTo(0, dbToY(dbValues[0]));
      for (let i = 1; i < N_FREQS; i++) {
        ctx.lineTo(freqToX(FREQS[i], W), dbToY(dbValues[i]));
      }
      ctx.strokeStyle = `${color}cc`;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.stroke();

      // dB labels
      ctx.fillStyle = '#4a4a60';
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      for (const db of [-24, -12, 0]) {
        const y = dbToY(db);
        if (y > 6 && y < H - 2) {
          ctx.fillText(`${db}`, W - 2, y + 3);
        }
      }
    };

    render();

    const ro = new ResizeObserver(() => render());
    ro.observe(container);
    return () => ro.disconnect();
  }, [filterType, frequency, q, color]);

  return (
    <div ref={containerRef} className="w-full rounded overflow-hidden" style={{ height: H }}>
      <canvas
        ref={canvasRef}
        height={H}
        className="block"
        style={{ imageRendering: 'pixelated' }}
      />
    </div>
  );
}
