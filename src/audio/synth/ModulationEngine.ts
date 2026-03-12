/**
 * ModulationEngine — 4 LFO slots with universal routing.
 *
 * Each LFO is an OscillatorNode → smoothing filter → GainNode → AnalyserNode.
 * Audio-rate targets (filter freq, pitch detune) use direct AudioParam connection.
 * All other targets are polled at ~60Hz via requestAnimationFrame.
 *
 * Supports custom LFO shapes (expDecay, punch, etc.) via PeriodicWave.
 * Trigger modes: free (always running), retrig (restart on note), envelope (one-shot per note).
 */

import type { SynthParams, LFOSlotParams, ModAssignment } from './types';
import { MOD_PARAM_META, syncDivToHz, isNativeLFOShape, getLFOPeriodicWave } from './modConstants';

const NUM_LFOS = 4;

export type LFOSourceId = 'lfo1' | 'lfo2' | 'lfo3' | 'lfo4';

interface LFOSlot {
  osc: OscillatorNode;
  smoothFilter: BiquadFilterNode;  // lowpass for smoothing
  gain: GainNode;                  // depth = 1.0 (unity); individual depth is per-assignment
  analyser: AnalyserNode;          // for reading current value
  delayGain: GainNode;             // for fade-in delay
  gateGain: GainNode;              // for retrig/envelope gating
  started: boolean;
  params: LFOSlotParams;
}

interface ActiveConnection {
  assignmentId: string;
  source: LFOSourceId;
  target: keyof SynthParams;
  depth: number;
  /** If audio-rate, the gain node used for the connection */
  connectionGain?: GainNode;
  /** The AudioParam being modulated (for audio-rate) */
  audioParam?: AudioParam;
}

export class ModulationEngine {
  private ac: AudioContext;
  private slots: LFOSlot[] = [];
  private connections: ActiveConnection[] = [];
  private rafId = 0;
  private running = false;
  private readBuffer = new Float32Array(1);
  private getParams: () => SynthParams;
  private applyParamFn: (key: keyof SynthParams, value: number) => void;
  /** AudioParam getters for audio-rate targets (set externally by SynthEngine) */
  audioParamGetters: Map<string, () => AudioParam[]> = new Map();
  /** Callback to check if any synth voices are active (set by SynthEngine) */
  hasActiveVoices: (() => boolean) | null = null;
  /** BPM for tempo sync (updated externally) */
  bpm = 120;
  /** Track whether voices were active last poll (for gating transitions) */
  private _lastVoicesActive = false;
  /** Grace period: don't close gates for this many ms after a noteOn */
  private _noteOnGraceUntil = 0;

  constructor(
    ac: AudioContext,
    getParams: () => SynthParams,
    applyParam: (key: keyof SynthParams, value: number) => void,
  ) {
    this.ac = ac;
    this.getParams = getParams;
    this.applyParamFn = applyParam;

    for (let i = 0; i < NUM_LFOS; i++) {
      this.slots.push(this.createSlot());
    }
  }

  private createSlot(): LFOSlot {
    const ac = this.ac;
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 1;

    const smoothFilter = ac.createBiquadFilter();
    smoothFilter.type = 'lowpass';
    smoothFilter.frequency.value = 20000; // no smoothing by default
    smoothFilter.Q.value = 0;

    const delayGain = ac.createGain();
    delayGain.gain.value = 1;

    const gateGain = ac.createGain();
    gateGain.gain.value = 1; // open by default (free mode)

    const gain = ac.createGain();
    gain.gain.value = 1; // unity; per-assignment depth is handled separately

    const analyser = ac.createAnalyser();
    analyser.fftSize = 32;

    // Chain: osc → smoothFilter → delayGain → gateGain → gain → analyser
    osc.connect(smoothFilter);
    smoothFilter.connect(delayGain);
    delayGain.connect(gateGain);
    gateGain.connect(gain);
    gain.connect(analyser);

    return {
      osc, smoothFilter, gain, delayGain, gateGain, analyser,
      started: false,
      params: { shape: 'sine', rate: 1, tempoSync: false, syncDiv: '1/4', triggerMode: 'free', smooth: 0, delay: 0, phase: 0 },
    };
  }

  start(): void {
    for (const slot of this.slots) {
      if (!slot.started) {
        slot.osc.start();
        slot.started = true;
        // For retrig/envelope: start gated (silent until first note)
        if (slot.params.triggerMode !== 'free') {
          slot.gateGain.gain.value = 0;
        }
      }
    }
    this.running = true;
    this.poll();
  }

