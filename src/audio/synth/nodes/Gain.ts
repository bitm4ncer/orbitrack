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
    const now = this.ac.currentTime;
    // Always use smooth ramp (20ms default) to prevent clicks on parameter changes.
    // The old approach (cancelScheduledValues + setValueAtTime) caused instant jumps.
    this.node.gain.setTargetAtTime(val, now, time || 0.02);
  }
}
