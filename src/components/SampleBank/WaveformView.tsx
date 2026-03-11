import { useEffect, useRef, useState, useCallback } from 'react';
import * as Tone from 'tone';

interface WaveformViewProps {
  sampleUrl: string;
  begin: number;
  end: number;
  attack?: number;
  release?: number;
  color?: string;
  onRegionChange?: (begin: number, end: number) => void;
}

type DragTarget = 'begin' | 'end' | null;

export function WaveformView({ sampleUrl, begin, end, attack = 0, release = 0, color = '#7dd3fc', onRegionChange }: WaveformViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [loading, setLoading] = useState(false);
  const [duration, setDuration] = useState<number>(0);
  const [localBegin, setLocalBegin] = useState(begin);
  const [localEnd, setLocalEnd] = useState(end);
  const dragTarget = useRef<DragTarget>(null);
  const localBeginRef = useRef(begin);
  const localEndRef = useRef(end);
  const containerRef = useRef<HTMLDivElement>(null);

  // Decode audio and extract peak data
  useEffect(() => {
    if (!sampleUrl) return;
    setLoading(true);
    setPeaks(null);

    const ctx = Tone.getContext().rawContext as AudioContext;
    const baseUrl = (import.meta.env.BASE_URL as string) ?? '/';
    const url = sampleUrl.startsWith('blob:') || sampleUrl.startsWith('http')
      ? sampleUrl
      : baseUrl.replace(/\/$/, '') + '/' + sampleUrl;

    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((buf) => ctx.decodeAudioData(buf))
      .then((decoded) => {
        // Merge channels to mono peak array (512 buckets)
        const buckets = 512;
        const channelCount = decoded.numberOfChannels;
        const samplesPerBucket = Math.ceil(decoded.length / buckets);
        const result = new Float32Array(buckets);

        for (let b = 0; b < buckets; b++) {
          let peak = 0;
          const start = b * samplesPerBucket;
          const end = Math.min(start + samplesPerBucket, decoded.length);
          for (let ch = 0; ch < channelCount; ch++) {
            const data = decoded.getChannelData(ch);
            for (let i = start; i < end; i++) {
              const abs = Math.abs(data[i]);
              if (abs > peak) peak = abs;
            }
          }
          result[b] = peak;
        }
        setPeaks(result);
        setDuration(decoded.duration);
      })
      .catch(() => {
        setPeaks(null);
        setDuration(0);
      })
      .finally(() => setLoading(false));
  }, [sampleUrl]);

  // Sync local begin/end when props change and not dragging
  useEffect(() => {
    if (!dragTarget.current) {
      setLocalBegin(begin);
      setLocalEnd(end);
      localBeginRef.current = begin;
      localEndRef.current = end;
    }
  }, [begin, end]);

  // Draw waveform to canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = canvas;

    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);

    if (!peaks) {
      // Loading or no data
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(loading ? 'loading…' : 'no waveform', width / 2, height / 2);
      return;
    }

    const mid = height / 2;
    const beginX = localBegin * width;
    const endX = localEnd * width;

    // Region tint
    ctx.fillStyle = `${color}18`;
    ctx.fillRect(beginX, 0, endX - beginX, height);

    // Waveform bars
    const barW = Math.max(1, width / peaks.length);
    for (let i = 0; i < peaks.length; i++) {
      const x = (i / peaks.length) * width;
      const amp = peaks[i] * mid * 0.95;
      const inRegion = x >= beginX && x <= endX;
      ctx.fillStyle = inRegion ? color : 'rgba(255,255,255,0.2)';
      ctx.fillRect(x, mid - amp, barW, amp * 2 || 1);
    }

    // Attack envelope (left gradient) — relative to region duration
    if (attack > 0 && duration > 0) {
      const regionDurationSec = (localEnd - localBegin) * duration;
      const attackWidthPx = Math.max(1, (attack / regionDurationSec) * (endX - beginX));
      const grad = ctx.createLinearGradient(beginX, 0, beginX + attackWidthPx, 0);
      grad.addColorStop(0, `${color}00`);
      grad.addColorStop(1, `${color}66`);
      ctx.fillStyle = grad;
      ctx.fillRect(beginX, 0, attackWidthPx, height);
    }


    // Center line
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(width, mid);
    ctx.stroke();

    // Region markers
    const markerColor = '#f59e0b';
    const drawMarker = (x: number, label: string) => {
      ctx.strokeStyle = markerColor;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = markerColor;
      ctx.font = '8px monospace';
      ctx.textAlign = x < width / 2 ? 'left' : 'right';
      const xOff = x < width / 2 ? x + 3 : x - 3;
      ctx.fillText(label, xOff, 10);
    };

    drawMarker(beginX, 'B');
    drawMarker(endX, 'E');
  }, [peaks, localBegin, localEnd, color, loading, attack, duration]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      draw();
    });
    ro.observe(canvas);
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    return () => ro.disconnect();
  }, [draw]);

  // Drag marker logic
  const xToNorm = (clientX: number): number => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!onRegionChange) return;
    const norm = xToNorm(e.clientX);
    const beginX = localBegin * (containerRef.current?.offsetWidth ?? 1);
    const endX = localEnd * (containerRef.current?.offsetWidth ?? 1);
    const x = norm * (containerRef.current?.offsetWidth ?? 1);

    const hitRadius = 8;
    if (Math.abs(x - beginX) <= hitRadius) {
      dragTarget.current = 'begin';
    } else if (Math.abs(x - endX) <= hitRadius) {
      dragTarget.current = 'end';
    }
  };

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!dragTarget.current) return;
      const norm = xToNorm(e.clientX);
      if (dragTarget.current === 'begin') {
        const newBegin = Math.min(norm, localEnd - 0.01);
        setLocalBegin(newBegin);
        localBeginRef.current = newBegin;
      } else {
        const newEnd = Math.max(norm, localBegin + 0.01);
        setLocalEnd(newEnd);
        localEndRef.current = newEnd;
      }
    };
    const handleUp = () => {
      if (dragTarget.current && onRegionChange) {
        onRegionChange(localBeginRef.current, localEndRef.current);
      }
      dragTarget.current = null;
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [localBegin, localEnd, onRegionChange]);

  return (
    <div ref={containerRef} className="relative w-full" style={{ height: 72 }}>
      <canvas
        ref={canvasRef}
        className="w-full h-full rounded"
        style={{ cursor: onRegionChange ? 'col-resize' : 'default' }}
        onMouseDown={handleMouseDown}
      />
    </div>
  );
}
