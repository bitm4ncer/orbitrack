import { createContext, useContext, useRef, useCallback, type ReactNode } from 'react';

export interface PortInfo {
  id: string;
  x: number; // viewport-relative pixel
  y: number;
}

interface PortContextValue {
  registerPort: (info: PortInfo) => void;
  unregisterPort: (id: string) => void;
  getPort: (id: string) => PortInfo | undefined;
  ports: Map<string, PortInfo>;
}

const PortContext = createContext<PortContextValue | null>(null);

export function PortProvider({ children }: { children: ReactNode }) {
  const portsRef = useRef<Map<string, PortInfo>>(new Map());

  const registerPort = useCallback((info: PortInfo) => {
    portsRef.current.set(info.id, info);
  }, []);

  const unregisterPort = useCallback((id: string) => {
    portsRef.current.delete(id);
  }, []);

  const getPort = useCallback((id: string) => {
    return portsRef.current.get(id);
  }, []);

  return (
    <PortContext.Provider value={{ registerPort, unregisterPort, getPort, ports: portsRef.current }}>
      {children}
    </PortContext.Provider>
  );
}

export function usePortContext() {
  const ctx = useContext(PortContext);
  if (!ctx) throw new Error('usePortContext must be used inside PortProvider');
  return ctx;
}

// Port ID helpers
export function instrumentPortId(instrumentId: string): string {
  return `inst:${instrumentId}:out`;
}
export function effectInPortId(effectId: string): string {
  return `effect:${effectId}:in`;
}
export function effectOutPortId(effectId: string): string {
  return `effect:${effectId}:out`;
}
export const MASTER_IN_PORT_ID = 'master:in';
