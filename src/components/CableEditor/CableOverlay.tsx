import { type RefObject, useEffect, useRef, useState } from 'react';
import { useStore } from '../../state/store';
import { usePortContext, MASTER_IN_PORT_ID } from './PortContext';
import { useCableDrag } from './CableDragContext';
import type { Connection, ConnectionEndpoint } from '../../types/effects';

function endpointToPortId(endpoint: ConnectionEndpoint): string {
  if (endpoint.kind === 'instrument') return `inst:${endpoint.id}:out`;
  if (endpoint.kind === 'effect') return `effect:${endpoint.id}:${endpoint.port}`;
  if (endpoint.kind === 'master') return MASTER_IN_PORT_ID;
  return '';
}

function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.abs(x2 - x1) * 0.6 + 40;
  return `M ${x1} ${y1} C ${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`;
}

// Cable colors per connection type
function cableColor(fromPortId: string): string {
  if (fromPortId.startsWith('inst:')) return '#7dd3fc'; // sky blue for instruments
  if (fromPortId.startsWith('effect:')) return '#a78bfa'; // violet for effects chain
  return '#94a3b8';
}

interface CableProps {
  connection: Connection;
  containerRect: DOMRect | null;
  onDelete: (id: string) => void;
}

function Cable({ connection, containerRect, onDelete }: CableProps) {
  const { getPort } = usePortContext();

  const fromId = endpointToPortId(connection.from);
  const toId = endpointToPortId(connection.to);
  const fromPort = getPort(fromId);
  const toPort = getPort(toId);

  if (!fromPort || !toPort || !containerRect) return null;

  const x1 = fromPort.x - containerRect.left;
  const y1 = fromPort.y - containerRect.top;
  const x2 = toPort.x - containerRect.left;
  const y2 = toPort.y - containerRect.top;

  const d = bezierPath(x1, y1, x2, y2);
  const color = cableColor(fromId);

  return (
    <g>
      {/* Invisible wide path for click target */}
      <path
        d={d}
        stroke="transparent"
        strokeWidth={14}
        fill="none"
        style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
        onClick={() => onDelete(connection.id)}
        title="Click to remove connection"
      />
      {/* Visible cable */}
      <path
        d={d}
        stroke={color}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        opacity={0.85}
        style={{ pointerEvents: 'none' }}
      />
      {/* End dot */}
      <circle cx={x2} cy={y2} r={3} fill={color} opacity={0.9} style={{ pointerEvents: 'none' }} />
    </g>
  );
}

interface CableOverlayProps {
  containerRef: RefObject<HTMLDivElement | null>;
}

export function CableOverlay({ containerRef }: CableOverlayProps) {
  const connections = useStore((s) => s.connections);
  const removeConnection = useStore((s) => s.removeConnection);
  const { dragging } = useCableDrag();
  const { getPort } = usePortContext();
  const [containerRect, setContainerRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        setContainerRect(containerRef.current.getBoundingClientRect());
      }
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('scroll', update, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', update, true);
    };
  }, [containerRef]);

  // Drag cable endpoint
  const dragCablePath = (() => {
    if (!dragging || !containerRect) return null;
    const fromPort = getPort(dragging.fromPortId);
    if (!fromPort) return null;
    const x1 = fromPort.x - containerRect.left;
    const y1 = fromPort.y - containerRect.top;
    const x2 = dragging.currentX - containerRect.left;
    const y2 = dragging.currentY - containerRect.top;
    return bezierPath(x1, y1, x2, y2);
  })();

  return (
    <svg
      className="absolute inset-0 pointer-events-none z-50"
      style={{ overflow: 'visible', width: '100%', height: '100%' }}
    >
      {/* Persistent connections */}
      {connections.map((conn) => (
        <Cable
          key={conn.id}
          connection={conn}
          containerRect={containerRect}
          onDelete={removeConnection}
        />
      ))}

      {/* In-progress drag cable */}
      {dragCablePath && (
        <path
          d={dragCablePath}
          stroke="#7dd3fc"
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeDasharray="6 3"
          opacity={0.7}
        />
      )}
    </svg>
  );
}
