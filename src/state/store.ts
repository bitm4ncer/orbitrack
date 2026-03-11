import { create } from 'zustand';
import * as Tone from 'tone';
import { PASTEL_COLORS } from '../canvas/colors';
import type { Instrument } from '../types/instrument';
import type { Effect, EffectType } from '../types/effects';
import type { InstrumentScene } from '../types/scene';
import { SCENE_COLORS } from '../types/scene';
import type { ArrangementStep } from '../types/arrangement';
import type { SuperdoughSynthParams, SuperdoughSamplerParams } from '../types/superdough';
import type { SynthParams } from '../audio/synth/types';
import { DEFAULT_SYNTH_PARAMS, DEFAULT_SAMPLER_PARAMS } from '../types/superdough';
import { DEFAULT_EFFECT_PARAMS } from '../audio/effectParams';
import { loadSample } from '../audio/sampler';
import { registerSampleForPlayback } from '../audio/engine';
import { preloadSample, preloadCustomSample } from '../audio/sampleCache';
import type { LooperParams, LooperEditorState } from '../types/looper';
import { DEFAULT_LOOPER_PARAMS, createLooperEditorState } from '../types/looper';
import { sliceBuffer, deleteRange, silenceRange, insertBuffer, extractPeaks, bufferToBlobUrl } from '../audio/bufferOps';
import { detectTransients, mapTransientsToGrid, estimateLoopSize, detectBpm } from '../audio/transientDetector';
import { getCachedBpm, setCachedBpm } from '../audio/bpmCache';
import type { OrbeatSet } from '../types/storage';
import { base64ToBlob } from '../storage/serializer';
import { generateName } from '../utils/nameGenerator';
import { startRecording as recStart, stopRecordingAsync, type RecordingFormat } from '../audio/recorder';
import {
  saveRecording as dbSaveRec, deleteRecordingFromDB as dbDelRec,
  saveFolder as dbSaveFolder, deleteFolderFromDB as dbDelFolder,
  loadAllRecordings, loadAllFolders,
  type StoredRecording,
} from '../storage/recordingStore';
import { postSync } from '../storage/recordingSync';
import { createSceneBus, routeOrbitToScene, unrouteOrbitFromScene, destroySceneBus, destroyAllSceneBuses, initSceneBusesFromState } from '../audio/sceneBus';
import { fetchSampleTree, type SampleEntry } from '../audio/sampleApi';
import { removeSynthEngine } from '../audio/synthManager';

// LLM Generation settings types
export type LLMEndpointType = 'none' | 'ollama' | 'claude' | 'custom';

export interface GenSettings {
  endpointType: LLMEndpointType;
  ollamaModel: string;
  ollamaUrl: string;
  customUrl: string;
  claudeModel: string;
  streamingEnabled: boolean;
}

export const DEFAULT_GEN_SETTINGS: GenSettings = {
  endpointType: 'none',
  ollamaModel: 'llama3.2',
  ollamaUrl: 'http://localhost:11434',
  customUrl: '',
  claudeModel: 'claude-3-5-haiku-20241022',
  streamingEnabled: false,
};

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

/** Reset orbit counter to a specific value (used by autosave restore). */
export function setOrbitCounter(value: number): void {
  orbitCounter = value;
}

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
      muted: true,
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
  trackStepProgress: number;

  // Instruments
  instruments: Instrument[];
  selectedInstrumentId: string | null;
  selectedInstrumentIds: string[];
  selectedSceneId: string | null;
  renamingId: string | null;          // ID of instrument or group currently being renamed

  // Scenes
  scenes: InstrumentScene[];
  sceneEffects: Record<string, Effect[]>;

  // Track Mode
  trackMode: boolean;
  arrangement: ArrangementStep[];
  trackPosition: number;

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
  toggleSelectInstrument: (id: string) => void;
  toggleMute: (id: string) => void;
  toggleSolo: (id: string) => void;
  removeInstrument: (id: string) => void;
  duplicateInstrument: (id: string) => void;
  randomizeHits: (id: string) => void;
  toggleLoopSizeLock: (id: string) => void;
  updateSynthParams: (id: string, params: Partial<SuperdoughSynthParams>) => void;
  updateEngineParams: (id: string, params: SynthParams) => void;
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
  // Batched UI update — single set() call instead of three separate dispatches
  setPlaybackUI: (progress: number, currentStep: number, instProgress: Record<string, number>, trackPosition?: number, trackStepProgress?: number) => void;
  setLoopSize: (id: string, size: number) => void;

  // Default instrument type for the Add card
  addInstrumentType: 'sampler' | 'synth' | 'looper';
  setAddInstrumentType: (type: 'sampler' | 'synth' | 'looper') => void;

  // Snap to 16th note grid
  snapEnabled: boolean;
  setSnapEnabled: (enabled: boolean) => void;
  spinMode?: boolean;

  // Grid resolution: 1 = every step (1/16), 2 = 1/8, 4 = 1/4, 8 = 1/2
  gridResolution: number;
  setGridResolution: (res: number) => void;

  // Scale filter for piano roll
  scaleRoot: number;         // 0=C, 1=C#, ..., 11=B
  scaleType: string;         // key into SCALES map (e.g. 'chromatic', 'major')
  setScaleRoot: (root: number) => void;
  setScaleType: (type: string) => void;

  // Generation undo (per instrument snapshot before generation)
  generationUndo: Record<string, {
    hitPositions: number[];
    hits: number;
    gridNotes: number[][];
    gridLengths: number[];
    gridGlide: boolean[];
  }>;
  snapshotForUndo: (instrumentId: string) => void;
  undoGeneration: (instrumentId: string) => void;

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
  masterEffects: Effect[];
  masterVolume: number; // 0-1 linear

  addEffect: (instrumentId: string, type: EffectType) => void;
  addMasterEffect: (type: EffectType) => void;
  removeEffect: (instrumentId: string, effectId: string) => void;
  setEffectParam: (instrumentId: string, effectId: string, key: string, value: number) => void;
  toggleEffectEnabled: (instrumentId: string, effectId: string) => void;
  toggleEffectCollapsed: (instrumentId: string, effectId: string) => void;
  reorderEffects: (instrumentId: string, fromIdx: number, toIdx: number) => void;

  setMasterVolume: (vol: number) => void;

  // Group actions
  sceneSelected: () => void;
  unsceneSelected: () => void;
  selectScene: (groupId: string | null) => void;
  toggleSceneMute: (groupId: string) => void;
  toggleSceneSolo: (groupId: string) => void;
  setSceneVolume: (groupId: string, volume: number) => void;
  toggleSceneCollapsed: (groupId: string) => void;
  renameScene: (groupId: string, name: string) => void;
  setRenamingId: (id: string | null) => void;
  addSceneEffect: (groupId: string, type: EffectType) => void;
  removeSceneEffect: (groupId: string, effectId: string) => void;
  setSceneEffectParam: (groupId: string, effectId: string, key: string, value: number) => void;
  toggleSceneEffectEnabled: (groupId: string, effectId: string) => void;
  toggleSceneEffectCollapsed: (groupId: string, effectId: string) => void;
  reorderSceneEffects: (groupId: string, fromIdx: number, toIdx: number) => void;

  // Track Mode actions
  toggleTrackMode: () => void;
  addArrangementStep: (sceneId: string, bars?: number) => void;
  removeArrangementStep: (stepId: string) => void;
  reorderArrangementSteps: (fromIdx: number, toIdx: number) => void;
  setArrangementStepBars: (stepId: string, bars: number) => void;
  duplicateArrangementStep: (stepId: string) => void;
  setTrackPosition: (index: number) => void;
  setTrackStepProgress: (progress: number) => void;

  // Recording
  isRecording: boolean;
  recordings: StoredRecording[];
  recordingFolders: { id: string; name: string }[];
  recordingFormat: RecordingFormat;
  recordingQuality: number; // 0-1
  hydrateRecordings: () => Promise<void>;
  startRecording: () => void;
  stopRecording: () => void;
  deleteRecording: (id: string) => void;
  renameRecording: (id: string, name: string) => void;
  reorderRecordings: (fromIdx: number, toIdx: number) => void;
  moveRecordingToFolder: (recordingId: string, folderId: string | null) => void;
  createRecordingFolder: (name: string) => void;
  renameRecordingFolder: (id: string, name: string) => void;
  deleteRecordingFolder: (id: string) => void;
  setRecordingFormat: (format: RecordingFormat) => void;
  setRecordingQuality: (quality: number) => void;

  // Looper
  looperEditors: Record<string, LooperEditorState>;
  assignLoop: (instrumentId: string, loopPath: string, displayName: string) => void;
  updateLooperParams: (instrumentId: string, params: Partial<LooperParams>) => void;
  initLooperEditor: (instrumentId: string, buffer: AudioBuffer) => void;
  setLooperSelection: (instrumentId: string, start: number | null, end: number | null) => void;
  setLooperZoom: (instrumentId: string, viewStart: number, viewEnd: number) => void;
  looperCut: (instrumentId: string) => void;
  looperCopy: (instrumentId: string) => void;
  looperPaste: (instrumentId: string) => void;
  looperTrim: (instrumentId: string) => void;
  looperDelete: (instrumentId: string) => void;
  looperSilence: (instrumentId: string) => void;
  looperUndo: (instrumentId: string) => void;
  redetectTransients: (instrumentId: string, sensitivity: number) => void;
  setLooperLoop: (instrumentId: string, loopIn: number, loopOut: number) => void;
  setLooperCursor: (instrumentId: string, position: number | null) => void;
  setLooperPeakResolution: (instrumentId: string, resolution: number) => void;
  setDetectedBpm: (instrumentId: string, bpm: number) => void;
  setLooperBpmMultiplier: (instrumentId: string, multiplier: number) => void;

  // Generation settings (LLM endpoints, etc.)
  genSettings: GenSettings;
  setGenSettings: (settings: Partial<GenSettings>) => void;

  // Set (project) management
  currentSetId: string | null;
  currentSetName: string;
  setCurrentSetName: (name: string) => void;
  getSerializableState: () => {
    bpm: number;
    masterVolume: number;
    instruments: Instrument[];
    gridNotes: Record<string, number[][]>;
    gridGlide: Record<string, boolean[]>;
    gridLengths: Record<string, number[]>;
    instrumentEffects: Record<string, Effect[]>;
    masterEffects: Effect[];
    scenes: InstrumentScene[];
    sceneEffects: Record<string, Effect[]>;
    customSamples: { key: string; url: string; name: string }[];
    gridResolution: number;
    scaleRoot: number;
    scaleType: string;
    trackMode: boolean;
    arrangement: ArrangementStep[];
  };
  loadSet: (set: OrbeatSet) => void;
  newSet: () => void;
}

