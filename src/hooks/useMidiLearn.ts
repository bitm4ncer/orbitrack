/** Hook for MIDI CC learn mode — binds the next received CC to a target parameter */

import { useEffect, useCallback } from 'react';
import { useStore } from '../state/store';
import { onMidiCC } from '../audio/midiController';
import type { MidiLearnTarget, MidiCCMapping } from '../types/midi';

export function useMidiLearn() {
  const learningMode = useStore((s) => s.midiSettings.learningMode);
  const learningTarget = useStore((s) => s.midiSettings.learningTarget);
  const setMidiSettings = useStore((s) => s.setMidiSettings);
  const midiSettings = useStore((s) => s.midiSettings);

  // Listen for CC when in learning mode
  useEffect(() => {
    if (!learningMode || !learningTarget) return;

    const unsubscribe = onMidiCC((mapping, _value) => {
      const ccNumber = (mapping as any).cc;
      if (ccNumber === undefined) return;

      // Remove any existing mapping for this CC + target combo
      const filteredMappings = midiSettings.ccMappings.filter(
        (m) =>
          !(m.cc === ccNumber && m.targetType === learningTarget.targetType &&
            m.orbitIndex === learningTarget.orbitIndex &&
            m.effectIndex === learningTarget.effectIndex &&
            m.paramName === learningTarget.paramName)
      );

      const newMapping: MidiCCMapping = {
        cc: ccNumber,
        targetType: learningTarget.targetType,
        orbitIndex: learningTarget.orbitIndex,
        effectIndex: learningTarget.effectIndex,
        paramName: learningTarget.paramName,
        label: learningTarget.label,
        minValue: learningTarget.minValue ?? 0,
        maxValue: learningTarget.maxValue ?? 1,
      };

      setMidiSettings({
        ccMappings: [...filteredMappings, newMapping],
        learningMode: false,
        learningTarget: null,
      });
    });

    return () => unsubscribe();
  }, [learningMode, learningTarget, midiSettings.ccMappings, setMidiSettings]);

  const startLearn = useCallback(
    (target: MidiLearnTarget) => {
      setMidiSettings({
        learningMode: true,
        learningTarget: target,
      });
    },
    [setMidiSettings]
  );

  const cancelLearn = useCallback(() => {
    setMidiSettings({
      learningMode: false,
      learningTarget: null,
    });
  }, [setMidiSettings]);

  const removeCCMapping = useCallback(
    (index: number) => {
      const newMappings = [...midiSettings.ccMappings];
      newMappings.splice(index, 1);
      setMidiSettings({ ccMappings: newMappings });
    },
    [midiSettings.ccMappings, setMidiSettings]
  );

  return {
    isLearning: learningMode,
    learningTarget,
    startLearn,
    cancelLearn,
    removeCCMapping,
  };
}
