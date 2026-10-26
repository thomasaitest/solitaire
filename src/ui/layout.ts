export interface StackCard {
  faceUp: boolean;
}

export interface Layout {
  cardW: number;
  cardH: number;
  gap: number;
  fan: number;
  upPeek: number;
  downPeek: number;
  tableW: number;
  wasteW: number;
}

const RATIO = 1.42;
const MAX_CARD = 118;
const MIN_CARD = 28;
/** Share of the card height a covered face-up card shows; the corner index ends at about 25%. */
export const MIN_UP_PEEK = 0.27;

function wasteFan(cardW: number, gap: number, drawCount: 1 | 3): number {
  if (drawCount === 1) return 0;
  const preferred = Math.max(8, Math.round(cardW * 0.38));
  const maxFan = Math.max(8, Math.floor((cardW + 2 * gap) / 2));
  return Math.min(preferred, maxFan);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

interface Measured extends Layout {
  fits: boolean;
}

function measure(
  cardW: number,
  width: number,
  height: number,
  tableau: readonly StackCard[][],
  drawCount: 1 | 3,
): Measured {
  const gap = clamp(Math.round(cardW * 0.1), 4, 12);
  const cardH = Math.round(cardW * RATIO);
  // Wide enough to show the index of the two covered waste cards, while the
  // stock, waste, and four foundations still fit inside the seven columns.
  const fan = wasteFan(cardW, gap, drawCount);
  let upPeek = clamp(Math.round(cardH * 0.34), 16, 42);
  let downPeek = clamp(Math.round(cardH * 0.16), 8, 20);
  const tableauH = Math.max(0, height - cardH - gap);

  const stackHeight = (pile: readonly StackCard[]): number => {
    if (pile.length === 0) return cardH;
    let total = cardH;
    for (let i = 0; i < pile.length - 1; i++) total += pile[i]?.faceUp ? upPeek : downPeek;
    return total;
  };

  const tallest = (): number => tableau.reduce((max, pile) => Math.max(max, stackHeight(pile)), cardH);

  // A covered face-up card must still show its whole corner index (rank and suit).
  const minUp = Math.max(13, Math.ceil(cardH * MIN_UP_PEEK));
  for (let i = 0; i < 40 && tallest() > tableauH; i++) {
    if (upPeek <= minUp && downPeek <= 6) break;
    upPeek = Math.max(minUp, upPeek - 1);
    downPeek = Math.max(6, downPeek - 1);
  }

  const tableW = 7 * cardW + 6 * gap;
  const wasteW = cardW + (drawCount === 1 ? 0 : fan * 2);
  const topW = cardW + gap + wasteW + 4 * cardW + 3 * gap;
  const fits = tallest() <= tableauH + 0.5 && tableW <= width + 0.5 && topW <= width + 0.5;
  return { cardW, cardH, gap, fan: drawCount === 1 ? 0 : fan, upPeek, downPeek, tableW, wasteW, fits };
}

/** Fit a 7-column table into the available box, including the tallest pile. */
export function computeLayout(
  width: number,
  height: number,
  tableau: readonly StackCard[][],
  drawCount: 1 | 3,
): Layout {
  const byWidth = Math.floor((width - 6 * 4) / 7);
  const upper = clamp(byWidth, MIN_CARD, MAX_CARD);
  let lo = MIN_CARD;
  let hi = Math.max(MIN_CARD, upper);
  let best = measure(MIN_CARD, width, height, tableau, drawCount);
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const measured = measure(mid, width, height, tableau, drawCount);
    if (measured.fits) {
      best = measured;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return {
    cardW: best.cardW,
    cardH: best.cardH,
    gap: best.gap,
    fan: best.fan,
    upPeek: best.upPeek,
    downPeek: best.downPeek,
    tableW: best.tableW,
    wasteW: best.wasteW,
  };
}
