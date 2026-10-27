import type { ActionResult, Card, GameState, PileRef, PileSnapshot, PlannedMove, Suit } from './types.ts';
import { SUITS } from './types.ts';
import { SCORE } from './scoreConfig.ts';

const MAX_UNDO = 300;

export function suitIndex(suit: Suit): number {
  return SUITS.indexOf(suit);
}

export function isRed(card: Card): boolean {
  return card.suit === 'h' || card.suit === 'd';
}

export function makeCard(suit: Suit, rank: number, faceUp = true): Card {
  return { id: `${suit}${rank}`, suit, rank, faceUp };
}

export function samePile(a: PileRef, b: PileRef): boolean {
  return a.zone === b.zone && a.index === b.index;
}

/** A card may sit on `under` in the tableau. `under` null means an empty column. */
export function fitsTableau(card: Card, under: Card | null): boolean {
  if (!under) return card.rank === 13;
  return card.rank === under.rank - 1 && isRed(card) !== isRed(under);
}

export function isWon(state: GameState): boolean {
  return state.foundations.every((pile) => pile.length === 13);
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const swap = arr[i];
    arr[i] = arr[j] as T;
    arr[j] = swap as T;
  }
  return arr;
}

export function createDeck(): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank++) cards.push(makeCard(suit, rank, false));
  }
  return cards;
}

function cloneCard(card: Card): Card {
  return { ...card };
}

function cloneSnapshot(snapshot: PileSnapshot): PileSnapshot {
  return {
    stock: snapshot.stock.map(cloneCard),
    waste: snapshot.waste.map(cloneCard),
    foundations: snapshot.foundations.map((pile) => pile.map(cloneCard)),
    tableau: snapshot.tableau.map((pile) => pile.map(cloneCard)),
    score: snapshot.score,
    moves: snapshot.moves,
    won: snapshot.won,
    drain: Number.isFinite(snapshot.drain) ? snapshot.drain : 0,
    emptied: Array.isArray(snapshot.emptied)
      ? snapshot.emptied.filter((col) => Number.isInteger(col) && col >= 0 && col < 7)
      : [],
  };
}

function snapshotOf(state: GameState): PileSnapshot {
  return cloneSnapshot(state);
}

function emptyFoundations(): Card[][] {
  return [[], [], [], []];
}

function emptyTableau(): Card[][] {
  return [[], [], [], [], [], [], []];
}

function withPiles(state: GameState, piles: PileSnapshot): GameState {
  return {
    ...state,
    stock: piles.stock,
    waste: piles.waste,
    foundations: piles.foundations,
    tableau: piles.tableau,
    score: piles.score,
    moves: piles.moves,
    won: piles.won,
    drain: piles.drain,
    emptied: piles.emptied,
  };
}

function clonePlayfield(state: GameState): GameState {
  return withPiles(state, snapshotOf(state));
}

function foundationDest(state: GameState, card: Card): PileRef | null {
  const index = suitIndex(card.suit);
  const pile = state.foundations[index];
  if (!pile) return null;
  if (pile.length === 0) return card.rank === 1 ? { zone: 'foundation', index } : null;
  const top = pile[pile.length - 1];
  if (!top) return null;
  return card.rank === top.rank + 1 ? { zone: 'foundation', index } : null;
}

/**
 * Cards that would move if the player picked up `index` in `from`.
 * Tableau moves take that card and every card above it, and only when the
 * run is face up and already alternating.
 */
export function movingCards(state: GameState, from: PileRef, index: number): Card[] | null {
  if (from.zone === 'waste') {
    if (index !== state.waste.length - 1 || index < 0) return null;
    const card = state.waste[index];
    return card?.faceUp ? [card] : null;
  }
  if (from.zone === 'foundation') {
    const pile = state.foundations[from.index];
    if (!pile || pile.length === 0 || index !== pile.length - 1) return null;
    const card = pile[index];
    return card ? [card] : null;
  }
  if (from.zone === 'tableau') {
    const pile = state.tableau[from.index];
    if (!pile || index < 0 || index >= pile.length) return null;
    const stack = pile.slice(index);
    if (stack.some((card) => !card.faceUp)) return null;
    for (let i = 1; i < stack.length; i++) {
      const lower = stack[i - 1];
      const upper = stack[i];
      if (!lower || !upper || !fitsTableau(upper, lower)) return null;
    }
    return stack;
  }
  return null;
}

