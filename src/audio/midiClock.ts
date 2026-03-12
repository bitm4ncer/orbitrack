/** MIDI clock synchronization — output and input */

import { sendMidiRawMessage, onMidiSystemMessage } from './midiController';

const PPQN = 24;

// ═══════════════════════════════════════════════════════════════════════
// CLOCK OUTPUT — Send MIDI clock to external devices
// ═══════════════════════════════════════════════════════════════════════

let clockTimer: ReturnType<typeof setTimeout> | null = null;
let isRunning = false;
let clockCount = 0;
let bpm = 120;
let expectedTime = 0;

export function startMidiClock(_bpm: number): void {
  stopMidiClock();
  bpm = Math.max(20, Math.min(300, _bpm));
  isRunning = true;
  clockCount = 0;

  sendMidiSystemMessage(0xfa); // Start

  const intervalMs = (60 * 1000) / (bpm * PPQN);
  expectedTime = performance.now() + intervalMs;

  const tick = () => {
    if (!isRunning) return;
    sendMidiSystemMessage(0xf8); // Clock
    clockCount++;

    const now = performance.now();
    const drift = now - expectedTime;
    expectedTime += intervalMs;
    const nextDelay = Math.max(0, intervalMs - drift);
    clockTimer = setTimeout(tick, nextDelay);
  };

  clockTimer = setTimeout(tick, intervalMs);
}

export function stopMidiClock(): void {
  if (clockTimer) {
    clearTimeout(clockTimer);
    clockTimer = null;
  }
  if (isRunning) {
    sendMidiSystemMessage(0xfc); // Stop
  }
  isRunning = false;
  clockCount = 0;
}

export function resumeMidiClock(_bpm: number): void {
  stopMidiClock();
  bpm = Math.max(20, Math.min(300, _bpm));
  isRunning = true;

  sendMidiSystemMessage(0xfb); // Continue

  const intervalMs = (60 * 1000) / (bpm * PPQN);
  expectedTime = performance.now() + intervalMs;

  const tick = () => {
    if (!isRunning) return;
    sendMidiSystemMessage(0xf8);
    clockCount++;

    const now = performance.now();
    const drift = now - expectedTime;
    expectedTime += intervalMs;
    const nextDelay = Math.max(0, intervalMs - drift);
    clockTimer = setTimeout(tick, nextDelay);
  };

  clockTimer = setTimeout(tick, intervalMs);
}

export function isMidiClockRunning(): boolean {
  return isRunning;
}

function sendMidiSystemMessage(statusByte: number): void {
  sendMidiRawMessage([statusByte]);
}

export function sendTransportControl(control: 'start' | 'stop' | 'continue'): void {
  const messages: Record<string, number> = {
    start: 0xfa,
    stop: 0xfc,
    continue: 0xfb,
  };
  sendMidiSystemMessage(messages[control] || 0);
}

// ═══════════════════════════════════════════════════════════════════════
// CLOCK INPUT — Receive MIDI clock from external devices
// ═══════════════════════════════════════════════════════════════════════

let receiverUnsubscribe: (() => void) | null = null;
let tickTimestamps: number[] = [];
let receivedBpm = 0;
let clockInCallbacks: ((bpm: number) => void)[] = [];
let transportCallbacks: ((action: 'start' | 'stop' | 'continue') => void)[] = [];

export function startMidiClockReceiver(): void {
  stopMidiClockReceiver();
  tickTimestamps = [];
  receivedBpm = 0;

  receiverUnsubscribe = onMidiSystemMessage((statusByte: number) => {
    switch (statusByte) {
      case 0xf8: { // Clock tick
        const now = performance.now();
        tickTimestamps.push(now);

        // Keep last 48 ticks (2 beats) for averaging
        if (tickTimestamps.length > 48) {
          tickTimestamps = tickTimestamps.slice(-48);
        }

        // Need at least 24 ticks (1 beat) to calculate BPM
        if (tickTimestamps.length >= PPQN) {
          const oldest = tickTimestamps[0];
          const newest = tickTimestamps[tickTimestamps.length - 1];
          const beats = (tickTimestamps.length - 1) / PPQN;
          const elapsedMs = newest - oldest;
          if (elapsedMs > 0) {
            receivedBpm = Math.round((beats * 60 * 1000) / elapsedMs);
            clockInCallbacks.forEach(cb => cb(receivedBpm));
          }
        }
        break;
      }
      case 0xfa: // Start
        tickTimestamps = [];
        transportCallbacks.forEach(cb => cb('start'));
        break;
      case 0xfb: // Continue
        transportCallbacks.forEach(cb => cb('continue'));
        break;
      case 0xfc: // Stop
        transportCallbacks.forEach(cb => cb('stop'));
        break;
    }
  });
}

export function stopMidiClockReceiver(): void {
  receiverUnsubscribe?.();
  receiverUnsubscribe = null;
  tickTimestamps = [];
  receivedBpm = 0;
}

export function getReceivedBpm(): number {
  return receivedBpm;
}

export function onMidiClockBpm(callback: (bpm: number) => void): () => void {
  clockInCallbacks.push(callback);
  return () => {
    clockInCallbacks = clockInCallbacks.filter(cb => cb !== callback);
  };
}

export function onMidiTransportMessage(callback: (action: 'start' | 'stop' | 'continue') => void): () => void {
  transportCallbacks.push(callback);
  return () => {
    transportCallbacks = transportCallbacks.filter(cb => cb !== callback);
  };
}
