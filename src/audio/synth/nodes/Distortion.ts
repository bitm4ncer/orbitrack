import { GainNode_ } from './Gain';

// Reduced from 44100 to 2048 — more than enough for WaveShaper resolution.
// The Web Audio API interpolates between curve samples anyway.
const CURVE_SIZE = 2048;

function createDistCurve(amount = 0): Float32Array {
  const k = amount;
  const curve = new Float32Array(CURVE_SIZE);

  for (let i = 0; i < CURVE_SIZE; ++i) {
    const x = (i * 2) / CURVE_SIZE - 1;
    curve[i] = ((3 + k) * Math.atan(Math.sinh(x * 0.25) * 5)) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

export class Distortion {
  private dryGain: GainNode_;
  private wetGain: GainNode_;
  private node: WaveShaperNode;
  private _prevAmount = -1;

  constructor(ac: AudioContext) {
    this.dryGain = new GainNode_(ac);
    this.wetGain = new GainNode_(ac);
    this.node = ac.createWaveShaper();
    this.node.curve = createDistCurve() as Float32Array<ArrayBuffer>;
    this.node.oversample = 'none';
    this.node.connect(this.wetGain.getNode());
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

  setDistortion(val: number): void {
    if (val < 0 || val > 30) return;
    // Only regenerate curve when the value actually changes (rounded to avoid micro-changes)
    const rounded = Math.round(val * 10) / 10;
    if (rounded === this._prevAmount) return;
    this._prevAmount = rounded;
    this.node.curve = createDistCurve(val) as Float32Array<ArrayBuffer>;
  }

  setAmount(val: number): void {
    this.dryGain.setGain(1 - val);
    this.wetGain.setGain(val);
  }
}
