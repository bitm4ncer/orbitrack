import { useEffect, useRef } from 'react';
import { getAudioContext } from 'superdough';
import { getOrbitAnalyser } from '../../audio/orbitEffects';

const N_FREQS  = 200;
const MIN_FREQ = 20;
const MAX_FREQ = 20000;
const DB_RANGE = 18; // ±18 dB display range
const H        = 64;

// Log-spaced frequency array (computed once)
const FREQS = new Float32Array(N_FREQS).map((_, i) =>
  MIN_FREQ * Math.pow(MAX_FREQ / MIN_FREQ, i / (N_FREQS - 1))
);

// Major grid frequencies to draw vertical lines
const GRID_FREQS = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

function freqToX(f: number, W: number): number {
  return (Math.log10(f / MIN_FREQ) / Math.log10(MAX_FREQ / MIN_FREQ)) * W;
}

function dbToY(db: number): number {
  return H / 2 - (db / DB_RANGE) * (H / 2);
}

interface EQCurveDisplayProps {
  orbitIndex: number;
  lowGain:    number;
  midGain:    number;
  highGain:   number;
  lowFreq:    number;
  midFreq:    number;
  midQ:       number;
  highFreq:   number;
  color:      string;
}

export function EQCurveDisplay({
  orbitIndex,
  lowGain, midGain, highGain, lowFreq, midFreq, midQ, highFreq, color,
}: EQCurveDisplayProps) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const paramsRef    = useRef({ lowGain, midGain, highGain, lowFreq, midFreq, midQ, highFreq });
  const rafRef       = useRef(0);
  const frameRef     = useRef(0);

  // Keep paramsRef in sync without remounting the rAF loop
  useEffect(() => {
    paramsRef.current = { lowGain, midGain, highGain, lowFreq, midFreq, midQ, highFreq };
  });

  useEffect(() => {
    const canvas    = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const W = container.clientWidth || 260;
    canvas.width  = W;
    canvas.height = H;

    const magLow   = new Float32Array(N_FREQS);
    const magMid   = new Float32Array(N_FREQS);
    const magHigh  = new Float32Array(N_FREQS);
    const phaseBuf = new Float32Array(N_FREQS);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);

      // Throttle to ~30 fps
      frameRef.current++;
      if (frameRef.current % 2 !== 0) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const { lowGain: lg, midGain: mg, highGain: hg,
              lowFreq: lf, midFreq: mf, midQ: mq, highFreq: hf } = paramsRef.current;

      ctx.clearRect(0, 0, W, H);

      // Background
      ctx.fillStyle = '#0e0e18';
      ctx.fillRect(0, 0, W, H);

      // ── Live FFT spectrum ──────────────────────────────────────────────────
      const analyser = getOrbitAnalyser(orbitIndex);
      if (analyser) {
        const binCount = analyser.frequencyBinCount;
        const buf      = new Uint8Array(binCount);
        analyser.getByteFrequencyData(buf);
        const nyquist = analyser.context.sampleRate / 2;

        ctx.beginPath();
        ctx.moveTo(0, H);
        for (let i = 1; i < binCount; i++) {
          const freq = (i / binCount) * nyquist;
          if (freq < MIN_FREQ || freq > MAX_FREQ) continue;
          const x = freqToX(freq, W);
          const y = H - (buf[i] / 255) * H;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(W, H);
        ctx.closePath();
        ctx.fillStyle = `${color}20`;
        ctx.fill();
      }

      // ── dB grid lines ──────────────────────────────────────────────────────
      ctx.strokeStyle = '#2a2a3a';
      ctx.lineWidth   = 1;
      for (const db of [-12, -6, 0, 6, 12]) {
        const y = Math.round(dbToY(db)) + 0.5;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      // Frequency grid lines
      ctx.strokeStyle = '#222232';
      for (const f of GRID_FREQS) {
        const x = Math.round(freqToX(f, W)) + 0.5;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }

      // 0 dB line (brighter)
      const y0 = Math.round(dbToY(0)) + 0.5;
      ctx.strokeStyle = '#3a3a55';
      ctx.lineWidth   = 1;
      ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(W, y0); ctx.stroke();

      // ── EQ curve (static per current params) ──────────────────────────────
      let ac: AudioContext | null = null;
      try { ac = getAudioContext() as AudioContext; } catch { /* ignore */ }

      if (ac) {
        try {
          const fLow = ac.createBiquadFilter();
          fLow.type = 'lowshelf';
          fLow.frequency.value = lf;
          fLow.gain.value      = lg;
          fLow.getFrequencyResponse(FREQS, magLow, phaseBuf);

          const fMid = ac.createBiquadFilter();
          fMid.type = 'peaking';
          fMid.frequency.value = mf;
          fMid.Q.value         = mq;
          fMid.gain.value      = mg;
          fMid.getFrequencyResponse(FREQS, magMid, phaseBuf);

          const fHigh = ac.createBiquadFilter();
          fHigh.type = 'highshelf';
          fHigh.frequency.value = hf;
          fHigh.gain.value      = hg;
          fHigh.getFrequencyResponse(FREQS, magHigh, phaseBuf);
        } catch { /* ignore */ }

        const dbCombined = new Float32Array(N_FREQS);
        for (let i = 0; i < N_FREQS; i++) {
          const linMag = magLow[i] * magMid[i] * magHigh[i];
          dbCombined[i] = 20 * Math.log10(Math.max(linMag, 1e-9));
        }

        // Curve fill
        ctx.beginPath();
        ctx.moveTo(0, dbToY(dbCombined[0]));
        for (let i = 1; i < N_FREQS; i++) {
          ctx.lineTo(freqToX(FREQS[i], W), dbToY(dbCombined[i]));
        }
        ctx.lineTo(W, y0);
        ctx.lineTo(0, y0);
        ctx.closePath();
        ctx.fillStyle = `${color}22`;
        ctx.fill();

        // Curve stroke
        ctx.beginPath();
        ctx.moveTo(0, dbToY(dbCombined[0]));
        for (let i = 1; i < N_FREQS; i++) {
          ctx.lineTo(freqToX(FREQS[i], W), dbToY(dbCombined[i]));
        }
        ctx.strokeStyle = `${color}cc`;
        ctx.lineWidth   = 1.5;
        ctx.lineJoin    = 'round';
        ctx.stroke();
      }

      // dB labels on right edge
      ctx.fillStyle    = '#4a4a60';
      ctx.font         = '9px monospace';
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'alphabetic';
      for (const db of [-12, 0, 12]) {
        const y = dbToY(db);
        if (y > 6 && y < H - 2) {
          ctx.fillText(db === 0 ? '0' : `${db > 0 ? '+' : ''}${db}`, W - 2, y + 3);
        }
      }
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [orbitIndex, color]);

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
