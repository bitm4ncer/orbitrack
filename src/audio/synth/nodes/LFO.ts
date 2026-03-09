import { Oscillator } from './Oscillator';
import { GainNode_ } from './Gain';

export class LFO {
  private osc: Oscillator;
  private depth: GainNode_;

  constructor(ac: AudioContext) {
    this.depth = new GainNode_(ac);
    this.osc = new Oscillator(ac);
    this.osc.setType('sine');
    this.osc.connect(this.depth.getNode());
  }

  connect(destination: AudioNode | AudioParam): void {
    this.depth.connect(destination);
  }

  start(): void {
    this.osc.start();
  }

  setRate(val: number): void {
    if (val < 0 || val > 100) return;
    this.osc.setFreq(val);
  }

  setDepth(val: number): void {
    if (val < 0 || val > 1000) return;
    this.depth.setGain(val);
  }
}
