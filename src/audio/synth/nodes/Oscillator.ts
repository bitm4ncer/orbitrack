import { GainNode_ } from './Gain';

const WAVEFORMS: OscillatorType[] = ['sine', 'triangle', 'square', 'sawtooth'];
const MAX_FREQ = 44100;

export class Oscillator {
  private ac: AudioContext;
  private node: OscillatorNode;
  private gainNode: GainNode_;

  constructor(ac: AudioContext) {
    this.ac = ac;
    this.node = ac.createOscillator();
    this.gainNode = new GainNode_(ac);
    this.node.connect(this.gainNode.getNode());
  }

  connect(destination: AudioNode | AudioParam): void {
    this.gainNode.connect(destination);
  }

  start(): void {
    this.node.start();
  }

  getNode(): OscillatorNode {
    return this.node;
  }

  setType(type: OscillatorType): void {
    if (!WAVEFORMS.includes(type)) return;
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

  setGain(val: number): void {
    this.gainNode.setGain(val);
  }
}
