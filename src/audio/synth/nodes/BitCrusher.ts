import { GainNode_ } from './Gain';

// Reduced from 65536 to 4096 — sufficient for bit-crush staircase effect.
// At 16 bits (65536 steps), the curve is effectively linear anyway.
const CURVE_SIZE = 4096;

export class BitCrusher {
  private dryGain: GainNode_;
  private wetGain: GainNode_;
  private node: WaveShaperNode;
  private bits = 8;

  constructor(ac: AudioContext) {
    this.dryGain = new GainNode_(ac);
    this.wetGain = new GainNode_(ac);
    this.node = ac.createWaveShaper();
    this.node.connect(this.wetGain.getNode());
    this.setBitDepth(8);
  }

  connect(destination: AudioNode): void {
    this.dryGain.connect(destination);
    this.wetGain.connect(destination);
  }

  getDryInput(): GainNode {
    return this.dryGain.getNode();
  }

  getWetInput(): WaveShaperNode {
    return this.node;
  }

  setBitDepth(bitDepth: number): void {
    const newBits = Math.max(1, Math.min(16, Math.round(bitDepth)));
    if (newBits === this.bits && this.node.curve) return; // skip if unchanged
    this.bits = newBits;

    const steps = Math.pow(2, this.bits);
    const curve = new Float32Array(CURVE_SIZE);

    for (let i = 0; i < CURVE_SIZE; i++) {
      const x = (i * 2) / CURVE_SIZE - 1;
      curve[i] = Math.round(x * steps) / steps;
    }

    this.node.curve = curve as Float32Array<ArrayBuffer>;
  }

  setAmount(val: number): void {
    this.dryGain.setGain(1 - val);
    this.wetGain.setGain(val);
  }
}
