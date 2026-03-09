import { GainNode_ } from './nodes/Gain';
import { Oscillator } from './nodes/Oscillator';
import { Filter } from './nodes/Filter';
import { Delay } from './nodes/Delay';
import { Reverb } from './nodes/Reverb';
import { Distortion } from './nodes/Distortion';
import { LFO } from './nodes/LFO';
import { BitCrusher } from './nodes/BitCrusher';
import { StereoPanner } from './nodes/StereoPanner';
import { SYNTH_PRESETS } from './presets';
import type { SynthParams } from './types';
import { midiNoteToFreq } from '../../utils/music';

export class SynthEngine {
  private ac: AudioContext;
  private volumeNode: GainNode_;
  private gainNode: GainNode_;
  private filterNode: Filter;
  private delayNode: Delay;
  private reverbNode: Reverb;
  private distortionNode: Distortion;
  private vibratoLFO: LFO;
  private bitCrusher: BitCrusher;

  private osc: Oscillator;
  private oscPanner: StereoPanner;
  private sub1: Oscillator;
  private sub1Panner: StereoPanner;
  private sub2: Oscillator;
  private sub2Panner: StereoPanner;

  private params: SynthParams;
  private noteHeld = 0;
  private timeoutIds: ReturnType<typeof setTimeout>[] = [];
  private initialized = false;

  constructor(ac: AudioContext) {
    this.ac = ac;
    this.params = { ...SYNTH_PRESETS['INIT'] };

    // Create nodes
    this.volumeNode = new GainNode_(ac);
    this.gainNode = new GainNode_(ac);
    this.filterNode = new Filter(ac);
    this.delayNode = new Delay(ac);
    this.reverbNode = new Reverb(ac);
    this.distortionNode = new Distortion(ac);
    this.vibratoLFO = new LFO(ac);
    this.bitCrusher = new BitCrusher(ac);

    this.osc = new Oscillator(ac);
    this.oscPanner = new StereoPanner(ac);
    this.sub1 = new Oscillator(ac);
    this.sub1Panner = new StereoPanner(ac);
    this.sub2 = new Oscillator(ac);
    this.sub2Panner = new StereoPanner(ac);
  }

  init(): void {
    if (this.initialized) return;

    // Signal chain: Osc → Panner → Distortion → Filter → Gain → Delay → BitCrusher → Reverb → Volume → Destination
    this.volumeNode.connect(this.ac.destination);

    this.reverbNode.connect(this.volumeNode.getNode());

    this.bitCrusher.connect(this.reverbNode.getDryInput());
    this.bitCrusher.connect(this.reverbNode.getWetInput());

    this.delayNode.connect(this.bitCrusher.getDryInput());
    this.delayNode.connect(this.bitCrusher.getWetInput());

    this.gainNode.connect(this.delayNode.getDryInput());
    this.gainNode.connect(this.delayNode.getWetInput());
    this.gainNode.setGain(0);

    this.filterNode.connect(this.gainNode.getNode());

    this.distortionNode.connect(this.filterNode.getNode());

    // Oscillators → Panners → Distortion
    this.osc.connect(this.oscPanner.getNode());
    this.oscPanner.connect(this.distortionNode.getDryInput());
    this.oscPanner.connect(this.distortionNode.getWetInput());
    this.osc.start();

    this.sub1.connect(this.sub1Panner.getNode());
    this.sub1Panner.connect(this.distortionNode.getDryInput());
    this.sub1Panner.connect(this.distortionNode.getWetInput());
    this.sub1.start();

    this.sub2.connect(this.sub2Panner.getNode());
    this.sub2Panner.connect(this.distortionNode.getDryInput());
    this.sub2Panner.connect(this.distortionNode.getWetInput());
    this.sub2.start();

    // Vibrato LFO → all oscillator detune
    this.vibratoLFO.connect(this.osc.getNode().detune);
    this.vibratoLFO.connect(this.sub1.getNode().detune);
    this.vibratoLFO.connect(this.sub2.getNode().detune);
    this.vibratoLFO.start();

    this.syncNodesToParams();
    this.initialized = true;
  }

  private syncNodesToParams(): void {
    const p = this.params;
    this.volumeNode.setGain(p.masterVolume);
    this.osc.setType(p.vcoType);
    this.osc.setGain(p.vcoGain);
    this.oscPanner.setPan(p.vcoPan);
    this.sub1.setType(p.sub1Type);
    this.sub1.setGain(p.sub1Gain);
    this.sub1Panner.setPan(p.sub1Pan);
    this.sub2.setType(p.sub2Type);
    this.sub2.setGain(p.sub2Gain);
    this.sub2Panner.setPan(p.sub2Pan);
    this.delayNode.setDelayTime(p.delayTime);
    this.delayNode.setFeedback(p.delayFeedback);
    this.delayNode.setTone(p.delayTone);
    this.delayNode.setAmount(p.delayAmount);
    this.filterNode.setType(p.filterType);
    this.filterNode.setFreq(p.filterFreq);
    this.filterNode.setQ(p.filterQ);
    this.reverbNode.setType(p.reverbType);
    this.reverbNode.setAmount(p.reverbAmount);
    this.distortionNode.setDistortion(p.distortionDist);
    this.distortionNode.setAmount(p.distortionAmount);
    this.vibratoLFO.setDepth(p.vibratoDepth);
    this.vibratoLFO.setRate(p.vibratoRate);
    this.bitCrusher.setBitDepth(p.bitCrushDepth);
    this.bitCrusher.setAmount(p.bitCrushAmount);
  }

