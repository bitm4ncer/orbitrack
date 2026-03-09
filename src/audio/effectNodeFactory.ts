import type { Effect } from '../types/effects';
import { Delay } from './synth/nodes/Delay';
import { Reverb } from './synth/nodes/Reverb';
import { Distortion } from './synth/nodes/Distortion';

export interface EffectAudioNode {
  effectId: string;
  inputNode: GainNode;
  outputNode: GainNode;
  // Internal references for param updates
  _reverb?: Reverb;
  _delay?: Delay;
  _distortion?: Distortion;
  _eq?: { low: BiquadFilterNode; mid: BiquadFilterNode; high: BiquadFilterNode };
  _compressor?: DynamicsCompressorNode;
  _compressorMakeup?: GainNode;
  _chorus?: { lfo: OscillatorNode; lfoGain: GainNode; delayL: DelayNode; delayR: DelayNode; wetGain: GainNode; dryGain: GainNode };
  _phaser?: { lfos: OscillatorNode[]; filters: BiquadFilterNode[]; wetGain: GainNode; dryGain: GainNode };
  _filter?: BiquadFilterNode;
}

export function createEffectNode(ac: AudioContext, effect: Effect): EffectAudioNode {
  const inputNode = ac.createGain();
  const outputNode = ac.createGain();
  const node: EffectAudioNode = { effectId: effect.id, inputNode, outputNode };

  switch (effect.type) {
    case 'reverb': {
      const reverb = new Reverb(ac);
      inputNode.connect(reverb.getDryInput());
      inputNode.connect(reverb.getWetInput());
      reverb.connect(outputNode);
      reverb.setAmount(effect.params.amount ?? 0.3);
      node._reverb = reverb;
      break;
    }

    case 'delay': {
      const delay = new Delay(ac);
      inputNode.connect(delay.getDryInput());
      inputNode.connect(delay.getWetInput());
      delay.connect(outputNode);
      delay.setAmount(effect.params.amount ?? 0.3);
      delay.setDelayTime(effect.params.time ?? 0.25);
      delay.setFeedback(effect.params.feedback ?? 0.4);
      delay.setTone(effect.params.tone ?? 8000);
      node._delay = delay;
      break;
    }

    case 'distortion': {
      const dist = new Distortion(ac);
      inputNode.connect(dist.getDryInput());
      inputNode.connect(dist.getWetInput());
      dist.connect(outputNode);
      dist.setAmount(effect.params.amount ?? 0.5);
      dist.setDistortion((effect.params.drive ?? 0.5) * 30); // map 0-1 → 0-30
      node._distortion = dist;
      break;
    }

    case 'eq3': {
      const low = ac.createBiquadFilter();
      const mid = ac.createBiquadFilter();
      const high = ac.createBiquadFilter();

      low.type = 'lowshelf';
      low.frequency.value = effect.params.lowFreq ?? 200;
      low.gain.value = effect.params.low ?? 0;

      mid.type = 'peaking';
      mid.frequency.value = effect.params.midFreq ?? 1000;
      mid.Q.value = 1;
      mid.gain.value = effect.params.mid ?? 0;

      high.type = 'highshelf';
      high.frequency.value = effect.params.highFreq ?? 4000;
      high.gain.value = effect.params.high ?? 0;

      inputNode.connect(low);
      low.connect(mid);
      mid.connect(high);
      high.connect(outputNode);

      node._eq = { low, mid, high };
      break;
    }

    case 'compressor': {
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = effect.params.threshold ?? -24;
      comp.ratio.value = effect.params.ratio ?? 4;
      comp.attack.value = effect.params.attack ?? 0.003;
      comp.release.value = effect.params.release ?? 0.25;
      comp.knee.value = effect.params.knee ?? 6;

      const makeup = ac.createGain();
      makeup.gain.value = Math.pow(10, (effect.params.makeupGain ?? 0) / 20);

      inputNode.connect(comp);
      comp.connect(makeup);
      makeup.connect(outputNode);

      node._compressor = comp;
      node._compressorMakeup = makeup;
      break;
    }

    case 'chorus': {
      const dryGain = ac.createGain();
      const wetGain = ac.createGain();
      const depth = effect.params.depth ?? 0.005;
      const rate = effect.params.rate ?? 1.5;
      const delayBase = effect.params.delay ?? 0.02;
      const amount = effect.params.amount ?? 0.5;

      // Stereo chorus: two slightly detuned delay lines
      const delayL = ac.createDelay();
      const delayR = ac.createDelay();
      delayL.delayTime.value = delayBase;
      delayR.delayTime.value = delayBase * 1.1;

      const lfo = ac.createOscillator();
      lfo.frequency.value = rate;
      lfo.type = 'sine';

      const lfoGain = ac.createGain();
      lfoGain.gain.value = depth;

      const splitter = ac.createChannelSplitter(2);
      const merger = ac.createChannelMerger(2);

      lfo.connect(lfoGain);
      lfoGain.connect(delayL.delayTime);
      lfoGain.connect(delayR.delayTime);

      inputNode.connect(dryGain);
      inputNode.connect(splitter);
      splitter.connect(delayL, 0);
      splitter.connect(delayR, 1);
      delayL.connect(merger, 0, 0);
      delayR.connect(merger, 0, 1);
      merger.connect(wetGain);

      dryGain.gain.value = 1 - amount;
      wetGain.gain.value = amount;
      dryGain.connect(outputNode);
      wetGain.connect(outputNode);

      lfo.start();
      node._chorus = { lfo, lfoGain, delayL, delayR, wetGain, dryGain };
      break;
    }

    case 'phaser': {
      const stages = Math.max(2, Math.min(12, Math.round(effect.params.stages ?? 4)));
      const dryGain = ac.createGain();
      const wetGain = ac.createGain();
      const amount = effect.params.amount ?? 0.5;
      const baseFreq = effect.params.baseFreq ?? 1000;
      const depth = effect.params.depth ?? 0.7;
      const rate = effect.params.rate ?? 0.5;

      const filters: BiquadFilterNode[] = [];
      let prevNode: AudioNode = inputNode;

      for (let i = 0; i < stages; i++) {
        const f = ac.createBiquadFilter();
        f.type = 'allpass';
        f.frequency.value = baseFreq * Math.pow(2, (i - stages / 2) * 0.5);
        f.Q.value = 5;
        prevNode.connect(f);
        prevNode = f;
        filters.push(f);
      }

      const lfo = ac.createOscillator();
      lfo.frequency.value = rate;
      lfo.type = 'sine';

      const lfos: OscillatorNode[] = [lfo];

      // LFO modulates all filter frequencies
      for (const f of filters) {
        const lfoG = ac.createGain();
        lfoG.gain.value = baseFreq * depth;
        lfo.connect(lfoG);
        lfoG.connect(f.frequency);
      }

      inputNode.connect(dryGain);
      prevNode.connect(wetGain);
      dryGain.gain.value = 1 - amount;
      wetGain.gain.value = amount;
      dryGain.connect(outputNode);
      wetGain.connect(outputNode);

      lfo.start();
      node._phaser = { lfos, filters, wetGain, dryGain };
      break;
    }

    case 'filter': {
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = effect.params.frequency ?? 2000;
      f.Q.value = effect.params.q ?? 1;

      const dryGain = ac.createGain();
      const wetGain = ac.createGain();
      const amount = effect.params.amount ?? 1;
      dryGain.gain.value = 1 - amount;
      wetGain.gain.value = amount;

      inputNode.connect(dryGain);
      inputNode.connect(f);
      f.connect(wetGain);
      dryGain.connect(outputNode);
      wetGain.connect(outputNode);

      node._filter = f;
      break;
    }
  }

  return node;
}

