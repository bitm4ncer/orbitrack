import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import { usePortContext, MASTER_IN_PORT_ID } from './PortContext';
import { useStore } from '../../state/store';
import type { ConnectionEndpoint } from '../../types/effects';

interface DragState {
  fromPortId: string;
  currentX: number;
  currentY: number;
}

interface CableDragContextValue {
  dragging: DragState | null;
  startDrag: (fromPortId: string, e: React.MouseEvent) => void;
}

const CableDragContext = createContext<CableDragContextValue | null>(null);

function portIdToEndpoint(portId: string): ConnectionEndpoint | null {
  const parts = portId.split(':');
  if (parts[0] === 'inst') return { kind: 'instrument', id: parts[1] };
  if (parts[0] === 'effect' && parts[2] === 'in') return { kind: 'effect', id: parts[1], port: 'in' };
  if (parts[0] === 'effect' && parts[2] === 'out') return { kind: 'effect', id: parts[1], port: 'out' };
  if (portId === MASTER_IN_PORT_ID) return { kind: 'master', port: 'in' };
  return null;
}

function isValidConnection(fromPortId: string, toPortId: string): boolean {
  // Instruments only have out ports → can only be source
  // Effects have in and out ports
  // Master only has in port → can only be target
  if (fromPortId === MASTER_IN_PORT_ID) return false;
  if (fromPortId.endsWith(':in')) return false; // can't start from an in port
  if (toPortId.endsWith(':out')) return false; // can't end on an out port
  if (fromPortId === toPortId) return false; // no self-loops
  return true;
}

export function CableDragProvider({ children }: { children: ReactNode }) {
  const [dragging, setDragging] = useState<DragState | null>(null);
  const { ports } = usePortContext();
  const addConnection = useStore((s) => s.addConnection);

  const startDrag = useCallback((fromPortId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging({ fromPortId, currentX: e.clientX, currentY: e.clientY });
  }, []);

  useEffect(() => {
    if (!dragging) return;

    const handleMove = (e: MouseEvent) => {
      setDragging((d) => d ? { ...d, currentX: e.clientX, currentY: e.clientY } : null);
    };

    const handleUp = (e: MouseEvent) => {
      if (dragging) {
        // Find port at mouse position
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const toPortId = el?.closest('[data-port-id]')?.getAttribute('data-port-id');

        if (toPortId && isValidConnection(dragging.fromPortId, toPortId)) {
          const from = portIdToEndpoint(dragging.fromPortId);
          const to = portIdToEndpoint(toPortId);
          if (from && to) {
            addConnection(from, to);
          }
        }
      }
      setDragging(null);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragging, ports, addConnection]);

  return (
    <CableDragContext.Provider value={{ dragging, startDrag }}>
      {children}
    </CableDragContext.Provider>
  );
}

export function useCableDrag() {
  const ctx = useContext(CableDragContext);
  if (!ctx) throw new Error('useCableDrag must be used inside CableDragProvider');
  return ctx;
}