  noteOn(midiNote: number): void {
    this.clearTimeouts();
    this.noteHeld = midiNote;
    const p = this.params;

    // Set frequencies with portamento
    const freq = midiNoteToFreq(midiNote);
    const subFreq1 = midiNoteToFreq(midiNote + p.sub1Offset);
    const subFreq2 = midiNoteToFreq(midiNote + p.sub2Offset);
    this.osc.setFreq(freq, p.portamentoSpeed);
    this.sub1.setFreq(subFreq1, p.portamentoSpeed);
    this.sub2.setFreq(subFreq2, p.portamentoSpeed);

    // Gain Envelope ADS
    if (p.gainAttack) {
      this.gainNode.setGain(0);
      this.gainNode.setGain(p.masterVolume, p.gainAttack);
      const noteRef = midiNote;
      const timeoutId = setTimeout(() => {
        if (noteRef === this.noteHeld) {
          const sustVolume = this.params.masterVolume * this.params.gainSustain;
          this.gainNode.setGain(sustVolume, this.params.gainDecay);
        }
      }, p.gainAttack * 1000);
      this.timeoutIds.push(timeoutId);
    } else {
      this.gainNode.setGain(p.masterVolume);
      const sustVolume = p.masterVolume * p.gainSustain;
      this.gainNode.setGain(sustVolume, p.gainDecay);
    }

    // Filter Envelope AD
    if (p.filterEnvAmount) {
      if (p.filterAttack) {
        this.filterNode.setDetune(0);
        this.filterNode.setDetune(p.filterEnvAmount, p.filterAttack);
        const noteRef = midiNote;
        const timeoutId = setTimeout(() => {
          if (noteRef === this.noteHeld) {
            this.filterNode.setDetune(0, this.params.filterDecay);
          }
        }, p.filterAttack * 1000);
        this.timeoutIds.push(timeoutId);
      } else {
        this.filterNode.setDetune(p.filterEnvAmount);
        this.filterNode.setDetune(0, p.filterDecay);
      }
    }
  }

  noteOff(): void {
    this.clearTimeouts();
    this.noteHeld = 0;
    this.gainNode.setGain(0, this.params.gainRelease);
    this.filterNode.setDetune(0, this.params.filterDecay);
  }

  noteStop(): void {
    this.clearTimeouts();
    this.noteHeld = 0;
    this.gainNode.setGain(0);
    this.filterNode.setDetune(0);
  }

  setParam<K extends keyof SynthParams>(key: K, value: SynthParams[K]): void {
    this.params[key] = value;

    // Apply to the correct node
    switch (key) {
      case 'masterVolume': this.volumeNode.setGain(value as number); break;
      case 'vcoType': this.osc.setType(value as OscillatorType); break;
      case 'vcoGain': this.osc.setGain(value as number); break;
      case 'vcoPan': this.oscPanner.setPan(value as number); break;
      case 'sub1Type': this.sub1.setType(value as OscillatorType); break;
      case 'sub1Gain': this.sub1.setGain(value as number); break;
      case 'sub1Pan': this.sub1Panner.setPan(value as number); break;
      case 'sub2Type': this.sub2.setType(value as OscillatorType); break;
      case 'sub2Gain': this.sub2.setGain(value as number); break;
      case 'sub2Pan': this.sub2Panner.setPan(value as number); break;
      case 'delayTime': this.delayNode.setDelayTime(value as number); break;
      case 'delayFeedback': this.delayNode.setFeedback(value as number); break;
      case 'delayTone': this.delayNode.setTone(value as number); break;
      case 'delayAmount': this.delayNode.setAmount(value as number); break;
      case 'filterType': this.filterNode.setType(value as BiquadFilterType); break;
      case 'filterFreq': this.filterNode.setFreq(value as number); break;
      case 'filterQ': this.filterNode.setQ(value as number); break;
      case 'reverbType': this.reverbNode.setType(value as string); break;
      case 'reverbAmount': this.reverbNode.setAmount(value as number); break;
      case 'distortionDist': this.distortionNode.setDistortion(value as number); break;
      case 'distortionAmount': this.distortionNode.setAmount(value as number); break;
      case 'vibratoDepth': this.vibratoLFO.setDepth(value as number); break;
      case 'vibratoRate': this.vibratoLFO.setRate(value as number); break;
      case 'bitCrushDepth': this.bitCrusher.setBitDepth(value as number); break;
      case 'bitCrushAmount': this.bitCrusher.setAmount(value as number); break;
      // gainAttack, gainDecay, gainSustain, gainRelease, filterAttack, filterDecay,
      // filterEnvAmount, portamentoSpeed, sub1Offset, sub2Offset are stored and used on noteOn
    }
  }

  getParams(): SynthParams {
    return { ...this.params };
  }

  loadPreset(preset: SynthParams): void {
    this.params = { ...preset };
    if (this.initialized) {
      this.syncNodesToParams();
    }
  }

  private clearTimeouts(): void {
    this.timeoutIds.forEach((id) => clearTimeout(id));
    this.timeoutIds = [];
  }
}