export function updateEffectNodeParams(node: EffectAudioNode, effect: Effect): void {
  switch (effect.type) {
    case 'reverb':
      node._reverb?.setAmount(effect.params.amount ?? 0.3);
      break;
    case 'delay':
      node._delay?.setAmount(effect.params.amount ?? 0.3);
      node._delay?.setDelayTime(effect.params.time ?? 0.25);
      node._delay?.setFeedback(effect.params.feedback ?? 0.4);
      node._delay?.setTone(effect.params.tone ?? 8000);
      break;
    case 'distortion':
      node._distortion?.setAmount(effect.params.amount ?? 0.5);
      node._distortion?.setDistortion((effect.params.drive ?? 0.5) * 30);
      break;
    case 'eq3':
      if (node._eq) {
        node._eq.low.gain.value = effect.params.low ?? 0;
        node._eq.mid.gain.value = effect.params.mid ?? 0;
        node._eq.high.gain.value = effect.params.high ?? 0;
        node._eq.low.frequency.value = effect.params.lowFreq ?? 200;
        node._eq.mid.frequency.value = effect.params.midFreq ?? 1000;
        node._eq.high.frequency.value = effect.params.highFreq ?? 4000;
      }
      break;
    case 'compressor':
      if (node._compressor) {
        node._compressor.threshold.value = effect.params.threshold ?? -24;
        node._compressor.ratio.value = effect.params.ratio ?? 4;
        node._compressor.attack.value = effect.params.attack ?? 0.003;
        node._compressor.release.value = effect.params.release ?? 0.25;
        node._compressor.knee.value = effect.params.knee ?? 6;
      }
      if (node._compressorMakeup) {
        node._compressorMakeup.gain.value = Math.pow(10, (effect.params.makeupGain ?? 0) / 20);
      }
      break;
    case 'chorus':
      if (node._chorus) {
        const amount = effect.params.amount ?? 0.5;
        node._chorus.dryGain.gain.value = 1 - amount;
        node._chorus.wetGain.gain.value = amount;
        node._chorus.lfo.frequency.value = effect.params.rate ?? 1.5;
        node._chorus.lfoGain.gain.value = effect.params.depth ?? 0.005;
        node._chorus.delayL.delayTime.value = effect.params.delay ?? 0.02;
        node._chorus.delayR.delayTime.value = (effect.params.delay ?? 0.02) * 1.1;
      }
      break;
    case 'phaser':
      if (node._phaser) {
        const amount = effect.params.amount ?? 0.5;
        node._phaser.dryGain.gain.value = 1 - amount;
        node._phaser.wetGain.gain.value = amount;
        node._phaser.lfos[0].frequency.value = effect.params.rate ?? 0.5;
      }
      break;
    case 'filter':
      if (node._filter) {
        node._filter.frequency.value = effect.params.frequency ?? 2000;
        node._filter.Q.value = effect.params.q ?? 1;
      }
      break;
  }
}
