/**
 * LFOPanel — Serum/Vital-style tabbed LFO interface.
 * 4 LFO slots with large animated waveform, drag handle, shape/trigger/rate controls.
 * Uses instrument color for all LFO styling.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { LFOSlotParams, SynthParams, LFOShape } from '../../audio/synth/types';
import { DEFAULT_LFO_SLOT } from '../../audio/synth/types';
import { SYNC_DIVS, SYNC_DIV_LABELS, LFO_SHAPE_LABELS, sampleLFOShape } from '../../audio/synth/modConstants';
import { useModulation } from './ModulationContext';
import type { LFOSourceId } from '../../audio/synth/ModulationEngine';
import { EffectKnob } from '../EffectsSidebar/EffectKnob';

// ── Waveform display ────────────────────────────────────────────────────────

const DISPLAY_H = 72;

function LFOWaveDisplay({ shape, rate, color }: { shape: LFOShape; rate: number; color: string }) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef       = useRef(0);
  const propsRef     = useRef({ shape, rate, color });

  useEffect(() => { propsRef.current = { shape, rate, color }; }, [shape, rate, color]);

  useEffect(() => {
    const canvas    = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const W = container.clientWidth || 220;
    canvas.width  = W;
    canvas.height = DISPLAY_H;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const { shape, rate, color } = propsRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = '#0a0a14';
      ctx.fillRect(0, 0, W, DISPLAY_H);

      const pad = 6;
      const mid = DISPLAY_H / 2;
      const amp = mid - pad;

      // Grid lines
      ctx.strokeStyle = '#1a1a2a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, mid); ctx.lineTo(W, mid);
      ctx.moveTo(0, pad); ctx.lineTo(W, pad);
      ctx.moveTo(0, DISPLAY_H - pad); ctx.lineTo(W, DISPLAY_H - pad);
      ctx.stroke();

      // Waveform fill
      ctx.beginPath();
      ctx.moveTo(0, mid);
      for (let i = 0; i <= W; i++) {
        const t = i / W;
        ctx.lineTo(i, mid - sampleLFOShape(t, shape) * amp);
      }
      ctx.lineTo(W, mid);
      ctx.closePath();
      ctx.fillStyle = `${color}15`;
      ctx.fill();

      // Waveform stroke
      ctx.beginPath();
      for (let i = 0; i <= W; i++) {
        const t = i / W;
        const y = mid - sampleLFOShape(t, shape) * amp;
        i === 0 ? ctx.moveTo(i, y) : ctx.lineTo(i, y);
      }
      ctx.strokeStyle = `${color}88`;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Phase scan line
      const phase = (performance.now() / 1000 * rate) % 1;
      const phaseX = phase * W;
      const phaseY = mid - sampleLFOShape(phase, shape) * amp;

      // Glow
      ctx.save();
      ctx.filter = 'blur(6px)';
      ctx.strokeStyle = `${color}50`;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(phaseX, 0);
      ctx.lineTo(phaseX, DISPLAY_H);
      ctx.stroke();
      ctx.restore();

      // Scan line
      ctx.strokeStyle = `${color}30`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(phaseX, 0);
      ctx.lineTo(phaseX, DISPLAY_H);
      ctx.stroke();

      // Phase dot
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(phaseX, phaseY, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(phaseX, phaseY, 1.5, 0, Math.PI * 2);
      ctx.fill();
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div ref={containerRef} className="w-full rounded overflow-hidden" style={{ height: DISPLAY_H }}>
      <canvas ref={canvasRef} height={DISPLAY_H} className="w-full block" />
    </div>
  );
}

// ── Button helpers ──────────────────────────────────────────────────────────

const STANDARD_SHAPES: LFOShape[] = ['sine', 'triangle', 'square', 'sawtooth'];
const CUSTOM_SHAPES: LFOShape[] = ['expDecay', 'expRise', 'punch', 'halfSine', 'staircase'];
const TRIGGER_MODES = ['free', 'retrig', 'envelope'] as const;
const TRIGGER_LABELS = ['FREE', 'RETRIG', 'ENV'];

function SmallButtons<T extends string>({
  labels, values, active, color, onChange,
}: { labels: string[]; values: T[]; active: T; color: string; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-0.5 w-full">
      {labels.map((label, i) => {
        const isActive = values[i] === active;
        return (
          <button
            key={i}
            onClick={() => onChange(values[i])}
            className="flex-1 text-[7px] uppercase tracking-wider py-0.5 rounded transition-all"
            style={{
              background: isActive ? `${color}28` : 'transparent',
              border: `1px solid ${isActive ? color : '#2a2a3a'}`,
              color: isActive ? color : '#8888a0',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

interface Props {
  lfos: [LFOSlotParams, LFOSlotParams, LFOSlotParams, LFOSlotParams];
  onLFOChange: (idx: number, params: LFOSlotParams) => void;
  assignments: { id: string; source: string; target: string; depth: number }[];
  instrumentColor: string;
}

export function LFOPanel({ lfos, onLFOChange, assignments, instrumentColor }: Props) {
  const [activeTab, setActiveTab] = useState(0);
  const { startDrag, endDrag, removeMod, updateModDepth } = useModulation();

  const lfo = lfos[activeTab] ?? DEFAULT_LFO_SLOT;
  const color = instrumentColor; // Use instrument color for everything
  const sourceId = `lfo${activeTab + 1}` as LFOSourceId;

  const update = useCallback((patch: Partial<LFOSlotParams>) => {
    onLFOChange(activeTab, { ...lfo, ...patch });
  }, [activeTab, lfo, onLFOChange]);

  // Assignments for this LFO
  const myAssignments = assignments.filter((a) => a.source === sourceId);

  return (
    <div style={{ borderBottom: `1px solid ${color}20` }}>
      {/* Tab bar */}
      <div className="flex items-center px-4 py-1 gap-0.5">
        <span className="text-[9px] uppercase tracking-wider font-medium mr-2" style={{ color }}>
          LFO
        </span>
        {[0, 1, 2, 3].map((i) => (
          <button
            key={i}
            onClick={() => setActiveTab(i)}
            className="text-[8px] px-2 py-0.5 rounded transition-all"
            style={{
              background: activeTab === i ? `${color}28` : 'transparent',
              border: `1px solid ${activeTab === i ? color : '#2a2a3a'}`,
              color: activeTab === i ? color : '#666',
            }}
          >
            {i + 1}
          </button>
        ))}
      </div>

      <div className="px-4 pb-3 flex flex-col gap-2">
        {/* Waveform display + drag handle */}
        <div className="relative">
          <LFOWaveDisplay shape={lfo.shape} rate={lfo.tempoSync ? lfo.rate : lfo.rate} color={color} />
          {/* Drag handle */}
          <div
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('lfo-source', sourceId);
              e.dataTransfer.effectAllowed = 'link';
              startDrag(sourceId);
            }}
            onDragEnd={() => endDrag()}
            className="absolute top-1 right-1 w-5 h-5 rounded-full cursor-grab active:cursor-grabbing flex items-center justify-center"
            style={{
              background: `${color}60`,
              border: `2px solid ${color}`,
            }}
            title="Drag onto any knob to modulate"
          >
            <span className="text-[7px] font-bold" style={{ color }}>{activeTab + 1}</span>
          </div>
        </div>

        {/* Shape selector — standard shapes */}
        <SmallButtons
          labels={STANDARD_SHAPES.map(s => LFO_SHAPE_LABELS[s])}
          values={STANDARD_SHAPES as unknown as string[]}
          active={lfo.shape}
          color={color}
          onChange={(v) => update({ shape: v as LFOShape })}
        />
        {/* Shape selector — custom shapes */}
        <SmallButtons
          labels={CUSTOM_SHAPES.map(s => LFO_SHAPE_LABELS[s])}
          values={CUSTOM_SHAPES as unknown as string[]}
          active={lfo.shape}
          color={color}
          onChange={(v) => update({ shape: v as LFOShape })}
        />

        {/* Trigger mode */}
        <SmallButtons
          labels={TRIGGER_LABELS}
          values={TRIGGER_MODES as unknown as ('free' | 'retrig' | 'envelope')[]}
          active={lfo.triggerMode}
          color={color}
          onChange={(v) => update({ triggerMode: v as LFOSlotParams['triggerMode'] })}
        />

        {/* Rate + Tempo Sync */}
        <div className="flex items-end gap-1">
          <EffectKnob
            value={lfo.rate}
            min={0.05}
            max={20}
            step={0.05}
            defaultValue={1}
            label="Rate"
            color={color}
            unit="Hz"
            size="sm"
            onChange={(v) => update({ rate: v })}
          />
          <div className="flex flex-col gap-0.5">
            <button
              onClick={() => update({ tempoSync: !lfo.tempoSync })}
              className="text-[7px] uppercase tracking-wider px-2 py-0.5 rounded transition-all"
              style={{
                background: lfo.tempoSync ? `${color}28` : 'transparent',
                border: `1px solid ${lfo.tempoSync ? color : '#2a2a3a'}`,
                color: lfo.tempoSync ? color : '#8888a0',
              }}
            >
              Sync
            </button>
            {lfo.tempoSync && (
              <select
                value={lfo.syncDiv}
                onChange={(e) => update({ syncDiv: e.target.value })}
                className="text-[7px] py-0.5 px-1 rounded border bg-transparent outline-none"
                style={{ borderColor: `${color}40`, color }}
              >
                {SYNC_DIVS.map((d) => (
                  <option key={d} value={d} style={{ background: '#0e0e18', color: '#ccc' }}>{SYNC_DIV_LABELS[d] ?? d}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Smooth, Delay, Phase */}
        <div className="flex justify-around items-end gap-1">
          <EffectKnob
            value={lfo.smooth} min={0} max={1} step={0.01} defaultValue={0}
            label="Smooth" color={color} size="sm"
            onChange={(v) => update({ smooth: v })}
          />
          <EffectKnob
            value={lfo.delay} min={0} max={2} step={0.01} defaultValue={0}
            label="Delay" color={color} unit="s" size="sm"
            onChange={(v) => update({ delay: v })}
          />
          <EffectKnob
            value={lfo.phase} min={0} max={1} step={0.01} defaultValue={0}
            label="Phase" color={color} size="sm"
            onChange={(v) => update({ phase: v })}
          />
        </div>

        {/* Active assignments for this LFO */}
        {myAssignments.length > 0 && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[7px] text-text-secondary/50 uppercase tracking-wider">Assignments</span>
            {myAssignments.map((a) => (
              <div key={a.id} className="flex items-center gap-1 text-[8px]">
                <span style={{ color }} className="truncate flex-1">{a.target}</span>
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.01}
                  value={a.depth}
                  onChange={(e) => updateModDepth(a.id, parseFloat(e.target.value))}
                  className="w-16 h-1 appearance-none rounded cursor-pointer"
                  style={{ accentColor: color }}
                />
                <span className="text-text-secondary/60 w-8 text-right">{a.depth > 0 ? '+' : ''}{(a.depth * 100).toFixed(0)}%</span>
                <button
                  onClick={() => removeMod(a.id)}
                  className="text-[7px] text-text-secondary/40 hover:text-red-400 transition-colors px-0.5"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
