import { useEffect, useRef } from 'react';
import { getCompressorNode } from '../../audio/orbitEffects';

const CURVE_H = 100;
const GR_H    = 20;
const H       = CURVE_H + GR_H;
const DB_MIN  = -60;
const DB_MAX  = 0;

function dbToX(db: number, W: number): number {
  return ((db - DB_MIN) / (DB_MAX - DB_MIN)) * W;
}
function xToDb(x: number, W: number): number {
  return DB_MIN + (x / W) * (DB_MAX - DB_MIN);
}
function dbToY(db: number): number {
  return CURVE_H - ((db - DB_MIN) / (DB_MAX - DB_MIN)) * CURVE_H;
}

/** Soft-knee transfer function: returns output dB for a given input dB */
function transferDb(inputDb: number, threshold: number, knee: number, ratio: number): number {
  const halfKnee = knee / 2;
  const kneeIn   = threshold - halfKnee;
  const kneeOut  = threshold + halfKnee;

  if (inputDb <= kneeIn || knee < 0.01) {
    // Below knee — 1:1
    if (inputDb <= threshold) return inputDb;
    return threshold + (inputDb - threshold) / ratio;
  } else if (inputDb < kneeOut) {
    // Soft knee region — quadratic interpolation
    const t = (inputDb - kneeIn) / knee; // 0..1
    const gain = 1 + (1 / ratio - 1) * t * t;
    return inputDb + (gain - 1) * (inputDb - kneeIn);
  } else {
    // Above knee — fully compressed
    return threshold + (inputDb - threshold) / ratio;
  }
}

interface Props {
  orbitIndex:        number;
  color:             string;
  threshold:         number;
  knee:              number;
  ratio:             number;
  onThresholdChange: (db: number) => void;
}

