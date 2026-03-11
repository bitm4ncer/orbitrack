import { useEffect, useRef } from 'react';
import { getMasterAnalyser } from '../../audio/routingEngine';

const CANVAS_H = 30;

export function WaveformView({ isRecording = false }: { isRecording?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const recordingRef = useRef(isRecording);
  recordingRef.current = isRecording;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const W = container.clientWidth || 240;
    canvas.width = W;
    canvas.height = CANVAS_H;

    // Circular buffer of peak levels — one per pixel column
    const history = new Float32Array(W);
    let writeIdx = 0;

    let dataBuffer: Float32Array | null = null;

    const draw = () => {
      const analyser = getMasterAnalyser();
      const ctx = canvas.getContext('2d');
      if (!ctx) { rafRef.current = requestAnimationFrame(draw); return; }

      // Sample current peak level
      let peak = 0;
      if (analyser) {
        if (!dataBuffer || dataBuffer.length !== analyser.fftSize) {
          dataBuffer = new Float32Array(analyser.fftSize);
        }
        analyser.getFloatTimeDomainData(dataBuffer as Float32Array<ArrayBuffer>);
        for (let i = 0; i < dataBuffer.length; i++) {
          const abs = Math.abs(dataBuffer[i]);
          if (abs > peak) peak = abs;
        }
      }

      // Push into circular buffer
      history[writeIdx] = Math.min(peak, 1);
      writeIdx = (writeIdx + 1) % W;

      // Draw — scrolls right to left, newest on the right
      ctx.clearRect(0, 0, W, CANVAS_H);

      // Subtle center line
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(0, CANVAS_H / 2, W, 1);

      const halfH = CANVAS_H / 2;

      for (let x = 0; x < W; x++) {
        // Read from buffer so oldest is on the left, newest on the right
        const idx = (writeIdx + x) % W;
        const level = history[idx];
        if (level < 0.002) continue; // skip silence

        const barH = level * halfH * 0.92;
        const y = halfH - barH;

        // Fade: older (left) is more transparent, newer (right) is brighter
        const age = x / W; // 0 = oldest, 1 = newest
        const alpha = 0.08 + age * 0.25;
        const rgb = recordingRef.current ? '220, 60, 60' : '148, 163, 184';
        ctx.fillStyle = `rgba(${rgb}, ${alpha})`;
        ctx.fillRect(x, y, 1, barH * 2);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div ref={containerRef} className="w-full flex-1 min-w-0">
      <canvas
        ref={canvasRef}
        height={CANVAS_H}
        className="w-full block"
        style={{ imageRendering: 'auto' }}
      />
    </div>
  );
}