export function legalTargets(state: GameState, from: PileRef, index: number): PileRef[] {
  if (state.won) return [];
  const cards = movingCards(state, from, index);
  if (!cards || cards.length === 0) return [];
  const bottom = cards[0];
  if (!bottom) return [];
  const targets: PileRef[] = [];
  if (cards.length === 1) {
    const foundation = foundationDest(state, bottom);
    if (foundation && !samePile(foundation, from)) targets.push(foundation);
  }
  for (let i = 0; i < 7; i++) {
    if (from.zone === 'tableau' && from.index === i) continue;
    const pile = state.tableau[i] ?? [];
    const top = pile.length > 0 ? (pile[pile.length - 1] ?? null) : null;
    if (top && !top.faceUp) continue;
    if (fitsTableau(bottom, top)) targets.push({ zone: 'tableau', index: i });
  }
  return targets;
}

/**
 * Single tap destination.
 * Building on a tableau pile comes first. A foundation move is used when
 * nothing can be built on. An empty column is a last resort, and a king
 * that is already the base of its column is left where it is.
 */
export function findBestMove(state: GameState, from: PileRef, index: number): PileRef | null {
  const cards = movingCards(state, from, index);
  if (!cards || cards.length === 0) return null;
  const targets = legalTargets(state, from, index);
  const build = targets.find((target) => target.zone === 'tableau' && (state.tableau[target.index]?.length ?? 0) > 0);
  if (build) return build;
  const foundation = targets.find((target) => target.zone === 'foundation');
  if (foundation) return foundation;
  const empty = targets.find((target) => target.zone === 'tableau' && (state.tableau[target.index]?.length ?? 0) === 0);
  if (!empty) return null;
  if (from.zone === 'tableau' && index === 0) return null;
  return empty;
}

export function findFoundationMove(state: GameState, from: PileRef, index: number): PileRef | null {
  return legalTargets(state, from, index).find((target) => target.zone === 'foundation') ?? null;
}

function pushUndo(state: GameState, before: PileSnapshot): PileSnapshot[] {
  const undos = [...state.undos, before];
  if (undos.length > MAX_UNDO) undos.splice(0, undos.length - MAX_UNDO);
  return undos;
}

export function moveCards(state: GameState, from: PileRef, index: number, to: PileRef): ActionResult {
  if (state.won) return { ok: false, state, reason: 'complete' };
  const moving = movingCards(state, from, index);
  if (!moving) return { ok: false, state, reason: 'stuck' };
  const allowed = legalTargets(state, from, index);
  if (!allowed.some((target) => samePile(target, to))) return { ok: false, state, reason: 'illegal' };

  const before = snapshotOf(state);
  const next = clonePlayfield(state);
  const destWasEmpty = to.zone === 'tableau' && (state.tableau[to.index]?.length ?? 0) === 0;
  let flipped = false;

  let cards: Card[];
  if (from.zone === 'waste') {
    const card = next.waste.pop();
    if (!card) return { ok: false, state, reason: 'stuck' };
    cards = [card];
  } else if (from.zone === 'foundation') {
    const card = next.foundations[from.index]?.pop();
    if (!card) return { ok: false, state, reason: 'stuck' };
    cards = [card];
  } else if (from.zone === 'tableau') {
    const pile = next.tableau[from.index];
    if (!pile) return { ok: false, state, reason: 'stuck' };
    cards = pile.splice(index);
    const uncovered = pile[pile.length - 1];
    if (uncovered && !uncovered.faceUp) {
      uncovered.faceUp = true;
      flipped = true;
    }
  } else {
    return { ok: false, state, reason: 'stuck' };
  }

  if (to.zone === 'foundation') {
    next.foundations[to.index]?.push(...cards);
  } else if (to.zone === 'tableau') {
    next.tableau[to.index]?.push(...cards);
  } else {
    return { ok: false, state, reason: 'illegal' };
  }

  // The score has no floor, so every reward and cost counts in full. That is
  // what makes foundation shuttling a pure loss: +15 up, -15 down, -1 each move.
  let balance = state.score;
  const emptiedColumns = [...state.emptied];
  if (to.zone === 'foundation' && from.zone !== 'foundation') balance += SCORE.foundationReward;
  if (from.zone === 'foundation' && to.zone === 'tableau') balance -= SCORE.foundationReward;
  if (from.zone === 'waste' && to.zone === 'tableau') balance += SCORE.wasteToTableauReward;
  if (flipped) balance += SCORE.revealReward;
  // Emptying a column pays once per column per deal. Moving a column's base
  // card into another empty column only relocates the gap, so it pays nothing.
  if (
    from.zone === 'tableau' &&
    index === 0 &&
    (next.tableau[from.index]?.length ?? 0) === 0 &&
    !destWasEmpty &&
    !emptiedColumns.includes(from.index)
  ) {
    balance += SCORE.emptyColumnReward;
    emptiedColumns.push(from.index);
  }
  next.moves = state.moves + 1;
  next.won = isWon(next);
  if (next.won) balance += SCORE.winReward;
  next.score = balance - SCORE.movePenalty;
  next.emptied = emptiedColumns;
  next.undos = pushUndo(state, before);
  return { ok: true, state: next };
}

