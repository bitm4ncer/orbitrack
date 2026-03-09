import { useEffect, useRef } from 'react';
import { usePortContext } from './PortContext';
import { useCableDrag } from './CableDragContext';

interface PortDotProps {
  portId: string;
  label?: string;
  color?: string;
  className?: string;
}

export function PortDot({ portId, label, color, className = '' }: PortDotProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { registerPort, unregisterPort } = usePortContext();
  const { startDrag, dragging } = useCableDrag();

  const updatePosition = () => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    registerPort({
      id: portId,
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
  };

  useEffect(() => {
    updatePosition();
    const ro = new ResizeObserver(updatePosition);
    ro.observe(document.body);
    return () => {
      ro.disconnect();
      unregisterPort(portId);
    };
  }, [portId]);

  // Update position on scroll events from parent scrollable containers
  useEffect(() => {
    const handleScroll = () => updatePosition();
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [portId]);

  const isActive = dragging?.fromPortId === portId;

  return (
    <div
      ref={ref}
      data-port-id={portId}
      title={label ?? portId}
      className={`w-3 h-3 rounded-full border-2 cursor-crosshair transition-all duration-100 ${
        isActive
          ? 'border-accent bg-accent scale-125'
          : 'border-white/40 bg-bg-tertiary hover:border-accent hover:bg-accent/30 hover:scale-110'
      } ${className}`}
      style={color ? { borderColor: color } : undefined}
      onMouseDown={(e) => startDrag(portId, e)}
    />
  );
}
