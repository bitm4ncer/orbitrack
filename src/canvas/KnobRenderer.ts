import * as Tone from 'tone';
import { useStore } from '../state/store';

const TWO_PI = Math.PI * 2;
const TRIGGER_ANGLE = -Math.PI / 2; // 12 o'clock
const HIT_RADIUS = 7;
const RING_PADDING = 22; // px from canvas edge to ring center

const colorCache = new Map<string, { r: number; g: number; b: number }>();
function parseColor(hex: string): { r: number; g: number; b: number } {
  let c = colorCache.get(hex);
  if (!c) {
    c = {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
    };
    colorCache.set(hex, c);
  }
  return c;
}

function rgba(hex: string, alpha: number): string {
  const c = parseColor(hex);
  return `rgba(${c.r},${c.g},${c.b},${alpha})`;
}

export class KnobRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private animationId: number | null = null;
  private instrumentId: string;

  constructor(canvas: HTMLCanvasElement, instrumentId: string) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true })!;
    this.instrumentId = instrumentId;
  }

  start(): void {
    if (this.animationId !== null) return;
    this.loop();
  }

  stop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private loop = (): void => {
    this.render();
    this.animationId = requestAnimationFrame(this.loop);
  };

  private getLayout(): { cx: number; cy: number; radius: number } {
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(cx, cy) - RING_PADDING;
    return { cx, cy, radius };
  }

  private render(): void {
    const state = useStore.getState();
    const inst = state.instruments.find((i) => i.id === this.instrumentId);
    if (!inst) return;

    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w <= 0 || h <= 0) return;
    const ctx = this.ctx;
    const { cx, cy, radius } = this.getLayout();
    if (radius <= 0) return;

    ctx.clearRect(0, 0, w, h);

    // Real-time transport position
    const transport = Tone.getTransport();
    const secondsPer16th = 60 / state.bpm / 4;
    const totalSteps = state.isPlaying ? transport.seconds / secondsPer16th : 0;

    const isSelected = state.selectedInstrumentId === this.instrumentId;
    const isMuted = inst.muted;
    const anySolo = state.instruments.some((i) => i.solo);
    const effectivelyMuted = isMuted && !inst.solo || (anySolo && !inst.solo);

    // Muted orbits don't rotate unless soloed
    const instProg = state.isPlaying && !effectivelyMuted
      ? (totalSteps % inst.loopSize) / inst.loopSize : 0;
    const dotRotation = instProg * TWO_PI;

    // --- 1. Dark knob background ---
    const bgRadius = Math.min(cx, cy) - 2;
    ctx.beginPath();
    ctx.arc(cx, cy, bgRadius, 0, TWO_PI);
    ctx.fillStyle = isSelected ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.35)';
    ctx.fill();

    // --- 2. Step tick marks on the ring (one per step, fixed/not rotating) ---
    const stepCount = inst.loopSize;
    for (let g = 0; g < stepCount; g++) {
      const tickAngle = (g / stepCount) * TWO_PI + TRIGGER_ANGLE - dotRotation;
      const cos = Math.cos(tickAngle);
      const sin = Math.sin(tickAngle);
      const isBeat = g % 4 === 0;
      const innerLen = isBeat ? 10 : 5;
      const outerLen = isBeat ? 5 : 3;
      ctx.beginPath();
      ctx.moveTo(cx + cos * (radius - innerLen), cy + sin * (radius - innerLen));
      ctx.lineTo(cx + cos * (radius + outerLen), cy + sin * (radius + outerLen));
      ctx.strokeStyle = g === 0 ? inst.color : rgba(inst.color, isBeat ? 0.7 : 0.5);
      ctx.lineWidth = g === 0 ? 2 : isBeat ? 1.5 : 1.25;
      ctx.stroke();
    }

    // --- 3. Grid ticks on ring (rotate with dots) — removed, replaced by fixed ticks above ---

    // Loop region state (needed for ring + hit dot rendering)
    const editorState = inst.type === 'looper' ? state.looperEditors[inst.id] : undefined;
    const loopIn = editorState?.loopIn ?? 0;
    const loopOut = editorState?.loopOut ?? 1;
    const hasLoopRegion = inst.type === 'looper' && (loopIn > 0 || loopOut < 1);

    // --- 4. Ring (skip if loop region draws its own) ---
    if (!hasLoopRegion) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, TWO_PI);
      ctx.strokeStyle = isMuted ? rgba(inst.color, 0.25) : inst.color;
      ctx.lineWidth = isSelected ? 2.5 : 1.5;
      ctx.stroke();
    }

    if (hasLoopRegion) {
      // Draw dimmed full ring, then bright arc for loop region
      const arcStart = loopIn * TWO_PI - dotRotation + TRIGGER_ANGLE;
      const arcEnd = loopOut * TWO_PI - dotRotation + TRIGGER_ANGLE;

      // Dim arc for the inactive region (draw full ring dimmed, then overdraw active)
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, TWO_PI);
      ctx.strokeStyle = rgba(inst.color, 0.12);
      ctx.lineWidth = 4;
      ctx.stroke();

      // Bright arc for the active loop region
      ctx.beginPath();
      ctx.arc(cx, cy, radius, arcStart, arcEnd);
      ctx.strokeStyle = isMuted ? rgba(inst.color, 0.4) : inst.color;
      ctx.lineWidth = 4;
      ctx.stroke();

      // Small ticks at loop in/out boundaries
      for (const pos of [loopIn, loopOut]) {
        const tickAngle = pos * TWO_PI - dotRotation + TRIGGER_ANGLE;
        const tc = Math.cos(tickAngle);
        const ts = Math.sin(tickAngle);
        ctx.beginPath();
        ctx.moveTo(cx + tc * (radius - 8), cy + ts * (radius - 8));
        ctx.lineTo(cx + tc * (radius + 8), cy + ts * (radius + 8));
        ctx.strokeStyle = 'rgba(0,255,255,0.7)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // --- 5. Hit dots (rotate with ring) ---

    for (let i = 0; i < inst.hitPositions.length; i++) {
      const hitPos = inst.hitPositions[i];
      const hitAngle = hitPos * TWO_PI - dotRotation + TRIGGER_ANGLE;
      const hx = cx + Math.cos(hitAngle) * radius;
      const hy = cy + Math.sin(hitAngle) * radius;

      const outsideLoop = hasLoopRegion && (hitPos < loopIn - 0.001 || hitPos > loopOut + 0.001);

      const diff = Math.abs(instProg - hitPos);
      const wrappedDiff = Math.min(diff, 1 - diff);
      const isTriggered = state.isPlaying && !outsideLoop && wrappedDiff < (0.5 / inst.loopSize);

      ctx.beginPath();
      ctx.arc(hx, hy, outsideLoop ? HIT_RADIUS * 0.6 : HIT_RADIUS, 0, TWO_PI);

      if (isTriggered) {
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = inst.color;
        ctx.shadowBlur = 18;
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = rgba(inst.color, outsideLoop ? 0.15 : isMuted ? 0.25 : 0.9);
        ctx.fill();
        if (!outsideLoop) {
          ctx.beginPath();
          ctx.arc(hx, hy, HIT_RADIUS * 0.45, 0, TWO_PI);
          ctx.fillStyle = rgba('#ffffff', isMuted ? 0.1 : 0.35);
          ctx.fill();
        }
      }
    }

    // --- 6. Fixed trigger notch at 12 o'clock ---
    const notchCos = Math.cos(TRIGGER_ANGLE);
    const notchSin = Math.sin(TRIGGER_ANGLE);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx + notchCos * (radius - 10), cy + notchSin * (radius - 10));
    ctx.lineTo(cx + notchCos * (radius + RING_PADDING - 6), cy + notchSin * (radius + RING_PADDING - 6));
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(255,255,255,0.4)';
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.restore();

    // --- 7. Center text: hit count + loop size ---
    const fontSize = Math.max(14, Math.floor(radius * 0.45));
    ctx.fillStyle = rgba(inst.color, isMuted ? 0.3 : 0.8);
    ctx.font = `bold ${fontSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(inst.hits), cx, cy - fontSize * 0.25);

    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = `${Math.floor(fontSize * 0.5)}px monospace`;
    ctx.fillText(`/${inst.loopSize}`, cx, cy + fontSize * 0.6);
  }

  // --- Hit detection ---

  getHitAt(mouseX: number, mouseY: number): number | null {
    const state = useStore.getState();
    const inst = state.instruments.find((i) => i.id === this.instrumentId);
    if (!inst) return null;

    const { cx, cy, radius } = this.getLayout();
    const transport = Tone.getTransport();
    const secondsPer16th = 60 / state.bpm / 4;
    const totalSteps = state.isPlaying ? transport.seconds / secondsPer16th : 0;
    const anySolo = state.instruments.some((i) => i.solo);
    const effectivelyMuted = (inst.muted && !inst.solo) || (anySolo && !inst.solo);
    const instProg = state.isPlaying && !effectivelyMuted
      ? (totalSteps % inst.loopSize) / inst.loopSize : 0;
    const dotRotation = instProg * TWO_PI;

    for (let i = 0; i < inst.hitPositions.length; i++) {
      const hitAngle = inst.hitPositions[i] * TWO_PI - dotRotation + TRIGGER_ANGLE;
      const hx = cx + Math.cos(hitAngle) * radius;
      const hy = cy + Math.sin(hitAngle) * radius;
      const dx = mouseX - hx;
      const dy = mouseY - hy;
      if (dx * dx + dy * dy < (HIT_RADIUS + 8) * (HIT_RADIUS + 8)) return i;
    }
    return null;
  }

  isOnRing(mouseX: number, mouseY: number): boolean {
    const { cx, cy, radius } = this.getLayout();
    const dx = mouseX - cx;
    const dy = mouseY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return Math.abs(dist - radius) < 15;
  }

  getAngleAt(mouseX: number, mouseY: number): number {
    const state = useStore.getState();
    const inst = state.instruments.find((i) => i.id === this.instrumentId);
    const { cx, cy } = this.getLayout();

    const transport = Tone.getTransport();
    const secondsPer16th = 60 / state.bpm / 4;
    const totalSteps = state.isPlaying ? transport.seconds / secondsPer16th : 0;
    const anySolo = state.instruments.some((i) => i.solo);
    const effectivelyMuted = inst ? (inst.muted && !inst.solo) || (anySolo && !inst.solo) : false;
    const instProg = state.isPlaying && inst && !effectivelyMuted
      ? (totalSteps % inst.loopSize) / inst.loopSize : 0;
    const dotRotation = instProg * TWO_PI;

    const angle = Math.atan2(mouseY - cy, mouseX - cx);
    const normalizedPos = (angle - TRIGGER_ANGLE + dotRotation) / TWO_PI;
    return ((normalizedPos % 1) + 1) % 1;
  }
}
