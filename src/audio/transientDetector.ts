/**
 * Transient / onset detection for loop slicing.
 * Uses energy-based onset detection with adaptive thresholding.
 */

const FRAME_SIZE = 1024;
const HOP_SIZE = 512;

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
  // Merge all channels to mono
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

  // Compute RMS energy per frame
  const numFrames = Math.floor((length - FRAME_SIZE) / HOP_SIZE) + 1;
  if (numFrames < 3) return [];

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