  stop(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  dispose(): void {
    this.stop();
    this.removeAllConnections();
    for (const slot of this.slots) {
      try { slot.osc.stop(); } catch { /* */ }
      try { slot.osc.disconnect(); } catch { /* */ }
      try { slot.smoothFilter.disconnect(); } catch { /* */ }
      try { slot.delayGain.disconnect(); } catch { /* */ }
      try { slot.gateGain.disconnect(); } catch { /* */ }
      try { slot.gain.disconnect(); } catch { /* */ }
      try { slot.analyser.disconnect(); } catch { /* */ }
    }
  }

  // ── LFO parameter updates ────────────────────────────────────────────────

  updateLFO(idx: number, params: LFOSlotParams): void {
    if (idx < 0 || idx >= NUM_LFOS) return;
    const slot = this.slots[idx];
    const now = this.ac.currentTime;

    const oldTrigger = slot.params.triggerMode;
    slot.params = { ...params };

    // Shape & rate — try-catch because osc may be stopped (envelope one-shot ended)
    try {
      if (isNativeLFOShape(params.shape)) {
        slot.osc.type = params.shape;
      } else {
        const wave = getLFOPeriodicWave(this.ac, params.shape);
        slot.osc.setPeriodicWave(wave);
      }

      const rate = params.tempoSync
        ? syncDivToHz(params.syncDiv, this.bpm)
        : params.rate;
      slot.osc.frequency.setTargetAtTime(Math.max(0.01, rate), now, 0.02);
    } catch { /* osc already stopped — will be recreated on next noteOn */ }

    // Smooth — map 0-1 to lowpass cutoff 20000Hz (no smooth) → 1Hz (max smooth)
    const smoothFreq = params.smooth > 0.01
      ? 20000 * Math.pow(0.00005, params.smooth)
      : 20000;
    slot.smoothFilter.frequency.setTargetAtTime(smoothFreq, now, 0.02);

    // Handle trigger mode changes
    if (oldTrigger !== params.triggerMode) {
      if (params.triggerMode === 'free') {
        // Switching to free: open gate and ensure osc is running
        slot.gateGain.gain.setTargetAtTime(1, now, 0.02);
        // If osc was stopped (envelope mode ended), restart it
        this.ensureOscRunning(slot, now);
      } else {
        // Close gate for retrig/envelope until next note
        const voicesActive = this.hasActiveVoices ? this.hasActiveVoices() : false;
        if (!voicesActive) {
          slot.gateGain.gain.setTargetAtTime(0, now, 0.02);
        }
      }
    }
  }

  /** Ensure the oscillator is running (it may have stopped after envelope one-shot) */
  private ensureOscRunning(slot: LFOSlot, now: number): void {
    try {
      // Test if osc is still alive by reading a property
      slot.osc.frequency.setTargetAtTime(slot.osc.frequency.value, now, 0.001);
    } catch {
      // Osc was stopped — recreate it
      this.restartOsc(slot, now);
    }
  }

  /** Called on note-on for retrig/envelope modes.
   *  @param audioTime — optional scheduled time; defaults to ac.currentTime */
  onNoteOn(audioTime?: number): void {
    const now = audioTime ?? this.ac.currentTime;
    // Grace period: prevent poll() from closing gates for 200ms after noteOn
    this._noteOnGraceUntil = performance.now() + 200;

    for (const slot of this.slots) {
      if (slot.params.triggerMode === 'retrig' || slot.params.triggerMode === 'envelope') {
        // Cancel any pending gate-close from previous envelope cycle
        slot.gateGain.gain.cancelScheduledValues(now);
        // Open the gate
        slot.gateGain.gain.setValueAtTime(1, now);

        // Restart LFO by recreating oscillator
        this.restartOsc(slot, now);
      }
      // Handle delay fade-in (applies to all modes on note trigger)
      if (slot.params.delay > 0 && slot.params.triggerMode !== 'free') {
        slot.delayGain.gain.cancelScheduledValues(now);
        slot.delayGain.gain.setValueAtTime(0, now);
        slot.delayGain.gain.linearRampToValueAtTime(1, now + slot.params.delay);
      }
    }
  }

  private restartOsc(slot: LFOSlot, now: number): void {
    try { slot.osc.stop(); } catch { /* */ }
    try { slot.osc.disconnect(); } catch { /* */ }

    const ac = this.ac;
    const osc = ac.createOscillator();

    // Apply shape
    if (isNativeLFOShape(slot.params.shape)) {
      osc.type = slot.params.shape;
    } else {
      const wave = getLFOPeriodicWave(ac, slot.params.shape);
      osc.setPeriodicWave(wave);
    }

    const rate = slot.params.tempoSync
      ? syncDivToHz(slot.params.syncDiv, this.bpm)
      : slot.params.rate;
    osc.frequency.value = Math.max(0.01, rate);
    osc.connect(slot.smoothFilter);
    osc.start(now);

    // Envelope mode: stop after one cycle (one-shot)
    if (slot.params.triggerMode === 'envelope') {
      const period = 1 / Math.max(0.01, rate);
      osc.stop(now + period);
      // Fade gate to 0 at end of cycle for smooth tail
      slot.gateGain.gain.setTargetAtTime(0, now + period * 0.9, period * 0.1);
    }

    slot.osc = osc;
    slot.started = true;
  }

  // ── Connection management ─────────────────────────────────────────────────

  addConnection(assignment: ModAssignment): void {
    // Remove existing connection with same id
    this.removeConnection(assignment.id);

    const slotIdx = parseInt(assignment.source.slice(3)) - 1;
    if (slotIdx < 0 || slotIdx >= NUM_LFOS) return;

    const meta = MOD_PARAM_META[assignment.target];
    if (!meta) return;

    const slot = this.slots[slotIdx];
    const conn: ActiveConnection = {
      assignmentId: assignment.id,
      source: assignment.source,
      target: assignment.target,
      depth: assignment.depth,
    };

    // Audio-rate connection for supported targets
    if (meta.audioRate) {
      const paramGetters = this.audioParamGetters.get(assignment.target);
      if (paramGetters) {
        const audioParams = paramGetters();
        if (audioParams.length > 0) {
          // Create a gain node for this specific assignment's depth
          const depthGain = this.ac.createGain();
          const range = meta.max - meta.min;
          depthGain.gain.value = assignment.depth * range;
          slot.gain.connect(depthGain);
          for (const ap of audioParams) {
            depthGain.connect(ap);
          }
          conn.connectionGain = depthGain;
          conn.audioParam = audioParams[0];
        }
      }
    }

    this.connections.push(conn);
  }

  removeConnection(id: string): void {
    const idx = this.connections.findIndex((c) => c.assignmentId === id);
    if (idx === -1) return;
    const conn = this.connections[idx];
    if (conn.connectionGain) {
      try { conn.connectionGain.disconnect(); } catch { /* */ }
    }
    this.connections.splice(idx, 1);
  }

  removeAllConnections(): void {
    for (const conn of this.connections) {
      if (conn.connectionGain) {
        try { conn.connectionGain.disconnect(); } catch { /* */ }
      }
    }
    this.connections.length = 0;
  }

  updateConnectionDepth(id: string, depth: number): void {
    const conn = this.connections.find((c) => c.assignmentId === id);
    if (!conn) return;
    conn.depth = depth;
    if (conn.connectionGain) {
      const meta = MOD_PARAM_META[conn.target];
      if (meta) {
        const range = meta.max - meta.min;
        conn.connectionGain.gain.setTargetAtTime(depth * range, this.ac.currentTime, 0.02);
      }
    }
  }

  // ── Polling loop for non-audio-rate targets ───────────────────────────────

  /** Read current LFO value from analyser (-1 to +1) */
  private readLFO(slotIdx: number): number {
    const slot = this.slots[slotIdx];
    slot.analyser.getFloatTimeDomainData(this.readBuffer);
    return this.readBuffer[0];
  }

  /** Get the current LFO value for a slot (for UI animation) */
  getLFOValue(slotIdx: number): number {
    if (slotIdx < 0 || slotIdx >= NUM_LFOS) return 0;
    return this.readLFO(slotIdx);
  }

  private poll = (): void => {
    if (!this.running) return;

    const params = this.getParams();
    const voicesActive = this.hasActiveVoices ? this.hasActiveVoices() : true;

    // Handle gate transitions for retrig/envelope when voices go silent
    // Skip gate-close during the grace period after noteOn to avoid race conditions
    const inGrace = performance.now() < this._noteOnGraceUntil;
    if (this._lastVoicesActive && !voicesActive && !inGrace) {
      const now = this.ac.currentTime;
      for (const slot of this.slots) {
        if (slot.params.triggerMode !== 'free') {
          slot.gateGain.gain.setTargetAtTime(0, now, 0.05);
        }
      }
    }
    this._lastVoicesActive = voicesActive;

    // Process non-audio-rate connections
    for (const conn of this.connections) {
      if (conn.connectionGain) continue; // handled by Web Audio graph

      const meta = MOD_PARAM_META[conn.target];
      if (!meta) continue;

      const slotIdx = parseInt(conn.source.slice(3)) - 1;
      const slot = this.slots[slotIdx];

      // Skip modulation for retrig/envelope when no voices active
      if (!voicesActive && slot.params.triggerMode !== 'free') continue;

      const lfoVal = this.readLFO(slotIdx);
      const range = meta.max - meta.min;
      const baseVal = (params as Record<string, number>)[conn.target] ?? 0;
      const modded = Math.max(meta.min, Math.min(meta.max, baseVal + lfoVal * conn.depth * range));

      this.applyParamFn(conn.target, modded);
    }

    this.rafId = requestAnimationFrame(this.poll);
  };

  // ── Sync all assignments from params ──────────────────────────────────────

  syncFromParams(params: SynthParams): void {
    // Update LFO slot params
    if (params.lfos) {
      for (let i = 0; i < NUM_LFOS && i < params.lfos.length; i++) {
        this.updateLFO(i, params.lfos[i]);
      }
    }

    // Sync mod assignments
    const currentIds = new Set(this.connections.map((c) => c.assignmentId));
    const targetIds = new Set((params.modAssignments ?? []).map((a) => a.id));

    // Remove old
    for (const id of currentIds) {
      if (!targetIds.has(id)) this.removeConnection(id);
    }

    // Add/update new
    for (const assignment of params.modAssignments ?? []) {
      const existing = this.connections.find((c) => c.assignmentId === assignment.id);
      if (!existing) {
        this.addConnection(assignment);
      } else if (existing.depth !== assignment.depth) {
        this.updateConnectionDepth(assignment.id, assignment.depth);
      }
    }
  }
}
