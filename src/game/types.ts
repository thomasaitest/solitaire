export const SUITS = ['s', 'h', 'd', 'c'] as const;
export type Suit = (typeof SUITS)[number];

export const SUIT_NAME: Record<Suit, string> = {
  s: 'spades',
  h: 'hearts',
  d: 'diamonds',
  c: 'clubs',
};

export const RANK_LABEL = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

export const RANK_NAME = [
  '',
  'Ace',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'Jack',
  'Queen',
  'King',
] as const;

export interface Card {
  id: string;
  suit: Suit;
  rank: number;
  faceUp: boolean;
}

export type Zone = 'tableau' | 'foundation' | 'waste' | 'stock';

export interface PileRef {
  zone: Zone;
  index: number;
}

/** A reversible picture of the table. Undo stores these. */
export interface PileSnapshot {
  stock: Card[];
  waste: Card[];
  foundations: Card[][];
  tableau: Card[][];
  score: number;
  moves: number;
  won: boolean;
}

export interface GameState extends PileSnapshot {
  version: 1;
  gameId: string;
  drawCount: 1 | 3;
  seed: number;
  elapsedMs: number;
  undos: PileSnapshot[];
  /** Exact opening layout, used by Restart deal. */
  initial: PileSnapshot;
}

export interface ActionResult {
  ok: boolean;
  state: GameState;
  reason?: string;
}

export interface PlannedMove {
  from: PileRef;
  index: number;
  to: PileRef;
}
