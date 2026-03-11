import type { SynthParams } from '../audio/synth/types';
import type { Instrument } from './instrument';
import type { Effect } from './effects';
import type { InstrumentScene } from './scene';

// ── Synth Presets ─────────────────────────────────────────────────────────────

export interface PresetMeta {
  id: string;
  name: string;
  folder: string;             // e.g. "Factory/Bass" or "User/My Sounds"
  source: 'factory' | 'user';
  createdAt: number;          // epoch ms
  updatedAt: number;
}

export interface SynthPreset extends PresetMeta {
  params: SynthParams;
}

// ── Effect Presets ───────────────────────────────────────────────────────────

export interface EffectPreset extends PresetMeta {
  effectType: string;                // EffectType — e.g. 'delay', 'reverb'
  params: Record<string, number>;
}

// ── Sets (Projects) ───────────────────────────────────────────────────────────

export interface SetMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface EmbeddedSample {
  key: string;
  name: string;
  mimeType: string;
  base64: string;
}

export interface OrbeatSet {
  id: string;           // top-level key for IndexedDB (mirrors meta.id)
  version: 1;
  meta: SetMeta;
  bpm: number;
  masterVolume: number;
  instruments: Instrument[];
  gridNotes: Record<string, number[][]>;
  gridGlide: Record<string, boolean[]>;
  gridLengths: Record<string, number[]>;
  instrumentEffects: Record<string, Effect[]>;
  masterEffects?: Effect[];
  groups?: InstrumentScene[];  // legacy: for backward compat on load
  scenes?: InstrumentScene[];
  groupEffects?: Record<string, Effect[]>;  // legacy: for backward compat on load
  sceneEffects?: Record<string, Effect[]>;
  customSamples?: EmbeddedSample[];
}

// ── Sample Library ────────────────────────────────────────────────────────────

export interface SampleMeta {
  key: string;
  name: string;
  blob: Blob;
  createdAt: number;
}

// ── User / Account (future) ──────────────────────────────────────────────────

export interface User {
  id: string;
  email?: string;
  plan: 'free' | 'pro';
  createdAt: number;
}
