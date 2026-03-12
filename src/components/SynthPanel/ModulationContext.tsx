/**
 * ModulationContext — React context for drag-and-drop LFO assignment.
 *
 * Provides drag state and assignment helpers so that LFO drag handles
 * and knob drop targets can communicate without prop drilling.
 */

import { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { ModAssignment, SynthParams } from '../../audio/synth/types';
import type { LFOSourceId } from '../../audio/synth/ModulationEngine';

interface ModulationContextValue {
  /** Currently dragging LFO source (null if idle) */
  dragSource: LFOSourceId | null;
  /** Start dragging from an LFO handle */
  startDrag: (source: LFOSourceId) => void;
  /** End drag (cancel or complete) */
  endDrag: () => void;
  /** Drop onto a knob to create an assignment */
  assignMod: (source: LFOSourceId, target: keyof SynthParams) => void;
  /** Remove a mod assignment by ID */
  removeMod: (id: string) => void;
  /** Update depth of an existing assignment */
  updateModDepth: (id: string, depth: number) => void;
  /** All current assignments */
  assignments: ModAssignment[];
  /** Get assignments for a specific param */
  getAssignmentsForParam: (target: keyof SynthParams) => ModAssignment[];
}

const ModulationCtx = createContext<ModulationContextValue | null>(null);

export function useModulation(): ModulationContextValue {
  const ctx = useContext(ModulationCtx);
  if (!ctx) throw new Error('useModulation must be used within ModulationProvider');
  return ctx;
}

interface ProviderProps {
  assignments: ModAssignment[];
  onAssignmentsChange: (assignments: ModAssignment[]) => void;
  children: React.ReactNode;
}

let nextModId = 1;

export function ModulationProvider({ assignments, onAssignmentsChange, children }: ProviderProps) {
  const [dragSource, setDragSource] = useState<LFOSourceId | null>(null);
  const assignmentsRef = useRef(assignments);
  assignmentsRef.current = assignments;

  const startDrag = useCallback((source: LFOSourceId) => setDragSource(source), []);
  const endDrag = useCallback(() => setDragSource(null), []);

  const assignMod = useCallback((source: LFOSourceId, target: keyof SynthParams) => {
    // Check if this exact source→target already exists
    const existing = assignmentsRef.current.find((a) => a.source === source && a.target === target);
    if (existing) return; // already assigned

    const newAssignment: ModAssignment = {
      id: `mod_${nextModId++}`,
      source,
      target,
      depth: 0.5, // default depth
    };
    onAssignmentsChange([...assignmentsRef.current, newAssignment]);
  }, [onAssignmentsChange]);

  const removeMod = useCallback((id: string) => {
    onAssignmentsChange(assignmentsRef.current.filter((a) => a.id !== id));
  }, [onAssignmentsChange]);

  const updateModDepth = useCallback((id: string, depth: number) => {
    onAssignmentsChange(
      assignmentsRef.current.map((a) => a.id === id ? { ...a, depth } : a),
    );
  }, [onAssignmentsChange]);

  const getAssignmentsForParam = useCallback((target: keyof SynthParams) => {
    return assignmentsRef.current.filter((a) => a.target === target);
  }, []);

  return (
    <ModulationCtx.Provider
      value={{
        dragSource,
        startDrag,
        endDrag,
        assignMod,
        removeMod,
        updateModDepth,
        assignments,
        getAssignmentsForParam,
      }}
    >
      {children}
    </ModulationCtx.Provider>
  );
}
