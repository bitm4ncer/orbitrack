import { useEffect, useRef, useCallback } from 'react';
import { DELAY_SYNC_DIVS } from '../../audio/effectParams';
import { getOrbitAnalyser } from '../../audio/orbitEffects';

interface Props {
  time: number;     // delay time in seconds (computed if sync)
  feedback: number; // 0–0.95
  mode: number;     // 0=Normal, 1=Tape, 2=Lo-Fi, 3=Multi-Tap
  sync: number;     // 0=off, 1=on
  syncDiv: number;  // index into DELAY_SYNC_DIVS
  bpm: number;
  orbitIndex: number;
  color: string;
}

const W = 240;
const H = 64;
const MAX_ECHOES = 10;
const PULSE_THRESHOLD = 0.04; // RMS level to trigger a pulse
const PULSE_COOLDOWN  = 0.08; // min seconds between pulses

export function DelayDisplay({ time, feedback, mode, sync, syncDiv, bpm, orbitIndex, color }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);
  const propsRef  = useRef({ time, feedback, mode, sync, syncDiv, bpm, orbitIndex, color });
  useEffect(() => { propsRef.current = { time, feedback, mode, sync, syncDiv, bpm, orbitIndex, color }; });

  // Live pulse state — array of { birthTime, amplitude } for active pulses
  const pulsesRef = useRef<{ birth: number; amp: number }[]>([]);
  const lastPulseRef = useRef(0);
  const analyserDataRef = useRef(new Float32Array(256));

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { time: t, feedback: fb, mode: m, sync: sy, syncDiv: sd, bpm: b, orbitIndex: oi, color: col } = propsRef.current;
    const now = performance.now() / 1000;

    // ── Detect audio input → spawn pulse ──────────────────────────────────
    const analyser = getOrbitAnalyser(oi);
    if (analyser) {
      const data = analyserDataRef.current;
      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length);
      if (rms > PULSE_THRESHOLD && (now - lastPulseRef.current) > PULSE_COOLDOWN) {
        lastPulseRef.current = now;
        pulsesRef.current.push({ birth: now, amp: Math.min(1, rms * 4) });
      }
    }

    // Prune old pulses (older than time * MAX_ECHOES + 0.5s)
    const maxAge = t * MAX_ECHOES + 0.5;
    pulsesRef.current = pulsesRef.current.filter((p) => (now - p.birth) < maxAge);

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#0e0e18';
    ctx.fillRect(0, 0, W, H);

    // Time grid lines
    const totalTime = 2.0;
    const timeToX = (ts: number) => 14 + (ts / totalTime) * (W - 28);

    ctx.strokeStyle = '#1a1a2a';
    ctx.lineWidth = 1;
    ctx.setLineDash([1, 3]);
    for (let s = 0.5; s <= 2; s += 0.5) {
      const x = timeToX(s);
      ctx.beginPath();
      ctx.moveTo(x, 4);
      ctx.lineTo(x, H - 4);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Build static echo points (parameter-based)
    const mainPoints: { x: number; y: number; amp: number }[] = [];
    let amp = 1;
    for (let i = 0; i < MAX_ECHOES; i++) {
      const ts = (i + 1) * t;
      if (ts > totalTime) break;
      const x = timeToX(ts);
      // PingPong (mode 4): alternate between top (L) and bottom (R)
      const y = m === 4 ? (i % 2 === 0 ? H * 0.25 : H * 0.75) : H / 2;
      mainPoints.push({ x, y, amp });
      amp *= fb;
      if (amp < 0.01) break;
    }

    // Multi-tap extra points
    const tapPoints: { x: number; y: number; amp: number }[] = [];
    if (m === 3) {
      const taps = [{ mult: 0.75, gain: 0.7 }, { mult: 0.5, gain: 0.5 }];
      for (const tap of taps) {
        let tAmp = tap.gain;
        for (let i = 0; i < MAX_ECHOES; i++) {
          const ts = (i + 1) * t * tap.mult;
          if (ts > totalTime) break;
          const x = timeToX(ts);
          tapPoints.push({ x, y: H / 2, amp: tAmp });
          tAmp *= fb * 0.7;
          if (tAmp < 0.01) break;
        }
      }
    }

    // Connecting line (main echoes) — dim static
    if (mainPoints.length > 0) {
      ctx.beginPath();
      ctx.moveTo(timeToX(0), H / 2);
      for (let i = 0; i < mainPoints.length; i++) {
        const pt = mainPoints[i];
        if (m === 1) {
          const cpx = (i === 0 ? timeToX(0) : mainPoints[i - 1].x + (pt.x - mainPoints[i - 1].x) * 0.5);
          const wobble = Math.sin(i * 2.3 + now * 1.0) * 6 * pt.amp;
          ctx.quadraticCurveTo(cpx, H / 2 + wobble, pt.x, pt.y);
        } else {
          ctx.lineTo(pt.x, pt.y);
        }
      }
      ctx.strokeStyle = m === 2 ? `${col}35` : m === 4 ? `${col}50` : `${col}45`;
      ctx.lineWidth = m === 2 ? 2 : 1;
      if (m === 4) { ctx.setLineDash([3, 3]); }
      ctx.stroke();
      if (m === 4) { ctx.setLineDash([]); }
    }

    // Multi-tap connecting lines — dim static
    if (m === 3 && tapPoints.length > 0) {
      ctx.beginPath();
      ctx.moveTo(timeToX(0), H / 2);
      for (const pt of tapPoints) {
        ctx.lineTo(pt.x, pt.y - 8 * pt.amp);
      }
      ctx.strokeStyle = `${col}28`;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ── Draw static echo dots (dim) ─────────────────────────────────────────
    const drawDot = (x: number, y: number, a: number, lofi: boolean, glow: number) => {
      const baseR = Math.max(2, a * 4);
      const r = baseR + glow * 3;
      const baseAlpha = 50 + a * 60;
      const alpha = Math.round(Math.min(255, baseAlpha + glow * 200)).toString(16).padStart(2, '0');
      ctx.fillStyle = `${col}${alpha}`;

      // Glow ring
      if (glow > 0.1) {
        ctx.beginPath();
        ctx.arc(x, y, r + 2, 0, Math.PI * 2);
        const glowAlpha = Math.round(glow * 80).toString(16).padStart(2, '0');
        ctx.fillStyle = `${col}${glowAlpha}`;
        ctx.fill();
        ctx.fillStyle = `${col}${alpha}`;
      }

      if (lofi) {
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      } else {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    // ── Compute per-dot glow from live pulses ─────────────────────────────
    const getGlow = (echoTimeSec: number): number => {
      let glow = 0;
      for (const pulse of pulsesRef.current) {
        const age = now - pulse.birth;
        // Each echo dot at time T lights up when pulse age ≈ T
        const dist = Math.abs(age - echoTimeSec);
        const window = Math.max(0.03, t * 0.15); // activation window
        if (dist < window) {
          const fadeFromDist = 1 - dist / window;
          const fbDecay = Math.pow(fb, echoTimeSec / t); // feedback attenuation
          glow = Math.max(glow, fadeFromDist * pulse.amp * fbDecay);
        }
      }
      return Math.min(1, glow);
    };

    // Tap dots (draw first, behind main)
    for (const pt of tapPoints) {
      const echoTime = (pt.x - 14) / (W - 28) * totalTime;
      drawDot(pt.x, pt.y - 8 * pt.amp, pt.amp * 0.7, false, getGlow(echoTime) * 0.6);
    }

    // Main echo dots
    for (let i = 0; i < mainPoints.length; i++) {
      const pt = mainPoints[i];
      const echoTime = (i + 1) * t;
      drawDot(pt.x, pt.y, pt.amp, m === 2, getGlow(echoTime));
    }

    // ── Input dot — pulses with live audio ──────────────────────────────────
    const inputGlow = getGlow(0); // check if a fresh pulse just spawned
    const inputR = 3 + inputGlow * 3;
    if (inputGlow > 0.1) {
      ctx.beginPath();
      ctx.arc(timeToX(0), H / 2, inputR + 3, 0, Math.PI * 2);
      const ga = Math.round(inputGlow * 60).toString(16).padStart(2, '0');
      ctx.fillStyle = `${col}${ga}`;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(timeToX(0), H / 2, inputR, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();

    // ── Live delay tail flag — horizontal shimmer line ──────────────────────
    for (const pulse of pulsesRef.current) {
      const age = now - pulse.birth;
      if (age > 0 && age < totalTime) {
        const x = timeToX(age);
        const pulseAlpha = Math.round(Math.max(0, (1 - age / totalTime) * pulse.amp * 120))
          .toString(16).padStart(2, '0');
        ctx.beginPath();
        ctx.moveTo(x, H * 0.3);
        ctx.lineTo(x, H * 0.7);
        ctx.strokeStyle = `${col}${pulseAlpha}`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // Labels
    ctx.font = '7px monospace';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = `${col}40`;

    // Mode label (top-right)
    const modeLabels = ['Normal', 'Tape', 'Lo-Fi', 'Multi', 'P.Pong'];
    ctx.textAlign = 'right';
    ctx.fillText(modeLabels[m] ?? '', W - 4, 12);

    // L/R labels for PingPong mode
    if (m === 4) {
      ctx.textAlign = 'left';
      ctx.fillStyle = `${col}50`;
      ctx.fillText('L', 4, H * 0.25 + 3);
      ctx.fillText('R', 4, H * 0.75 + 3);
    }

    // Sync label + computed time (top-left)
    ctx.textAlign = 'left';
    if (sy === 1) {
      const divLabel = DELAY_SYNC_DIVS[Math.min(sd, DELAY_SYNC_DIVS.length - 1)]?.label ?? '';
      const ms = Math.round(t * 1000);
      ctx.fillStyle = `${col}60`;
      ctx.fillText(`♩ ${divLabel}  ${ms}ms`, 4, 12);
    } else {
      const ms = Math.round(t * 1000);
      ctx.fillText(`${ms}ms`, 4, 12);
    }

    // BPM (bottom-right)
    if (sy === 1 && b > 0) {
      ctx.textAlign = 'right';
      ctx.fillStyle = `${col}30`;
      ctx.fillText(`${b} BPM`, W - 4, H - 2);
    }

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
