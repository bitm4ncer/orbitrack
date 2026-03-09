import { GainNode_ } from './Gain';

// BitCrusher implemented as a simple pass-through with bit reduction
// Uses a WaveShaperNode to approximate bit crushing without ScriptProcessorNode
export class BitCrusher {
  private ac: AudioContext;
  private dryGain: GainNode_;
  private wetGain: GainNode_;
  private node: WaveShaperNode;
  private bits = 8;

  constructor(ac: AudioContext) {
    this.ac = ac;
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
    this.bits = Math.max(1, Math.min(16, Math.round(bitDepth)));
    const steps = Math.pow(2, this.bits);
    const nSamples = 65536;
    const curve = new Float32Array(nSamples);

    for (let i = 0; i < nSamples; i++) {
      const x = (i * 2) / nSamples - 1; // -1 to 1
      curve[i] = Math.round(x * steps) / steps;
    }

    this.node.curve = curve;
  }

  setAmount(val: number): void {
    this.dryGain.setGain(1 - val);
    this.wetGain.setGain(val);
  }
}
