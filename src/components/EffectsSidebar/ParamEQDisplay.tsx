import { useEffect, useRef } from 'react';
import { getAudioContext } from 'superdough';
import { getOrbitAnalyser, EQ_BAND_TYPES } from '../../audio/orbitEffects';

const N_FREQS  = 200;
const MIN_FREQ = 20;
const MAX_FREQ = 20000;
const DB_RANGE = 18; // ±18 dB display range
const H        = 100;

const FREQS = new Float32Array(N_FREQS).map((_, i) =>
  MIN_FREQ * Math.pow(MAX_FREQ / MIN_FREQ, i / (N_FREQS - 1)),
);
const GRID_FREQS = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

// Band type labels shown in the type-selector row
const TYPE_LABELS = ['LP', 'HP', 'Bell', 'LS', 'HS', 'Notch'];

// Types for which gain controls something (LP/HP/Notch have no gain knob meaning)
const HAS_GAIN = new Set([2, 3, 4]); // Bell, LS, HS

function freqToX(f: number, W: number): number {
  return (Math.log10(f / MIN_FREQ) / Math.log10(MAX_FREQ / MIN_FREQ)) * W;
}
function xToFreq(x: number, W: number): number {
  return MIN_FREQ * Math.pow(MAX_FREQ / MIN_FREQ, x / W);
}
function gainToY(db: number): number {
  return H / 2 - (db / DB_RANGE) * (H / 2);
}
function yToGain(y: number): number {
  return ((H / 2 - y) / (H / 2)) * DB_RANGE;
}
function yToQ(y: number): number {
  // Map y=0 → Q=10, y=H → Q=0.1 (log scale)
  const t = Math.max(0, Math.min(1, y / H));
  return Math.pow(10, -2 * t + 1); // 10^1 → 10^-1
}

export interface BandParam {
  type: number; // 0=LP 1=HP 2=Bell 3=LS 4=HS 5=Notch
  freq: number;
  gain: number;
  q:    number;
}

interface Props {
  orbitIndex: number;
  color:      string;
  bands:      BandParam[];
  onChange:   (bandIndex: number, key: 'type' | 'freq' | 'gain' | 'q', value: number) => void;
}

