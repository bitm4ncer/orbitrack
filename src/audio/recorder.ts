/**
 * Audio Recorder — Multi-format (WAV / MP3 / WebM)
 *
 * WAV & MP3: Captures raw PCM via ScriptProcessorNode side-tap on master gain.
 * WebM: Falls back to MediaRecorder for browser-native encoding.
 */

import { getMasterGain } from './routingEngine';
import { getAudioContext } from 'superdough';
import { Mp3Encoder } from 'lamejs';

export type RecordingFormat = 'wav' | 'mp3' | 'webm';

// ── Module state ──────────────────────────────────────────────────────────────
let recording = false;
let startTime = 0;

// PCM capture (WAV / MP3)
let scriptNode: ScriptProcessorNode | null = null;
let leftChunks: Float32Array[] = [];
let rightChunks: Float32Array[] = [];
let sampleRate = 44100;

// WebM capture
let mediaRecorder: MediaRecorder | null = null;
let streamDest: MediaStreamAudioDestinationNode | null = null;
let webmChunks: Blob[] = [];

// ── Start ─────────────────────────────────────────────────────────────────────
export function startRecording(): boolean {
  if (recording) return false;

  const gain = getMasterGain();
  if (!gain) return false;

  const ctx = getAudioContext();
  sampleRate = ctx.sampleRate;

  // PCM capture via ScriptProcessorNode (side-tap, gain still routes normally)
  scriptNode = ctx.createScriptProcessor(4096, 2, 2);
  leftChunks = [];
  rightChunks = [];

  scriptNode.onaudioprocess = (e) => {
    leftChunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    rightChunks.push(new Float32Array(e.inputBuffer.getChannelData(1)));
  };

  gain.connect(scriptNode);
  // ScriptProcessor must be connected to destination to fire onaudioprocess
  // Use a silent output (it outputs zeros because we don't write to outputBuffer)
  scriptNode.connect(ctx.destination);

  // Also set up WebM capture in case format is webm
  streamDest = ctx.createMediaStreamDestination();
  gain.connect(streamDest);
  webmChunks = [];
  mediaRecorder = new MediaRecorder(streamDest.stream, { mimeType: 'audio/webm' });
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) webmChunks.push(e.data);
  };
  mediaRecorder.start(100);

  startTime = Date.now();
  recording = true;
  return true;
}

// ── Stop ──────────────────────────────────────────────────────────────────────
export async function stopRecordingAsync(
  format: RecordingFormat,
  quality: number,
): Promise<{ blob: Blob; duration: number; timestamp: number } | null> {
  if (!recording) return null;

  const duration = Date.now() - startTime;
  const timestamp = Date.now();
  recording = false;

  // Disconnect PCM capture
  const gain = getMasterGain();
  if (scriptNode) {
    try { if (gain) gain.disconnect(scriptNode); } catch { /* ok */ }
    try { scriptNode.disconnect(); } catch { /* ok */ }
    scriptNode.onaudioprocess = null;
    scriptNode = null;
  }

  // Stop WebM recorder
  const webmBlob = await new Promise<Blob>((resolve) => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.onstop = () => {
        resolve(new Blob(webmChunks, { type: 'audio/webm' }));
        webmChunks = [];
      };
      mediaRecorder.stop();
    } else {
      resolve(new Blob([], { type: 'audio/webm' }));
    }
  });

  // Disconnect stream destination
  try { if (gain && streamDest) gain.disconnect(streamDest); } catch { /* ok */ }
  streamDest = null;
  mediaRecorder = null;

  // Merge PCM chunks
  const left = mergeBuffers(leftChunks);
  const right = mergeBuffers(rightChunks);
  leftChunks = [];
  rightChunks = [];

  let blob: Blob;
  if (format === 'wav') {
    const bitDepth = quality >= 0.5 ? 32 : 16;
    blob = encodeWAV(left, right, sampleRate, bitDepth);
  } else if (format === 'mp3') {
    const kbps = qualityToMp3Bitrate(quality);
    blob = encodeMP3(left, right, sampleRate, kbps);
  } else {
    blob = webmBlob;
  }

  return { blob, duration, timestamp };
}

export function isRecordingActive(): boolean {
  return recording;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mergeBuffers(chunks: Float32Array[]): Float32Array {
  let totalLen = 0;
  for (const c of chunks) totalLen += c.length;
  const result = new Float32Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}

export function qualityToMp3Bitrate(quality: number): number {
  if (quality < 0.25) return 128;
  if (quality < 0.5) return 192;
  if (quality < 0.75) return 256;
  return 320;
}

export function qualityToWavLabel(quality: number): string {
  return quality >= 0.5 ? '32-bit' : '16-bit';
}

export function qualityToMp3Label(quality: number): string {
  return `${qualityToMp3Bitrate(quality)}k`;
}

// ── WAV Encoder ───────────────────────────────────────────────────────────────

function encodeWAV(left: Float32Array, right: Float32Array, sr: number, bitDepth: 16 | 32): Blob {
  const numChannels = 2;
  const bytesPerSample = bitDepth / 8;
  const numSamples = left.length;
  const dataSize = numSamples * numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, bitDepth === 32 ? 3 : 1, true); // format: 3=float, 1=PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * numChannels * bytesPerSample, true); // byte rate
  view.setUint16(32, numChannels * bytesPerSample, true); // block align
  view.setUint16(34, bitDepth, true);

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Interleaved samples
  let offset = 44;
  if (bitDepth === 32) {
    for (let i = 0; i < numSamples; i++) {
      view.setFloat32(offset, left[i], true); offset += 4;
      view.setFloat32(offset, right[i], true); offset += 4;
    }
  } else {
    for (let i = 0; i < numSamples; i++) {
      view.setInt16(offset, floatTo16(left[i]), true); offset += 2;
      view.setInt16(offset, floatTo16(right[i]), true); offset += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function floatTo16(sample: number): number {
  const s = Math.max(-1, Math.min(1, sample));
  return s < 0 ? s * 0x8000 : s * 0x7FFF;
}

// ── MP3 Encoder ───────────────────────────────────────────────────────────────

function encodeMP3(left: Float32Array, right: Float32Array, sr: number, kbps: number): Blob {
  const encoder = new Mp3Encoder(2, sr, kbps);
  const numSamples = left.length;
  const blockSize = 1152;
  const mp3Chunks: Int8Array[] = [];

  for (let i = 0; i < numSamples; i += blockSize) {
    const end = Math.min(i + blockSize, numSamples);
    const leftBlock = floatToInt16(left.subarray(i, end));
    const rightBlock = floatToInt16(right.subarray(i, end));
    const chunk = encoder.encodeBuffer(leftBlock, rightBlock);
    if (chunk.length > 0) mp3Chunks.push(chunk);
  }

  const flush = encoder.flush();
  if (flush.length > 0) mp3Chunks.push(flush);

  return new Blob(mp3Chunks as BlobPart[], { type: 'audio/mpeg' });
}

function floatToInt16(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return output;
}
