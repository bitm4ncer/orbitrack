/**
 * Transient / onset detection for loop slicing.
 * Uses energy-based onset detection with adaptive thresholding.
 * BPM detection uses web-audio-beat-detector for accurate tempo estimation.
 */

import { guess } from 'web-audio-beat-detector';

const FRAME_SIZE = 1024;
const HOP_SIZE = 512;

/**
 * Compute RMS energy per frame for an AudioBuffer (mono-mixed).
 * Shared by transient detection and tail detection.
 */
export function computeEnergyFrames(buffer: AudioBuffer): { energy: Float32Array; numFrames: number } {
  const length = buffer.length;
  const mono = new Float32Array(length);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      mono[i] += data[i];
    }
  }
  const scale = 1 / buffer.numberOfChannels;
  for (let i = 0; i < length; i++) mono[i] *= scale;

  const numFrames = Math.floor((length - FRAME_SIZE) / HOP_SIZE) + 1;
  const energy = new Float32Array(numFrames);
  for (let f = 0; f < numFrames; f++) {
    const offset = f * HOP_SIZE;
    let sum = 0;
    for (let i = 0; i < FRAME_SIZE; i++) {
      const s = mono[offset + i];
      sum += s * s;
    }
    energy[f] = Math.sqrt(sum / FRAME_SIZE);
  }
  return { energy, numFrames };
}

/**
 * Detect transient positions in an AudioBuffer.
 * @param buffer  - The audio to analyze
 * @param sensitivity - 0.0 (few peaks) to 1.0 (many peaks)
 * @param maxPeaks - Maximum number of transients to return
 * @returns Normalized positions [0..1] sorted ascending
 */
export function detectTransients(
  buffer: AudioBuffer,
  sensitivity: number = 0.5,
  maxPeaks: number = 16,
): number[] {
  const length = buffer.length;
  const { energy, numFrames } = computeEnergyFrames(buffer);
  if (numFrames < 3) return [];

  // Onset detection function: first-order difference (positive only)
  const onset = new Float32Array(numFrames);
  for (let f = 1; f < numFrames; f++) {
    onset[f] = Math.max(0, energy[f] - energy[f - 1]);
  }

  // Adaptive threshold: local median + sensitivity-scaled stddev
  const windowSize = Math.max(5, Math.floor(numFrames / 8));
  const thresholdScale = 1.5 - sensitivity * 1.2; // high sensitivity = lower threshold

  const peaks: { frame: number; strength: number }[] = [];

  for (let f = 1; f < numFrames - 1; f++) {
    // Local window
    const wStart = Math.max(0, f - windowSize);
    const wEnd = Math.min(numFrames, f + windowSize + 1);
    const localVals: number[] = [];
    for (let w = wStart; w < wEnd; w++) localVals.push(onset[w]);
    localVals.sort((a, b) => a - b);

    const median = localVals[Math.floor(localVals.length / 2)];
    let variance = 0;
    for (const v of localVals) variance += (v - median) * (v - median);
    const stddev = Math.sqrt(variance / localVals.length);

    const threshold = median + thresholdScale * stddev;

    // Peak picking: must be above threshold and a local maximum
    if (onset[f] > threshold && onset[f] >= onset[f - 1] && onset[f] >= onset[f + 1]) {
      peaks.push({ frame: f, strength: onset[f] });
    }
  }

  // Sort by strength, take top maxPeaks
  peaks.sort((a, b) => b.strength - a.strength);
  const selected = peaks.slice(0, maxPeaks);

  // Convert frame indices to normalized positions, sort by position
  const positions = selected
    .map((p) => (p.frame * HOP_SIZE) / length)
    .sort((a, b) => a - b);

  // Ensure first transient is near the start if there's any energy there
  if (positions.length > 0 && positions[0] > 0.05) {
    positions.unshift(0);
    if (positions.length > maxPeaks) positions.pop();
  }

  return positions;
}

/**
 * Detect the tail (decay end) of each transient onset.
 * For each onset, scans forward in the energy array until RMS drops below
 * a fraction of the onset's peak energy, or the next onset is reached.
 * @param buffer - The audio to analyze
 * @param onsets - Normalized onset positions [0..1], sorted ascending
 * @param decayThreshold - Fraction of onset peak energy to consider "decayed" (0-1)
 * @returns Normalized tail positions [0..1], parallel to onsets array
 */
