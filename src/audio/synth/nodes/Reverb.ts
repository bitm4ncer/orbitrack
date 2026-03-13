import { GainNode_ } from './Gain';

// Simple algorithmic reverb using delay lines instead of convolver
// This avoids needing large base64 impulse response files
function createReverbBuffer(ac: AudioContext, duration: number, decay: number): AudioBuffer {
  const sampleRate = ac.sampleRate;
  const length = sampleRate * duration;
  const buffer = ac.createBuffer(2, length, sampleRate);

  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }

  return buffer;
}

const REVERB_CONFIGS: Record<string, { duration: number; decay: number }> = {
  reverb1: { duration: 1.0, decay: 2.0 },
  reverb2: { duration: 1.5, decay: 2.5 },
  reverb3: { duration: 0.5, decay: 1.5 },
  reverb4: { duration: 2.0, decay: 3.0 },
  reverb5: { duration: 3.0, decay: 4.0 },
  reverb6: { duration: 4.0, decay: 5.0 },
};

export class Reverb {
  private ac: AudioContext;
  private node: ConvolverNode;
  private dryGain: GainNode_;
  private wetGain: GainNode_;
  private _currentType = '';

  constructor(ac: AudioContext) {
    this.ac = ac;
    this.node = ac.createConvolver();
    this.dryGain = new GainNode_(ac);
    this.wetGain = new GainNode_(ac);
    this.node.connect(this.wetGain.getNode());
    this.setType('reverb1');
  }

  connect(destination: AudioNode): void {
    this.dryGain.connect(destination);
    this.wetGain.connect(destination);
  }

  getDryInput(): GainNode {
    return this.dryGain.getNode();
  }

  getWetInput(): ConvolverNode {
    return this.node;
  }

  setAmount(val: number): void {
    this.dryGain.setGain(1 - val);
    this.wetGain.setGain(val);
  }

  setType(val: string): void {
    if (val === this._currentType) return; // skip if unchanged
    const config = REVERB_CONFIGS[val];
    if (!config) return;
    this._currentType = val;
    this.node.buffer = createReverbBuffer(this.ac, config.duration, config.decay);
  }
}