export function CompressorDisplay({ orbitIndex, color, threshold, knee, ratio, onThresholdChange }: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const paramsRef    = useRef({ threshold, knee, ratio });
  const rafRef       = useRef(0);
  const frameRef     = useRef(0);
  const isDragging   = useRef(false);

  useEffect(() => { paramsRef.current = { threshold, knee, ratio }; });

  useEffect(() => {
    const canvas    = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const W = container.clientWidth || 240;
    canvas.width  = W;
    canvas.height = H;

    const GRID_DBS = [-48, -36, -24, -12];

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      frameRef.current++;
      if (frameRef.current % 2 !== 0) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const { threshold: thr, knee: kn, ratio: rat } = paramsRef.current;

      ctx.clearRect(0, 0, W, H);

      // ── Background ─────────────────────────────────────────────────────────
      ctx.fillStyle = '#0e0e18';
      ctx.fillRect(0, 0, W, CURVE_H);

      // ── Grid lines ─────────────────────────────────────────────────────────
      ctx.lineWidth   = 1;
      ctx.strokeStyle = '#2a2a3a';
      for (const db of GRID_DBS) {
        // horizontal
        const y = Math.round(dbToY(db)) + 0.5;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        // vertical
        const x = Math.round(dbToX(db, W)) + 0.5;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CURVE_H); ctx.stroke();
      }
      // 0 dB axes
      ctx.strokeStyle = '#3a3a55';
      const y0 = Math.round(dbToY(0)) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(W, y0); ctx.stroke();
      const x0 = Math.round(dbToX(0, W)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0, CURVE_H); ctx.stroke();

      // dB labels
      ctx.fillStyle    = '#3a3a55';
      ctx.font         = '8px monospace';
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'alphabetic';
      for (const db of [-48, -24, 0]) {
        const x = dbToX(db, W);
        if (x > 4 && x < W - 4) ctx.fillText(`${db}`, x + 2, CURVE_H - 2);
      }

      // ── 1:1 reference diagonal ──────────────────────────────────────────────
      ctx.strokeStyle = '#3a3a55';
      ctx.lineWidth   = 1;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(dbToX(DB_MIN, W), dbToY(DB_MIN));
      ctx.lineTo(dbToX(DB_MAX, W), dbToY(DB_MAX));
      ctx.stroke();

      // ── Compression curve ──────────────────────────────────────────────────
      const steps = 120;
      const pts: [number, number][] = [];
      for (let i = 0; i <= steps; i++) {
        const inDb  = DB_MIN + (i / steps) * (DB_MAX - DB_MIN);
        const outDb = transferDb(inDb, thr, kn, rat);
        pts.push([dbToX(inDb, W), dbToY(outDb)]);
      }

      // Fill between curve and 1:1 diagonal
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const [px, py] of pts) ctx.lineTo(px, py);
      // Close back along 1:1 line
      ctx.lineTo(dbToX(DB_MAX, W), dbToY(DB_MAX));
      ctx.lineTo(dbToX(DB_MIN, W), dbToY(DB_MIN));
      ctx.closePath();
      ctx.fillStyle = `${color}18`;
      ctx.fill();

      // Curve stroke
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const [px, py] of pts) ctx.lineTo(px, py);
      ctx.strokeStyle = `${color}cc`;
      ctx.lineWidth   = 1.5;
      ctx.lineJoin    = 'round';
      ctx.stroke();

      // ── Threshold dashed vertical line ─────────────────────────────────────
      const thrX = Math.round(dbToX(thr, W)) + 0.5;
      ctx.strokeStyle = `${color}80`;
      ctx.lineWidth   = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(thrX, 0);
      ctx.lineTo(thrX, CURVE_H);
      ctx.stroke();
      ctx.setLineDash([]);

      // Threshold label
      ctx.fillStyle    = `${color}99`;
      ctx.font         = '8px monospace';
      ctx.textAlign    = thrX > W / 2 ? 'right' : 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`${thr.toFixed(0)}dB`, thrX + (thrX > W / 2 ? -3 : 3), 2);

      // ── GR meter strip ─────────────────────────────────────────────────────
      ctx.fillStyle = '#111120';
      ctx.fillRect(0, CURVE_H, W, GR_H);

      const node = getCompressorNode(orbitIndex);
      const reduction = node ? Math.min(0, node.reduction) : 0;

      if (reduction < -0.1) {
        const barW = Math.min(W, (Math.abs(reduction) / 40) * W);
        ctx.fillStyle = `${color}99`;
        ctx.fillRect(W - barW, CURVE_H + 4, barW, GR_H - 8);

        ctx.fillStyle    = '#8888aa';
        ctx.font         = '8px monospace';
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${reduction.toFixed(1)} dB`, W - 4, CURVE_H + GR_H / 2);
      } else {
        ctx.fillStyle    = '#3a3a55';
        ctx.font         = '8px monospace';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('GR', W / 2, CURVE_H + GR_H / 2);
      }
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [orbitIndex, color]);

  // ── Pointer interaction (threshold drag) ───────────────────────────────────
  function getDb(e: React.PointerEvent<HTMLCanvasElement>): number {
    const canvas = canvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const cx     = (e.clientX - rect.left) * scaleX;
    return Math.round(Math.max(DB_MIN, Math.min(DB_MAX, xToDb(cx, canvas.width))));
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    // Only interact with the curve area, not GR strip
    const canvas = canvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    const cy     = (e.clientY - rect.top) * (canvas.height / rect.height);
    if (cy > CURVE_H) return;
    canvas.setPointerCapture(e.pointerId);
    isDragging.current = true;
    onThresholdChange(getDb(e));
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDragging.current) return;
    onThresholdChange(getDb(e));
  }
  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    canvasRef.current?.releasePointerCapture(e.pointerId);
    isDragging.current = false;
  }

  return (
    <div ref={containerRef} className="w-full rounded overflow-hidden" style={{ height: H }}>
      <canvas
        ref={canvasRef}
        height={H}
        className="w-full block cursor-ew-resize"
        style={{ imageRendering: 'pixelated', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
    </div>
  );
}
