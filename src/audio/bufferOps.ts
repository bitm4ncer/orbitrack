/**
 * Pure AudioBuffer manipulation utilities.
 * All functions create new AudioBuffers — originals are never mutated.
 */

function getOfflineCtx(channels: number, length: number, sampleRate: number): OfflineAudioContext {
  return new OfflineAudioContext(channels, Math.max(1, length), sampleRate);
}

/** Extract a range of samples from a buffer. */
export function sliceBuffer(buf: AudioBuffer, startSample: number, endSample: number): AudioBuffer {
  const start = Math.max(0, Math.min(startSample, buf.length));
  const end = Math.max(start, Math.min(endSample, buf.length));
  const length = end - start;
  if (length === 0) {
    return getOfflineCtx(buf.numberOfChannels, 1, buf.sampleRate).createBuffer(buf.numberOfChannels, 1, buf.sampleRate);
  }
  const out = new AudioBuffer({ numberOfChannels: buf.numberOfChannels, length, sampleRate: buf.sampleRate });
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const src = buf.getChannelData(ch);
    const dst = out.getChannelData(ch);
    dst.set(src.subarray(start, end));
  }
  return out;
}

/** Remove a range and concatenate the remaining parts. */
export function deleteRange(buf: AudioBuffer, startSample: number, endSample: number): AudioBuffer {
  const start = Math.max(0, Math.min(startSample, buf.length));
  const end = Math.max(start, Math.min(endSample, buf.length));
  const newLength = buf.length - (end - start);
  if (newLength <= 0) {
    return new AudioBuffer({ numberOfChannels: buf.numberOfChannels, length: 1, sampleRate: buf.sampleRate });
  }
  const out = new AudioBuffer({ numberOfChannels: buf.numberOfChannels, length: newLength, sampleRate: buf.sampleRate });
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const src = buf.getChannelData(ch);
    const dst = out.getChannelData(ch);
    dst.set(src.subarray(0, start), 0);
    dst.set(src.subarray(end), start);
  }
  return out;
}

/** Insert source buffer into target at the given sample position. */
export function insertBuffer(target: AudioBuffer, source: AudioBuffer, atSample: number): AudioBuffer {
  const at = Math.max(0, Math.min(atSample, target.length));
  const channels = Math.max(target.numberOfChannels, source.numberOfChannels);
  const newLength = target.length + source.length;
  const out = new AudioBuffer({ numberOfChannels: channels, length: newLength, sampleRate: target.sampleRate });
  for (let ch = 0; ch < channels; ch++) {
    const dst = out.getChannelData(ch);
    const tSrc = ch < target.numberOfChannels ? target.getChannelData(ch) : new Float32Array(target.length);
    const sSrc = ch < source.numberOfChannels ? source.getChannelData(ch) : new Float32Array(source.length);
    dst.set(tSrc.subarray(0, at), 0);
    dst.set(sSrc, at);
    dst.set(tSrc.subarray(at), at + source.length);
  }
  return out;
}

/** Extract peak amplitude data for waveform rendering. */
export function extractPeaks(buf: AudioBuffer, buckets: number): Float32Array {
  const result = new Float32Array(buckets);
  const samplesPerBucket = Math.ceil(buf.length / buckets);
  for (let b = 0; b < buckets; b++) {
    let peak = 0;
    const start = b * samplesPerBucket;
    const end = Math.min(start + samplesPerBucket, buf.length);
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = start; i < end; i++) {
        const abs = Math.abs(data[i]);
        if (abs > peak) peak = abs;
      }
    }
    result[b] = peak;
  }
  return result;
}

/** Encode an AudioBuffer to a WAV Blob. */
export function bufferToWavBlob(buf: AudioBuffer): Blob {
  const numChannels = buf.numberOfChannels;
  const sampleRate = buf.sampleRate;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataLength = buf.length * blockAlign;
  const headerLength = 44;
  const arrayBuffer = new ArrayBuffer(headerLength + dataLength);
  const view = new DataView(arrayBuffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  // Interleave channels and write 16-bit PCM
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buf.getChannelData(ch));
  }
  let offset = 44;
  for (let i = 0; i < buf.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

/** Create a blob URL from an AudioBuffer (WAV encoded). */
export function bufferToBlobUrl(buf: AudioBuffer): string {
  return URL.createObjectURL(bufferToWavBlob(buf));
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
