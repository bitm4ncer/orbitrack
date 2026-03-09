export class GainNode_ {
  private ac: AudioContext;
  private node: GainNode;

  constructor(ac: AudioContext) {
    this.ac = ac;
    this.node = ac.createGain();
  }

  connect(destination: AudioNode | AudioParam): void {
    if (destination instanceof AudioParam) {
      this.node.connect(destination);
    } else {
      this.node.connect(destination);
    }
  }

  getNode(): GainNode {
    return this.node;
  }

  getGain(): number {
    return this.node.gain.value;
  }

  setGain(val: number, time = 0): void {
    this.node.gain.cancelScheduledValues(this.ac.currentTime);
    if (time) {
      this.node.gain.setValueAtTime(this.node.gain.value, this.ac.currentTime);
      this.node.gain.setTargetAtTime(val, this.ac.currentTime, time);
    } else {
      this.node.gain.setValueAtTime(val, this.ac.currentTime);
    }
  }
}
