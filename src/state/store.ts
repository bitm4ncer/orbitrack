import { create } from 'zustand';
import { PASTEL_COLORS } from '../canvas/colors';
import type { Instrument } from '../types/instrument';
import type { Effect, EffectType } from '../types/effects';
import type { SuperdoughSynthParams, SuperdoughSamplerParams } from '../types/superdough';
import { DEFAULT_SYNTH_PARAMS, DEFAULT_SAMPLER_PARAMS } from '../types/superdough';
import { DEFAULT_EFFECT_PARAMS } from '../audio/effectParams';
import { loadSample } from '../audio/sampler';
import { registerSampleForPlayback } from '../audio/engine';

function generateEvenHits(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i / count);
}

function createId(): string {
  return Math.random().toString(36).slice(2, 9);
}

// Snap a [0,1) position to the nearest grid slot
function snapToGrid(pos: number, gridSize: number): number {
  return Math.round(pos * gridSize) % gridSize / gridSize;
}

function randomHits(min = 1, max = 8): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Orbit index counter — incremented each time a new instrument is added
let orbitCounter = 0;

const defaultInstruments: Instrument[] = (() => {
  const kickHits = randomHits(2, 6);
  const snareHits = randomHits(1, 5);
  const hihatHits = randomHits(3, 8);
  const clapHits = randomHits(1, 4);
  return [
    {
      id: createId(),
      name: 'Kick',
      type: 'sampler',
      sampleName: 'kick',
      color: PASTEL_COLORS[0],
      hits: kickHits,
      hitPositions: generateEvenHits(kickHits),
      loopSize: 16,
      loopSizeLocked: false,
      muted: false,
      solo: false,
      volume: 0,
      orbitIndex: orbitCounter++,
      samplerParams: { ...DEFAULT_SAMPLER_PARAMS },
    },
    {
      id: createId(),
      name: 'Snare',
      type: 'sampler',
      sampleName: 'snare',
      color: PASTEL_COLORS[1],
      hits: snareHits,
      hitPositions: generateEvenHits(snareHits),
      loopSize: 16,
      loopSizeLocked: false,
      muted: false,
      solo: false,
      volume: 0,
      orbitIndex: orbitCounter++,
      samplerParams: { ...DEFAULT_SAMPLER_PARAMS },
    },
    {
      id: createId(),
      name: 'Hi-Hat',
      type: 'sampler',
      sampleName: 'hihat',
      color: PASTEL_COLORS[2],
      hits: hihatHits,
      hitPositions: generateEvenHits(hihatHits),
      loopSize: 16,
      loopSizeLocked: false,
      muted: false,
      solo: false,
      volume: -3,
      orbitIndex: orbitCounter++,
      samplerParams: { ...DEFAULT_SAMPLER_PARAMS },
    },
    {
      id: createId(),
      name: 'Clap',
      type: 'sampler',
      sampleName: 'clap',
      color: PASTEL_COLORS[4],
      hits: clapHits,
      hitPositions: generateEvenHits(clapHits),
      loopSize: 16,
      loopSizeLocked: false,
      muted: false,
      solo: false,
      volume: -2,
      orbitIndex: orbitCounter++,
      samplerParams: { ...DEFAULT_SAMPLER_PARAMS },
    },
  ];
})();

export interface StoreState {
  // Transport
  bpm: number;
  isPlaying: boolean;
  currentStep: number;
  transportProgress: number;

  // Instruments
  instruments: Instrument[];
  selectedInstrumentId: string | null;

  // Transport actions
  setBpm: (bpm: number) => void;
  setPlaying: (playing: boolean) => void;
  setCurrentStep: (step: number) => void;
  setTransportProgress: (progress: number) => void;

