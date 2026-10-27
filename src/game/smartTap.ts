import { findBestMove, findFoundationMove, movingCards } from './engine.ts';
import { suitIndex } from './engine.ts';
import type { Card, GameState, PileRef } from './types.ts';

/**
 * Standard safe rule for sending a card to its foundation. A card of rank r
 * is safe when r is 1 or 2, or when both opposite-colour cards of rank r - 1
 * are already on their foundations (so nothing can still need this card as a
 * place to build on in the tableau).
 */
export function isSafeToAutoplay(state: GameState, card: Card): boolean {
  if (card.rank <= 2) return true;
  const red = card.suit === 'h' || card.suit === 'd';
  const opposite = red ? (['s', 'c'] as const) : (['h', 'd'] as const);
  return opposite.every((suit) => (state.foundations[suitIndex(suit)]?.length ?? 0) >= card.rank - 1);
}

/** The foundation to send the tapped card to when that is both legal and safe. */
export function safeFoundationMove(state: GameState, from: PileRef, index: number): PileRef | null {
  if (from.zone === 'foundation') return null;
  const cards = movingCards(state, from, index);
  const card = cards?.[0];
  if (!card || cards.length !== 1) return null;
  const target = findFoundationMove(state, from, index);
  if (!target) return null;
  return isSafeToAutoplay(state, card) ? target : null;
}

/**
 * What a single tap does. With smart tap on, a safe foundation move wins;
 * otherwise the original rule applies: build on the tableau first, then a
 * foundation (even an unsafe one), then an empty column.
 */
export function tapTarget(state: GameState, from: PileRef, index: number, smart: boolean): PileRef | null {
  if (smart) {
    const safe = safeFoundationMove(state, from, index);
    if (safe) return safe;
  }
  return findBestMove(state, from, index);
}
