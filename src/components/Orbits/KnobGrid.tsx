import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../state/store';
import { KnobCanvas } from './KnobCanvas';


// Slider maps left→right to small→large cards: 120px – 480px
const MIN_CARD = 120;
const MAX_CARD = 480;

export function KnobGrid() {
  const instruments = useStore((s) => s.instruments);
  const snapEnabled = useStore((s) => s.snapEnabled);
  // sliderVal: 1 (left = small cards) … 12 (right = big cards)
  const [sliderVal, setSliderVal] = useState(4);
  const cardMinWidth = Math.round(MIN_CARD + (sliderVal - 1) * (MAX_CARD - MIN_CARD) / 11);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.shiftKey) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? -1 : 1;
      setSliderVal((v) => Math.max(1, Math.min(12, v + delta)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const selectInstrument = useStore((s) => s.selectInstrument);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-auto"
      style={{ padding: 50 }}
      onClick={() => selectInstrument(null)}
    >
      {/* Card-size slider */}
      <div className="absolute top-3 left-3 flex items-center z-20">
        <input
          type="range"
          min={1}
          max={12}
          value={sliderVal}
          onChange={(e) => setSliderVal(Number(e.target.value))}
          className="w-20 h-1 accent-white/40 cursor-pointer opacity-40 hover:opacity-80 transition-opacity"
        />
      </div>

      {/* Snap button (bottom-right) */}
      <button
        onClick={() => useStore.getState().setSnapEnabled(!snapEnabled)}
        style={{ padding: '3px 10px' }}
        className={`absolute bottom-3 right-3 z-20 text-[10px] rounded border transition-colors
                   ${snapEnabled
                     ? 'border-white text-white bg-white/10'
                     : 'border-border text-text-secondary hover:border-white/20 hover:text-white'}`}
      >
        Snap
      </button>

      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cardMinWidth}px, 1fr))` }}
      >
        {instruments.map((inst) => (
          <KnobCanvas key={inst.id} instrumentId={inst.id} />
        ))}
      </div>
    </div>
  );
}
