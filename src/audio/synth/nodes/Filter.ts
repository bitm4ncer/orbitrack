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
    if (time) {
      this.node.frequency.setTargetAtTime(freq, this.ac.currentTime, time);
    } else {
      this.node.frequency.setValueAtTime(freq, this.ac.currentTime);
    }
  }

  setQ(q: number): void {
    if (q < 0 || q > MAX_Q) return;
    this.node.Q.setValueAtTime(q, this.ac.currentTime);
  }

  setDetune(val: number, time = 0): void {
    this.node.detune.cancelScheduledValues(this.ac.currentTime);
    if (time) {
      this.node.detune.setValueAtTime(this.node.detune.value, this.ac.currentTime);
      this.node.detune.setTargetAtTime(val, this.ac.currentTime, time);
    } else {
      this.node.detune.setValueAtTime(val, this.ac.currentTime);
    }
  }
}