export function detectTransientTails(
  buffer: AudioBuffer,
  onsets: number[],
  decayThreshold: number = 0.15,
): number[] {
  if (onsets.length === 0) return [];

  const length = buffer.length;
  const { energy, numFrames } = computeEnergyFrames(buffer);
  if (numFrames < 3) return onsets.map((_, i) => i + 1 < onsets.length ? onsets[i + 1] : 1);

  const tails: number[] = [];

  for (let i = 0; i < onsets.length; i++) {
    const onsetSample = Math.floor(onsets[i] * length);
    const onsetFrame = Math.min(numFrames - 1, Math.floor(onsetSample / HOP_SIZE));

    // Next onset frame (or end of buffer)
    const nextOnsetSample = i + 1 < onsets.length ? Math.floor(onsets[i + 1] * length) : length;
    const nextOnsetFrame = Math.min(numFrames, Math.floor(nextOnsetSample / HOP_SIZE));

    // Find peak energy in the first few frames after onset (attack phase)
    const searchEnd = Math.min(onsetFrame + 8, nextOnsetFrame);
    let peakEnergy = 0;
    for (let f = onsetFrame; f < searchEnd; f++) {
      if (energy[f] > peakEnergy) peakEnergy = energy[f];
    }

    // If no significant energy, tail = next onset
    if (peakEnergy < 0.001) {
      tails.push(i + 1 < onsets.length ? onsets[i + 1] : 1);
      continue;
    }

    // Scan forward from peak until energy drops below threshold
    const threshold = peakEnergy * decayThreshold;
    let tailFrame = nextOnsetFrame; // default: extends to next onset
    for (let f = searchEnd; f < nextOnsetFrame; f++) {
      if (energy[f] < threshold) {
        tailFrame = f;
        break;
      }
    }

    // Convert frame to normalized position, clamp to not exceed next onset
    const tailNorm = Math.min(
      (tailFrame * HOP_SIZE) / length,
      i + 1 < onsets.length ? onsets[i + 1] : 1,
    );

    // Ensure tail is at least slightly after onset
    tails.push(Math.max(tailNorm, onsets[i] + 0.001));
  }

  return tails;
}

/**
 * Snap transient positions to the nearest grid step and deduplicate.
 * @param transients - Normalized positions [0..1]
 * @param gridSize   - Number of grid steps (e.g. 16)
 * @returns Normalized positions [0..1) snapped to grid
 */
export function mapTransientsToGrid(transients: number[], gridSize: number): number[] {
  const snapped = new Set<number>();
  for (const t of transients) {
    const step = Math.round(t * gridSize) % gridSize;
    snapped.add(step / gridSize);
  }
  return [...snapped].sort((a, b) => a - b);
}

/**
 * Detect the BPM of an audio buffer using web-audio-beat-detector.
 * Falls back to a simple duration-based estimate if detection fails.
 */
export async function detectBpm(buffer: AudioBuffer): Promise<number> {
  // Skip very short buffers — BPM detection needs at least ~2s of audio
  if (buffer.duration < 1.5) return 0;
  try {
    const result = await guess(buffer);
    // Sanity check: BPM should be in a reasonable range
    if (result.bpm >= 50 && result.bpm <= 300) {
      return result.bpm;
    }
    console.warn('[detectBpm] out of range:', result.bpm);
  } catch (e) {
    console.warn('[detectBpm] detection failed:', e);
  }
  return 0; // 0 = unknown, caller should use project BPM
}

/**
 * Estimate the best loopSize (in 16th notes) for an audio buffer.
 * Uses detected audio BPM if available, otherwise falls back to project BPM.
 * @param buffer - The audio to analyze
 * @param projectBpm - Current project BPM (fallback)
 * @param detectedBpm - BPM detected from the audio (0 = unknown)
 */
export function estimateLoopSize(buffer: AudioBuffer, projectBpm: number, detectedBpm: number = 0, stepsPerBeat: number = 4): number {
  const bpmForCalc = detectedBpm > 0 ? detectedBpm : projectBpm;

  // Calculate in the current step resolution (stepsPerBeat).
  // stepsPerBeat=4 → 16th notes, stepsPerBeat=8 → 32nd notes, etc.
  const secondsPerStep = 60 / bpmForCalc / stepsPerBeat;
  const rawSteps = buffer.duration / secondsPerStep;

  // Steps per beat and per bar at current resolution
  const spb = stepsPerBeat;      // steps per beat
  const spBar = spb * 4;         // steps per bar (4/4 time)

  let loopSize: number;
  if (rawSteps <= spb * 1.5) {
    // Very short: round to nearest beat, minimum 1 beat
    loopSize = Math.max(spb, Math.round(rawSteps / spb) * spb);
  } else if (rawSteps <= spBar * 1.5) {
    // Short: round to nearest half-bar, minimum half-bar
    const halfBar = spb * 2;
    loopSize = Math.max(halfBar, Math.round(rawSteps / halfBar) * halfBar);
  } else {
    // Standard+: round to nearest bar, minimum 1 bar
    loopSize = Math.max(spBar, Math.round(rawSteps / spBar) * spBar);
  }

  // Cap at 16 bars
  loopSize = Math.min(loopSize, spBar * 16);

  console.log(`[estimateLoopSize] duration=${buffer.duration.toFixed(2)}s, bpm=${bpmForCalc}, rawSteps=${rawSteps.toFixed(1)}, loopSize=${loopSize}, stepsPerBeat=${stepsPerBeat}`);
  return loopSize;
}