export function draw(state: GameState): ActionResult {
  if (state.won) return { ok: false, state, reason: 'complete' };
  if (state.stock.length === 0 && state.waste.length === 0) {
    return { ok: false, state, reason: 'empty' };
  }

  const before = snapshotOf(state);
  const next = clonePlayfield(state);
  let cost = SCORE.movePenalty;

  if (next.stock.length === 0) {
    // Flip the waste as one pile. The oldest waste card is dealt first next pass.
    next.stock = [...next.waste].reverse().map((card) => ({ ...card, faceUp: false }));
    next.waste = [];
    cost += SCORE.recyclePenalty;
  } else {
    const count = Math.min(state.drawCount, next.stock.length);
    for (let i = 0; i < count; i++) {
      const card = next.stock.pop();
      if (!card) break;
      card.faceUp = true;
      next.waste.push(card);
    }
  }

  next.score = state.score - cost;
  next.moves = state.moves + 1;
  next.won = false;
  next.undos = pushUndo(state, before);
  return { ok: true, state: next };
}

export function undo(state: GameState): ActionResult {
  const previous = state.undos[state.undos.length - 1];
  if (!previous) return { ok: false, state, reason: 'nothing' };
  const restored = cloneSnapshot(previous);
  // Back to the score from before the undone move, minus everything lost
  // since then that is not part of a move (clock, Hint, mistaps). Points won
  // by the undone move are gone with it.
  const lost = Math.max(0, state.drain - restored.drain);
  restored.score -= lost;
  restored.drain = state.drain;
  const next = withPiles(state, restored);
  next.undos = state.undos.slice(0, -1);
  next.elapsedMs = state.elapsedMs;
  return { ok: true, state: next };
}

export function restartDeal(state: GameState): GameState {
  const restored = cloneSnapshot(state.initial);
  return {
    ...state,
    ...restored,
    elapsedMs: 0,
    clockSec: 0,
    undos: [],
  };
}

function lowestFoundationMove(state: GameState): PlannedMove | null {
  const candidates: { rank: number; order: number; move: PlannedMove }[] = [];
  const consider = (from: PileRef, index: number, card: Card, order: number) => {
    const to = foundationDest(state, card);
    if (!to || samePile(to, from)) return;
    candidates.push({ rank: card.rank, order, move: { from, index, to } });
  };

  state.tableau.forEach((pile, pileIndex) => {
    const card = pile[pile.length - 1];
    if (!card?.faceUp) return;
    consider({ zone: 'tableau', index: pileIndex }, pile.length - 1, card, pileIndex);
  });

  const wasteTop = state.waste[state.waste.length - 1];
  if (wasteTop) {
    consider({ zone: 'waste', index: 0 }, state.waste.length - 1, wasteTop, 100);
  }
  candidates.sort((a, b) => a.rank - b.rank || a.order - b.order);
  return candidates[0]?.move ?? null;
}

/**
 * When every card is face up, finish the game if repeatedly sending the
 * lowest legal card home will clear the table. Waste may still hold cards;
 * if their order cannot be cleared this way, returns null and play continues.
 */
