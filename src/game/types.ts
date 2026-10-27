export const SUITS = ['s', 'h', 'd', 'c'] as const;
export type Suit = (typeof SUITS)[number];

export const SUIT_NAME: Record<Suit, string> = {
  s: 'Spar',
  h: 'Hjerter',
  d: 'Ruter',
  c: 'Kløver',
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
  /**
   * Points lost to things Angre cannot take back: time, Hint, mistaps and
   * earlier Angre charges. Undo keeps them lost.
   */
  drain: number;
  /** Tableau columns that have already paid the empty-column reward this deal. */
  emptied: number[];
}

export interface GameState extends PileSnapshot {
  version: 1;
  /** Whole seconds of play that the clock has already charged. */
  clockSec: number;
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
