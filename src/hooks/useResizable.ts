import { useState, useCallback, useRef } from 'react';

export function useResizable(defaultSize: number, min = 80, axis: 'x' | 'y' = 'y', direction: 1 | -1 = 1) {
  const [size, setSize] = useState(defaultSize);
  const drag = useRef<{ startPos: number; startSize: number } | null>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    drag.current = { startPos: axis === 'x' ? e.clientX : e.clientY, startSize: size };

    const onMove = (e: MouseEvent) => {
      if (!drag.current) return;
      const pos = axis === 'x' ? e.clientX : e.clientY;
      // direction=1:  drag LEFT  = positive delta = wider (right-side panels)
      // direction=-1: drag RIGHT = positive delta = wider (left-side panels)
      const delta = direction * (drag.current.startPos - pos);
      const max = axis === 'x' ? window.innerWidth * 0.65 : window.innerHeight * 0.85;
      setSize(Math.max(min, Math.min(max, drag.current.startSize + delta)));
    };

    const onUp = () => {
      drag.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [size, min, axis, direction]);

  // Backwards compat: return both height and size
  return { height: size, size, onMouseDown };
}
