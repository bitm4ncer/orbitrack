const FILTER_TYPES: BiquadFilterType[] = ['lowpass', 'highpass', 'bandpass', 'notch', 'lowshelf', 'highshelf'];
const MAX_FREQ = 20000;
const MAX_Q = 10;

export class Filter {
  private ac: AudioContext;
  private node: BiquadFilterNode;

  constructor(ac: AudioContext) {
    this.ac = ac;
    this.node = ac.createBiquadFilter();
    this.node.type = 'lowpass';
  }

  connect(destination: AudioNode): void {
    this.node.connect(destination);
  }

  getNode(): BiquadFilterNode {
    return this.node;
  }

  setType(type: BiquadFilterType): void {
    if (!FILTER_TYPES.includes(type)) return;
    this.node.type = type;
  }

  setFreq(freq: number, time = 0): void {
    if (freq < 0 || freq > MAX_FREQ) return;
    // Always smooth — instant setValueAtTime causes zipper noise
    this.node.frequency.setTargetAtTime(freq, this.ac.currentTime, time || 0.02);
  }

  setQ(q: number): void {
    if (q < 0 || q > MAX_Q) return;
    // Smooth Q changes to prevent resonance spikes
    this.node.Q.setTargetAtTime(q, this.ac.currentTime, 0.02);
  }

  setDetune(val: number, time = 0): void {
    // Smooth detune changes
    this.node.detune.setTargetAtTime(val, this.ac.currentTime, time || 0.02);
  }
}