  // Instrument actions
  setInstruments: (instruments: Instrument[]) => void;
  updateInstrument: (id: string, updates: Partial<Instrument>) => void;
  setHitCount: (id: string, hits: number) => void;
  setHitPosition: (id: string, hitIndex: number, position: number) => void;
  addHit: (id: string, position: number) => void;
  addSamplerHit: (id: string, position: number, midiNote?: number) => void;
  removeHit: (id: string, hitIndex: number) => void;
  moveSamplerNoteToStep: (id: string, fromStep: number, toStep: number, midiNote: number) => void;
  selectInstrument: (id: string | null) => void;
  toggleMute: (id: string) => void;
  toggleSolo: (id: string) => void;
  removeInstrument: (id: string) => void;
  duplicateInstrument: (id: string) => void;
  randomizeHits: (id: string) => void;
  toggleLoopSizeLock: (id: string) => void;
  updateSynthParams: (id: string, params: Partial<SuperdoughSynthParams>) => void;
  updateSamplerParams: (id: string, params: Partial<SuperdoughSamplerParams>) => void;

  // Grid sequencer (per synth instrument)
  // gridNotes[instrumentId][hitIndex] = array of MIDI note numbers
  gridNotes: Record<string, number[][]>;
  gridGlide: Record<string, boolean[]>;
  gridLengths: Record<string, number[]>;
  octaveOffset: number;

  setGridNote: (instrumentId: string, hitIndex: number, notes: number[]) => void;
  setGridGlide: (instrumentId: string, hitIndex: number, glide: boolean) => void;
  setGridLength: (instrumentId: string, hitIndex: number, length: number) => void;
  toggleGridNote: (instrumentId: string, hitIndex: number, midiNote: number) => void;
  moveGridNote: (instrumentId: string, hitIndex: number, fromNote: number, toNote: number) => void;
  moveGridNoteToStep: (instrumentId: string, fromHitIndex: number, toHitIndex: number, midiNote: number) => void;
  setOctaveOffset: (offset: number) => void;
  applyChordPreset: (instrumentId: string, chords: number[][], steps: number) => void;

  // Per-instrument progress (0-1) for polyrhythm
  instrumentProgress: Record<string, number>;
  setInstrumentProgress: (progress: Record<string, number>) => void;
  setLoopSize: (id: string, size: number) => void;

  // Snap to 16th note grid
  snapEnabled: boolean;
  setSnapEnabled: (enabled: boolean) => void;
  spinMode?: boolean;

  // Sample bank
  sampleBankOpen: boolean;
  sampleBankInstrumentId: string | null;
  openSampleBank: (instrumentId: string) => void;
  closeSampleBank: () => void;
  assignSample: (instrumentId: string, samplePath: string, displayName: string) => void;

  // Custom imported samples
  customSamples: { key: string; url: string; name: string }[];
  addCustomSample: (sample: { key: string; url: string; name: string }) => void;
  removeCustomSample: (key: string) => void;

  // Per-instrument effect chains
  instrumentEffects: Record<string, Effect[]>;
  masterVolume: number; // 0-1 linear

  addEffect: (instrumentId: string, type: EffectType) => void;
  removeEffect: (instrumentId: string, effectId: string) => void;
  setEffectParam: (instrumentId: string, effectId: string, key: string, value: number) => void;
  toggleEffectEnabled: (instrumentId: string, effectId: string) => void;
  toggleEffectCollapsed: (instrumentId: string, effectId: string) => void;
  reorderEffects: (instrumentId: string, fromIdx: number, toIdx: number) => void;

  setMasterVolume: (vol: number) => void;
}

