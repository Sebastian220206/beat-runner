// Beat Runner - Rhythmic Calculation, Timing Windows & Pattern Bank

export type TimingRating = 'PERFECT' | 'GREAT' | 'GOOD' | 'MISS';

export interface JudgmentResult {
  rating: TimingRating;
  deltaMs: number; // Negative = Early, Positive = Late
  score: number;
  grooveChange: number; // Percent change to groove meter (-15 to +10)
  label: string;
}

// Precision timing windows in milliseconds
export const TIMING_WINDOWS = {
  PERFECT_MS: 35,
  GREAT_MS: 70,
  GOOD_MS: 115,
} as const;

export function bpmToSecondsPerBeat(bpm: number): number {
  if (bpm <= 0) return 0.5;
  return 60 / bpm;
}

export function beatToSeconds(beat: number, bpm: number): number {
  return beat * bpmToSecondsPerBeat(bpm);
}

export function secondsToBeat(seconds: number, bpm: number): number {
  return seconds / bpmToSecondsPerBeat(bpm);
}

/**
 * Calculates accurate subdivision timing with support for swing ratios.
 * In straight feel (swingRatio = 0.5), an 8th note is exactly half a beat.
 * In jazz swing feel (swingRatio = 0.67), the offbeat 8th note falls on 2/3 of the beat (triplet feel).
 */
export function calculateSubdivisionTime(
  barStartBeat: number,
  fractionalBeat: number,
  bpm: number,
  swingRatio: number = 0.5
): number {
  const wholeBeat = Math.floor(fractionalBeat);
  const frac = fractionalBeat - wholeBeat;

  let adjustedFrac = frac;
  if (Math.abs(frac - 0.5) < 0.01) {
    // 8th-note offbeat: apply swing ratio
    adjustedFrac = swingRatio;
  } else if (Math.abs(frac - 0.25) < 0.01) {
    // 16th-note 2nd tick
    adjustedFrac = frac * (swingRatio / 0.5);
  } else if (Math.abs(frac - 0.75) < 0.01) {
    // 16th-note 4th tick
    adjustedFrac = swingRatio + (1 - swingRatio) * 0.5;
  }

  const finalBeat = barStartBeat + wholeBeat + adjustedFrac;
  return beatToSeconds(finalBeat, bpm);
}

/**
 * Evaluates player action timing against the target beat timestamp.
 */
export function judgeTiming(actualTimeSeconds: number, targetTimeSeconds: number): JudgmentResult {
  const deltaSeconds = actualTimeSeconds - targetTimeSeconds;
  const deltaMs = Math.round(deltaSeconds * 1000);
  const absMs = Math.abs(deltaMs);

  if (absMs <= TIMING_WINDOWS.PERFECT_MS) {
    return {
      rating: 'PERFECT',
      deltaMs,
      score: 100,
      grooveChange: 10,
      label: `PERFECT! ${deltaMs >= 0 ? '+' : ''}${deltaMs}ms`,
    };
  }

  if (absMs <= TIMING_WINDOWS.GREAT_MS) {
    return {
      rating: 'GREAT',
      deltaMs,
      score: 75,
      grooveChange: 5,
      label: `GREAT ${deltaMs >= 0 ? '+' : ''}${deltaMs}ms`,
    };
  }

  if (absMs <= TIMING_WINDOWS.GOOD_MS) {
    return {
      rating: 'GOOD',
      deltaMs,
      score: 45,
      grooveChange: 2,
      label: `GOOD ${deltaMs >= 0 ? '+' : ''}${deltaMs}ms`,
    };
  }

  return {
    rating: 'MISS',
    deltaMs,
    score: 0,
    grooveChange: -15,
    label: 'MISS',
  };
}

/**
 * Frequency calculation for musical scale intervals.
 */
export function intervalToFrequency(baseFreq: number, semitones: number): number {
  return baseFreq * Math.pow(2, semitones / 12);
}

/**
 * Call & Response Pattern Generator
 * Creates an ear-training challenge where the player listens to a 1-bar rhythmic motif
 * and then plays it back in the subsequent bar.
 */
export interface CallResponsePattern {
  name: string;
  beats: number[]; // Subdivisions within the bar (e.g. [0, 1.5, 3])
  lanes: number[]; // Lanes (0, 1, 2)
  notes: number[]; // Semitone offsets
}

export const CALL_RESPONSE_LIBRARY: CallResponsePattern[] = [
  {
    name: 'Straight Pulse Call',
    beats: [0, 1, 2, 3],
    lanes: [0, 1, 2, 1],
    notes: [0, 3, 7, 5],
  },
  {
    name: 'Syncopated Tresillo',
    beats: [0, 1.5, 3],
    lanes: [1, 2, 0],
    notes: [0, 7, 10],
  },
  {
    name: 'Double-Tap Echo',
    beats: [0, 0.5, 2, 2.5],
    lanes: [0, 0, 2, 2],
    notes: [0, 2, 7, 9],
  },
  {
    name: 'Walking Triplets',
    beats: [0, 1, 2, 3],
    lanes: [0, 1, 2, 1],
    notes: [0, 4, 7, 11],
  },
  {
    name: 'Off-Beat Pocket',
    beats: [0.5, 1.5, 2.5, 3.5],
    lanes: [1, 0, 2, 1],
    notes: [3, 5, 8, 10],
  },
];
