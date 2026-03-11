import { useState, useCallback, useRef, useEffect } from 'react';

export function useResizable(defaultSize: number, min = 80, axis: 'x' | 'y' = 'y', direction: 1 | -1 = 1) {
  const [size, setSize] = useState(defaultSize);
  const [isDragging, setIsDragging] = useState(false);
  const drag = useRef<{ startPos: number; startSize: number } | null>(null);
  const sizeRef = useRef(defaultSize);
  const isDraggingRef = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    setIsDragging(true);
    drag.current = { startPos: axis === 'x' ? e.clientX : e.clientY, startSize: sizeRef.current };

    const onMove = (e: MouseEvent) => {
      if (!drag.current) return;
      const pos = axis === 'x' ? e.clientX : e.clientY;
      // direction=1:  drag LEFT  = positive delta = wider (right-side panels)
      // direction=-1: drag RIGHT = positive delta = wider (left-side panels)
      const delta = direction * (drag.current.startPos - pos);
      const max = axis === 'x' ? window.innerWidth * 0.65 : window.innerHeight * 0.85;
      const newSize = Math.max(min, Math.min(max, drag.current.startSize + delta));
      sizeRef.current = newSize;
      setSize(newSize);
    };

    const onUp = () => {
      drag.current = null;
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      // Update state only after listeners are removed to avoid re-renders during drag
      setIsDragging(false);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [min, axis, direction]);

  // Keep refs in sync with state
  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  useEffect(() => {
    isDraggingRef.current = isDragging;
  }, [isDragging]);

  // Backwards compat: return both height and size + isDragging
  return { height: size, size, onMouseDown, isDragging };
}
