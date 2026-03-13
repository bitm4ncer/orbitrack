import { GainNode_ } from './Gain';

// Reduced from 44100 to 2048 — more than enough for WaveShaper resolution.
// The Web Audio API interpolates between curve samples anyway.
const CURVE_SIZE = 2048;

/**
 * Distortion curve types (Surge XT-inspired):
 *   0 = Soft clip (atan/sinh — warm, original)
 *   1 = Hard clip (aggressive digital)
 *   2 = Tanh (tube-like warmth)
 *   3 = Wavefolder (sine fold — West Coast synthesis)
 *   4 = Asymmetric (even harmonics — tube amp character)
 *   5 = Rectify (full-wave — octave up effect)
 *   6 = Fuzz (exponential saturation)
 */
function createDistCurve(type: number, amount = 0): Float32Array {
  const k = Math.max(0.1, amount);
  const curve = new Float32Array(CURVE_SIZE);

  for (let i = 0; i < CURVE_SIZE; ++i) {
    const x = (i * 2) / CURVE_SIZE - 1;

    switch (type) {
      case 0: // Soft clip (original)
        curve[i] = ((3 + k) * Math.atan(Math.sinh(x * 0.25) * 5)) / (Math.PI + k * Math.abs(x));
        break;

      case 1: // Hard clip
        curve[i] = Math.max(-1, Math.min(1, x * (1 + k * 0.5)));
        break;

      case 2: // Tanh (tube-like)
        curve[i] = Math.tanh(x * (1 + k * 0.3));
        break;

      case 3: { // Wavefolder (sine fold)
        const foldAmt = 1 + k * 0.15;
        curve[i] = Math.sin(x * foldAmt * Math.PI);
        break;
      }

      case 4: { // Asymmetric (tube amp — even harmonics)
        const drive = 1 + k * 0.2;
        if (x >= 0) {
          curve[i] = Math.tanh(x * drive);
        } else {
          curve[i] = Math.tanh(x * drive * 0.5) * 0.8;
        }
        break;
      }

      case 5: // Rectify (full-wave — octave up)
        curve[i] = Math.abs(x) * 2 - 1;
        break;

      case 6: { // Fuzz (exponential saturation)
        const fuzzK = 1 + k * 0.3;
        curve[i] = Math.sign(x) * (1 - Math.exp(-Math.abs(x * fuzzK)));
        break;
      }

      default: // Fallback to soft clip
        curve[i] = ((3 + k) * Math.atan(Math.sinh(x * 0.25) * 5)) / (Math.PI + k * Math.abs(x));
    }
  }
  return curve;
}

export const DISTORTION_TYPE_LABELS = ['Soft', 'Hard', 'Tanh', 'Fold', 'Asym', 'Rect', 'Fuzz'];

export class Distortion {
  private dryGain: GainNode_;
  private wetGain: GainNode_;
  private node: WaveShaperNode;
  private _prevAmount = -1;
  private _prevType = -1;

  constructor(ac: AudioContext) {
    this.dryGain = new GainNode_(ac);
    this.wetGain = new GainNode_(ac);
    this.node = ac.createWaveShaper();
    this.node.curve = createDistCurve(0) as Float32Array<ArrayBuffer>;
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

  setDistortion(val: number, type = 0): void {
    if (val < 0 || val > 50) return;
    const rounded = Math.round(val * 10) / 10;
    const clampedType = Math.max(0, Math.min(6, Math.round(type)));
    if (rounded === this._prevAmount && clampedType === this._prevType) return;
    this._prevAmount = rounded;
    this._prevType = clampedType;
    this.node.curve = createDistCurve(clampedType, val) as Float32Array<ArrayBuffer>;
  }

  setAmount(val: number): void {
    this.dryGain.setGain(1 - val);
    this.wetGain.setGain(val);
  }
}
