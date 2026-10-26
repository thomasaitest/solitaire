import { describe, expect, it } from 'vitest';
import { MIN_UP_PEEK, computeLayout } from './layout.ts';

const empty = Array.from({ length: 7 }, () => []);

describe('computeLayout', () => {
  it('fits an iPhone-width portrait table without overflowing', () => {
    const layout = computeLayout(360, 640, empty, 3);
    expect(layout.cardW).toBeGreaterThanOrEqual(42);
    expect(layout.cardW).toBeLessThanOrEqual(56);
    expect(layout.tableW).toBeLessThanOrEqual(360);
    expect(layout.cardH).toBe(Math.round(layout.cardW * 1.42));
    expect(layout.fan).toBeGreaterThanOrEqual(Math.round(layout.cardW * 0.34));
    const topW = layout.cardW + layout.gap + layout.wasteW + 4 * layout.cardW + 3 * layout.gap;
    expect(topW).toBeLessThanOrEqual(layout.tableW);
    expect(topW).toBeLessThanOrEqual(360);
  });

  it('caps card size on a wide desktop window', () => {
    const layout = computeLayout(1440, 900, empty, 1);
    expect(layout.cardW).toBe(118);
    expect(layout.fan).toBe(0);
    expect(layout.wasteW).toBe(layout.cardW);
  });

  it('compresses a tall pile so the column still fits a short window', () => {
    const tall = Array.from({ length: 7 }, (_, index) =>
      index === 0 ? Array.from({ length: 13 }, () => ({ faceUp: true })) : [],
    );
    const layout = computeLayout(900, 320, tall, 3);
    const tableauH = 320 - layout.cardH - layout.gap;
    const stack = layout.cardH + 12 * layout.upPeek;
    expect(stack).toBeLessThanOrEqual(tableauH + 1);
    expect(layout.tableW).toBeLessThanOrEqual(900);
  });

  it('keeps the corner index readable on a landscape phone', () => {
    const run = Array.from({ length: 7 }, (_, index) => [
      ...Array.from({ length: index }, () => ({ faceUp: false })),
      ...Array.from({ length: 4 }, () => ({ faceUp: true })),
    ]);
    const layout = computeLayout(844, 300, run, 3);
    expect(layout.upPeek).toBeGreaterThanOrEqual(Math.ceil(layout.cardH * MIN_UP_PEEK));
    const tallest = layout.cardH + 6 * layout.downPeek + 3 * layout.upPeek;
    expect(tallest).toBeLessThanOrEqual(300 - layout.cardH - layout.gap + 1);
  });
});
