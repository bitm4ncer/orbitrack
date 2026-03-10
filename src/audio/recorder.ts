/**
 * Audio Recorder
 *
 * Taps the master gain (side-connection, same pattern as the metering analyser)
 * and records via MediaRecorder API into WebM blobs.
 */

import { getMasterGain } from './routingEngine';
import { getAudioContext } from 'superdough';

let mediaRecorder: MediaRecorder | null = null;
let streamDest: MediaStreamAudioDestinationNode | null = null;
let chunks: Blob[] = [];
let startTime = 0;

export function startRecording(): boolean {
  if (mediaRecorder && mediaRecorder.state === 'recording') return false;

  const gain = getMasterGain();
  if (!gain) return false;

  const ctx = getAudioContext();
  streamDest = ctx.createMediaStreamDestination();
  gain.connect(streamDest); // side-tap — gain still routes to destination normally

  chunks = [];
  mediaRecorder = new MediaRecorder(streamDest.stream, { mimeType: 'audio/webm' });

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  startTime = Date.now();
  mediaRecorder.start(100); // collect chunks every 100ms
  return true;
}

export function stopRecording(): { blob: Blob; duration: number; timestamp: number } | null {
  if (!mediaRecorder || mediaRecorder.state !== 'recording') return null;

  const duration = Date.now() - startTime;
  const timestamp = Date.now();

  return new Promise<{ blob: Blob; duration: number; timestamp: number }>((resolve) => {
    mediaRecorder!.onstop = () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      chunks = [];

      // Disconnect the stream destination tap
      try {
        const gain = getMasterGain();
        if (gain && streamDest) gain.disconnect(streamDest);
      } catch { /* already disconnected */ }
      streamDest = null;
      mediaRecorder = null;

      resolve({ blob, duration, timestamp });
    };
    mediaRecorder!.stop();
  }) as unknown as { blob: Blob; duration: number; timestamp: number };
}

// Async version for proper promise handling
export async function stopRecordingAsync(): Promise<{ blob: Blob; duration: number; timestamp: number } | null> {
  if (!mediaRecorder || mediaRecorder.state !== 'recording') return null;

  const duration = Date.now() - startTime;
  const timestamp = Date.now();

  return new Promise<{ blob: Blob; duration: number; timestamp: number }>((resolve) => {
    mediaRecorder!.onstop = () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      chunks = [];

      try {
        const gain = getMasterGain();
        if (gain && streamDest) gain.disconnect(streamDest);
      } catch { /* already disconnected */ }
      streamDest = null;
      mediaRecorder = null;

      resolve({ blob, duration, timestamp });
    };
    mediaRecorder!.stop();
  });
}