export function planAutoComplete(state: GameState): PlannedMove[] | null {
  if (state.won) return null;
  if (state.stock.length > 0) return null;
  if (state.tableau.some((pile) => pile.some((card) => !card.faceUp))) return null;

  let sim = state;
  const plan: PlannedMove[] = [];
  for (let guard = 0; guard < 60; guard++) {
    if (isWon(sim)) return plan;
    const move = lowestFoundationMove(sim);
    if (!move) return null;
    const applied = moveCards(sim, move.from, move.index, move.to);
    if (!applied.ok) return null;
    sim = applied.state;
    plan.push(move);
  }
  return isWon(sim) ? plan : null;
}

export interface CreateGameOptions {
  drawCount?: 1 | 3;
  seed?: number;
  gameId?: string;
}

function randomSeed(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] || 1;
  }
  return Math.floor(Math.random() * 0xffffffff) || 1;
}

export function createGame(options: CreateGameOptions = {}): GameState {
  const seed = (options.seed ?? randomSeed()) >>> 0 || 1;
  const drawCount: 1 | 3 = options.drawCount === 1 ? 1 : 3;
  const deck = shuffle(createDeck(), mulberry32(seed));
  const tableau = emptyTableau();
  let cursor = 0;
  for (let pile = 0; pile < 7; pile++) {
    for (let depth = 0; depth <= pile; depth++) {
      const card = deck[cursor++];
      if (!card) continue;
      tableau[pile]?.push({ ...card, faceUp: depth === pile });
    }
  }
  const stock = deck.slice(cursor).map((card) => ({ ...card, faceUp: false }));
  const foundations = emptyFoundations();
  const waste: Card[] = [];
  const initial: PileSnapshot = {
    stock: stock.map(cloneCard),
    waste: [],
    foundations: foundations.map((pile) => pile.map(cloneCard)),
    tableau: tableau.map((pile) => pile.map(cloneCard)),
    score: SCORE.startScore,
    moves: 0,
    won: false,
    drain: 0,
    emptied: [],
  };
  return {
    version: 1,
    clockSec: 0,
    drain: 0,
    emptied: [],
    gameId: options.gameId ?? `${seed.toString(36)}-${Date.now().toString(36)}`,
    drawCount,
    seed,
    elapsedMs: 0,
    stock,
    waste,
    foundations,
    tableau,
    score: SCORE.startScore,
    moves: 0,
    won: false,
    undos: [],
    initial,
  };
}

export interface BuildPositionInput {
  drawCount?: 1 | 3;
  seed?: number;
  gameId?: string;
  stock?: Card[];
  waste?: Card[];
  foundations?: Card[][];
  tableau?: Card[][];
  score?: number;
  moves?: number;
  elapsedMs?: number;
  emptied?: number[];
  drain?: number;
  clockSec?: number;
}

/** Build a position for tests and for resuming a save. Does not validate. */
export function buildPosition(input: BuildPositionInput = {}): GameState {
  const foundations = emptyFoundations().map((pile, index) => (input.foundations?.[index] ?? pile).map(cloneCard));
  const tableau = emptyTableau().map((pile, index) => (input.tableau?.[index] ?? pile).map(cloneCard));
  const stock = (input.stock ?? []).map(cloneCard);
  const waste = (input.waste ?? []).map(cloneCard);
  const won = foundations.every((pile) => pile.length === 13);
  const initial: PileSnapshot = {
    stock: stock.map(cloneCard),
    waste: waste.map(cloneCard),
    foundations: foundations.map((pile) => pile.map(cloneCard)),
    tableau: tableau.map((pile) => pile.map(cloneCard)),
    score: 0,
    moves: 0,
    won: false,
    drain: 0,
    emptied: [],
  };
  return {
    version: 1,
    clockSec: input.clockSec ?? Math.floor((input.elapsedMs ?? 0) / 1000),
    drain: input.drain ?? 0,
    emptied: [...(input.emptied ?? [])],
    gameId: input.gameId ?? 'position',
    drawCount: input.drawCount === 1 ? 1 : 3,
    seed: input.seed ?? 1,
    elapsedMs: input.elapsedMs ?? 0,
    stock,
    waste,
    foundations,
    tableau,
    score: input.score ?? 0,
    moves: input.moves ?? 0,
    won,
    undos: [],
    initial,
  };
}