export const useStore = create<StoreState>((set, get) => ({
  // Transport
  bpm: 120,
  isPlaying: false,
  currentStep: -1,
  transportProgress: 0,

  // Instruments
  instruments: defaultInstruments,
  selectedInstrumentId: null,

  // Grid sequencer — pre-populate C4 (MIDI 60) for all default instrument hits
  gridNotes: (() => {
    const notes: Record<string, number[][]> = {};
    for (const inst of defaultInstruments) {
      notes[inst.id] = Array.from({ length: inst.hits }, () => [60]);
    }
    return notes;
  })(),
  gridGlide: {},
  gridLengths: {},
  octaveOffset: 3, // Start at octave 3 (C3-B4 visible)

  // Per-instrument progress
  instrumentProgress: {},

  // Snap
  snapEnabled: true,

  // Sample bank
  sampleBankOpen: false,
  sampleBankInstrumentId: null,
  customSamples: [],

  // Per-instrument effects
  instrumentEffects: {},
  masterVolume: 0.8,

  // Transport actions
  setBpm: (bpm) => set({ bpm }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentStep: (currentStep) => set({ currentStep }),
  setTransportProgress: (transportProgress) => set({ transportProgress }),

  // Instrument actions
  setInstruments: (instruments) => set({ instruments }),

  updateInstrument: (id, updates) =>
    set((s) => ({
      instruments: s.instruments.map((inst) =>
        inst.id === id ? { ...inst, ...updates } : inst
      ),
    })),

  updateSynthParams: (id, params) =>
    set((s) => ({
      instruments: s.instruments.map((inst) =>
        inst.id === id
          ? { ...inst, synthParams: { ...(inst.synthParams ?? DEFAULT_SYNTH_PARAMS), ...params } }
          : inst
      ),
    })),

  updateSamplerParams: (id, params) =>
    set((s) => ({
      instruments: s.instruments.map((inst) =>
        inst.id === id
          ? { ...inst, samplerParams: { ...(inst.samplerParams ?? DEFAULT_SAMPLER_PARAMS), ...params } }
          : inst
      ),
    })),

  setHitCount: (id, hits) =>
    set((s) => {
      const inst = s.instruments.find((i) => i.id === id);
      if (!inst) return s;
      const newInstruments = s.instruments.map((i) =>
        i.id === id
          ? { ...i, hits, hitPositions: generateEvenHits(hits) }
          : i
      );
      const grid = { ...s.gridNotes };
      grid[id] = Array.from({ length: hits }, () => [60]);
      return { instruments: newInstruments, gridNotes: grid };
    }),

  setHitPosition: (id, hitIndex, position) =>
    set((s) => {
      const inst = s.instruments.find((i) => i.id === id);
      if (!inst) return s;
      const norm = ((position % 1) + 1) % 1;
      const final = s.snapEnabled ? snapToGrid(norm, inst.loopSize) : norm;
      return {
        instruments: s.instruments.map((i) => {
          if (i.id !== id) return i;
          const newPositions = [...i.hitPositions];
          newPositions[hitIndex] = final;
          return { ...i, hitPositions: newPositions };
        }),
      };
    }),

  addHit: (id, position) =>
    set((s) => {
      const inst = s.instruments.find((i) => i.id === id);
      if (!inst) return s;
      const norm = ((position % 1) + 1) % 1;
      const final = s.snapEnabled ? snapToGrid(norm, inst.loopSize) : norm;
      const newIndex = inst.hitPositions.length;
      const grid = { ...s.gridNotes };
      if (!grid[id]) grid[id] = [];
      grid[id] = [...grid[id]];
      grid[id][newIndex] = [60];
      return {
        instruments: s.instruments.map((i) => {
          if (i.id !== id) return i;
          return { ...i, hits: i.hits + 1, hitPositions: [...i.hitPositions, final] };
        }),
        gridNotes: grid,
      };
    }),

  addSamplerHit: (id, position, midiNote = 60) =>
    set((s) => {
      const inst = s.instruments.find((i) => i.id === id);
      if (!inst) return s;
      const norm = ((position % 1) + 1) % 1;
      const final = s.snapEnabled ? snapToGrid(norm, inst.loopSize) : norm;
      // Guard: don't add if a hit already exists at this step
      const step = Math.round(final * inst.loopSize) % inst.loopSize;
      for (const pos of inst.hitPositions) {
        if (Math.round(pos * inst.loopSize) % inst.loopSize === step) return s;
      }
      const newIndex = inst.hitPositions.length;
      const grid = { ...s.gridNotes };
      if (!grid[id]) grid[id] = [];
      grid[id] = [...grid[id]];
      grid[id][newIndex] = [midiNote];
      return {
        instruments: s.instruments.map((i) => {
          if (i.id !== id) return i;
          return { ...i, hits: i.hits + 1, hitPositions: [...i.hitPositions, final] };
        }),
        gridNotes: grid,
      };
    }),

  removeHit: (id, hitIndex) =>
    set((s) => {
      const newInstruments = s.instruments.map((inst) => {
        if (inst.id !== id) return inst;
        const newPositions = inst.hitPositions.filter((_, i) => i !== hitIndex);
        return { ...inst, hits: newPositions.length, hitPositions: newPositions };
      });
      // Clean up gridNotes: splice out hitIndex so subsequent indices shift
      const grid = { ...s.gridNotes };
      if (grid[id]) {
        const arr = [...grid[id]];
        arr.splice(hitIndex, 1);
        grid[id] = arr;
      }
      const gGlide = { ...s.gridGlide };
      if (gGlide[id]) {
        const arr = [...gGlide[id]];
        arr.splice(hitIndex, 1);
        gGlide[id] = arr;
      }
      const gLengths = { ...s.gridLengths };
      if (gLengths[id]) {
        const arr = [...gLengths[id]];
        arr.splice(hitIndex, 1);
        gLengths[id] = arr;
      }
      return { instruments: newInstruments, gridNotes: grid, gridGlide: gGlide, gridLengths: gLengths };
    }),

  selectInstrument: (id) => set({ selectedInstrumentId: id }),

  toggleMute: (id) =>
    set((s) => ({
      instruments: s.instruments.map((inst) =>
        inst.id === id ? { ...inst, muted: !inst.muted } : inst
      ),
    })),

  toggleSolo: (id) =>
    set((s) => ({
      instruments: s.instruments.map((inst) =>
        inst.id === id ? { ...inst, solo: !inst.solo } : inst
      ),
    })),

  removeInstrument: (id) =>
    set((s) => {
      const instruments = s.instruments.filter((i) => i.id !== id);
      const { [id]: _gn, ...gridNotes } = s.gridNotes;
      const { [id]: _gg, ...gridGlide } = s.gridGlide;
      const { [id]: _gl, ...gridLengths } = s.gridLengths;
      const { [id]: _fx, ...instrumentEffects } = s.instrumentEffects;
      return {
        instruments,
        gridNotes,
        gridGlide,
        gridLengths,
        instrumentEffects,
        selectedInstrumentId: s.selectedInstrumentId === id ? null : s.selectedInstrumentId,
      };
    }),

  duplicateInstrument: (id) =>
    set((s) => {
      const src = s.instruments.find((i) => i.id === id);
      if (!src) return s;
      const newId = createId();
      const newInst = { ...src, id: newId, muted: true, orbitIndex: orbitCounter++ };
      const idx = s.instruments.findIndex((i) => i.id === id);
      const instruments = [...s.instruments.slice(0, idx + 1), newInst, ...s.instruments.slice(idx + 1)];
      const gridNotes = { ...s.gridNotes, [newId]: s.gridNotes[id] ? [...s.gridNotes[id]] : [] };
      const gridGlide = { ...s.gridGlide, [newId]: s.gridGlide[id] ? [...s.gridGlide[id]] : [] };
      const gridLengths = { ...s.gridLengths, [newId]: s.gridLengths[id] ? [...s.gridLengths[id]] : [] };
      return { instruments, gridNotes, gridGlide, gridLengths };
    }),

  randomizeHits: (id) =>
    set((s) => ({
      instruments: s.instruments.map((inst) => {
        if (inst.id !== id) return inst;
        const newPositions = Array.from({ length: inst.hits }, () => Math.random());
        return { ...inst, hitPositions: newPositions };
      }),
    })),

  toggleLoopSizeLock: (id) =>
    set((s) => ({
      instruments: s.instruments.map((inst) =>
        inst.id === id ? { ...inst, loopSizeLocked: !inst.loopSizeLocked } : inst
      ),
    })),

  // Grid sequencer actions
  setGridNote: (instrumentId, hitIndex, notes) =>
    set((s) => {
      const grid = { ...s.gridNotes };
      if (!grid[instrumentId]) grid[instrumentId] = [];
      grid[instrumentId] = [...grid[instrumentId]];
      grid[instrumentId][hitIndex] = notes;
      return { gridNotes: grid };
    }),

  setGridGlide: (instrumentId, hitIndex, glide) =>
    set((s) => {
      const grid = { ...s.gridGlide };
      if (!grid[instrumentId]) grid[instrumentId] = [];
      grid[instrumentId] = [...grid[instrumentId]];
      grid[instrumentId][hitIndex] = glide;
      return { gridGlide: grid };
    }),

  setGridLength: (instrumentId, hitIndex, length) =>
    set((s) => {
      const grid = { ...s.gridLengths };
      if (!grid[instrumentId]) grid[instrumentId] = [];
      grid[instrumentId] = [...grid[instrumentId]];
      grid[instrumentId][hitIndex] = length;
      return { gridLengths: grid };
    }),

  toggleGridNote: (instrumentId, hitIndex, midiNote) =>
    set((s) => {
      const grid = { ...s.gridNotes };
      if (!grid[instrumentId]) grid[instrumentId] = [];
      grid[instrumentId] = [...grid[instrumentId]];
      const current = grid[instrumentId][hitIndex] || [];
      if (current.includes(midiNote)) {
        grid[instrumentId][hitIndex] = current.filter((n) => n !== midiNote);
      } else {
        grid[instrumentId][hitIndex] = [...current, midiNote];
      }
      return { gridNotes: grid };
    }),

  moveGridNote: (instrumentId, hitIndex, fromNote, toNote) =>
    set((s) => {
      const grid = { ...s.gridNotes };
      if (!grid[instrumentId]) grid[instrumentId] = [];
      grid[instrumentId] = [...grid[instrumentId]];
      const current = grid[instrumentId][hitIndex] || [];
      grid[instrumentId][hitIndex] = current.map((n) => (n === fromNote ? toNote : n));
      return { gridNotes: grid };
    }),

  moveGridNoteToStep: (instrumentId, fromHitIndex, toHitIndex, midiNote) =>
    set((s) => {
      const grid = { ...s.gridNotes };
      if (!grid[instrumentId]) grid[instrumentId] = [];
      grid[instrumentId] = [...grid[instrumentId]];
      // Remove from old step
      const fromNotes = grid[instrumentId][fromHitIndex] || [];
      grid[instrumentId][fromHitIndex] = fromNotes.filter((n) => n !== midiNote);
      // Add to new step
      const toNotes = grid[instrumentId][toHitIndex] || [];
      if (!toNotes.includes(midiNote)) {
        grid[instrumentId][toHitIndex] = [...toNotes, midiNote];
      }
      // Move length and glide data too
      const gridLengths = { ...s.gridLengths };
      if (gridLengths[instrumentId]) {
        gridLengths[instrumentId] = [...gridLengths[instrumentId]];
        const len = gridLengths[instrumentId][fromHitIndex] ?? 1;
        gridLengths[instrumentId][toHitIndex] = len;
      }
      const gridGlide = { ...s.gridGlide };
      if (gridGlide[instrumentId]) {
        gridGlide[instrumentId] = [...gridGlide[instrumentId]];
        const gl = gridGlide[instrumentId][fromHitIndex] ?? false;
        gridGlide[instrumentId][toHitIndex] = gl;
      }
      return { gridNotes: grid, gridLengths, gridGlide };
    }),

  moveSamplerNoteToStep: (id, fromStep, toStep, midiNote) =>
    set((s) => {
      const inst = s.instruments.find((i) => i.id === id);
      if (!inst) return s;

      // Build step → hitIndex map
      const stepToHit = new Map<number, number>();
      for (let i = 0; i < inst.hitPositions.length; i++) {
        const step = Math.round(inst.hitPositions[i] * inst.loopSize) % inst.loopSize;
        stepToHit.set(step, i);
      }

      const fromHitIdx = stepToHit.get(fromStep);
      if (fromHitIdx === undefined) return s;

      let newPositions = [...inst.hitPositions];
      const grid = { ...s.gridNotes };
      if (!grid[id]) grid[id] = [];
      grid[id] = [...grid[id]];

      // Remove note from source hit
      const fromNotes = grid[id][fromHitIdx] || [];
      grid[id][fromHitIdx] = fromNotes.filter((n) => n !== midiNote);

      // If source hit has no remaining notes, remove the hit entirely
      if (grid[id][fromHitIdx].length === 0) {
        newPositions = newPositions.filter((_, i) => i !== fromHitIdx);
        grid[id].splice(fromHitIdx, 1);
      }

      // Find or create hit at destination step
      const stepToHit2 = new Map<number, number>();
      for (let i = 0; i < newPositions.length; i++) {
        const step = Math.round(newPositions[i] * inst.loopSize) % inst.loopSize;
        stepToHit2.set(step, i);
      }

      let toHitIdx = stepToHit2.get(toStep);
      if (toHitIdx === undefined) {
        toHitIdx = newPositions.length;
        const pos = toStep / inst.loopSize;
        newPositions.push(pos);
        grid[id][toHitIdx] = [midiNote];
      } else {
        const toNotes = grid[id][toHitIdx] || [];
        if (!toNotes.includes(midiNote)) {
          grid[id][toHitIdx] = [...toNotes, midiNote];
        }
      }

      return {
        instruments: s.instruments.map((i) => {
          if (i.id !== id) return i;
          return { ...i, hits: newPositions.length, hitPositions: newPositions };
        }),
        gridNotes: grid,
      };
    }),

  setOctaveOffset: (offset) => set({ octaveOffset: offset }),

  applyChordPreset: (instrumentId, chords, _steps) =>
    set((s) => {
      const inst = s.instruments.find((i) => i.id === instrumentId);
      if (!inst) return s;
      const grid = { ...s.gridNotes };
      grid[instrumentId] = [];
      for (let i = 0; i < inst.hits; i++) {
        grid[instrumentId][i] = chords[i % chords.length] || [];
      }
      return { gridNotes: grid };
    }),

  setInstrumentProgress: (instrumentProgress) => set({ instrumentProgress }),

  setLoopSize: (id, size) =>
    set((s) => {
      const newLoopSize = Math.max(1, Math.min(64, Math.round(size)));
      const inst = s.instruments.find((i) => i.id === id);
      if (!inst) return s;

      let newInstruments;
      let gridUpdate: Partial<Pick<StoreState, 'gridNotes' | 'gridGlide' | 'gridLengths'>> = {};

      if (inst.type === 'synth') {
        newInstruments = s.instruments.map((i) =>
          i.id !== id ? i : {
            ...i,
            loopSize: newLoopSize,
            hits: newLoopSize,
            hitPositions: generateEvenHits(newLoopSize),
          }
        );
        gridUpdate = {
          gridNotes: { ...s.gridNotes, [id]: Array.from({ length: newLoopSize }, () => [60]) },
          gridGlide: { ...s.gridGlide, [id]: [] },
          gridLengths: { ...s.gridLengths, [id]: [] },
        };
      } else {
        const newHits = Math.min(inst.hits, newLoopSize);
        const hitsReduced = newHits !== inst.hits;
        newInstruments = s.instruments.map((i) =>
          i.id !== id ? i : {
            ...i,
            loopSize: newLoopSize,
            hits: newHits,
            hitPositions: hitsReduced ? generateEvenHits(newHits) : i.hitPositions,
          }
        );
        if (hitsReduced) {
          const trimArr = <T,>(arr: T[]) => arr.slice(0, newHits);
          gridUpdate = {
            gridNotes: { ...s.gridNotes, [id]: trimArr(s.gridNotes[id] || []) },
            gridGlide: { ...s.gridGlide, [id]: trimArr(s.gridGlide[id] || []) },
            gridLengths: { ...s.gridLengths, [id]: trimArr(s.gridLengths[id] || []) },
          };
        }
      }

      return { instruments: newInstruments, ...gridUpdate };
    }),

  setSnapEnabled: (snapEnabled) => set({ snapEnabled }),

  openSampleBank: (instrumentId) =>
    set({ sampleBankOpen: true, sampleBankInstrumentId: instrumentId }),

  closeSampleBank: () =>
    set({ sampleBankOpen: false, sampleBankInstrumentId: null }),

  assignSample: (instrumentId, samplePath, displayName) => {
    // For imported samples (blob URLs), look up the actual blob URL from state
    const customSamples = get().customSamples;
    const custom = customSamples.find((c) => c.key === samplePath);
    const sdKey = custom
      ? registerSampleForPlayback(samplePath, custom.url)
      : registerSampleForPlayback(samplePath);
    loadSample(samplePath, custom?.url ?? samplePath);
    set((s) => ({
      instruments: s.instruments.map((inst) =>
        inst.id === instrumentId
          ? { ...inst, sampleName: sdKey, name: displayName }
          : inst
      ),
    }));
  },

  addCustomSample: (sample) => {
    loadSample(sample.key, sample.url);
    set((s) => ({ customSamples: [...s.customSamples, sample] }));
  },

  removeCustomSample: (key) =>
    set((s) => ({ customSamples: s.customSamples.filter((cs) => cs.key !== key) })),

  // Per-instrument effects actions
  addEffect: (instrumentId, type) =>
    set((s) => {
      const EFFECT_LABELS: Record<EffectType, string> = {
        eq3: 'EQ 3-Band',
        reverb: 'Reverb',
        delay: 'Delay',
        compressor: 'Compressor',
        chorus: 'Chorus',
        phaser: 'Phaser',
        distortion: 'Distortion',
        filter: 'Filter',
      };
      const effect: Effect = {
        id: createId(),
        type,
        label: EFFECT_LABELS[type],
        enabled: true,
        params: DEFAULT_EFFECT_PARAMS(type),
        collapsed: false,
      };
      const prev = s.instrumentEffects[instrumentId] ?? [];
      return { instrumentEffects: { ...s.instrumentEffects, [instrumentId]: [...prev, effect] } };
    }),

  removeEffect: (instrumentId, effectId) =>
    set((s) => {
      const prev = s.instrumentEffects[instrumentId] ?? [];
      return {
        instrumentEffects: {
          ...s.instrumentEffects,
          [instrumentId]: prev.filter((e) => e.id !== effectId),
        },
      };
    }),

  setEffectParam: (instrumentId, effectId, key, value) =>
    set((s) => {
      const prev = s.instrumentEffects[instrumentId] ?? [];
      return {
        instrumentEffects: {
          ...s.instrumentEffects,
          [instrumentId]: prev.map((e) =>
            e.id === effectId ? { ...e, params: { ...e.params, [key]: value } } : e
          ),
        },
      };
    }),

  toggleEffectEnabled: (instrumentId, effectId) =>
    set((s) => {
      const prev = s.instrumentEffects[instrumentId] ?? [];
      return {
        instrumentEffects: {
          ...s.instrumentEffects,
          [instrumentId]: prev.map((e) => (e.id === effectId ? { ...e, enabled: !e.enabled } : e)),
        },
      };
    }),

  toggleEffectCollapsed: (instrumentId, effectId) =>
    set((s) => {
      const prev = s.instrumentEffects[instrumentId] ?? [];
      return {
        instrumentEffects: {
          ...s.instrumentEffects,
          [instrumentId]: prev.map((e) => (e.id === effectId ? { ...e, collapsed: !e.collapsed } : e)),
        },
      };
    }),

  reorderEffects: (instrumentId, fromIdx, toIdx) =>
    set((s) => {
      const effects = [...(s.instrumentEffects[instrumentId] ?? [])];
      const [item] = effects.splice(fromIdx, 1);
      effects.splice(toIdx, 0, item);
      return { instrumentEffects: { ...s.instrumentEffects, [instrumentId]: effects } };
    }),

  setMasterVolume: (masterVolume) => set({ masterVolume }),
}));
