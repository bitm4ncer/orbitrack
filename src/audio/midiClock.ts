/** MIDI clock synchronization for external instruments */

const PPQN = 24;
let clockTimer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;
let clockCount = 0;
let bpm = 120;

export function startMidiClock(_bpm: number): void {
  stopMidiClock();
  bpm = Math.max(20, Math.min(300, _bpm));
  isRunning = true;
  clockCount = 0;

  sendMidiSystemMessage(0xfa);

  const intervalMs = (60 * 1000) / (bpm * PPQN);

  clockTimer = setInterval(() => {
    sendMidiSystemMessage(0xf8);
    clockCount++;
  }, intervalMs);
}

export function stopMidiClock(): void {
  if (clockTimer) {
    clearInterval(clockTimer);
    clockTimer = null;
  }
  isRunning = false;
  clockCount = 0;

  sendMidiSystemMessage(0xfc);
}

export function resumeMidiClock(_bpm: number): void {
  stopMidiClock();
  bpm = Math.max(20, Math.min(300, _bpm));
  isRunning = true;

  sendMidiSystemMessage(0xfb);

  const intervalMs = (60 * 1000) / (bpm * PPQN);

  clockTimer = setInterval(() => {
    sendMidiSystemMessage(0xf8);
    clockCount++;
  }, intervalMs);
}

export function isMidiClockRunning(): boolean {
  return isRunning;
}

function sendMidiSystemMessage(statusByte: number): void {
  const messageNames: Record<number, string> = {
    0xf8: 'Clock',
    0xfa: 'Start',
    0xfb: 'Continue',
    0xfc: 'Stop',
  };

  console.debug('[MIDI Clock]', messageNames[statusByte] || `0x${statusByte.toString(16)}`);
}

export function sendTransportControl(control: 'start' | 'stop' | 'continue'): void {
  const messages: Record<string, number> = {
    start: 0xfa,
    stop: 0xfc,
    continue: 0xfb,
  };
  sendMidiSystemMessage(messages[control] || 0);
}
