import { useRef, useEffect } from 'react';
import { useStore } from '../../state/store';

interface MiniOrbProps {
  instrumentId: string;
  /** Highlight border when the parent scene/card is selected */
  isSelected?: boolean;
  /** Show a mute toggle overlay in the center of the orb */
  showMuteOverlay?: boolean;
  /** Size in px (default 48) */
  size?: number;
}

export function MiniOrb({
  instrumentId,
  isSelected = false,
  showMuteOverlay = false,
  size = 48,
}: MiniOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const selectInstrument = useStore((s) => s.selectInstrument);
  const toggleMute = useStore((s) => s.toggleMute);
  const isPlaying = useStore((s) => s.isPlaying);
  const inst = useStore((s) => s.instruments.find((i) => i.id === instrumentId));
  const instName = inst?.name ?? '';
  const isMuted = inst?.muted ?? false;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !inst) return;

    let rotation = 0;
    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const radius = w / 2 - 3;

      ctx.clearRect(0, 0, w, h);

      // Outer ring — dimmed if muted
      const ringAlpha = isMuted ? 0.25 : 0.8;
      ctx.strokeStyle = `rgba(180, 180, 180, ${ringAlpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();

      // Hit position dots (rotate if playing, clockwise)
      if (inst.hitPositions && inst.hitPositions.length > 0) {
        const dotAlpha = isMuted ? 0.3 : 0.9;
        inst.hitPositions.forEach((angle) => {
          const rad = (angle * Math.PI * 2 + (isPlaying ? rotation : 0)) % (Math.PI * 2);
          const x = cx + Math.cos(rad) * (radius - 4);
          const y = cy + Math.sin(rad) * (radius - 4);
          ctx.fillStyle = `rgba(200, 200, 200, ${dotAlpha})`;
          ctx.beginPath();
          ctx.arc(x, y, 2, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      // Bottom indicator
      ctx.fillStyle = `rgba(220, 220, 220, ${isMuted ? 0.3 : 0.8})`;
      ctx.beginPath();
      ctx.arc(cx, cy + radius - 2, 2.5, 0, Math.PI * 2);
      ctx.fill();

      if (isPlaying) rotation += 0.02;
      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [inst, isPlaying, isMuted]);

  return (
    <div
      className="cursor-pointer rounded transition-colors flex-shrink-0 relative"
      style={{
        width: size,
        height: size,
        border: isSelected ? '1px solid rgba(200, 200, 200, 0.6)' : '1px solid transparent',
        opacity: isMuted ? 0.5 : 1,
      }}
      title={`${instName}${isMuted ? ' (muted)' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        selectInstrument(instrumentId);
      }}
    >
      <canvas ref={canvasRef} width={size} height={size} style={{ display: 'block', width: size, height: size }} />
      {showMuteOverlay && (
        <button
          className="absolute rounded-full transition-all"
          style={{
            width: 14,
            height: 14,
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            background: isMuted ? 'rgba(255, 80, 80, 0.8)' : 'rgba(100, 255, 100, 0.6)',
            border: '1px solid rgba(255,255,255,0.3)',
          }}
          title={isMuted ? 'Unmute' : 'Mute'}
          onClick={(e) => {
            e.stopPropagation();
            toggleMute(instrumentId);
          }}
        />
      )}
    </div>
  );
}