export const useStore = create<StoreState>((set, get) => ({
  // Transport
  bpm: 128,
  isPlaying: false,
  currentStep: -1,
  transportProgress: 0,
  trackStepProgress: 0,

  // Instruments
  instruments: defaultInstruments,
  selectedInstrumentId: null,
  selectedInstrumentIds: [],
  selectedSceneId: null,
  renamingId: null,

  // Scenes
  scenes: [],
  sceneEffects: {},

  // Track Mode
  trackMode: false,
  arrangement: [],
  trackPosition: -1,

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

  // Add card default type
  addInstrumentType: 'sampler',

  // Snap
  snapEnabled: true,
  gridResolution: 1,

  // Scale filter
  scaleRoot: 0,         // C
  scaleType: 'chromatic', // show all notes by default

  // Generation undo
  generationUndo: {},

  // Sample bank
  sampleBankOpen: false,
  sampleBankInstrumentId: null,
  customSamples: [],

  // Per-instrument effects
  instrumentEffects: {},
  masterEffects: [],
  masterVolume: 0.8,
  genSettings: DEFAULT_GEN_SETTINGS,

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

  updateEngineParams: (id, params) =>
    set((s) => ({
      instruments: s.instruments.map((inst) =>
        inst.id === id ? { ...inst, engineParams: params } : inst
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
      const defaultNote = inst.type === 'sampler' ? (inst.samplerParams?.rootNote ?? 60) : 60;
      // Preserve existing notes as persistent memory; only initialize genuinely new slots
      const existingNotes = s.gridNotes[id] || [];
      const newNotes = [...existingNotes];
      for (let i = existingNotes.length; i < hits; i++) {
        newNotes[i] = [defaultNote];
      }
      return {
        instruments: s.instruments.map((i) =>
          i.id === id ? { ...i, hits, hitPositions: generateEvenHits(hits) } : i
        ),
        gridNotes: { ...s.gridNotes, [id]: newNotes },
      };
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

  addSamplerHit: (id, position, midiNote?: number) =>
    set((s) => {
      const inst = s.instruments.find((i) => i.id === id);
      if (!inst) return s;
      // Use caller-supplied note, or fall back to the sample's root note
      const note = midiNote ?? inst.samplerParams?.rootNote ?? 60;
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
      grid[id][newIndex] = [note];
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

  selectInstrument: (id) => set({
    selectedInstrumentId: id,
    selectedInstrumentIds: id ? [id] : [],
    selectedSceneId: null,
  }),

  toggleSelectInstrument: (id) =>
    set((s) => {
      const ids = s.selectedInstrumentIds.includes(id)
        ? s.selectedInstrumentIds.filter((x) => x !== id)
        : [...s.selectedInstrumentIds, id];
      return {
        selectedInstrumentIds: ids,
        selectedInstrumentId: ids[ids.length - 1] ?? null,
        selectedSceneId: null,
      };
    }),

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

  removeInstrument: (id) => {
    const s = get();
    const inst = s.instruments.find((i) => i.id === id);
    // Clean up synth engine if it's a synth instrument
    if (inst?.type === 'synth') removeSynthEngine(id);
    // Unroute from group bus if grouped
    if (inst) unrouteOrbitFromScene(inst.orbitIndex);
    const instruments = s.instruments.filter((i) => i.id !== id);
    const { [id]: _gn, ...gridNotes } = s.gridNotes;
    const { [id]: _gg, ...gridGlide } = s.gridGlide;
    const { [id]: _gl, ...gridLengths } = s.gridLengths;
    const { [id]: _fx, ...instrumentEffects } = s.instrumentEffects;
    const { [id]: _le, ...looperEditors } = s.looperEditors;
    // Remove from any scene; dissolve scenes with <2 members
    let scenes = s.scenes.map((g) =>
      g.instrumentIds.includes(id)
        ? { ...g, instrumentIds: g.instrumentIds.filter((x) => x !== id) }
        : g
    );
    const dissolvedIds = scenes.filter((g) => g.instrumentIds.length < 2).map((g) => g.id);
    scenes = scenes.filter((g) => g.instrumentIds.length >= 2);
    const sceneEffects = { ...s.sceneEffects };
    for (const did of dissolvedIds) {
      // Unroute remaining members and destroy dissolved bus
      const oldGroup = s.scenes.find((g) => g.id === did);
      if (oldGroup) {
        for (const instId of oldGroup.instrumentIds) {
          if (instId !== id) {
            const member = s.instruments.find((i) => i.id === instId);
            if (member) unrouteOrbitFromScene(member.orbitIndex);
          }
        }
      }
      destroySceneBus(did);
      delete sceneEffects[did];
    }
    set({
      instruments,
      gridNotes,
      gridGlide,
      gridLengths,
      instrumentEffects,
      looperEditors,
      scenes,
      sceneEffects,
      selectedInstrumentId: s.selectedInstrumentId === id ? null : s.selectedInstrumentId,
      selectedInstrumentIds: s.selectedInstrumentIds.filter((x) => x !== id),
      selectedSceneId: dissolvedIds.includes(s.selectedSceneId ?? '') ? null : s.selectedSceneId,
    });
  },

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
  setPlaybackUI: (transportProgress, currentStep, instrumentProgress, trackPosition, trackStepProgress) =>
    set({ transportProgress, currentStep, instrumentProgress, ...(trackPosition !== undefined && { trackPosition }), ...(trackStepProgress !== undefined && { trackStepProgress }) }),

  setLoopSize: (id, size) =>
    set((s) => {
      const newLoopSize = Math.max(1, Math.min(256, Math.round(size)));
      const inst = s.instruments.find((i) => i.id === id);
      if (!inst) return s;

      let newInstruments;
      let gridUpdate: Partial<Pick<StoreState, 'gridNotes' | 'gridGlide' | 'gridLengths'>> = {};

      if (inst.type === 'synth') {
        // Preserve existing notes as persistent memory; only initialize genuinely new step slots
        const existingNotes = s.gridNotes[id] || [];
        const newNotes = [...existingNotes];
        for (let i = existingNotes.length; i < newLoopSize; i++) {
          newNotes[i] = [60];
        }
        newInstruments = s.instruments.map((i) =>
          i.id !== id ? i : {
            ...i,
            loopSize: newLoopSize,
            hits: newLoopSize,
            hitPositions: generateEvenHits(newLoopSize),
          }
        );
        gridUpdate = {
          gridNotes: { ...s.gridNotes, [id]: newNotes },
          gridGlide: { ...s.gridGlide, [id]: s.gridGlide[id] || [] },
          gridLengths: { ...s.gridLengths, [id]: s.gridLengths[id] || [] },
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

  setAddInstrumentType: (addInstrumentType) => set({ addInstrumentType }),
  setSnapEnabled: (snapEnabled) => set({ snapEnabled }),
  setGridResolution: (gridResolution) => set({ gridResolution }),
  setScaleRoot: (scaleRoot) => set({ scaleRoot }),
  setScaleType: (scaleType) => set({ scaleType }),

  snapshotForUndo: (instrumentId) => set((s) => {
    const inst = s.instruments.find((i) => i.id === instrumentId);
    if (!inst) return s;
    return {
      generationUndo: {
        ...s.generationUndo,
        [instrumentId]: {
          hitPositions: [...inst.hitPositions],
          hits: inst.hits,
          gridNotes: (s.gridNotes[instrumentId] || []).map((n) => [...n]),
          gridLengths: [...(s.gridLengths[instrumentId] || [])],
          gridGlide: [...(s.gridGlide[instrumentId] || [])],
        },
      },
    };
  }),

  undoGeneration: (instrumentId) => set((s) => {
    const snapshot = s.generationUndo[instrumentId];
    if (!snapshot) return s;

    const instruments = s.instruments.map((inst) => {
      if (inst.id !== instrumentId) return inst;
      return { ...inst, hitPositions: snapshot.hitPositions, hits: snapshot.hits };
    });

    const gridNotes = { ...s.gridNotes, [instrumentId]: snapshot.gridNotes };
    const gridLengths = { ...s.gridLengths, [instrumentId]: snapshot.gridLengths };
    const gridGlide = { ...s.gridGlide, [instrumentId]: snapshot.gridGlide };

    const undo = { ...s.generationUndo };
    delete undo[instrumentId];

    return { instruments, gridNotes, gridLengths, gridGlide, generationUndo: undo };
  }),

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
    if (custom) {
      void preloadCustomSample(sdKey, custom.url);
    } else {
      void preloadSample(samplePath);
    }
    set((s) => ({
      instruments: s.instruments.map((inst) =>
        inst.id === instrumentId
          ? { ...inst, sampleName: sdKey, samplePath: samplePath, name: displayName }
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
      const EFFECT_LABELS: Partial<Record<EffectType, string>> = {
        eq3: 'EQ 3-Band', reverb: 'Reverb', delay: 'Delay', compressor: 'Compressor',
        chorus: 'Chorus', phaser: 'Phaser', distortion: 'Distortion', filter: 'Filter',
        bitcrusher: 'Bit Crusher', parame: 'Param EQ', tremolo: 'Tremolo', ringmod: 'Ring Mod',
        trancegate: 'Orb Gate', limiter: 'Limiter', drumbuss: 'Drum Buss',
        stereoimage: 'Stereo Image',
      };
      const effect: Effect = {
        id: createId(),
        type,
        label: EFFECT_LABELS[type] ?? type,
        enabled: true,
        params: DEFAULT_EFFECT_PARAMS(type),
        collapsed: false,
      };
      if (instrumentId.startsWith('__scene_')) {
        const gid = instrumentId.slice(8, -2);
        const prev = s.sceneEffects[gid] ?? [];
        return { sceneEffects: { ...s.sceneEffects, [gid]: [...prev, effect] } };
      }
      const prev = s.instrumentEffects[instrumentId] ?? [];
      return { instrumentEffects: { ...s.instrumentEffects, [instrumentId]: [...prev, effect] } };
    }),

  addMasterEffect: (type) =>
    set((s) => {
      const EFFECT_LABELS: Partial<Record<EffectType, string>> = {
        eq3: 'EQ 3-Band', reverb: 'Reverb', delay: 'Delay', compressor: 'Compressor',
        chorus: 'Chorus', phaser: 'Phaser', distortion: 'Distortion', filter: 'Filter',
        bitcrusher: 'Bit Crusher', parame: 'Param EQ', tremolo: 'Tremolo', ringmod: 'Ring Mod',
        trancegate: 'Orb Gate',
      };
      const effect: Effect = {
        id: createId(),
        type,
        label: EFFECT_LABELS[type] ?? type,
        enabled: true,
        params: DEFAULT_EFFECT_PARAMS(type),
        collapsed: false,
      };
      return { masterEffects: [...s.masterEffects, effect] };
    }),

  removeEffect: (instrumentId, effectId) =>
    set((s) => {
      if (instrumentId === '__master__')
        return { masterEffects: s.masterEffects.filter((e) => e.id !== effectId) };
      if (instrumentId.startsWith('__scene_')) {
        const gid = instrumentId.slice(8, -2);
        const prev = s.sceneEffects[gid] ?? [];
        return { sceneEffects: { ...s.sceneEffects, [gid]: prev.filter((e) => e.id !== effectId) } };
      }
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
      if (instrumentId === '__master__')
        return { masterEffects: s.masterEffects.map((e) => e.id === effectId ? { ...e, params: { ...e.params, [key]: value } } : e) };
      if (instrumentId.startsWith('__scene_')) {
        const gid = instrumentId.slice(8, -2);
        const prev = s.sceneEffects[gid] ?? [];
        return { sceneEffects: { ...s.sceneEffects, [gid]: prev.map((e) => e.id === effectId ? { ...e, params: { ...e.params, [key]: value } } : e) } };
      }
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
      if (instrumentId === '__master__')
        return { masterEffects: s.masterEffects.map((e) => e.id === effectId ? { ...e, enabled: !e.enabled } : e) };
      if (instrumentId.startsWith('__scene_')) {
        const gid = instrumentId.slice(8, -2);
        const prev = s.sceneEffects[gid] ?? [];
        return { sceneEffects: { ...s.sceneEffects, [gid]: prev.map((e) => e.id === effectId ? { ...e, enabled: !e.enabled } : e) } };
      }
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
      if (instrumentId === '__master__')
        return { masterEffects: s.masterEffects.map((e) => e.id === effectId ? { ...e, collapsed: !e.collapsed } : e) };
      if (instrumentId.startsWith('__scene_')) {
        const gid = instrumentId.slice(8, -2);
        const prev = s.sceneEffects[gid] ?? [];
        return { sceneEffects: { ...s.sceneEffects, [gid]: prev.map((e) => e.id === effectId ? { ...e, collapsed: !e.collapsed } : e) } };
      }
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
      if (instrumentId === '__master__') {
        const effects = [...s.masterEffects];
        const [item] = effects.splice(fromIdx, 1);
        effects.splice(toIdx, 0, item);
        return { masterEffects: effects };
      }
      if (instrumentId.startsWith('__scene_')) {
        const gid = instrumentId.slice(8, -2);
        const effects = [...(s.sceneEffects[gid] ?? [])];
        const [item] = effects.splice(fromIdx, 1);
        effects.splice(toIdx, 0, item);
        return { sceneEffects: { ...s.sceneEffects, [gid]: effects } };
      }
      const effects = [...(s.instrumentEffects[instrumentId] ?? [])];
      const [item] = effects.splice(fromIdx, 1);
      effects.splice(toIdx, 0, item);
      return { instrumentEffects: { ...s.instrumentEffects, [instrumentId]: effects } };
    }),

  setMasterVolume: (masterVolume) => set({ masterVolume }),

  setGenSettings: (settings) => set((state) => ({
    genSettings: { ...state.genSettings, ...settings },
  })),

  // ── Group actions ──────────────────────────────────────────────────────────

  sceneSelected: () => {
    const s = get();
    const ids = s.selectedInstrumentIds;
    if (ids.length < 2) return;
    // Remove selected instruments from any existing groups — unroute from old buses
    const oldGroups = s.scenes;
    for (const g of oldGroups) {
      for (const instId of g.instrumentIds) {
        if (ids.includes(instId)) {
          const inst = s.instruments.find((i) => i.id === instId);
          if (inst) unrouteOrbitFromScene(inst.orbitIndex);
        }
      }
    }
    let groups = oldGroups.map((g) => ({
      ...g,
      instrumentIds: g.instrumentIds.filter((x) => !ids.includes(x)),
    }));
    // Dissolve groups that became too small
    const dissolvedIds = groups.filter((g) => g.instrumentIds.length < 2).map((g) => g.id);
    groups = groups.filter((g) => g.instrumentIds.length >= 2);
    const sceneEffects = { ...s.sceneEffects };
    for (const did of dissolvedIds) {
      delete sceneEffects[did];
      // Unroute remaining members of dissolved groups
      const oldGroup = oldGroups.find((g) => g.id === did);
      if (oldGroup) {
        for (const instId of oldGroup.instrumentIds) {
          if (!ids.includes(instId)) {
            const inst = s.instruments.find((i) => i.id === instId);
            if (inst) unrouteOrbitFromScene(inst.orbitIndex);
          }
        }
      }
      destroySceneBus(did);
    }
    // Create new scene
    const groupId = createId();
    const usedColors = s.scenes.map((g) => g.color);
    const color = SCENE_COLORS.find((c) => !usedColors.includes(c)) ?? SCENE_COLORS[s.scenes.length % SCENE_COLORS.length];
    const newScene: InstrumentScene = {
      id: groupId,
      name: `Scene ${s.scenes.length + 1}`,
      color,
      instrumentIds: [...ids],
      muted: false,
      solo: false,
      volume: 0,
      collapsed: false,
    };
    const scenes = [...s.scenes, newScene];
    sceneEffects[groupId] = [];
    // Reorder instruments so grouped instruments are adjacent
    const instruments = [...s.instruments];
    const grouped = ids.map((id) => instruments.find((i) => i.id === id)!).filter(Boolean);
    const rest = instruments.filter((i) => !ids.includes(i.id));
    const firstIdx = instruments.findIndex((i) => ids.includes(i.id));
    const before = rest.filter((_, idx) => {
      const origIdx = instruments.indexOf(rest[idx]);
      return origIdx < firstIdx;
    });
    const after = rest.filter((i) => !before.includes(i));
    set({
      instruments: [...before, ...grouped, ...after],
      scenes,
      sceneEffects,
      selectedSceneId: groupId,
    });
    // Wire audio: create group bus and route orbits
    createSceneBus(groupId);
    for (const instId of ids) {
      const inst = s.instruments.find((i) => i.id === instId);
      if (inst) routeOrbitToScene(inst.orbitIndex, groupId);
    }
  },

  unsceneSelected: () => {
    const s = get();
    const sceneEffects = { ...s.sceneEffects };
    // If a group is selected, dissolve it entirely
    if (s.selectedSceneId) {
      const group = s.scenes.find((g) => g.id === s.selectedSceneId);
      if (group) {
        for (const instId of group.instrumentIds) {
          const inst = s.instruments.find((i) => i.id === instId);
          if (inst) unrouteOrbitFromScene(inst.orbitIndex);
        }
        destroySceneBus(s.selectedSceneId);
      }
      const scenes = s.scenes.filter((g) => g.id !== s.selectedSceneId);
      delete sceneEffects[s.selectedSceneId];
      set({ scenes, sceneEffects, selectedSceneId: null });
      return;
    }
    // Otherwise, remove selected instruments from their groups
    const ids = s.selectedInstrumentIds;
    if (ids.length === 0) return;
    // Unroute selected instruments
    for (const instId of ids) {
      const inst = s.instruments.find((i) => i.id === instId);
      if (inst) unrouteOrbitFromScene(inst.orbitIndex);
    }
    let scenes = s.scenes.map((g) => ({
      ...g,
      instrumentIds: g.instrumentIds.filter((x) => !ids.includes(x)),
    }));
    const dissolvedIds = scenes.filter((g) => g.instrumentIds.length < 2).map((g) => g.id);
    scenes = scenes.filter((g) => g.instrumentIds.length >= 2);
    for (const did of dissolvedIds) {
      delete sceneEffects[did];
      // Unroute remaining members and destroy dissolved bus
      const oldGroup = s.scenes.find((g) => g.id === did);
      if (oldGroup) {
        for (const instId of oldGroup.instrumentIds) {
          if (!ids.includes(instId)) {
            const inst = s.instruments.find((i) => i.id === instId);
            if (inst) unrouteOrbitFromScene(inst.orbitIndex);
          }
        }
      }
      destroySceneBus(did);
    }
    set({
      scenes,
      sceneEffects,
      selectedSceneId: dissolvedIds.includes(s.selectedSceneId ?? '') ? null : s.selectedSceneId,
    });
  },

  selectScene: (groupId) =>
    set((s) => {
      if (!groupId) return { selectedSceneId: null };
      const group = s.scenes.find((g) => g.id === groupId);
      if (!group) return { selectedSceneId: null };
      return {
        selectedSceneId: groupId,
        selectedInstrumentIds: [...group.instrumentIds],
        selectedInstrumentId: group.instrumentIds[0] ?? null,
      };
    }),

  toggleSceneMute: (groupId) =>
    set((s) => ({
      scenes: s.scenes.map((g) => g.id === groupId ? { ...g, muted: !g.muted } : g),
    })),

  toggleSceneSolo: (groupId) =>
    set((s) => ({
      scenes: s.scenes.map((g) => g.id === groupId ? { ...g, solo: !g.solo } : g),
    })),

  setSceneVolume: (groupId, volume) =>
    set((s) => ({
      scenes: s.scenes.map((g) => g.id === groupId ? { ...g, volume } : g),
    })),

  toggleSceneCollapsed: (groupId) =>
    set((s) => ({
      scenes: s.scenes.map((g) => g.id === groupId ? { ...g, collapsed: !g.collapsed } : g),
    })),

  renameScene: (groupId, name) =>
    set((s) => ({
      scenes: s.scenes.map((g) => g.id === groupId ? { ...g, name } : g),
    })),

  setRenamingId: (id) => set({ renamingId: id }),

  addSceneEffect: (groupId, type) =>
    set((s) => {
      const EFFECT_LABELS: Partial<Record<EffectType, string>> = {
        eq3: 'EQ 3-Band', reverb: 'Reverb', delay: 'Delay', compressor: 'Compressor',
        chorus: 'Chorus', phaser: 'Phaser', distortion: 'Distortion', filter: 'Filter',
        bitcrusher: 'Bit Crusher', parame: 'Param EQ', tremolo: 'Tremolo', ringmod: 'Ring Mod',
        trancegate: 'Orb Gate', limiter: 'Limiter', drumbuss: 'Drum Buss',
        stereoimage: 'Stereo Image',
      };
      const effect: Effect = {
        id: createId(),
        type,
        label: EFFECT_LABELS[type] ?? type,
        enabled: true,
        params: DEFAULT_EFFECT_PARAMS(type),
        collapsed: false,
      };
      const prev = s.sceneEffects[groupId] ?? [];
      return { sceneEffects: { ...s.sceneEffects, [groupId]: [...prev, effect] } };
    }),

  removeSceneEffect: (groupId, effectId) =>
    set((s) => {
      const prev = s.sceneEffects[groupId] ?? [];
      return { sceneEffects: { ...s.sceneEffects, [groupId]: prev.filter((e) => e.id !== effectId) } };
    }),

  setSceneEffectParam: (groupId, effectId, key, value) =>
    set((s) => {
      const prev = s.sceneEffects[groupId] ?? [];
      return {
        sceneEffects: {
          ...s.sceneEffects,
          [groupId]: prev.map((e) => e.id === effectId ? { ...e, params: { ...e.params, [key]: value } } : e),
        },
      };
    }),

  toggleSceneEffectEnabled: (groupId, effectId) =>
    set((s) => {
      const prev = s.sceneEffects[groupId] ?? [];
      return {
        sceneEffects: {
          ...s.sceneEffects,
          [groupId]: prev.map((e) => e.id === effectId ? { ...e, enabled: !e.enabled } : e),
        },
      };
    }),

  toggleSceneEffectCollapsed: (groupId, effectId) =>
    set((s) => {
      const prev = s.sceneEffects[groupId] ?? [];
      return {
        sceneEffects: {
          ...s.sceneEffects,
          [groupId]: prev.map((e) => e.id === effectId ? { ...e, collapsed: !e.collapsed } : e),
        },
      };
    }),

  reorderSceneEffects: (groupId, fromIdx, toIdx) =>
    set((s) => {
      const effects = [...(s.sceneEffects[groupId] ?? [])];
      const [item] = effects.splice(fromIdx, 1);
      effects.splice(toIdx, 0, item);
      return { sceneEffects: { ...s.sceneEffects, [groupId]: effects } };
    }),

  // Track Mode
  toggleTrackMode: () => set((s) => {
    const newTrackMode = !s.trackMode;
    return {
      trackMode: newTrackMode,
      trackPosition: newTrackMode && s.arrangement.length > 0 ? 0 : -1,
    };
  }),

  addArrangementStep: (sceneId, bars = 4) =>
    set((s) => ({
      arrangement: [...s.arrangement, { id: crypto.randomUUID(), sceneId, bars }],
    })),

  removeArrangementStep: (stepId) =>
    set((s) => ({
      arrangement: s.arrangement.filter((a) => a.id !== stepId),
    })),

  reorderArrangementSteps: (fromIdx, toIdx) =>
    set((s) => {
      const arr = [...s.arrangement];
      const [item] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, item);
      return { arrangement: arr };
    }),

  setArrangementStepBars: (stepId, bars) =>
    set((s) => ({
      arrangement: s.arrangement.map((a) =>
        a.id === stepId ? { ...a, bars: Math.max(1, Math.min(64, bars)) } : a,
      ),
    })),

  duplicateArrangementStep: (stepId) =>
    set((s) => {
      const idx = s.arrangement.findIndex((a) => a.id === stepId);
      if (idx === -1) return s;
      const copy = { ...s.arrangement[idx], id: crypto.randomUUID() };
      const arr = [...s.arrangement];
      arr.splice(idx + 1, 0, copy);
      return { arrangement: arr };
    }),

  setTrackPosition: (index) => set({ trackPosition: index }),
  setTrackStepProgress: (progress) => set({ trackStepProgress: progress }),

  // Recording
  isRecording: false,
  recordings: [],
  recordingFolders: [],
  recordingFormat: 'wav' as RecordingFormat,
  recordingQuality: 0.75,

  hydrateRecordings: async () => {
    const [recs, folders] = await Promise.all([loadAllRecordings(), loadAllFolders()]);
    recs.sort((a, b) => a.order - b.order);
    set({ recordings: recs, recordingFolders: folders });
  },

  startRecording: () => {
    if (recStart()) set({ isRecording: true });
  },

  stopRecording: async () => {
    const { recordingFormat, recordingQuality } = get();
    const result = await stopRecordingAsync(recordingFormat, recordingQuality);
    if (result) {
      const order = get().recordings.length;
      const newRec: StoredRecording = {
        id: createId(), blob: result.blob, name: `Rec ${order + 1}`,
        duration: result.duration, timestamp: result.timestamp,
        folderId: null, format: recordingFormat, order,
      };
      set((s) => ({ isRecording: false, recordings: [...s.recordings, newRec] }));
      dbSaveRec(newRec).catch(console.error);
      postSync({ type: 'recording-added', id: newRec.id });
    } else {
      set({ isRecording: false });
    }
  },

  deleteRecording: (id) => {
    set((s) => ({ recordings: s.recordings.filter((r) => r.id !== id) }));
    dbDelRec(id).catch(console.error);
    postSync({ type: 'recording-deleted', id });
  },

  renameRecording: (id, name) => {
    set((s) => ({ recordings: s.recordings.map((r) => (r.id === id ? { ...r, name } : r)) }));
    const rec = get().recordings.find((r) => r.id === id);
    if (rec) dbSaveRec(rec).catch(console.error);
    postSync({ type: 'recording-updated', id });
  },

  reorderRecordings: (fromIdx, toIdx) => {
    set((s) => {
      const recs = [...s.recordings];
      const [item] = recs.splice(fromIdx, 1);
      recs.splice(toIdx, 0, item);
      // Update order fields
      return { recordings: recs.map((r, i) => ({ ...r, order: i })) };
    });
    // Persist all with updated order
    for (const rec of get().recordings) dbSaveRec(rec).catch(console.error);
    postSync({ type: 'recordings-reordered' });
  },

  moveRecordingToFolder: (recordingId, folderId) => {
    set((s) => ({ recordings: s.recordings.map((r) => (r.id === recordingId ? { ...r, folderId } : r)) }));
    const rec = get().recordings.find((r) => r.id === recordingId);
    if (rec) dbSaveRec(rec).catch(console.error);
    postSync({ type: 'recording-updated', id: recordingId });
  },

  createRecordingFolder: (name) => {
    const folder = { id: createId(), name };
    set((s) => ({ recordingFolders: [...s.recordingFolders, folder] }));
    dbSaveFolder(folder).catch(console.error);
    postSync({ type: 'folder-added', id: folder.id });
  },

  renameRecordingFolder: (id, name) => {
    set((s) => ({ recordingFolders: s.recordingFolders.map((f) => (f.id === id ? { ...f, name } : f)) }));
    const folder = get().recordingFolders.find((f) => f.id === id);
    if (folder) dbSaveFolder(folder).catch(console.error);
    postSync({ type: 'folder-updated', id });
  },

  deleteRecordingFolder: (id) => {
    set((s) => ({
      recordingFolders: s.recordingFolders.filter((f) => f.id !== id),
      recordings: s.recordings.map((r) => (r.folderId === id ? { ...r, folderId: null } : r)),
    }));
    dbDelFolder(id).catch(console.error);
    // Persist orphaned recordings with null folderId
    for (const rec of get().recordings.filter((r) => r.folderId === null)) {
      dbSaveRec(rec).catch(console.error);
    }
    postSync({ type: 'folder-deleted', id });
  },

  setRecordingFormat: (recordingFormat) => set({ recordingFormat }),
  setRecordingQuality: (recordingQuality) => set({ recordingQuality }),

  // Looper
  looperEditors: {},

  assignLoop: (instrumentId, loopPath, displayName) => {
    const baseUrl = (import.meta.env.BASE_URL as string) ?? '/';
    const url = loopPath.startsWith('blob:') || loopPath.startsWith('http')
      ? loopPath
      : baseUrl.replace(/\/$/, '') + '/' + loopPath;

    const sdKey = registerSampleForPlayback(loopPath);
    loadSample(loopPath, url);

    set((s) => ({
      instruments: s.instruments.map((inst) =>
        inst.id === instrumentId
          ? { ...inst, sampleName: sdKey, samplePath: loopPath, name: displayName }
          : inst
      ),
    }));

    // Decode audio and init editor — reuse Tone.js AudioContext
    const ctx = Tone.getContext().rawContext as AudioContext;
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((buf) => ctx.decodeAudioData(buf))
      .then((decoded) => {
        get().initLooperEditor(instrumentId, decoded);
      })
      .catch((e) => console.error('[assignLoop] decode failed:', e));
  },

  updateLooperParams: (id, params) =>
    set((s) => ({
      instruments: s.instruments.map((inst) =>
        inst.id === id
          ? { ...inst, looperParams: { ...(inst.looperParams ?? DEFAULT_LOOPER_PARAMS), ...params } }
          : inst
      ),
    })),

  initLooperEditor: (instrumentId, buffer) => {
    const projectBpm = get().bpm;
    const inst = get().instruments.find((i) => i.id === instrumentId);
    const samplePath = inst?.samplePath ?? '';
    const existingRes = get().looperEditors[instrumentId]?.peakResolution ?? 2048;
    const peaks = extractPeaks(buffer, existingRes);

    // Check BPM cache first for instant results
    const cachedBpm = getCachedBpm(samplePath);

    // Use cached BPM for initial estimate if available, otherwise fall back to project BPM
    const initialBpm = cachedBpm > 0 ? cachedBpm : 0;
    const fallbackLoopSize = estimateLoopSize(buffer, projectBpm, initialBpm);
    const fallbackMaxPeaks = Math.min(fallbackLoopSize, 64);
    const transients = detectTransients(buffer, 0.5, fallbackMaxPeaks);
    const hitPositions = mapTransientsToGrid(transients, fallbackLoopSize);

    set((s) => ({
      looperEditors: {
        ...s.looperEditors,
        [instrumentId]: {
          ...createLooperEditorState(),
          peakResolution: existingRes,
          audioBuffer: buffer,
          peaks,
          transients,
        },
      },
      instruments: s.instruments.map((i) =>
        i.id === instrumentId
          ? { ...i, hits: hitPositions.length, hitPositions, loopSize: fallbackLoopSize, detectedBpm: cachedBpm || i.detectedBpm }
          : i
      ),
      gridNotes: {
        ...s.gridNotes,
        [instrumentId]: hitPositions.map(() => [60]),
      },
    }));

    // If we already have a cached BPM and it matched the fallback, skip async detection
    if (cachedBpm > 0) {
      console.log(`[looper] Using cached BPM: ${cachedBpm}, loopSize: ${fallbackLoopSize}`);
    }

    // Always run async BPM detection to verify/update cache
    detectBpm(buffer).then((detectedBpm) => {
      if (detectedBpm <= 0) {
        console.log(`[looper] BPM detection returned 0, keeping loopSize=${fallbackLoopSize}`);
        return;
      }

      // Cache the detected BPM for future loads
      if (samplePath) setCachedBpm(samplePath, detectedBpm);

      // If we already applied this BPM from cache, just ensure it's on the instrument
      const currentInst = get().instruments.find((i) => i.id === instrumentId);
      if (currentInst?.detectedBpm === detectedBpm) return;

      const refinedLoopSize = estimateLoopSize(buffer, projectBpm, detectedBpm);

      if (refinedLoopSize === fallbackLoopSize) {
        // loopSize unchanged, but still store detectedBpm
        set((s) => ({
          instruments: s.instruments.map((i) =>
            i.id === instrumentId ? { ...i, detectedBpm } : i
          ),
        }));
        console.log(`[looper] BPM detected: ${detectedBpm.toFixed(1)}, loopSize unchanged: ${refinedLoopSize}`);
        return;
      }

      const refinedMaxPeaks = Math.min(refinedLoopSize, 64);
      const refinedTransients = detectTransients(buffer, 0.5, refinedMaxPeaks);
      const refinedHits = mapTransientsToGrid(refinedTransients, refinedLoopSize);

      set((s) => ({
        looperEditors: {
          ...s.looperEditors,
          [instrumentId]: {
            ...(s.looperEditors[instrumentId] ?? createLooperEditorState()),
            transients: refinedTransients,
          },
        },
        instruments: s.instruments.map((i) =>
          i.id === instrumentId
            ? { ...i, hits: refinedHits.length, hitPositions: refinedHits, loopSize: refinedLoopSize, detectedBpm }
            : i
        ),
        gridNotes: {
          ...s.gridNotes,
          [instrumentId]: refinedHits.map(() => [60]),
        },
      }));
      console.log(`[looper] BPM detected: ${detectedBpm.toFixed(1)}, loopSize: ${refinedLoopSize} (was ${fallbackLoopSize})`);
    }).catch((e) => {
      console.warn('[looper] BPM detection error:', e);
    });
  },

  setLooperSelection: (instrumentId, start, end) =>
    set((s) => ({
      looperEditors: {
        ...s.looperEditors,
        [instrumentId]: {
          ...(s.looperEditors[instrumentId] ?? createLooperEditorState()),
          selectionStart: start,
          selectionEnd: end,
        },
      },
    })),

  setLooperZoom: (instrumentId, viewStart, viewEnd) =>
    set((s) => ({
      looperEditors: {
        ...s.looperEditors,
        [instrumentId]: {
          ...(s.looperEditors[instrumentId] ?? createLooperEditorState()),
          viewStart,
          viewEnd,
        },
      },
    })),

  setLooperLoop: (instrumentId, loopIn, loopOut) =>
    set((s) => ({
      looperEditors: {
        ...s.looperEditors,
        [instrumentId]: {
          ...(s.looperEditors[instrumentId] ?? createLooperEditorState()),
          loopIn: Math.max(0, Math.min(1, loopIn)),
          loopOut: Math.max(0, Math.min(1, loopOut)),
        },
      },
    })),

  setLooperCursor: (instrumentId, position) =>
    set((s) => ({
      looperEditors: {
        ...s.looperEditors,
        [instrumentId]: {
          ...(s.looperEditors[instrumentId] ?? createLooperEditorState()),
          cursorPosition: position != null ? Math.max(0, Math.min(1, position)) : null,
        },
      },
    })),

  setLooperPeakResolution: (instrumentId, resolution) => {
    const editor = get().looperEditors[instrumentId];
    if (!editor?.audioBuffer) return;
    const clamped = Math.max(256, Math.min(2048, resolution));
    const peaks = extractPeaks(editor.audioBuffer, clamped);
    set((s) => ({
      looperEditors: {
        ...s.looperEditors,
        [instrumentId]: {
          ...(s.looperEditors[instrumentId] ?? createLooperEditorState()),
          peakResolution: clamped,
          peaks,
        },
      },
    }));
  },

  looperCut: (instrumentId) => {
    const editor = get().looperEditors[instrumentId];
    if (!editor?.audioBuffer || editor.selectionStart == null || editor.selectionEnd == null) return;
    const buf = editor.audioBuffer;
    const startSample = Math.floor(editor.selectionStart * buf.length);
    const endSample = Math.floor(editor.selectionEnd * buf.length);
    const clipboard = sliceBuffer(buf, startSample, endSample);
    const newBuffer = deleteRange(buf, startSample, endSample);
    const peaks = extractPeaks(newBuffer, editor.peakResolution ?? 2048);
    const undoStack = [...editor.undoStack, buf].slice(-20);

    // Re-register with superdough
    const inst = get().instruments.find((i) => i.id === instrumentId);
    if (inst?.sampleName) {
      const blobUrl = bufferToBlobUrl(newBuffer);
      registerSampleForPlayback(inst.samplePath ?? inst.sampleName, blobUrl);
    }

    // Re-detect transients
    const transients = detectTransients(newBuffer, 0.5, 16);
    const gridSize = inst?.loopSize ?? 16;
    const hitPositions = mapTransientsToGrid(transients, gridSize);

    set((s) => ({
      looperEditors: {
        ...s.looperEditors,
        [instrumentId]: {
          ...editor,
          audioBuffer: newBuffer,
          peaks,
          clipboard,
          clipboardStart: Math.min(editor.selectionStart!, editor.selectionEnd!),
          clipboardEnd: Math.max(editor.selectionStart!, editor.selectionEnd!),
          undoStack,
          transients,
          selectionStart: null,
          selectionEnd: null,
        },
      },
      instruments: s.instruments.map((i) =>
        i.id === instrumentId ? { ...i, hits: hitPositions.length, hitPositions } : i
      ),
      gridNotes: {
        ...s.gridNotes,
        [instrumentId]: hitPositions.map(() => [60]),
      },
    }));
  },

  looperCopy: (instrumentId) => {
    const editor = get().looperEditors[instrumentId];
    if (!editor?.audioBuffer || editor.selectionStart == null || editor.selectionEnd == null) return;
    const buf = editor.audioBuffer;
    const startSample = Math.floor(editor.selectionStart * buf.length);
    const endSample = Math.floor(editor.selectionEnd * buf.length);
    const clipboard = sliceBuffer(buf, startSample, endSample);

    const clipStart = Math.min(editor.selectionStart, editor.selectionEnd);
    const clipEnd = Math.max(editor.selectionStart, editor.selectionEnd);
    set((s) => ({
      looperEditors: {
        ...s.looperEditors,
        [instrumentId]: { ...editor, clipboard, clipboardStart: clipStart, clipboardEnd: clipEnd },
      },
    }));
  },

  looperPaste: (instrumentId) => {
    const editor = get().looperEditors[instrumentId];
    if (!editor?.audioBuffer || !editor.clipboard) return;
    const buf = editor.audioBuffer;
    const insertAt = editor.selectionStart != null
      ? Math.floor(editor.selectionStart * buf.length)
      : editor.cursorPosition != null
        ? Math.floor(editor.cursorPosition * buf.length)
        : buf.length;
    const undoStack = [...editor.undoStack, buf].slice(-20);
    const newBuffer = insertBuffer(buf, editor.clipboard, insertAt);
    const peaks = extractPeaks(newBuffer, editor.peakResolution ?? 2048);

    const inst = get().instruments.find((i) => i.id === instrumentId);
    if (inst?.sampleName) {
      const blobUrl = bufferToBlobUrl(newBuffer);
      registerSampleForPlayback(inst.samplePath ?? inst.sampleName, blobUrl);
    }

    const transients = detectTransients(newBuffer, 0.5, 16);
    const gridSize = inst?.loopSize ?? 16;
    const hitPositions = mapTransientsToGrid(transients, gridSize);

    set((s) => ({
      looperEditors: {
        ...s.looperEditors,
        [instrumentId]: {
          ...editor,
          audioBuffer: newBuffer,
          peaks,
          undoStack,
          transients,
          clipboardStart: null,
          clipboardEnd: null,
          selectionStart: null,
          selectionEnd: null,
        },
      },
      instruments: s.instruments.map((i) =>
        i.id === instrumentId ? { ...i, hits: hitPositions.length, hitPositions } : i
      ),
      gridNotes: {
        ...s.gridNotes,
        [instrumentId]: hitPositions.map(() => [60]),
      },
    }));
  },

  looperTrim: (instrumentId) => {
    const editor = get().looperEditors[instrumentId];
    if (!editor?.audioBuffer || editor.selectionStart == null || editor.selectionEnd == null) return;
    const buf = editor.audioBuffer;
    const startSample = Math.floor(editor.selectionStart * buf.length);
    const endSample = Math.floor(editor.selectionEnd * buf.length);
    const undoStack = [...editor.undoStack, buf].slice(-20);
    const newBuffer = sliceBuffer(buf, startSample, endSample);
    const peaks = extractPeaks(newBuffer, editor.peakResolution ?? 2048);

    const inst = get().instruments.find((i) => i.id === instrumentId);
    if (inst?.sampleName) {
      const blobUrl = bufferToBlobUrl(newBuffer);
      registerSampleForPlayback(inst.samplePath ?? inst.sampleName, blobUrl);
    }

    const transients = detectTransients(newBuffer, 0.5, 16);
    const gridSize = inst?.loopSize ?? 16;
    const hitPositions = mapTransientsToGrid(transients, gridSize);

    set((s) => ({
      looperEditors: {
        ...s.looperEditors,
        [instrumentId]: {
          ...editor,
          audioBuffer: newBuffer,
          peaks,
          undoStack,
          transients,
          selectionStart: null,
          selectionEnd: null,
          viewStart: 0,
          viewEnd: 1,
        },
      },
      instruments: s.instruments.map((i) =>
        i.id === instrumentId ? { ...i, hits: hitPositions.length, hitPositions } : i
      ),
      gridNotes: {
        ...s.gridNotes,
        [instrumentId]: hitPositions.map(() => [60]),
      },
    }));
  },

  looperDelete: (instrumentId) => {
    const editor = get().looperEditors[instrumentId];
    if (!editor?.audioBuffer || editor.selectionStart == null || editor.selectionEnd == null) return;
    const buf = editor.audioBuffer;
    const startSample = Math.floor(editor.selectionStart * buf.length);
    const endSample = Math.floor(editor.selectionEnd * buf.length);
    const undoStack = [...editor.undoStack, buf].slice(-20);
    const newBuffer = deleteRange(buf, startSample, endSample);
    const peaks = extractPeaks(newBuffer, editor.peakResolution ?? 2048);

    const inst = get().instruments.find((i) => i.id === instrumentId);
    if (inst?.sampleName) {
      const blobUrl = bufferToBlobUrl(newBuffer);
      registerSampleForPlayback(inst.samplePath ?? inst.sampleName, blobUrl);
    }

    const transients = detectTransients(newBuffer, 0.5, 16);
    const gridSize = inst?.loopSize ?? 16;
    const hitPositions = mapTransientsToGrid(transients, gridSize);

    set((s) => ({
      looperEditors: {
        ...s.looperEditors,
        [instrumentId]: {
          ...editor,
          audioBuffer: newBuffer,
          peaks,
          undoStack,
          transients,
          selectionStart: null,
          selectionEnd: null,
        },
      },
      instruments: s.instruments.map((i) =>
        i.id === instrumentId ? { ...i, hits: hitPositions.length, hitPositions } : i
      ),
      gridNotes: {
        ...s.gridNotes,
        [instrumentId]: hitPositions.map(() => [60]),
      },
    }));
  },

  looperSilence: (instrumentId) => {
    const editor = get().looperEditors[instrumentId];
    if (!editor?.audioBuffer || editor.selectionStart == null || editor.selectionEnd == null) return;
    const buf = editor.audioBuffer;
    const startSample = Math.floor(editor.selectionStart * buf.length);
    const endSample = Math.floor(editor.selectionEnd * buf.length);
    const undoStack = [...editor.undoStack, buf].slice(-20);
    const newBuffer = silenceRange(buf, startSample, endSample);
    const peaks = extractPeaks(newBuffer, editor.peakResolution ?? 2048);

    const inst = get().instruments.find((i) => i.id === instrumentId);
    if (inst?.sampleName) {
      const blobUrl = bufferToBlobUrl(newBuffer);
      registerSampleForPlayback(inst.samplePath ?? inst.sampleName, blobUrl);
    }

    const transients = detectTransients(newBuffer, 0.5, 16);
    const gridSize = inst?.loopSize ?? 16;
    const hitPositions = mapTransientsToGrid(transients, gridSize);

    set((s) => ({
      looperEditors: {
        ...s.looperEditors,
        [instrumentId]: {
          ...editor,
          audioBuffer: newBuffer,
          peaks,
          undoStack,
          transients,
          selectionStart: null,
          selectionEnd: null,
        },
      },
      instruments: s.instruments.map((i) =>
        i.id === instrumentId ? { ...i, hits: hitPositions.length, hitPositions } : i
      ),
      gridNotes: {
        ...s.gridNotes,
        [instrumentId]: hitPositions.map(() => [60]),
      },
    }));
  },

  looperUndo: (instrumentId) => {
    const editor = get().looperEditors[instrumentId];
    if (!editor?.undoStack.length) return;
    const undoStack = [...editor.undoStack];
    const buffer = undoStack.pop()!;
    const peaks = extractPeaks(buffer, editor.peakResolution ?? 2048);

    const inst = get().instruments.find((i) => i.id === instrumentId);
    if (inst?.sampleName) {
      const blobUrl = bufferToBlobUrl(buffer);
      registerSampleForPlayback(inst.samplePath ?? inst.sampleName, blobUrl);
    }

    const transients = detectTransients(buffer, 0.5, 16);
    const gridSize = inst?.loopSize ?? 16;
    const hitPositions = mapTransientsToGrid(transients, gridSize);

    set((s) => ({
      looperEditors: {
        ...s.looperEditors,
        [instrumentId]: {
          ...editor,
          audioBuffer: buffer,
          peaks,
          undoStack,
          transients,
          selectionStart: null,
          selectionEnd: null,
        },
      },
      instruments: s.instruments.map((i) =>
        i.id === instrumentId ? { ...i, hits: hitPositions.length, hitPositions } : i
      ),
      gridNotes: {
        ...s.gridNotes,
        [instrumentId]: hitPositions.map(() => [60]),
      },
    }));
  },

  redetectTransients: (instrumentId, sensitivity) => {
    const editor = get().looperEditors[instrumentId];
    if (!editor?.audioBuffer) return;
    const transients = detectTransients(editor.audioBuffer, sensitivity, 16);
    const inst = get().instruments.find((i) => i.id === instrumentId);
    const gridSize = inst?.loopSize ?? 16;
    const hitPositions = mapTransientsToGrid(transients, gridSize);

    set((s) => ({
      looperEditors: {
        ...s.looperEditors,
        [instrumentId]: { ...editor, transients },
      },
      instruments: s.instruments.map((i) =>
        i.id === instrumentId ? { ...i, hits: hitPositions.length, hitPositions } : i
      ),
      gridNotes: {
        ...s.gridNotes,
        [instrumentId]: hitPositions.map(() => [60]),
      },
    }));
  },

  setDetectedBpm: (instrumentId, bpm) => {
    const inst = get().instruments.find((i) => i.id === instrumentId);
    if (inst?.samplePath) setCachedBpm(inst.samplePath, bpm);
    set((s) => ({
      instruments: s.instruments.map((i) =>
        i.id === instrumentId ? { ...i, detectedBpm: bpm } : i
      ),
    }));
  },

  setLooperBpmMultiplier: (instrumentId, multiplier) => {
    const inst = get().instruments.find((i) => i.id === instrumentId);
    const editor = get().looperEditors[instrumentId];
    if (!inst || !editor?.audioBuffer) return;

    const detectedBpm = inst.detectedBpm ?? 0;
    if (detectedBpm <= 0) return; // can't compute without detected BPM

    const projectBpm = get().bpm;
    const effectiveBpm = detectedBpm * multiplier;
    const newLoopSize = estimateLoopSize(editor.audioBuffer, projectBpm, effectiveBpm);
    const maxPeaks = Math.min(newLoopSize, 64);
    const transients = detectTransients(editor.audioBuffer, 0.5, maxPeaks);
    const hitPositions = mapTransientsToGrid(transients, newLoopSize);

    set((s) => ({
      instruments: s.instruments.map((i) =>
        i.id === instrumentId
          ? { ...i, bpmMultiplier: multiplier, loopSize: newLoopSize, hits: hitPositions.length, hitPositions }
          : i
      ),
      looperEditors: {
        ...s.looperEditors,
        [instrumentId]: { ...editor, transients },
      },
      gridNotes: {
        ...s.gridNotes,
        [instrumentId]: hitPositions.map(() => [60]),
      },
    }));
  },

  // Set (project) management
  currentSetId: null,
  currentSetName: generateName(),

  setCurrentSetName: (name) => set({ currentSetName: name }),

  getSerializableState: () => {
    const s = get();
    return {
      bpm: s.bpm,
      masterVolume: s.masterVolume,
      instruments: s.instruments,
      gridNotes: s.gridNotes,
      gridGlide: s.gridGlide,
      gridLengths: s.gridLengths,
      instrumentEffects: s.instrumentEffects,
      masterEffects: s.masterEffects,
      scenes: s.scenes,
      sceneEffects: s.sceneEffects,
      customSamples: s.customSamples,
      gridResolution: s.gridResolution,
      scaleRoot: s.scaleRoot,
      scaleType: s.scaleType,
      trackMode: s.trackMode,
      arrangement: s.arrangement,
    };
  },

  loadSet: (orbeatSet: OrbeatSet) => {
    // Tear down existing group buses before loading new state
    destroyAllSceneBuses();

    // Re-register custom samples from embedded data and pre-decode into superdough's buffer cache
    const customSamples: { key: string; url: string; name: string }[] = [];
    if (orbeatSet.customSamples) {
      for (const es of orbeatSet.customSamples) {
        const blob = base64ToBlob(es.base64, es.mimeType);
        const url = URL.createObjectURL(blob);
        registerSampleForPlayback(es.key, url);
        void preloadCustomSample(es.key, url); // pre-decode into superdough buffer cache
        customSamples.push({ key: es.key, url, name: es.name });
      }
    }

    // Re-register + pre-decode non-custom samples referenced by instruments
    for (const inst of orbeatSet.instruments) {
      if ((inst.type === 'sampler' || inst.type === 'looper') && inst.samplePath) {
        const isCustom = customSamples.some((c) => c.key === inst.samplePath);
        if (!isCustom) {
          void preloadSample(inst.samplePath); // registers + pre-decodes into superdough buffer cache
        }
      }
    }

    // Reset orbit counter to match loaded instruments
    orbitCounter = orbeatSet.instruments.reduce((max, i) => Math.max(max, i.orbitIndex + 1), 0);

    set({
      bpm: orbeatSet.bpm,
      masterVolume: orbeatSet.masterVolume,
      instruments: orbeatSet.instruments,
      gridNotes: orbeatSet.gridNotes,
      gridGlide: orbeatSet.gridGlide,
      gridLengths: orbeatSet.gridLengths,
      instrumentEffects: orbeatSet.instrumentEffects,
      masterEffects: orbeatSet.masterEffects ?? [],
      scenes: orbeatSet.scenes ?? [],
      sceneEffects: orbeatSet.sceneEffects ?? {},
      customSamples,
      currentSetId: orbeatSet.meta.id,
      currentSetName: orbeatSet.meta.name,
      selectedInstrumentId: orbeatSet.instruments[0]?.id ?? null,
      selectedInstrumentIds: orbeatSet.instruments[0] ? [orbeatSet.instruments[0].id] : [],
      selectedSceneId: null,
      gridResolution: orbeatSet.gridResolution ?? 1,
      scaleRoot: orbeatSet.scaleRoot ?? 0,
      scaleType: orbeatSet.scaleType ?? 'chromatic',
      trackMode: orbeatSet.trackMode ?? false,
      arrangement: orbeatSet.arrangement ?? [],
    });

    // Re-init looper editors — async decode + BPM detection
    const baseUrl = ((import.meta.env.BASE_URL as string) ?? '/').replace(/\/$/, '') + '/';
    for (const inst of orbeatSet.instruments) {
      if (inst.type === 'looper' && inst.samplePath) {
        const isCustom = customSamples.some((c) => c.key === inst.samplePath);
        const url = isCustom
          ? customSamples.find((c) => c.key === inst.samplePath)!.url
          : inst.samplePath.startsWith('blob:') || inst.samplePath.startsWith('http')
            ? inst.samplePath
            : baseUrl + inst.samplePath;
        try {
          const ctx = Tone.getContext().rawContext as AudioContext;
          fetch(url)
            .then((r) => r.arrayBuffer())
            .then((buf) => ctx.decodeAudioData(buf))
            .then((decoded) => get().initLooperEditor(inst.id, decoded))
            .catch((e) => console.error('[loadSet] looper decode failed:', e));
        } catch (e) {
          console.error('[loadSet] looper re-init failed:', e);
        }
      }
    }

    // Clear undo history — new project context
    import('./undoHistory').then((m) => m.clearHistory());

    // Re-initialize group buses from loaded state
    if (orbeatSet.scenes && orbeatSet.scenes.length > 0) {
      initSceneBusesFromState(orbeatSet.scenes, orbeatSet.instruments);
    }
  },

  newSet: () => {
    destroyAllSceneBuses();
    orbitCounter = 0;
    const instruments = defaultInstruments.map((inst) => ({
      ...inst,
      id: createId(),
      orbitIndex: orbitCounter++,
    }));
    const gridNotes: Record<string, number[][]> = {};
    for (const inst of instruments) {
      gridNotes[inst.id] = Array.from({ length: inst.hits }, () => [60]);
    }
    const bpm = Math.floor(Math.random() * (145 - 85 + 1)) + 85;
    set({
      bpm,
      masterVolume: 0.8,
      instruments,
      gridNotes,
      gridGlide: {},
      gridLengths: {},
      instrumentEffects: {},
      masterEffects: [],
      scenes: [],
      sceneEffects: {},
      customSamples: [],
      currentSetId: null,
      currentSetName: generateName(),
      selectedInstrumentId: null,
      selectedInstrumentIds: [],
      selectedSceneId: null,
      isPlaying: false,
      currentStep: -1,
      transportProgress: 0,
      gridResolution: 1,
      scaleRoot: 0,
      scaleType: 'chromatic',
      trackMode: false,
      arrangement: [],
      trackPosition: -1,
    });

    // Assign random samples to default sampler instruments
    const CATEGORIES: { keywords: string[]; index: number }[] = [
      { keywords: ['kick'],          index: 0 },
      { keywords: ['snare', 'clap'], index: 1 },
      { keywords: ['hat', 'hh'],     index: 2 },
      { keywords: ['conga'],         index: 3 },
    ];
    const flattenFiles = (entries: SampleEntry[]): SampleEntry[] => {
      const result: SampleEntry[] = [];
      for (const e of entries) {
        if (e.type === 'file') result.push(e);
        else if (e.children) result.push(...flattenFiles(e.children));
      }
      return result;
    };
    fetchSampleTree().then((tree) => {
      const files = flattenFiles(tree);
      const store = get();
      for (const { keywords, index } of CATEGORIES) {
        const inst = store.instruments[index];
        if (!inst) continue;
        const matches = files.filter((f) =>
          keywords.some((kw) => f.name.toLowerCase().includes(kw))
        );
        if (matches.length === 0) continue;
        const pick = matches[Math.floor(Math.random() * matches.length)];
        get().assignSample(inst.id, pick.path, pick.name.replace(/\.[^.]+$/, ''));
      }
    });

    // Clear undo history — new project context
    import('./undoHistory').then((m) => m.clearHistory());
  },
}));
