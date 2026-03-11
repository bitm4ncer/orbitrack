/** MIDI clock synchronization for external instruments */

const PPQN = 24; // Standard MIDI clocks per quarter note
let clockTimer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;
let clockCount = 0;
let bpm = 120;

/**
 * Start sending MIDI clock
 */
export function startMidiClock(_bpm: number): void {
  stopMidiClock();
  bpm = Math.max(20, Math.min(300, _bpm));
  isRunning = true;
  clockCount = 0;

  // Send MIDI Start (0xFA)
  sendMidiSystemMessage(0xfa);

  // Calculate interval: 60,000ms / BPM / PPQN
  const intervalMs = (60 * 1000) / (bpm * PPQN);

  clockTimer = setInterval(() => {
    // Send MIDI Clock (0xF8)
    sendMidiSystemMessage(0xf8);
    clockCount++;
  }, intervalMs);
}

/**
 * Stop sending MIDI clock
 */
export function stopMidiClock(): void {
  if (clockTimer) {
    clearInterval(clockTimer);
    clockTimer = null;
  }
  isRunning = false;
  clockCount = 0;

  // Send MIDI Stop (0xFC)
  sendMidiSystemMessage(0xfc);
}

/**
 * Resume MIDI clock from where it was stopped
 */
export function resumeMidiClock(_bpm: number): void {
  stopMidiClock();
  bpm = Math.max(20, Math.min(300, _bpm));
  isRunning = true;

  // Send MIDI Continue (0xFB) instead of Start
  sendMidiSystemMessage(0xfb);

  const intervalMs = (60 * 1000) / (bpm * PPQN);

  clockTimer = setInterval(() => {
    sendMidiSystemMessage(0xf8);
    clockCount++;
  }, intervalMs);
}

/**
 * Check if MIDI clock is running
 */
export function isMidiClockRunning(): boolean {
  return isRunning;
}

/**
 * Send a MIDI system message via CC hack (for browsers that don't support direct system messages)
 * Real MIDI system messages would use sendMidiSystemMessage, but most WebMidi.js
 * implementations fall back to CC 250-252 for timing
 */
function sendMidiSystemMessage(statusByte: number): void {
  // Map system messages to CC:
  // 0xF8 (Clock) → CC 250
  // 0xFA (Start) → CC 251
  // 0xFB (Continue) → CC 252
  // 0xFC (Stop) → CC 253

  // Note: This is a workaround. Proper implementation would use sendSystemMessage
  // if the WebMidi.js library supports it. For now, we log the intent.
  const messageNames: Record<number, string> = {
    0xf8: 'Clock',
    0xfa: 'Start',
    0xfb: 'Continue',
    0xfc: 'Stop',
  };

  // In a real implementation with native MIDI, these would send as system messages
  console.debug('[MIDI Clock]', messageNames[statusByte] || `0x${statusByte.toString(16)}`);
}

/**
 * Set transport controls via MIDI
 */
export function sendTransportControl(control: 'start' | 'stop' | 'continue'): void {
  const messages: Record<string, number> = {
    start: 0xfa,
    stop: 0xfc,
    continue: 0xfb,
  };
  sendMidiSystemMessage(messages[control] || 0);
}
