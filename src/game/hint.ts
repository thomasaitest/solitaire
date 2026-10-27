import { draw, legalTargets, moveCards, movingCards } from './engine.ts';
import { isSafeToAutoplay } from './smartTap.ts';
import type { Card, GameState, PileRef } from './types.ts';

export type HintReason = 'reveal' | 'foundation' | 'column' | 'play' | 'setup';

export type Hint =
  | { kind: 'move'; from: PileRef; index: number; to: PileRef; reason: HintReason }
  /** The next progress needs the stock: `draws` presses, then `card` (from the waste) can be played. */
  | { kind: 'draw'; draws: number; recycle: boolean; card: Card | null; to: PileRef | null }
  | { kind: 'none' };

/** A position without score, move count or undo history, for spotting repeats. */
export function stateKey(state: GameState): string {
  const code = (card: Card) => (card.faceUp ? '' : '~') + card.id;
  return [
    state.stock.map(code).join(','),
    state.waste.map(code).join(','),
    state.foundations.map((pile) => pile.length).join(','),
    state.tableau.map((pile) => pile.map(code).join(',')).join('/'),
  ].join('|');
}

type Step = { kind: 'draw' } | { kind: 'move'; from: PileRef; index: number; to: PileRef; card: Card };

interface Node {
  state: GameState;
  parent: Node | null;
  step: Step | null;
  reason: HintReason | null;
}

interface Found {
  node: Node;
  score: number;
}

const MAX_NODES = 14000;
const MAX_MS = 350;

/** A king that could fill an empty column: in the waste, the stock, or face up and not already at a base. */
function kingAvailable(state: GameState): boolean {
  if (state.waste.some((card) => card.rank === 13) || state.stock.some((card) => card.rank === 13)) return true;
  return state.tableau.some((pile) => pile.some((card, i) => i > 0 && card.faceUp && card.rank === 13));
}

function stepsFrom(state: GameState): Step[] {
  const steps: Step[] = [];
  const add = (from: PileRef, index: number) => {
    const cards = movingCards(state, from, index);
    const first = cards?.[0];
    if (!first) return;
    for (const to of legalTargets(state, from, index)) {
      // A king that already sits at the base of its column gains nothing from another empty column.
      if (from.zone === 'tableau' && index === 0 && to.zone === 'tableau' && (state.tableau[to.index]?.length ?? 0) === 0) continue;
      steps.push({ kind: 'move', from, index, to, card: first });
    }
  };
  if (state.waste.length > 0) add({ zone: 'waste', index: 0 }, state.waste.length - 1);
  state.tableau.forEach((pile, pileIndex) => {
    pile.forEach((card, index) => {
      if (card.faceUp) add({ zone: 'tableau', index: pileIndex }, index);
    });
  });
  if (state.stock.length > 0 || state.waste.length > 0) steps.push({ kind: 'draw' });
  return steps;
}

function apply(state: GameState, step: Step): GameState | null {
  const result =
    step.kind === 'draw' ? draw(state) : moveCards(state, step.from, step.index, step.to);
  if (!result.ok) return null;
  return { ...result.state, undos: [] };
}

/**
 * How valuable the progress made by this step is, or 0 for none.
 * Progress means: turning a face-down card up, a card to its foundation, a
 * waste card played onto the tableau, or emptying a column when a king can fill it.
 * A foundation move that is not safe only counts as a fallback (`fallback` true).
 */
function progress(state: GameState, step: Step): { score: number; reason: HintReason; fallback: boolean } | null {
  if (step.kind === 'draw') return null;
  const { from, index, to, card } = step;
  const reveals =
    from.zone === 'tableau' && index > 0 && state.tableau[from.index]?.[index - 1]?.faceUp === false;
  if (reveals) return { score: 100, reason: 'reveal', fallback: false };
  if (to.zone === 'foundation' && from.zone !== 'foundation') {
    return isSafeToAutoplay(state, card)
      ? { score: 90, reason: 'foundation', fallback: false }
      : { score: 30, reason: 'foundation', fallback: true };
  }
  if (from.zone === 'tableau' && index === 0 && to.zone === 'tableau' && kingAvailable(state)) {
    return { score: 70, reason: 'column', fallback: false };
  }
  if (from.zone === 'waste' && to.zone === 'tableau') return { score: 65, reason: 'play', fallback: false };
  return null;
}

