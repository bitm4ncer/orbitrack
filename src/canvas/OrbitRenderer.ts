import * as Tone from 'tone';
import { useStore } from '../state/store';
import type { Instrument } from '../types/instrument';

const TRIGGER_ANGLE = Math.PI / 2; // Bottom (6 o'clock)
const TWO_PI = Math.PI * 2;
const HIT_RADIUS = 6;

// Pre-computed color cache to avoid repeated hex parsing
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

interface LayoutCache {
  width: number;
  height: number;
  cx: number;
  cy: number;
  maxRadius: number;
  instrumentCount: number;
  ringSpacing: number;
  zoom: number;
}

export class OrbitRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private animationId: number | null = null;
  private layout: LayoutCache = { width: 0, height: 0, cx: 0, cy: 0, maxRadius: 0, instrumentCount: 0, ringSpacing: 0, zoom: 1 };
  zoom = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true })!;
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
    this.updateLayout(rect.width, rect.height, useStore.getState().instruments.length);
  }

  private updateLayout(w: number, h: number, count: number): void {
    const cx = w / 2;
    const cy = h / 2;
    const baseMaxRadius = Math.min(cx, cy) - 40;
    const maxRadius = baseMaxRadius * this.zoom;
    const ringSpacing = count > 1 ? maxRadius / (count + 1) : maxRadius / 2;
    this.layout = { width: w, height: h, cx, cy, maxRadius, instrumentCount: count, ringSpacing, zoom: this.zoom };
  }

  private loop = (): void => {
    this.render();
    this.animationId = requestAnimationFrame(this.loop);
  };

  private render(): void {
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w <= 0 || h <= 0) return;
    const state = useStore.getState();
    const { instruments, isPlaying, spinMode, bpm } = state;

    // Sort by loopSize ascending (smaller loops = inner rings)
    const ordered = [...instruments].sort((a, b) => a.loopSize - b.loopSize);

    // Update layout cache if needed
    if (w !== this.layout.width || h !== this.layout.height || ordered.length !== this.layout.instrumentCount || this.zoom !== this.layout.zoom) {
      this.updateLayout(w, h, ordered.length);
    }

    const { cx, cy, maxRadius, ringSpacing } = this.layout;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, w, h);

    // Compute real-time transport position (smooth 60fps, not discrete ticks)
    const toneTransport = Tone.getTransport();
    const secondsPer32nd = 60 / bpm / 8;
    const totalSteps = isPlaying ? toneTransport.seconds / secondsPer32nd : 0;

    // Indicator line: 1 rotation = maxLoopSize steps
    const maxLoopSize = ordered.reduce((m, i) => Math.max(m, i.loopSize), 1);
    const globalProgress = (totalSteps % maxLoopSize) / maxLoopSize;
    const globalRotation = globalProgress * TWO_PI;
    const lineAngle = spinMode ? TRIGGER_ANGLE + globalRotation : TRIGGER_ANGLE;

    // Per-instrument real-time progress
    const instProgressRT: Record<string, number> = {};
    for (const inst of ordered) {
      instProgressRT[inst.id] = isPlaying
        ? ((totalSteps % inst.loopSize) / inst.loopSize)
        : 0;
    }

    // Fixed clock-face reference grid: always 32 marks (1 bar of 32nd notes), never rotates
    const OUTER_GRID_STEPS = 32;
    for (let g = 0; g < OUTER_GRID_STEPS; g++) {
      const tickAngle = (g / OUTER_GRID_STEPS) * TWO_PI + TRIGGER_ANGLE;
      const cos = Math.cos(tickAngle);
      const sin = Math.sin(tickAngle);
      const isBar = g === 0;
      const isBeat = g % 8 === 0;
      const is16th = g % 4 === 0 && !isBeat;
      if (!isBeat && !is16th) continue;
      const innerR = 20;
      const outerR = maxRadius + 10;
      ctx.beginPath();
      ctx.moveTo(cx + cos * innerR, cy + sin * innerR);
      ctx.lineTo(cx + cos * outerR, cy + sin * outerR);
      ctx.strokeStyle = isBar
        ? 'rgba(255,255,255,0.12)'
        : isBeat
        ? 'rgba(255,255,255,0.07)'
        : 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Draw trigger line
    this.drawTriggerLine(ctx, cx, cy, maxRadius + 20, lineAngle);

    // Draw grid ticks on each orbit — evenly spaced rings, each spinning at its own speed
    for (let si = 0; si < ordered.length; si++) {
      const inst = ordered[si];
      const radius = ringSpacing * (si + 1);
      const alpha = inst.muted ? 0.15 : 0.4;

      // Per-instrument rotation (smooth, real-time)
      const instProg = instProgressRT[inst.id] ?? 0;
      const instRotation = instProg * TWO_PI;
      const dotRotation = spinMode ? 0 : instRotation;

      // Draw orbit ring
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, TWO_PI);
      ctx.strokeStyle = rgba(inst.color, alpha);
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Draw grid ticks based on instrument's loopSize — show all steps
      const gridDiv = inst.loopSize;
      for (let g = 0; g < gridDiv; g++) {
        const tickAngle = (g / gridDiv) * TWO_PI + TRIGGER_ANGLE - dotRotation;
        const cos = Math.cos(tickAngle);
        const sin = Math.sin(tickAngle);
        const isBeat = g % 8 === 0;
        const is16th = g % 4 === 0 && !isBeat;
        const tickLen = isBeat ? 12 : is16th ? 6 : 3;
        const tickAlpha = isBeat ? 0.3 : is16th ? 0.15 : 0.07;
        ctx.beginPath();
        ctx.moveTo(cx + cos * (radius - tickLen), cy + sin * (radius - tickLen));
        ctx.lineTo(cx + cos * (radius + tickLen), cy + sin * (radius + tickLen));
        ctx.strokeStyle = rgba(inst.color, tickAlpha);
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Draw hits
      const hitAlpha = inst.muted ? 0.3 : 0.9;
      const baseFillColor = rgba(inst.color, hitAlpha);
      const highlightColor = rgba('#ffffff', hitAlpha * 0.5);

      for (let i = 0; i < inst.hitPositions.length; i++) {
        const hitPos = inst.hitPositions[i];
        const hitAngle = hitPos * TWO_PI - dotRotation + TRIGGER_ANGLE;
        const hx = cx + Math.cos(hitAngle) * radius;
        const hy = cy + Math.sin(hitAngle) * radius;

        // Check if hit is currently triggered
        const diff = Math.abs(instProg - hitPos);
        const wrappedDiff = Math.min(diff, 1 - diff);
        const isTriggered = isPlaying && wrappedDiff < 0.01;

        ctx.beginPath();
        ctx.arc(hx, hy, HIT_RADIUS, 0, TWO_PI);

        if (isTriggered) {
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = inst.color;
          ctx.shadowBlur = 15;
          ctx.fill();
          ctx.shadowBlur = 0;
        } else {
          ctx.fillStyle = baseFillColor;
          ctx.fill();

          // Inner highlight
          ctx.beginPath();
          ctx.arc(hx, hy, HIT_RADIUS * 0.5, 0, TWO_PI);
          ctx.fillStyle = highlightColor;
          ctx.fill();
        }
      }
    }
  }

  private drawTriggerLine(ctx: CanvasRenderingContext2D, cx: number, cy: number, maxRadius: number, angle: number): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + cos * maxRadius, cy + sin * maxRadius);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(255,255,255,0.3)';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.restore();
  }

  // --- Hit detection for mouse interaction ---

  private getOrderedLayout(): Array<{ inst: Instrument; radius: number }> {
    const { instruments } = useStore.getState();
    const { ringSpacing } = this.layout;
    const sorted = [...instruments].sort((a, b) => a.loopSize - b.loopSize);
    return sorted.map((inst, si) => ({ inst, radius: ringSpacing * (si + 1) }));
  }

  getHitAt(mouseX: number, mouseY: number): { instrumentId: string; hitIndex: number } | null {
    const state = useStore.getState();
    const { isPlaying, spinMode, bpm } = state;
    const { cx, cy } = this.layout;

    const toneTransport = Tone.getTransport();
    const secondsPer32nd = 60 / bpm / 8;
    const totalSteps = isPlaying ? toneTransport.seconds / secondsPer32nd : 0;

    for (const { inst, radius } of this.getOrderedLayout()) {
      const instProg = isPlaying ? (totalSteps % inst.loopSize) / inst.loopSize : 0;
      const instRotation = instProg * TWO_PI;
      const dotRotation = spinMode ? 0 : instRotation;

      for (let i = 0; i < inst.hitPositions.length; i++) {
        const hitAngle = inst.hitPositions[i] * TWO_PI - dotRotation + TRIGGER_ANGLE;
        const hx = cx + Math.cos(hitAngle) * radius;
        const hy = cy + Math.sin(hitAngle) * radius;
        const dx = mouseX - hx;
        const dy = mouseY - hy;

        if (dx * dx + dy * dy < (HIT_RADIUS + 8) * (HIT_RADIUS + 8)) {
          return { instrumentId: inst.id, hitIndex: i };
        }
      }
    }
    return null;
  }

  getOrbitAt(mouseX: number, mouseY: number): { instrumentId: string; angle: number } | null {
    const state = useStore.getState();
    const { isPlaying, spinMode, bpm } = state;
    const { cx, cy } = this.layout;
    const dx = mouseX - cx;
    const dy = mouseY - cy;
    const distFromCenter = Math.sqrt(dx * dx + dy * dy);

    const toneTransport = Tone.getTransport();
    const secondsPer32nd = 60 / bpm / 8;
    const totalSteps = isPlaying ? toneTransport.seconds / secondsPer32nd : 0;

    for (const { inst, radius } of this.getOrderedLayout()) {
      if (Math.abs(distFromCenter - radius) < 15) {
        const instProg = isPlaying ? (totalSteps % inst.loopSize) / inst.loopSize : 0;
        const instRotation = instProg * TWO_PI;
        const dotRotation = spinMode ? 0 : instRotation;

        const angle = Math.atan2(dy, dx);
        let normalizedPos = (angle - TRIGGER_ANGLE + dotRotation) / TWO_PI;
        normalizedPos = ((normalizedPos % 1) + 1) % 1;
        return { instrumentId: inst.id, angle: normalizedPos };
      }
    }
    return null;
  }
}
