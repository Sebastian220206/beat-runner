import { describe, it, expect } from 'vitest';
import {
  bpmToSecondsPerBeat,
  beatToSeconds,
  secondsToBeat,
  calculateSubdivisionTime,
  judgeTiming,
  intervalToFrequency,
  TIMING_WINDOWS,
  CALL_RESPONSE_LIBRARY,
} from '../src/rhythm.ts';
import { GENRES, GENRE_ORDER } from '../src/genres.ts';

describe('Rhythm Math & Time Conversions', () => {
  it('converts BPM to seconds per beat correctly', () => {
    expect(bpmToSecondsPerBeat(120)).toBeCloseTo(0.5);
    expect(bpmToSecondsPerBeat(60)).toBeCloseTo(1.0);
    expect(bpmToSecondsPerBeat(100)).toBeCloseTo(0.6);
  });

  it('converts beats to seconds and back', () => {
    const bpm = 120;
    const beat = 4;
    const seconds = beatToSeconds(beat, bpm);
    expect(seconds).toBeCloseTo(2.0);
    expect(secondsToBeat(seconds, bpm)).toBeCloseTo(beat);
  });

  it('calculates straight subdivisions properly', () => {
    const bpm = 120; // 0.5s per beat
    // Bar start beat = 0, beat 1.5 -> 1.5 beats * 0.5s = 0.75s
    const time = calculateSubdivisionTime(0, 1.5, bpm, 0.5);
    expect(time).toBeCloseTo(0.75);
  });

  it('delays swung 8th notes according to swing ratio', () => {
    const bpm = 120; // 0.5s per beat
    // Swing ratio 0.67 (triplet swing)
    // Beat 0.5 should be shifted to 0.67 beats -> 0.67 * 0.5 = 0.335s instead of 0.25s
    const straightTime = calculateSubdivisionTime(0, 0.5, bpm, 0.5);
    const swungTime = calculateSubdivisionTime(0, 0.5, bpm, 0.67);
    expect(straightTime).toBeCloseTo(0.25);
    expect(swungTime).toBeCloseTo(0.335);
    expect(swungTime).toBeGreaterThan(straightTime);
  });
});

describe('Precision Timing Judgments', () => {
  it('has calibrated timing window thresholds', () => {
    expect(TIMING_WINDOWS.PERFECT_MS).toBe(35);
    expect(TIMING_WINDOWS.GREAT_MS).toBe(70);
    expect(TIMING_WINDOWS.GOOD_MS).toBe(115);
  });

  it('awards PERFECT for inputs within 35ms', () => {
    const target = 2.0;
    const resOnTarget = judgeTiming(2.0, target);
    expect(resOnTarget.rating).toBe('PERFECT');
    expect(resOnTarget.deltaMs).toBe(0);
    expect(resOnTarget.score).toBe(100);

    const resEarly = judgeTiming(1.97, target); // -30ms
    expect(resEarly.rating).toBe('PERFECT');
    expect(resEarly.deltaMs).toBe(-30);

    const resLate = judgeTiming(2.035, target); // +35ms
    expect(resLate.rating).toBe('PERFECT');
    expect(resLate.deltaMs).toBe(35);
  });

  it('awards GREAT for inputs between 36ms and 70ms', () => {
    const target = 2.0;
    const res = judgeTiming(2.05, target); // +50ms
    expect(res.rating).toBe('GREAT');
    expect(res.score).toBe(75);
  });

  it('awards GOOD for inputs between 71ms and 115ms', () => {
    const target = 2.0;
    const res = judgeTiming(1.91, target); // -90ms
    expect(res.rating).toBe('GOOD');
    expect(res.score).toBe(45);
  });

  it('awards MISS for inputs exceeding 115ms', () => {
    const target = 2.0;
    const res = judgeTiming(2.13, target); // +130ms
    expect(res.rating).toBe('MISS');
    expect(res.score).toBe(0);
    expect(res.grooveChange).toBeLessThan(0);
  });
});

describe('Musical Utilities & Pattern Library', () => {
  it('computes musical intervals correctly', () => {
    const root = 440; // A4
    const octave = intervalToFrequency(root, 12);
    expect(octave).toBeCloseTo(880);

    const fifth = intervalToFrequency(root, 7);
    expect(fifth).toBeCloseTo(659.255, 1);
  });

  it('provides well-formed call & response patterns', () => {
    expect(CALL_RESPONSE_LIBRARY.length).toBeGreaterThan(0);
    for (const pattern of CALL_RESPONSE_LIBRARY) {
      expect(pattern.beats.length).toBe(pattern.lanes.length);
      expect(pattern.beats.length).toBe(pattern.notes.length);
      for (const lane of pattern.lanes) {
        expect([0, 1, 2]).toContain(lane);
      }
    }
  });

  it('contains all 5 musical genres with required audio and visual parameters', () => {
    expect(GENRE_ORDER.length).toBe(5);
    for (const id of GENRE_ORDER) {
      const g = GENRES[id];
      expect(g.id).toBe(id);
      expect(g.bpm).toBeGreaterThan(80);
      expect(g.scale.length).toBeGreaterThanOrEqual(5);
      expect(g.colors.primary).toBeDefined();
      expect(g.colors.secondary).toBeDefined();
      expect(g.colors.highway).toBeDefined();
      expect(g.rhythmPatterns.length).toBeGreaterThan(0);
    }
  });
});

