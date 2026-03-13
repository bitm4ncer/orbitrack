import { useCallback, useRef } from 'react';
import { useStore } from '../state/store';

export function useDraggable() {
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const pos = useStore.getState().synthFloatPos;
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      const x = Math.max(0, Math.min(window.innerWidth - 200, dragRef.current.origX + dx));
      const y = Math.max(0, Math.min(window.innerHeight - 40, dragRef.current.origY + dy));
      useStore.getState().setSynthFloatPos({ x, y });
    };

    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  return { onMouseDown };
}
