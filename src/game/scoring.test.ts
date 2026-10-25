import { describe, expect, it } from 'vitest';
import { formatTime, scoreParts } from './scoring.ts';

describe('scoreParts', () => {
  it('subtracts two points for each ten seconds and clamps at zero', () => {
    expect(scoreParts(10, 0, false)).toMatchObject({ timePenalty: 0, bonus: 0, total: 10 });
    expect(scoreParts(10, 25_000, false)).toMatchObject({ timePenalty: 4, bonus: 0, total: 6 });
    expect(scoreParts(0, 25_000, false).total).toBe(0);
  });

  it('adds the win bonus from the classic 700,000 / seconds rule', () => {
    const parts = scoreParts(100, 100_000, true);
    expect(parts.timePenalty).toBe(20);
    expect(parts.bonus).toBe(7000);
    expect(parts.total).toBe(7080);
    expect(scoreParts(100, 400, true).bonus).toBe(0);
  });
});

describe('formatTime', () => {
  it('formats minutes and hours', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65_000)).toBe('1:05');
    expect(formatTime(3_661_000)).toBe('1:01:01');
  });
});
