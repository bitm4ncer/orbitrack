import { useState, useCallback, useRef } from 'react';

export function useResizable(defaultHeight: number, min = 80) {
  const [height, setHeight] = useState(defaultHeight);
  const drag = useRef<{ startY: number; startH: number } | null>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    drag.current = { startY: e.clientY, startH: height };

    const onMove = (e: MouseEvent) => {
      if (!drag.current) return;
      const delta = drag.current.startY - e.clientY; // up = positive = taller
      const max = window.innerHeight * 0.85;
      setHeight(Math.max(min, Math.min(max, drag.current.startH + delta)));
    };

    const onUp = () => {
      drag.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [height, min]);

  return { height, onMouseDown };
}
