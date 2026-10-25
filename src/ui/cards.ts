import { RANK_LABEL, SUIT_NAME } from '../game/types.ts';
import type { Card, Suit } from '../game/types.ts';

const RED = '#c5162c';
const BLACK = '#1c1917';

export function cardColor(suit: Suit): string {
  return suit === 'h' || suit === 'd' ? RED : BLACK;
}

export function cardLabel(card: Card): string {
  if (!card.faceUp) return 'Face-down card';
  return `${RANK_NAME(card.rank)} of ${SUIT_NAME[card.suit]}`;
}

function RANK_NAME(rank: number): string {
  return ['', 'Ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Jack', 'Queen', 'King'][rank] ?? String(rank);
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

function pip(suit: Suit, x: number, y: number, size: number, invert: boolean, color: string): string {
  const scale = size / 100;
  const turn = invert ? ' rotate(180)' : '';
  return `<g transform="translate(${x} ${y})${turn} scale(${scale})" fill="${color}"><g transform="translate(-50 -50)">${suitPaths(suit)}</g></g>`;
}

const PIPS: Record<number, Array<[number, number, boolean]>> = {
  1: [[120, 188, false]],
  2: [[120, 132, false], [120, 236, true]],
  3: [[120, 124, false], [120, 184, false], [120, 244, true]],
  4: [[76, 128, false], [164, 128, false], [76, 236, true], [164, 236, true]],
  5: [[76, 124, false], [164, 124, false], [120, 184, false], [76, 244, true], [164, 244, true]],
  6: [[76, 118, false], [164, 118, false], [76, 184, false], [164, 184, false], [76, 250, true], [164, 250, true]],
  7: [[76, 114, false], [164, 114, false], [120, 150, false], [76, 186, false], [164, 186, false], [76, 252, true], [164, 252, true]],
  8: [[76, 112, false], [164, 112, false], [120, 146, false], [76, 178, false], [164, 178, false], [120, 220, true], [76, 252, true], [164, 252, true]],
  9: [[76, 110, false], [164, 110, false], [76, 148, false], [164, 148, false], [120, 184, false], [76, 220, true], [164, 220, true], [76, 256, true], [164, 256, true]],
  10: [[76, 108, false], [164, 108, false], [120, 132, false], [76, 154, false], [164, 154, false], [76, 210, true], [164, 210, true], [120, 232, true], [76, 256, true], [164, 256, true]],
};

function corner(rank: string, suit: Suit, color: string): string {
  const wide = rank.length > 1;
  const font = wide ? 52 : 66;
  const suitAt = wide ? 112 : 92;
  return `
    <text x="16" y="62" fill="${color}" font-size="${font}" font-family="Georgia, 'Iowan Old Style', Palatino, 'Times New Roman', serif" font-weight="700">${rank}</text>
    ${pip(suit, suitAt, 40, 34, false, color)}
  `;
}

function faceArt(rank: string, suit: Suit, color: string): string {
  return `
    <rect x="58" y="112" width="124" height="124" rx="14" fill="none" stroke="${color}" stroke-width="2.4"/>
    <rect x="68" y="122" width="104" height="104" rx="8" fill="none" stroke="${color}" stroke-width="1" opacity="0.55"/>
    <text x="120" y="186" text-anchor="middle" fill="${color}" font-size="72" font-family="Georgia, 'Iowan Old Style', Palatino, serif">${rank}</text>
    <g transform="translate(120 214)">${pip(suit, 0, 0, 34, false, color)}</g>
  `;
}

function pipsFor(card: Card, color: string): string {
  const spots = PIPS[card.rank] ?? [];
  const size = card.rank === 1 ? 108 : card.rank >= 9 ? 26 : card.rank >= 7 ? 30 : 34;
  return spots.map(([x, y, invert]) => pip(card.suit, x, y, size, invert && card.rank !== 1, color)).join('');
}

export function cardFaceSvg(card: Card): string {
  const color = cardColor(card.suit);
  const rank = RANK_LABEL[card.rank] ?? String(card.rank);
  const center = card.rank >= 11 ? faceArt(rank, card.suit, color) : pipsFor(card, color);
  const index = corner(rank, card.suit, color);
  return `<svg class="card-svg" viewBox="0 0 240 336" width="100%" height="100%" aria-hidden="true">
    ${index}
    <g transform="rotate(180 120 168)">${index}</g>
    ${center}
  </svg>`;
}

export function cardBackSvg(): string {
  return `<svg class="card-svg" viewBox="0 0 240 336" width="100%" height="100%" aria-hidden="true">
    <rect width="240" height="336" fill="#7a1f34"/>
    <rect x="11" y="11" width="218" height="314" rx="16" fill="#64182c" stroke="#e6d3a1" stroke-width="2.5"/>
    <rect x="20" y="20" width="200" height="296" rx="12" fill="none" stroke="#e6d3a1" stroke-width="1" opacity="0.8"/>
    <path d="M120 118L156 168L120 218L84 168Z" fill="none" stroke="#e6d3a1" stroke-width="2"/>
    <path d="M120 136L144 168L120 200L96 168Z" fill="#e6d3a1"/>
    <circle cx="36" cy="36" r="3.2" fill="#e6d3a1"/>
    <circle cx="204" cy="36" r="3.2" fill="#e6d3a1"/>
    <circle cx="36" cy="300" r="3.2" fill="#e6d3a1"/>
    <circle cx="204" cy="300" r="3.2" fill="#e6d3a1"/>
  </svg>`;
}

export function recycleSvg(): string {
  return `<svg viewBox="0 0 24 24" width="46%" height="46%" aria-hidden="true">
    <path d="M19 12a7 7 0 1 1-2.05-4.95" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M19 4.5V8h-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}
