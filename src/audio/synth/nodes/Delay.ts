import { Filter } from './Filter';
import { GainNode_ } from './Gain';

export class Delay {
  private ac: AudioContext;
  private dryGain: GainNode_;
  private wetGain: GainNode_;
  private delayNode: DelayNode;
  private tone: Filter;
  private feedbackGain: GainNode_;

  constructor(ac: AudioContext) {
    this.ac = ac;
    this.dryGain = new GainNode_(ac);
    this.wetGain = new GainNode_(ac);
    this.delayNode = ac.createDelay();
    this.tone = new Filter(ac);
    this.feedbackGain = new GainNode_(ac);

    this.tone.connect(this.delayNode);
    this.delayNode.connect(this.feedbackGain.getNode());
    this.feedbackGain.connect(this.wetGain.getNode());
    this.feedbackGain.connect(this.delayNode);
  }

  connect(destination: AudioNode): void {
    this.dryGain.connect(destination);
    this.wetGain.connect(destination);
  }

  getDryInput(): GainNode {
    return this.dryGain.getNode();
  }

  getWetInput(): BiquadFilterNode {
    return this.tone.getNode();
  }

  setAmount(val: number): void {
    this.dryGain.setGain(1 - val);
    this.wetGain.setGain(val);
  }

  setFeedback(val: number): void {
    this.feedbackGain.setGain(val);
  }

  setTone(val: number): void {
    this.tone.setFreq(val);
  }

  setDelayTime(val: number): void {
    if (val < 0 || val > 1) return;
    this.delayNode.delayTime.setValueAtTime(val, this.ac.currentTime);
  }
}