function isSuit(value: unknown): value is Suit {
  return value === 's' || value === 'h' || value === 'd' || value === 'c';
}

function isCard(value: unknown): value is Card {
  if (!value || typeof value !== 'object') return false;
  const card = value as Card;
  return (
    isSuit(card.suit) &&
    Number.isInteger(card.rank) &&
    card.rank >= 1 &&
    card.rank <= 13 &&
    typeof card.faceUp === 'boolean' &&
    card.id === `${card.suit}${card.rank}`
  );
}

function allCards(snapshot: PileSnapshot): Card[] {
  return [
    ...snapshot.stock,
    ...snapshot.waste,
    ...snapshot.foundations.flat(),
    ...snapshot.tableau.flat(),
  ];
}

function isValidSnapshot(value: unknown): value is PileSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as PileSnapshot;
  if (!Array.isArray(snapshot.stock) || !Array.isArray(snapshot.waste)) return false;
  if (!Array.isArray(snapshot.foundations) || snapshot.foundations.length !== 4) return false;
  if (!Array.isArray(snapshot.tableau) || snapshot.tableau.length !== 7) return false;
  const piles = [
    ...snapshot.foundations,
    ...snapshot.tableau,
    snapshot.stock,
    snapshot.waste,
  ];
  if (piles.some((pile) => !Array.isArray(pile) || pile.some((card) => !isCard(card)))) return false;
  if (snapshot.stock.some((card) => card.faceUp)) return false;
  if (snapshot.waste.some((card) => !card.faceUp)) return false;
  for (let i = 0; i < 4; i++) {
    const pile = snapshot.foundations[i] ?? [];
    for (let n = 0; n < pile.length; n++) {
      const card = pile[n];
      if (!card || suitIndex(card.suit) !== i || card.rank !== n + 1 || !card.faceUp) return false;
    }
  }
  for (const pile of snapshot.tableau) {
    let up = false;
    for (let i = 0; i < pile.length; i++) {
      const card = pile[i];
      if (!card) return false;
      if (!card.faceUp) {
        if (up) return false;
      } else {
        up = true;
        const under = pile[i - 1];
        if (under?.faceUp && !fitsTableau(card, under)) return false;
      }
    }
  }
  const cards = allCards(snapshot);
  if (cards.length !== 52) return false;
  if (new Set(cards.map((card) => card.id)).size !== 52) return false;
  if (typeof snapshot.score !== 'number' || typeof snapshot.moves !== 'number') return false;
  if (typeof snapshot.won !== 'boolean') return false;
  return true;
}

export function hydrate(raw: unknown): GameState | null {
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const data = value as GameState;
  if (data.version !== 1) return null;
  if (data.drawCount !== 1 && data.drawCount !== 3) return null;
  if (typeof data.gameId !== 'string' || data.gameId.length === 0) return null;
  if (typeof data.seed !== 'number' || typeof data.elapsedMs !== 'number') return null;
  if (!isValidSnapshot(data) || !isValidSnapshot(data.initial)) return null;
  // Saves from before the points system have no clock counter. Keep their
  // score and start charging the clock from now.
  const legacy = typeof data.clockSec !== 'number';
  const fix = (snapshot: PileSnapshot): PileSnapshot => {
    const copy = cloneSnapshot(snapshot);
    if (legacy) {
      copy.drain = 0;
      copy.emptied = [];
    }
    return copy;
  };
  const undos = Array.isArray(data.undos) && data.undos.every((entry) => isValidSnapshot(entry))
    ? data.undos.map((entry) => fix(entry))
    : [];
  const state = withPiles(clonePlayfield({ ...data, undos: [], initial: fix(data.initial) }), fix(data));
  state.version = 1;
  state.gameId = data.gameId;
  state.drawCount = data.drawCount;
  state.seed = data.seed >>> 0;
  state.elapsedMs = Math.max(0, data.elapsedMs);
  state.clockSec = legacy ? Math.floor(state.elapsedMs / 1000) : Math.max(0, Math.floor(data.clockSec));
  state.undos = undos;
  state.initial = fix(data.initial);
  state.won = isWon(state);
  return state;
}
