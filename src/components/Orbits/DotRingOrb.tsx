/**
 * DotRingOrb — pure SVG/DOM orbit display.
 *
 * A fixed circle of SVG <circle> elements.  Hit-coloured dots rotate clockwise
 * through the fixed grid; when one reaches the bottom indicator it flashes white.
 * All per-frame updates go through direct DOM manipulation (refs), NOT React state,
 * so there are zero re-renders during playback.
 */

import { useEffect, useRef, useCallback } from 'react';
import * as Tone from 'tone';
import { useStore } from '../../state/store';
import { isInstrumentEffectivelyMuted } from '../../canvas/renderUtils';

const TWO_PI = Math.PI * 2;
const TRIGGER_ANGLE = Math.PI / 2; // 6 o'clock (bottom)

// ── helpers ──────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

interface Props {
  instrumentId: string;
  /** Rendered size in CSS px — the SVG viewBox matches this 1:1 */
  size: number;
}

export function DotRingOrb({ instrumentId, size }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dotsRef = useRef<(SVGCircleElement | null)[]>([]);
  const hitsTextRef = useRef<SVGTextElement>(null);
  const loopTextRef = useRef<SVGTextElement>(null);
  const indicatorRef = useRef<SVGLineElement>(null);
  const rafRef = useRef(0);

  // Snapshot refs so the RAF loop reads fresh store without re-renders
  const instRef = useRef(useStore.getState().instruments.find((i) => i.id === instrumentId));
  const stateRef = useRef(useStore.getState());

  // Keep refs fresh via Zustand subscribe (no re-renders)
  useEffect(() => {
    const unsub = useStore.subscribe((s) => {
      stateRef.current = s;
      instRef.current = s.instruments.find((i) => i.id === instrumentId);
    });
    return unsub;
  }, [instrumentId]);

  // Build dot elements once when loopSize changes — the ONLY thing that triggers re-render
  const inst = useStore((s) => s.instruments.find((i) => i.id === instrumentId));
  const loopSize = inst?.loopSize ?? 16;
  const color = inst?.color ?? '#6d8cff';
  const rgb = hexToRgb(color);

  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 22; // ring padding

  // Pre-compute fixed dot positions (never change for a given loopSize)
  const dotPositions = useRef<{ x: number; y: number }[]>([]);
  if (dotPositions.current.length !== loopSize) {
    dotPositions.current = Array.from({ length: loopSize }, (_, g) => {
      const angle = TRIGGER_ANGLE - (g / loopSize) * TWO_PI;
      return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
    });
  }

  // RAF loop — direct DOM updates, no setState
  useEffect(() => {
    const tick = () => {
      const state = stateRef.current;
      const inst = instRef.current;
      if (!inst) { rafRef.current = requestAnimationFrame(tick); return; }

      const dots = dotsRef.current;
      const ls = inst.loopSize;

      // Transport progress
      const transport = Tone.getTransport();
      const stepsPerBeat = state.stepsPerBeat ?? 8;
      const secondsPerStep = 60 / state.bpm / stepsPerBeat;
      const totalSteps = state.isPlaying ? transport.seconds / secondsPerStep : 0;
      const effectivelyMuted = isInstrumentEffectivelyMuted(state, inst.id, inst.muted, inst.solo);
      const instProg = state.isPlaying && !effectivelyMuted
        ? (totalSteps % ls) / ls : 0;
      const currentStep = Math.floor(instProg * ls) % ls;

      // Build hit step set
      const hitSteps = new Set<number>();
      for (const hp of inst.hitPositions) {
        hitSteps.add(Math.round(hp * ls) % ls);
      }

      // Rotate: original hit at step s → display at (s + currentStep) % ls
      const rotatedHits = new Set<number>();
      for (const s of hitSteps) {
        rotatedHits.add((s - currentStep + ls) % ls);
      }

      const isMuted = inst.muted;
      const activeColor = `rgba(${rgb},${isMuted ? 0.35 : 0.9})`;
      const dimColor = 'rgba(255,255,255,0.07)';
      const triggerStep = 0; // step 0 sits at the indicator (TRIGGER_ANGLE)

      for (let g = 0; g < ls; g++) {
        const dot = dots[g];
        if (!dot) continue;

        const isHit = rotatedHits.has(g);
        const isTriggered = state.isPlaying && isHit && g === triggerStep;

        if (isTriggered) {
          dot.setAttribute('r', '6');
          dot.setAttribute('fill', '#ffffff');
        } else if (isHit) {
          dot.setAttribute('r', '4.5');
          dot.setAttribute('fill', activeColor);
        } else {
          dot.setAttribute('r', '2.5');
          dot.setAttribute('fill', dimColor);
        }
      }

      // Update center text
      if (hitsTextRef.current) {
        hitsTextRef.current.textContent = String(inst.hits);
      }
      if (loopTextRef.current) {
        loopTextRef.current.textContent = `/${inst.loopSize}`;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [loopSize, rgb, cx, cy, radius]);

  // Store dot refs
  const setDotRef = useCallback((idx: number) => (el: SVGCircleElement | null) => {
    dotsRef.current[idx] = el;
  }, []);

  if (!inst) return null;

  const indicatorX = cx + Math.cos(TRIGGER_ANGLE) * radius;
  const indicatorY1 = cy + Math.sin(TRIGGER_ANGLE) * radius + 6;
  const indicatorY2 = indicatorY1 + 14;
  const fontSize = Math.max(14, Math.floor(radius * 0.45));

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${size} ${size}`}
      className="w-full aspect-square"
      style={{ overflow: 'visible' }}
    >
      {/* Ring stroke */}
      <circle
        cx={cx} cy={cy} r={radius}
        fill="none"
        stroke={`rgba(${rgb},0.15)`}
        strokeWidth="1"
      />

      {/* Fixed dot positions */}
      {dotPositions.current.map((pos, g) => (
        <circle
          key={g}
          ref={setDotRef(g)}
          cx={pos.x}
          cy={pos.y}
          r={2.5}
          fill="rgba(255,255,255,0.07)"
        />
      ))}

      {/* Fixed indicator line at bottom */}
      <line
        ref={indicatorRef}
        x1={indicatorX}
        y1={indicatorY1}
        x2={indicatorX}
        y2={indicatorY2}
        stroke="rgba(255,255,255,0.75)"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* Center text: hits */}
      <text
        ref={hitsTextRef}
        x={cx}
        y={cy - fontSize * 0.15}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={`rgba(${rgb},0.8)`}
        fontFamily="monospace"
        fontWeight="bold"
        fontSize={fontSize}
      >
        {inst.hits}
      </text>

      {/* Center text: /loopSize */}
      <text
        ref={loopTextRef}
        x={cx}
        y={cy + fontSize * 0.7}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="rgba(255,255,255,0.25)"
        fontFamily="monospace"
        fontSize={Math.floor(fontSize * 0.5)}
      >
        /{inst.loopSize}
      </text>
    </svg>
  );
}
