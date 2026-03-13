/**
 * Karplus-Strong string oscillator — physical modeling synthesis.
 *
 * Architecture:
 *   noise burst (one-shot AudioBuffer) → DelayNode → LPF (damping) → feedbackGain → DelayNode
 *                                                                           ↓
 *                                                                       outputGain
 *
 * The delay length determines pitch (delayTime = 1/frequency).
 * The lowpass filter in the feedback path simulates string damping.
 * Higher damping frequency = brighter, longer sustain.
 *
 * Limitation: Web Audio DelayNode minimum delay = 1 render quantum (128 samples).
 * At 44.1kHz that's ~2.9ms = max ~345Hz. For higher pitches, we use shorter
 * noise bursts and accept slight pitch inaccuracy (still sounds musical).
 */

export class KarplusStrong {
  private ac: AudioContext;
  private outputGain: GainNode;
  private delayNode: DelayNode;
  private dampingFilter: BiquadFilterNode;
  private feedbackGain: GainNode;
  private noiseSource: AudioBufferSourceNode | null = null;

  private _damping = 4000;   // Hz
  private _decay = 0.995;    // feedback amount (0.9–0.999)

  constructor(ac: AudioContext) {
    this.ac = ac;

    this.outputGain = ac.createGain();
    this.outputGain.gain.value = 1;

    // Delay line — max 50ms (20Hz lowest pitch)
    this.delayNode = ac.createDelay(0.05);
    this.delayNode.delayTime.value = 0.01; // default ~100Hz

    // Damping filter in feedback path
    this.dampingFilter = ac.createBiquadFilter();
    this.dampingFilter.type = 'lowpass';
    this.dampingFilter.frequency.value = this._damping;
    this.dampingFilter.Q.value = 0;

    // Feedback gain (controls sustain/decay)
    this.feedbackGain = ac.createGain();
    this.feedbackGain.gain.value = this._decay;

    // Wire feedback loop: delay → damping → feedback → delay
    this.delayNode.connect(this.dampingFilter);
    this.dampingFilter.connect(this.feedbackGain);
    this.feedbackGain.connect(this.delayNode); // feedback cycle

    // Delay output → output
    this.delayNode.connect(this.outputGain);
  }

  /** Excite the string with a noise burst at the given frequency */
  trigger(frequency: number, when: number): void {
    const sampleRate = this.ac.sampleRate;
    const delayTime = 1 / Math.max(20, frequency);

    // Set delay time for pitch
    this.delayNode.delayTime.setValueAtTime(
      Math.max(delayTime, 1 / sampleRate), // clamp to minimum 1 sample
      when
    );

    // Create noise burst (1 cycle of noise at the target frequency)
    const burstLength = Math.max(128, Math.round(sampleRate * delayTime));
    const buffer = this.ac.createBuffer(1, burstLength, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < burstLength; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    // Stop previous noise source
    if (this.noiseSource) {
      try { this.noiseSource.stop(); } catch { /* ignore */ }
      try { this.noiseSource.disconnect(); } catch { /* ignore */ }
    }

    // Play noise burst into the delay line
    this.noiseSource = this.ac.createBufferSource();
    this.noiseSource.buffer = buffer;
    this.noiseSource.connect(this.delayNode);
    this.noiseSource.start(when);
  }

  /** Set damping frequency (higher = brighter, longer sustain) */
  setDamping(freq: number): void {
    this._damping = Math.max(200, Math.min(12000, freq));
    this.dampingFilter.frequency.setTargetAtTime(this._damping, this.ac.currentTime, 0.02);
  }

  /** Set decay/sustain (0.9 = short, 0.999 = very long) */
  setDecay(val: number): void {
    this._decay = Math.max(0.5, Math.min(0.999, val));
    this.feedbackGain.gain.setTargetAtTime(this._decay, this.ac.currentTime, 0.02);
  }

  getOutput(): AudioNode {
    return this.outputGain;
  }

  connect(destination: AudioNode): void {
    this.outputGain.connect(destination);
  }

  disconnect(): void {
    try { this.outputGain.disconnect(); } catch { /* ignore */ }
  }

  dispose(): void {
    if (this.noiseSource) {
      try { this.noiseSource.stop(); } catch { /* ignore */ }
      try { this.noiseSource.disconnect(); } catch { /* ignore */ }
    }
    try { this.delayNode.disconnect(); } catch { /* ignore */ }
    try { this.dampingFilter.disconnect(); } catch { /* ignore */ }
    try { this.feedbackGain.disconnect(); } catch { /* ignore */ }
    try { this.outputGain.disconnect(); } catch { /* ignore */ }
  }
}
