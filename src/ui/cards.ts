import { RANK_LABEL, SUIT_NAME } from '../game/types.ts';
import type { Card, Suit } from '../game/types.ts';

const RED = '#ff3b30';
const BLACK = '#1c1c1e';

export function cardColor(suit: Suit): string {
  return suit === 'h' || suit === 'd' ? RED : BLACK;
}

export function cardLabel(card: Card): string {
  if (!card.faceUp) return 'Kort med baksiden opp';
  return `${SUIT_NAME[card.suit]} ${RANK_NAME(card.rank)}`;
}

function RANK_NAME(rank: number): string {
  return ['', 'ess', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'knekt', 'dame', 'konge'][rank] ?? String(rank);
}

function suitPaths(suit: Suit): string {
  if (suit === 'h') {
    return '<path d="M50 90C50 90 12 60 12 38C12 22 24 12 37 12C44 12 50 18 50 26C50 18 56 12 63 12C76 12 88 22 88 38C88 60 50 90 50 90Z"/>';
  }
  if (suit === 'd') {
    return '<path d="M50 6L90 50L50 94L10 50Z"/>';
  }
  if (suit === 'c') {
    return '<circle cx="50" cy="32" r="16"/><circle cx="31" cy="54" r="16"/><circle cx="69" cy="54" r="16"/><path d="M44 58C42 76 36 92 26 98H74C64 92 58 76 56 58Z"/>';
  }
  return '<path d="M50 8C50 8 88 40 88 58C88 76 74 88 62 86C56 85 52 78 50 70C48 78 44 85 38 86C26 88 12 76 12 58C12 40 50 8 50 8Z"/><path d="M43 74C41 88 35 98 26 98H74C65 98 59 88 57 74Z"/>';
}

export function suitSvg(suit: Suit, size: number, color = 'currentColor'): string {
  return `<svg class="suit" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true" fill="${color}">${suitPaths(suit)}</svg>`;
}

const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', 'Segoe UI', Roboto, sans-serif";

function glyph(suit: Suit, x: number, y: number, size: number, color: string): string {
  const scale = size / 100;
  return `<g transform="translate(${x} ${y}) scale(${scale})" fill="${color}">${suitPaths(suit)}</g>`;
}

/** Top-left index: rank and a small suit side by side, inside the part a fanned card shows. */
function corner(rank: string, suit: Suit, color: string): string {
  const wide = rank.length > 1;
  const x = wide ? 14 : 20;
  const textW = wide ? 82 : 48;
  return `
    <text x="${x}" y="84" fill="${color}" font-size="78" font-family="${FONT}" font-weight="600" letter-spacing="${wide ? -6 : -2}">${rank}</text>
    ${glyph(suit, x + textW + 4, 34, 54, color)}
  `;
}

function center(card: Card, rank: string, color: string): string {
  if (card.rank >= 11) {
    return `
      <text x="146" y="262" text-anchor="middle" fill="${color}" font-size="132" font-family="${FONT}" font-weight="700" opacity="0.92">${rank}</text>
      ${glyph(card.suit, 122, 272, 48, color)}
    `;
  }
  const size = card.rank === 1 ? 150 : 124;
  return glyph(card.suit, 150 - size / 2 + 2, 196 - size / 2 + 10, size, color);
}

export function cardFaceSvg(card: Card): string {
  const color = cardColor(card.suit);
  const rank = RANK_LABEL[card.rank] ?? String(card.rank);
  return `<svg class="card-svg" viewBox="0 0 240 336" width="100%" height="100%" aria-hidden="true">
    ${corner(rank, card.suit, color)}
    ${center(card, rank, color)}
  </svg>`;
}

/** The back is painted in CSS (gradient and gloss), so it needs no SVG ids. */
export function cardBackSvg(): string {
  return '<span class="card-back-art" aria-hidden="true"></span>';
}

export function recycleSvg(): string {
  return `<svg viewBox="0 0 24 24" width="46%" height="46%" aria-hidden="true">
    <path d="M19 12a7 7 0 1 1-2.05-4.95" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M19 4.5V8h-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}
