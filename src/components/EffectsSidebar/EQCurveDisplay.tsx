import { useEffect, useRef } from 'react';
import { getAudioContext } from 'superdough';

const N_FREQS = 200;
const MIN_FREQ = 20;
const MAX_FREQ = 20000;
const DB_RANGE = 18; // ±18 dB display range
const H = 64;

// Log-spaced frequency array (computed once)
const FREQS = new Float32Array(N_FREQS).map((_, i) =>
  MIN_FREQ * Math.pow(MAX_FREQ / MIN_FREQ, i / (N_FREQS - 1))
);

// Major grid frequencies to draw vertical lines
const GRID_FREQS = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

function freqToX(f: number, W: number): number {
  return (Math.log10(f / MIN_FREQ) / Math.log10(MAX_FREQ / MIN_FREQ)) * W;
}

function dbToY(db: number, H: number): number {
  return H / 2 - (db / DB_RANGE) * (H / 2);
}

interface EQCurveDisplayProps {
  lowGain: number;
  midGain: number;
  highGain: number;
  lowFreq: number;
  midFreq: number;
  highFreq: number;
  color: string;
}

export function EQCurveDisplay({
  lowGain, midGain, highGain, lowFreq, midFreq, highFreq, color,
}: EQCurveDisplayProps) {
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

    // Use AudioContext to get accurate filter frequency responses
    let ac: AudioContext;
    try {
      ac = getAudioContext() as AudioContext;
    } catch {
      return;
    }

    const magLow   = new Float32Array(N_FREQS);
    const magMid   = new Float32Array(N_FREQS);
    const magHigh  = new Float32Array(N_FREQS);
    const phase    = new Float32Array(N_FREQS); // unused but required

    try {
      const fLow = ac.createBiquadFilter();
      fLow.type = 'lowshelf';
      fLow.frequency.value = lowFreq;
      fLow.gain.value = lowGain;
      fLow.getFrequencyResponse(FREQS, magLow, phase);

      const fMid = ac.createBiquadFilter();
      fMid.type = 'peaking';
      fMid.frequency.value = midFreq;
      fMid.Q.value = 1;
      fMid.gain.value = midGain;
      fMid.getFrequencyResponse(FREQS, magMid, phase);

      const fHigh = ac.createBiquadFilter();
      fHigh.type = 'highshelf';
      fHigh.frequency.value = highFreq;
      fHigh.gain.value = highGain;
      fHigh.getFrequencyResponse(FREQS, magHigh, phase);
    } catch {
      return;
    }

    // Combined response: multiply linear magnitudes (= add in dB)
    const dbCombined = new Float32Array(N_FREQS);
    for (let i = 0; i < N_FREQS; i++) {
      const linMag = magLow[i] * magMid[i] * magHigh[i];
      dbCombined[i] = 20 * Math.log10(Math.max(linMag, 1e-9));
    }

    // --- Draw ---
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#0e0e18';
    ctx.fillRect(0, 0, W, H);

    // dB grid lines
    ctx.strokeStyle = '#2a2a3a';
    ctx.lineWidth = 1;
    for (const db of [-12, -6, 0, 6, 12]) {
      const y = Math.round(dbToY(db, H)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Frequency grid lines
    ctx.strokeStyle = '#222232';
    for (const f of GRID_FREQS) {
      const x = Math.round(freqToX(f, W)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }

    // 0 dB line (brighter)
    const y0 = Math.round(dbToY(0, H)) + 0.5;
    ctx.strokeStyle = '#3a3a55';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y0);
    ctx.lineTo(W, y0);
    ctx.stroke();

    // Curve fill (semi-transparent)
    ctx.beginPath();
    ctx.moveTo(0, dbToY(dbCombined[0], H));
    for (let i = 1; i < N_FREQS; i++) {
      ctx.lineTo(freqToX(FREQS[i], W), dbToY(dbCombined[i], H));
    }
    ctx.lineTo(W, y0);
    ctx.lineTo(0, y0);
    ctx.closePath();
    ctx.fillStyle = `${color}22`;
    ctx.fill();

    // Curve stroke
    ctx.beginPath();
    ctx.moveTo(0, dbToY(dbCombined[0], H));
    for (let i = 1; i < N_FREQS; i++) {
      ctx.lineTo(freqToX(FREQS[i], W), dbToY(dbCombined[i], H));
    }
    ctx.strokeStyle = `${color}cc`;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // dB labels on right edge
    ctx.fillStyle = '#4a4a60';
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    for (const db of [-12, 0, 12]) {
      const y = dbToY(db, H);
      if (y > 6 && y < H - 2) {
        ctx.fillText(db === 0 ? '0' : `${db > 0 ? '+' : ''}${db}`, W - 2, y + 3);
      }
    }

  }, [lowGain, midGain, highGain, lowFreq, midFreq, highFreq, color]);

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
