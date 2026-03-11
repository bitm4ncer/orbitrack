import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../state/store';

// Global event emitter for MIDI/keyboard activity
class MidiActivityEmitter {
  private listeners: (() => void)[] = [];

  trigger() {
    this.listeners.forEach(listener => listener());
  }

  subscribe(callback: () => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }
}

// Global event emitter for metronome ticks
class MetronomeEmitter {
  private listeners: (() => void)[] = [];

  trigger() {
    this.listeners.forEach(listener => listener());
  }

  subscribe(callback: () => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }
}

export const midiActivityEmitter = new MidiActivityEmitter();
export const metronomeEmitter = new MetronomeEmitter();

export function MidiLight() {
  const [pulses, setPulses] = useState<{ id: number }[]>([]);
  const [metronomeEnabled, setMetronomeEnabled] = useState(true);
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const audioContextRef = useRef<AudioContext | null>(null);
  const pulseIdRef = useRef(0);
  const isPlayingRef = useRef(false);

  const isPlaying = useStore((s) => s.isPlaying);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    const unsubscribeActivity = midiActivityEmitter.subscribe(() => {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {}, 150);
    });

    const unsubscribeMetronome = metronomeEmitter.subscribe(() => {
      if (!isPlayingRef.current || !metronomeEnabled) return;

      // Add pulse animation
      const id = pulseIdRef.current++;
      setPulses((prev) => [...prev, { id }]);

      // Remove pulse after animation
      setTimeout(() => {
        setPulses((prev) => prev.filter((p) => p.id !== id));
      }, 600);

      // Play metronome sound if enabled
      if (metronomeEnabled) {
        playMetronomeSound();
      }

      // Light up the dot
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {}, 100);
    });

    return () => {
      unsubscribeActivity();
      unsubscribeMetronome();
      clearTimeout(timeoutRef.current);
    };
  }, [metronomeEnabled]);

  const playMetronomeSound = async () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      const now = ctx.currentTime;

      // Create a bright click sound
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.08);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

      osc.start(now);
      osc.stop(now + 0.08);
    } catch (e) {
      console.error('Failed to play metronome sound:', e);
    }
  };

  const toggleMetronomeSound = () => {
    setMetronomeEnabled(!metronomeEnabled);
  };

  return (
    <div className="relative flex items-center justify-center">
      {/* Animated expanding circles */}
      {pulses.map((pulse) => (
        <div
          key={pulse.id}
          className="absolute rounded-full"
          style={{
            width: '12px',
            height: '12px',
            border: '1px solid rgb(239, 68, 68)',
            animation: `pulse-expand 0.6s ease-out forwards`,
            pointerEvents: 'none',
          }}
        />
      ))}

      <button
        onClick={toggleMetronomeSound}
        className="invisible w-0"
        title={`MIDI/Metronome - Sound ${metronomeEnabled ? 'ON' : 'OFF'}`}
      />

      <style>{`
        @keyframes pulse-expand {
          0% {
            width: 12px;
            height: 12px;
            opacity: 1;
            border-color: rgb(239, 68, 68);
          }
          100% {
            width: 28px;
            height: 28px;
            opacity: 0;
            border-color: transparent;
          }
        }
      `}</style>
    </div>
  );
}
