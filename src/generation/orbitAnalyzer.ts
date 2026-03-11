import { useStore } from '../state/store';
import { classifyInstrument } from './sampleClassifier';
import { resizeTemplate, applyDensity } from './rhythmTemplates';
import { createRNG } from './rng';
import { KICK_TEMPLATES } from './rhythmTemplates';

/**
 * Krumhansl-Schmuckler key profiles (12 pitch classes).
 * These correlation weights help detect the most likely key.
 */
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

// Additional scale profiles for extended detection
const DORIAN_PROFILE = [6.33, 2.68, 3.52, 5.0, 2.6, 3.53, 2.54, 5.0, 3.98, 2.69, 2.5, 3.17];
const PHRYGIAN_PROFILE = [6.33, 5.0, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 2.5, 3.17];

export interface PitchClassProfile {
  scores: number[];
  detectedRoot: number; // 0–11
  detectedScale: string; // 'major', 'minor', 'dorian', etc.
  confidence: number; // 0–1
}

export interface GrooveFingerprint {
  isFourOnFloor: boolean;
  isHalfTime: boolean;
  suggestedGenre: string;
}

export interface OrbitAnalysis {
  pitchProfile: PitchClassProfile | null;
  groove: GrooveFingerprint | null;
  hasPitchedContent: boolean;
  hasDrumContent: boolean;
}

/**
 * Pearson correlation coefficient between two arrays.
 */
function pearsonCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length) return 0;

  const n = x.length;
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumX2 = 0,
    sumY2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Detect the key and scale from all pitched instruments (synths/leads).
 */
function detectPitchProfile(): PitchClassProfile | null {
  const s = useStore.getState();
  const pitchClassCounts = new Array(12).fill(0);
  let totalNotes = 0;

  // Collect all notes from non-sampler instruments
  for (const inst of s.instruments) {
    if (inst.type === 'sampler' || inst.type === 'looper') continue;

    const gridNotes = s.gridNotes[inst.id] ?? [];
    for (const noteSet of gridNotes) {
      for (const midiNote of noteSet) {
        const pitchClass = midiNote % 12;
        pitchClassCounts[pitchClass]++;
        totalNotes++;
      }
    }
  }

  if (totalNotes === 0) return null;

  // Normalize to 0–1
  const histogram = pitchClassCounts.map((c) => c / totalNotes);

  // Build all rotations of key profiles and correlate
  const profiles = [
    { scale: 'major', profile: MAJOR_PROFILE },
    { scale: 'minor', profile: MINOR_PROFILE },
    { scale: 'dorian', profile: DORIAN_PROFILE },
    { scale: 'phrygian', profile: PHRYGIAN_PROFILE },
  ];

  let bestScore = -Infinity;
  let bestRoot = 0;
  let bestScale = 'major';
  const scores: number[] = new Array(12).fill(-Infinity);

  for (const { scale, profile } of profiles) {
    for (let root = 0; root < 12; root++) {
      // Rotate profile by root
      const rotatedProfile = Array.from({ length: 12 }, (_, i) => profile[(i + root) % 12]);
      const score = pearsonCorrelation(histogram, rotatedProfile);

      if (score > bestScore) {
        bestScore = score;
        bestRoot = root;
        bestScale = scale;
      }
      scores[root] = score;
    }
  }

  return {
    scores,
    detectedRoot: bestRoot,
    detectedScale: bestScale,
    confidence: Math.max(0, Math.min(1, (bestScore + 1) / 2)), // Normalize [-1,1] to [0,1]
  };
}

/**
 * Detect groove characteristics (4-on-floor, half-time, genre).
 */
function detectGrooveFingerprint(): GrooveFingerprint | null {
  const s = useStore.getState();
  let kickInstrument = null;
  let snareInstrument = null;

  // Find kick and snare instruments
  for (const inst of s.instruments) {
    if (inst.type === 'sampler' || inst.type === 'looper') {
      const role = classifyInstrument(inst.sampleName ?? '', inst.name);
      if (role === 'kick' && !kickInstrument) {
        kickInstrument = inst;
      } else if (role === 'snare' && !snareInstrument) {
        snareInstrument = inst;
      }
    }
  }

  if (!kickInstrument) return null;

  // Extract kick pattern as step set
  const kickPositions = kickInstrument.hitPositions ?? [];
  const kickSteps = new Set(
    kickPositions.map((pos) => Math.round(pos * kickInstrument.loopSize)).filter((s) => s < 16),
  );

  // Check for 4-on-floor (hits on steps 0, 4, 8, 12)
  const fourOnFloorSteps = [0, 4, 8, 12];
  const fourOnFloorHits = fourOnFloorSteps.filter((step) => kickSteps.has(step)).length;
  const isFourOnFloor = fourOnFloorHits >= 3;

  // Check for half-time (kick avoids 4+12, snare mostly on 8)
  let isHalfTime = false;
  if (snareInstrument) {
    const snarePositions = snareInstrument.hitPositions ?? [];
    const snareSteps = new Set(
      snarePositions.map((pos) => Math.round(pos * snareInstrument.loopSize)).filter((s) => s < 16),
    );
    const halfTimeKickMissing = !kickSteps.has(4) && !kickSteps.has(12);
    const snareOnEight = snareSteps.has(8);
    isHalfTime = halfTimeKickMissing && snareOnEight;
  }

  // Suggest genre based on pattern (simple heuristic)
  let suggestedGenre = 'house'; // default
  if (isFourOnFloor && !isHalfTime) {
    suggestedGenre = 'house'; // or techno
  } else if (isHalfTime) {
    suggestedGenre = 'hiphop';
  } else if (kickSteps.has(0) && kickSteps.has(10)) {
    suggestedGenre = 'dnb';
  } else {
    suggestedGenre = 'house';
  }

  return {
    isFourOnFloor,
    isHalfTime,
    suggestedGenre,
  };
}

/**
 * Analyze all orbits and return detected key, scale, and groove characteristics.
 */
export function analyzeOrbits(): OrbitAnalysis {
  const pitchProfile = detectPitchProfile();
  const groove = detectGrooveFingerprint();

  const s = useStore.getState();
  const hasPitchedContent = s.instruments.some((i) => i.type !== 'sampler' && i.type !== 'looper');
  const hasDrumContent = s.instruments.some((i) => i.type === 'sampler' || i.type === 'looper');

  return {
    pitchProfile,
    groove,
    hasPitchedContent,
    hasDrumContent,
  };
}