interface SearchResult {
  best: Found | null;
  fallback: Found | null;
  capped: boolean;
}

/**
 * Breadth-first search over legal plays (tableau/waste moves and drawing, never
 * foundation back down) for the nearest progress. Because it looks for the
 * shortest path, a shuffle is only suggested when it leads to progress, and
 * following the hints cannot loop.
 */
function search(start: GameState, avoid: Set<string> | null, deadline: number): SearchResult {
  const root: Node = { state: { ...start, undos: [] }, parent: null, step: null, reason: null };
  const visited = new Set<string>([stateKey(root.state)]);
  let level: Node[] = [root];
  let fallback: Found | null = null;
  let expanded = 0;

  while (level.length > 0) {
    const next: Node[] = [];
    let best: Found | null = null;
    for (const node of level) {
      for (const step of stepsFrom(node.state)) {
        if (++expanded > MAX_NODES || performance.now() > deadline) return { best: null, fallback, capped: true };
        const state = apply(node.state, step);
        if (!state) continue;
        const key = stateKey(state);
        if (node === root && avoid?.has(key)) continue;
        const gain = progress(node.state, step);
        const child: Node = { state, parent: node, step, reason: gain?.reason ?? null };
        if (gain && !gain.fallback) {
          if (!best || gain.score > best.score) best = { node: child, score: gain.score };
        } else if (gain && !fallback) {
          fallback = { node: child, score: gain.score };
        }
        if (!visited.has(key)) {
          visited.add(key);
          next.push(child);
        }
      }
    }
    if (best) return { best, fallback, capped: false };
    level = next;
  }
  return { best: null, fallback, capped: false };
}

function pathOf(node: Node): Node[] {
  const path: Node[] = [];
  for (let cur: Node | null = node; cur && cur.parent; cur = cur.parent) path.unshift(cur);
  return path;
}

function toHint(found: Found, start: GameState): Hint {
  const path = pathOf(found.node);
  const first = path[0]?.step;
  if (!first) return { kind: 'none' };
  if (first.kind === 'move') {
    const reason: HintReason = path.length === 1 ? (found.node.reason ?? 'setup') : 'setup';
    return { kind: 'move', from: first.from, index: first.index, to: first.to, reason };
  }
  let draws = 0;
  while (path[draws]?.step?.kind === 'draw') draws++;
  const after = path[draws]?.step;
  const playable = after && after.kind === 'move' && after.from.zone === 'waste' ? after : null;
  return {
    kind: 'draw',
    draws,
    recycle: start.stock.length === 0,
    card: playable?.card ?? null,
    to: playable?.to ?? null,
  };
}

/** Progress that is one move away, used if the full search runs out of time. */
function quickHint(state: GameState): Hint {
  let best: { step: Step; score: number; reason: HintReason } | null = null;
  for (const step of stepsFrom(state)) {
    if (step.kind !== 'move') continue;
    const gain = progress(state, step);
    if (gain && (!best || gain.score > best.score)) best = { step, score: gain.score, reason: gain.reason };
  }
  if (best && best.step.kind === 'move') {
    const { from, index, to } = best.step;
    return { kind: 'move', from, index, to, reason: best.reason };
  }
  if (state.stock.length > 0 || state.waste.length > 0) {
    return { kind: 'draw', draws: 1, recycle: state.stock.length === 0, card: null, to: null };
  }
  return { kind: 'none' };
}

/**
 * The next useful move, looking at the whole table and the stock/waste cycle
 * for the current draw mode. Returns `none` when nothing productive is left,
 * including after cycling through the entire stock.
 * `seen` holds positions already visited this game; first steps back into them are avoided.
 */
export function findHint(state: GameState, seen?: ReadonlySet<string>): Hint {
  if (state.won) return { kind: 'none' };
  const deadline = performance.now() + MAX_MS;
  const avoid = seen && seen.size > 0 ? new Set(seen) : null;

  const first = search(state, avoid, deadline);
  if (first.best) return toHint(first.best, state);
  let second = first;
  if (!first.capped && avoid) {
    second = search(state, null, deadline);
    if (second.best) return toHint(second.best, state);
  }
  if (first.capped || second.capped) return quickHint(state);
  const fallback = first.fallback ?? second.fallback;
  if (fallback) return toHint(fallback, state);
  return { kind: 'none' };
}
