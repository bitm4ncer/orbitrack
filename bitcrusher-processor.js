class BitcrusherProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'downsample', defaultValue: 0, minValue: 0, maxValue: 1 }];
  }
  constructor() {
    super();
    this._phase = 0;
    this._last = new Array(2).fill(0);
  }
  process(inputs, outputs, params) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input.length) return true;

    const downsample = params.downsample.length > 1
      ? params.downsample
      : new Float32Array(128).fill(params.downsample[0]);

    for (let c = 0; c < Math.min(input.length, output.length); c++) {
      const inp = input[c];
      const out = output[c];
      let phase = this._phase;
      let last = this._last[c] || 0;

      for (let i = 0; i < inp.length; i++) {
        const ratio = 1 - downsample[i];
        const effectiveRatio = ratio < 0.001 ? 1 : ratio;
        phase += effectiveRatio;
        if (phase >= 1) {
          phase -= 1;
          last = inp[i];
        }
        out[i] = last;
      }

      this._last[c] = last;
      if (c === 0) this._phase = phase;
    }
    return true;
  }
}
registerProcessor('bitcrusher-processor', BitcrusherProcessor);
