export class StereoPanner {
  private ac: AudioContext;
  private node: StereoPannerNode;

  constructor(ac: AudioContext) {
    this.ac = ac;
    this.node = ac.createStereoPanner();
  }

  connect(destination: AudioNode): void {
    this.node.connect(destination);
  }

  getNode(): StereoPannerNode {
    return this.node;
  }

  setPan(val: number): void {
    this.node.pan.setValueAtTime(val, this.ac.currentTime);
  }
}