export function ParamEQDisplay({ orbitIndex, color, bands, onChange }: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const bandsRef     = useRef(bands);
  const rafRef       = useRef(0);
  const frameRef     = useRef(0);
  const dragRef      = useRef<{ band: number; startX: number; startY: number; startFreq: number; startGain: number; startQ: number } | null>(null);

  // Keep bandsRef in sync with latest props (no remount)
  useEffect(() => { bandsRef.current = bands; });

  // ── rAF draw loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas    = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const W = container.clientWidth || 260;
    canvas.width  = W;
    canvas.height = H;

    let fftBuf  = new Uint8Array(1024);
    const magBuf  = new Float32Array(N_FREQS);
    const phaseBuf = new Float32Array(N_FREQS);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);

      // Throttle to ~30 fps
      frameRef.current++;
      if (frameRef.current % 2 !== 0) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, W, H);

      // Background
      ctx.fillStyle = '#0e0e18';
      ctx.fillRect(0, 0, W, H);

      // ── Live FFT spectrum ────────────────────────────────────────────────
      const analyser = getOrbitAnalyser(orbitIndex);
      if (analyser) {
        const binCount = analyser.frequencyBinCount;
        if (fftBuf.length !== binCount) {
          // recreate if size mismatch (shouldn't happen but guard it)
        }
        if (fftBuf.length !== binCount) fftBuf = new Uint8Array(binCount);
        analyser.getByteFrequencyData(fftBuf);
        const buf = fftBuf;
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

      // ── dB grid ─────────────────────────────────────────────────────────
      ctx.strokeStyle = '#2a2a3a';
      ctx.lineWidth   = 1;
      for (const db of [-12, -6, 0, 6, 12]) {
        const y = Math.round(gainToY(db)) + 0.5;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      // Freq grid
      ctx.strokeStyle = '#222232';
      for (const f of GRID_FREQS) {
        const x = Math.round(freqToX(f, W)) + 0.5;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }

      // 0 dB line
      const y0 = Math.round(gainToY(0)) + 0.5;
      ctx.strokeStyle = '#3a3a55';
      ctx.lineWidth   = 1;
      ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(W, y0); ctx.stroke();

      // ── EQ curve ────────────────────────────────────────────────────────
      let ac: AudioContext | null = null;
      try { ac = getAudioContext() as AudioContext; } catch { /* ignore */ }

      if (ac) {
        const currentBands = bandsRef.current;
        const combinedMag  = new Float32Array(N_FREQS).fill(1);

        for (const band of currentBands) {
          const typeIdx = Math.max(0, Math.min(5, Math.round(band.type)));
          try {
            const f = ac.createBiquadFilter();
            f.type = EQ_BAND_TYPES[typeIdx] ?? 'peaking';
            f.frequency.value = band.freq;
            f.gain.value      = band.gain;
            f.Q.value         = band.q;
            f.getFrequencyResponse(FREQS, magBuf, phaseBuf);
            for (let i = 0; i < N_FREQS; i++) combinedMag[i] *= magBuf[i];
          } catch { /* ignore */ }
        }

        const dbCombined = new Float32Array(N_FREQS);
        for (let i = 0; i < N_FREQS; i++) {
          dbCombined[i] = 20 * Math.log10(Math.max(combinedMag[i], 1e-9));
        }

        // Fill below curve
        ctx.beginPath();
        ctx.moveTo(0, gainToY(dbCombined[0]));
        for (let i = 1; i < N_FREQS; i++) {
          ctx.lineTo(freqToX(FREQS[i], W), gainToY(dbCombined[i]));
        }
        ctx.lineTo(W, y0);
        ctx.lineTo(0, y0);
        ctx.closePath();
        ctx.fillStyle = `${color}25`;
        ctx.fill();

        // Curve stroke
        ctx.beginPath();
        ctx.moveTo(0, gainToY(dbCombined[0]));
        for (let i = 1; i < N_FREQS; i++) {
          ctx.lineTo(freqToX(FREQS[i], W), gainToY(dbCombined[i]));
        }
        ctx.strokeStyle = `${color}dd`;
        ctx.lineWidth   = 1.5;
        ctx.lineJoin    = 'round';
        ctx.stroke();

        // ── Band nodes ──────────────────────────────────────────────────
        for (let bi = 0; bi < currentBands.length; bi++) {
          const band     = currentBands[bi];
          const typeIdx  = Math.max(0, Math.min(5, Math.round(band.type)));
          const nodeX    = freqToX(band.freq, W);
          const nodeY    = HAS_GAIN.has(typeIdx) ? gainToY(band.gain) : H / 2;
          const isDragging = dragRef.current?.band === bi;

          ctx.beginPath();
          ctx.arc(nodeX, nodeY, isDragging ? 6 : 5, 0, Math.PI * 2);
          ctx.fillStyle   = isDragging ? color : `${color}99`;
          ctx.strokeStyle = color;
          ctx.lineWidth   = 1.5;
          ctx.fill();
          ctx.stroke();

          // Band number label
          ctx.fillStyle  = '#0e0e18';
          ctx.font       = 'bold 7px monospace';
          ctx.textAlign  = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(bi + 1), nodeX, nodeY);
        }
      }

      // dB labels
      ctx.fillStyle    = '#4a4a60';
      ctx.font         = '9px monospace';
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'alphabetic';
      for (const db of [-12, 0, 12]) {
        const y = gainToY(db);
        if (y > 6 && y < H - 2) ctx.fillText(db === 0 ? '0' : `${db > 0 ? '+' : ''}${db}`, W - 2, y + 3);
      }
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [orbitIndex, color]);

  // ── Pointer interaction ───────────────────────────────────────────────────
  function findClosestBand(x: number, y: number, W: number): number | null {
    const bs = bandsRef.current;
    let best = -1, bestDist = 14; // 14px hit radius
    for (let i = 0; i < bs.length; i++) {
      const typeIdx = Math.max(0, Math.min(5, Math.round(bs[i].type)));
      const nx = freqToX(bs[i].freq, W);
      const ny = HAS_GAIN.has(typeIdx) ? gainToY(bs[i].gain) : H / 2;
      const d  = Math.hypot(x - nx, y - ny);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best === -1 ? null : best;
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect  = canvas.getBoundingClientRect();
    const W     = canvas.width;
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    const cx    = (e.clientX - rect.left) * scaleX;
    const cy    = (e.clientY - rect.top)  * scaleY;

    const bi = findClosestBand(cx, cy, W);
    if (bi === null) return;

    canvas.setPointerCapture(e.pointerId);
    const band = bandsRef.current[bi];
    dragRef.current = {
      band: bi,
      startX: cx, startY: cy,
      startFreq: band.freq,
      startGain: band.gain,
      startQ:    band.q,
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const drag   = dragRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas) return;

    const rect   = canvas.getBoundingClientRect();
    const W      = canvas.width;
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    const cx     = (e.clientX - rect.left) * scaleX;
    const cy     = (e.clientY - rect.top)  * scaleY;

    const band     = bandsRef.current[drag.band];
    const typeIdx  = Math.max(0, Math.min(5, Math.round(band.type)));

    // X → frequency (log scale)
    const newFreq = Math.max(MIN_FREQ, Math.min(MAX_FREQ, xToFreq(cx, W)));
    onChange(drag.band, 'freq', Math.round(newFreq));

    // Y → gain (for Bell/LS/HS) or Q (for LP/HP/Notch)
    if (HAS_GAIN.has(typeIdx)) {
      const newGain = Math.max(-DB_RANGE, Math.min(DB_RANGE, yToGain(cy)));
      onChange(drag.band, 'gain', Math.round(newGain * 2) / 2); // 0.5 dB steps
    } else {
      const newQ = Math.max(0.1, Math.min(10, yToQ(cy)));
      onChange(drag.band, 'q', Math.round(newQ * 10) / 10);
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    canvasRef.current?.releasePointerCapture(e.pointerId);
    dragRef.current = null;
  }

  return (
    <div ref={containerRef} className="w-full rounded overflow-hidden" style={{ height: H }}>
      <canvas
        ref={canvasRef}
        height={H}
        className="w-full block cursor-crosshair"
        style={{ imageRendering: 'pixelated', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
    </div>
  );
}

// ── Band type button row ──────────────────────────────────────────────────────

interface TypeRowProps {
  bands:    BandParam[];
  color:    string;
  onChange: (bandIndex: number, key: 'type' | 'freq' | 'gain' | 'q', value: number) => void;
}

export function ParamEQTypeRow({ bands, color, onChange }: TypeRowProps) {
  return (
    <div className="flex gap-1 mt-1">
      {bands.map((band, bi) => {
        const typeIdx = Math.max(0, Math.min(5, Math.round(band.type)));
        const nextType = (typeIdx + 1) % 6;
        return (
          <button
            key={bi}
            onClick={() => onChange(bi, 'type', nextType)}
            className="flex-1 text-center rounded transition-colors"
            style={{
              fontSize: 9,
              padding: '2px 0',
              background: `${color}20`,
              border: `1px solid ${color}50`,
              color,
              lineHeight: 1.4,
            }}
            title={`Band ${bi + 1}: click to cycle type`}
          >
            <span style={{ opacity: 0.5, fontSize: 8, display: 'block', lineHeight: 1.2 }}>B{bi + 1}</span>
            {TYPE_LABELS[typeIdx]}
          </button>
        );
      })}
    </div>
  );
}
