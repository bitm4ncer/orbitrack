import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../../state/store';
import { getTranceGatePhase } from '../../audio/orbitEffects';

interface Props {
  params: Record<string, number>;
  color: string;
  orbitIndex: number;
  onChange: (key: string, val: number) => void;
}

const SIZE    = 200;
const CX      = SIZE / 2;
const CY      = SIZE / 2;
const R_OUTER = 86;
const R_INNER = 48;
const R_DOT   = (R_OUTER + R_INNER) / 2;
const GAP     = 0.04;

const EYE_RX  = 19;
const EYE_RY  = 13;

type BlinkPhase = 'open' | 'closing' | 'opening' | 'forced-closed';

interface EyeState {
  openAmount: number;
  closedUntil: number;
  nextBlink:   number;
  blinkPhase:  BlinkPhase;
  blinkT:      number;
}

export function TranceGateDisplay({ params, color, orbitIndex, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);
  const bpm       = useStore((s) => s.bpm);
  const propsRef  = useRef({ params, color, orbitIndex, bpm });
  useEffect(() => { propsRef.current = { params, color, orbitIndex, bpm }; });

  const eyeRef = useRef<EyeState>({
    openAmount:  1,
    closedUntil: 0,
    nextBlink:   performance.now() + 2000 + Math.random() * 4000,
    blinkPhase:  'open',
    blinkT:      0,
  });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { params: p, color: col, orbitIndex: oi } = propsRef.current;

    const steps     = Math.max(1, Math.round(p.steps ?? 8));
    const phase     = getTranceGatePhase(oi);
    const playAngle = -Math.PI / 2 + phase * Math.PI * 2;

    ctx.clearRect(0, 0, SIZE, SIZE);

    // Background circle
    ctx.beginPath();
    ctx.arc(CX, CY, R_OUTER + 4, 0, Math.PI * 2);
    ctx.fillStyle = '#0e0e18';
    ctx.fill();

    const stepAngle = (Math.PI * 2) / steps;

    for (let i = 0; i < steps; i++) {
      const isOn   = (p[`s${i}`] ?? 1) > 0.5;
      const startA = -Math.PI / 2 + i * stepAngle + GAP / 2;
      const endA   = startA + stepAngle - GAP;

      ctx.beginPath();
      ctx.moveTo(CX + Math.cos(startA) * R_INNER, CY + Math.sin(startA) * R_INNER);
      ctx.arc(CX, CY, R_OUTER, startA, endA);
      ctx.arc(CX, CY, R_INNER, endA, startA, true);
      ctx.closePath();
      ctx.fillStyle   = isOn ? `${col}50` : '#1a1a28';
      ctx.fill();
      ctx.strokeStyle = isOn ? `${col}90` : '#2a2a3a';
      ctx.lineWidth   = 1;
      ctx.stroke();
    }

    // Playhead arm
    const px1 = CX + Math.cos(playAngle) * (R_INNER - 4);
    const py1 = CY + Math.sin(playAngle) * (R_INNER - 4);
    const px2 = CX + Math.cos(playAngle) * (R_OUTER + 2);
    const py2 = CY + Math.sin(playAngle) * (R_OUTER + 2);
    ctx.beginPath();
    ctx.moveTo(px1, py1);
    ctx.lineTo(px2, py2);
    ctx.strokeStyle = col;
    ctx.lineWidth   = 2;
    ctx.lineCap     = 'round';
    ctx.stroke();

    // Active-step dot
    const currentStep = Math.floor(phase * steps) % steps;
    const dotA        = -Math.PI / 2 + (currentStep + 0.5) * stepAngle;
    const stepOn      = (p[`s${currentStep}`] ?? 1) > 0.5;
    if (stepOn) {
      ctx.beginPath();
      ctx.arc(CX + Math.cos(dotA) * R_DOT, CY + Math.sin(dotA) * R_DOT, 4, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
    }

    // ── Eye ─────────────────────────────────────────────────────────────
    const eye = eyeRef.current;
    const now = performance.now();
    const BLINK_HALF = 80;

    // Advance blink state machine
    if (eye.blinkPhase === 'forced-closed') {
      eye.openAmount = Math.max(0, eye.openAmount - 0.14);
      if (now >= eye.closedUntil) {
        eye.blinkPhase = 'opening';
        eye.blinkT     = now;
        eye.openAmount = 0;
      }
    } else if (eye.blinkPhase === 'closing') {
      const t = Math.min(1, (now - eye.blinkT) / BLINK_HALF);
      eye.openAmount = 1 - t;
      if (t >= 1) { eye.blinkPhase = 'opening'; eye.blinkT = now; }
    } else if (eye.blinkPhase === 'opening') {
      const t = Math.min(1, (now - eye.blinkT) / BLINK_HALF);
      eye.openAmount = t;
      if (t >= 1) {
        eye.blinkPhase = 'open';
        eye.openAmount = 1;
        eye.nextBlink  = now + 2000 + Math.random() * 4000;
      }
    } else { // 'open'
      eye.openAmount = 1;
      if (now >= eye.nextBlink) { eye.blinkPhase = 'closing'; eye.blinkT = now; }
    }

    const oa      = eye.openAmount;          // 0..1
    const lidOpen = oa * EYE_RY;             // vertical gap from center to lid edge

    // Eyelid curves (upper/lower)
    const cpUY = CY - lidOpen * 1.15;        // upper control-point Y
    const cpLY = CY + lidOpen * 0.75;        // lower control-point Y

    // ── Clip to eye opening ──
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(CX - EYE_RX, CY);
    ctx.bezierCurveTo(CX - EYE_RX * 0.45, cpUY, CX + EYE_RX * 0.45, cpUY, CX + EYE_RX, CY);
    ctx.bezierCurveTo(CX + EYE_RX * 0.45, cpLY, CX - EYE_RX * 0.45, cpLY, CX - EYE_RX, CY);
    ctx.closePath();
    ctx.clip();

    // White sclera
    ctx.fillStyle = '#ededf0';
    ctx.beginPath();
    ctx.ellipse(CX, CY, EYE_RX, EYE_RY + 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Iris
    const irisR = 7.5;
    ctx.beginPath();
    ctx.arc(CX, CY, irisR, 0, Math.PI * 2);
    // Iris gradient
    const irisGrd = ctx.createRadialGradient(CX - 2, CY - 2, 1, CX, CY, irisR);
    irisGrd.addColorStop(0, col);
    irisGrd.addColorStop(1, `${col}88`);
    ctx.fillStyle = irisGrd;
    ctx.fill();

    // Pupil — offset toward sequencer arm direction
    const pupilDist = 2.5 * oa;
    const pupilX    = CX + Math.cos(playAngle) * pupilDist;
    const pupilY    = CY + Math.sin(playAngle) * pupilDist;
    ctx.beginPath();
    ctx.arc(pupilX, pupilY, 4.2, 0, Math.PI * 2);
    ctx.fillStyle = '#080810';
    ctx.fill();

    // Pupil shine
    ctx.beginPath();
    ctx.arc(pupilX - 1.4, pupilY - 1.5, 1.1, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fill();

    ctx.restore(); // remove clip

    // ── Draw eyelids on top of eyeball ──
    ctx.save();

    // Upper eyelid — mask rectangle above curve + colored edge
    ctx.shadowColor  = `${col}70`;
    ctx.shadowBlur   = 10;
    ctx.shadowOffsetY = 3;
    ctx.beginPath();
    ctx.rect(CX - EYE_RX - 2, CY - EYE_RY - 14, (EYE_RX + 2) * 2, EYE_RY + 14);
    ctx.moveTo(CX - EYE_RX, CY);
    ctx.bezierCurveTo(CX - EYE_RX * 0.45, cpUY, CX + EYE_RX * 0.45, cpUY, CX + EYE_RX, CY);
    ctx.lineTo(CX + EYE_RX + 2, CY - EYE_RY - 14);
    ctx.lineTo(CX - EYE_RX - 2, CY - EYE_RY - 14);
    ctx.closePath();
    ctx.fillStyle = '#0e0e18';
    ctx.fill();

    // Upper lid colored edge
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(CX - EYE_RX, CY);
    ctx.bezierCurveTo(CX - EYE_RX * 0.45, cpUY, CX + EYE_RX * 0.45, cpUY, CX + EYE_RX, CY);
    ctx.strokeStyle = col;
    ctx.lineWidth   = 1.8;
    ctx.lineCap     = 'round';
    ctx.stroke();

    // Lower eyelid mask
    ctx.shadowOffsetY = -3;
    ctx.beginPath();
    ctx.rect(CX - EYE_RX - 2, CY, (EYE_RX + 2) * 2, EYE_RY + 14);
    ctx.moveTo(CX - EYE_RX, CY);
    ctx.bezierCurveTo(CX - EYE_RX * 0.45, cpLY, CX + EYE_RX * 0.45, cpLY, CX + EYE_RX, CY);
    ctx.lineTo(CX + EYE_RX + 2, CY + EYE_RY + 14);
    ctx.lineTo(CX - EYE_RX - 2, CY + EYE_RY + 14);
    ctx.closePath();
    ctx.fillStyle = '#0e0e18';
    ctx.fill();

    // Lower lid colored edge
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(CX - EYE_RX, CY);
    ctx.bezierCurveTo(CX - EYE_RX * 0.45, cpLY, CX + EYE_RX * 0.45, cpLY, CX + EYE_RX, CY);
    ctx.strokeStyle = `${col}90`;
    ctx.lineWidth   = 1.2;
    ctx.stroke();

    ctx.restore();
    // ── End eye ──────────────────────────────────────────────────────────

    rafRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect   = canvas.getBoundingClientRect();
    const scaleX = SIZE / rect.width;
    const scaleY = SIZE / rect.height;
    const mx     = (e.clientX - rect.left) * scaleX - CX;
    const my     = (e.clientY - rect.top)  * scaleY - CY;
    const dist   = Math.sqrt(mx * mx + my * my);

    // Eye center click → 20s close
    if (dist < R_INNER - 6) {
      const eye          = eyeRef.current;
      eye.closedUntil    = performance.now() + 20000;
      eye.blinkPhase     = 'forced-closed';
      return;
    }

    if (dist < R_INNER - 2 || dist > R_OUTER + 6) return;

    const angle = Math.atan2(my, mx) + Math.PI / 2;
    const norm  = ((angle / (Math.PI * 2)) + 1) % 1;
    const steps = Math.max(1, Math.round(propsRef.current.params.steps ?? 8));
    const idx   = Math.floor(norm * steps);
    const key   = `s${idx}`;
    const wasOn = (propsRef.current.params[key] ?? 1) > 0.5;
    onChange(key, wasOn ? 0 : 1);
  }, [onChange]);

  return (
    <canvas
      ref={canvasRef}
      width={SIZE}
      height={SIZE}
      onClick={handleClick}
      style={{ width: SIZE, height: SIZE, cursor: 'pointer', display: 'block', margin: '0 auto' }}
    />
  );
}
