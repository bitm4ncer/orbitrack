import { useRef, useCallback, useState } from 'react';

const SIZE_MAP = { sm: 38, md: 50, lg: 64 } as const;

// Knob sweep: 270° arc starting at 7 o'clock (-225° from positive X axis)
const START_DEG = -225;
const RANGE_DEG = 270;

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const s = toRad(startDeg);
  const e = toRad(endDeg);
  const x1 = cx + r * Math.cos(s);
  const y1 = cy + r * Math.sin(s);
  const x2 = cx + r * Math.cos(e);
  const y2 = cy + r * Math.sin(e);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

function snapToStep(value: number, step: number, min: number, max: number): number {
  const snapped = Math.round((value - min) / step) * step + min;
  return Math.max(min, Math.min(max, parseFloat(snapped.toFixed(10))));
}

function formatValue(v: number, step: number, unit?: string): string {
  const decimals = step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0;
  const s = v.toFixed(decimals);
  return unit ? `${s} ${unit}` : s;
}

interface EffectKnobProps {
  value: number;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  label: string;
  color: string;
  unit?: string;
  size?: 'sm' | 'md' | 'lg';
  onChange: (v: number) => void;
}

export function EffectKnob({
  value, min, max, step, defaultValue, label, color, unit,
  size = 'md', onChange,
}: EffectKnobProps) {
  const px = SIZE_MAP[size];
  const cx = px / 2;
  const cy = px / 2;
  const trackR = px * 0.38;
  const bodyR  = px * 0.30;
  const dotR   = px * 0.05;

  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const valueDeg = START_DEG + t * RANGE_DEG;

  // Indicator dot position
  const indR = px * 0.20;
  const dotX = cx + indR * Math.cos(toRad(valueDeg));
  const dotY = cy + indR * Math.sin(toRad(valueDeg));

  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startY: number; startVal: number } | null>(null);

  const SENSITIVITY = 180; // px for full range

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startVal: value };
    setDragging(true);
    e.preventDefault();
  }, [value]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const sens = e.shiftKey ? SENSITIVITY * 5 : SENSITIVITY;
    const delta = -(e.clientY - dragRef.current.startY) / sens * (max - min);
    const raw = dragRef.current.startVal + delta;
    onChange(snapToStep(raw, step, min, max));
  }, [min, max, step, onChange]);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
  }, []);

  const handleDoubleClick = useCallback(() => {
    onChange(defaultValue);
  }, [defaultValue, onChange]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1 : -1;
    const mult = e.shiftKey ? 1 : 1;
    onChange(snapToStep(value + dir * step * mult, step, min, max));
  }, [value, min, max, step, onChange]);

  const displayVal = formatValue(value, step, unit);
  const dimColor = `${color}40`; // 25% opacity for track
  const activeColor = color;

  return (
    <div
      className="flex flex-col items-center gap-0.5 select-none"
      style={{ width: px }}
    >
      <div
        style={{ width: px, height: px, cursor: 'ns-resize', position: 'relative' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        title={`${label}: ${displayVal}${dragging ? '' : '\nDrag to adjust · Shift = fine · Dbl-click = reset'}`}
      >
        <svg width={px} height={px} style={{ display: 'block' }} overflow="visible">
          <defs>
            <radialGradient id={`kg-${label.replace(/\W+/g, '_')}-body`} cx="40%" cy="35%" r="60%">
              <stop offset="0%" stopColor="#3a3a50" />
              <stop offset="100%" stopColor="#141420" />
            </radialGradient>
          </defs>

          {/* Track background arc (full 270°) */}
          <path
            d={arcPath(cx, cy, trackR, START_DEG, START_DEG + RANGE_DEG)}
            fill="none"
            stroke={dimColor}
            strokeWidth={size === 'lg' ? 3.5 : size === 'md' ? 3 : 2.5}
            strokeLinecap="round"
          />

          {/* Active arc */}
          {t > 0.001 && (
            <path
              d={arcPath(cx, cy, trackR, START_DEG, valueDeg)}
              fill="none"
              stroke={activeColor}
              strokeWidth={size === 'lg' ? 3.5 : size === 'md' ? 3 : 2.5}
              strokeLinecap="round"
              style={{ filter: dragging ? `drop-shadow(0 0 3px ${color})` : undefined }}
            />
          )}

          {/* Knob body */}
          <circle
            cx={cx} cy={cy} r={bodyR}
            fill={`url(#kg-${label.replace(/\W+/g, '_')}-body)`}
            stroke="#2a2a3c"
            strokeWidth={1}
          />

          {/* Indicator dot */}
          <circle
            cx={dotX} cy={dotY} r={dotR}
            fill={dragging ? activeColor : '#d0d0e0'}
            style={{ filter: dragging ? `drop-shadow(0 0 2px ${color})` : undefined }}
          />
        </svg>
      </div>

      {/* Label */}
      <span
        className={`fx-knob-label ${size === 'lg' ? 'fx-knob-label-lg' : ''} truncate w-full`}
        style={{ maxWidth: px }}
      >
        {label}
      </span>

      {/* Value */}
      <span
        className={`fx-knob-value ${size === 'lg' ? 'fx-knob-value-lg' : ''} truncate w-full`}
        style={{ color: dragging ? color : '#6060a0', maxWidth: px }}
      >
        {displayVal}
      </span>
    </div>
  );
}
