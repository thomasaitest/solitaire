import { describe, expect, it } from 'vitest';
import {
  buildPosition,
  createGame,
  draw,
  findBestMove,
  findFoundationMove,
  hydrate,
  isWon,
  makeCard,
  moveCards,
  planAutoComplete,
  restartDeal,
  undo,
} from './engine.ts';
import { SUITS } from './types.ts';
import type { Card, GameState } from './types.ts';

function ids(cards: Card[]): string[] {
  return cards.map((card) => card.id);
}

function deal(seed = 42, drawCount: 1 | 3 = 3): GameState {
  return createGame({ seed, drawCount, gameId: `game-${seed}-${drawCount}` });
}

function fullFoundations(except: string[] = []): Card[][] {
  const skip = new Set(except);
  return SUITS.map((suit) => {
    const pile: Card[] = [];
    for (let rank = 1; rank <= 13; rank++) {
      const card = makeCard(suit, rank, true);
      if (skip.has(card.id)) break;
      pile.push(card);
    }
    return pile;
  });
}

describe('deal', () => {
  it('lays out a classic klondike tableau and a 24-card stock', () => {
    const state = deal();
    expect(state.tableau.map((pile) => pile.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(state.stock).toHaveLength(24);
    expect(state.waste).toHaveLength(0);
    expect(state.foundations.every((pile) => pile.length === 0)).toBe(true);
    for (const pile of state.tableau) {
      expect(pile.slice(0, -1).every((card) => !card.faceUp)).toBe(true);
      expect(pile[pile.length - 1]?.faceUp).toBe(true);
    }
    expect(state.stock.every((card) => !card.faceUp)).toBe(true);
    const all = [...state.stock, ...state.tableau.flat()];
    expect(new Set(ids(all)).size).toBe(52);
    expect(state.score).toBe(0);
    expect(state.moves).toBe(0);
    expect(isWon(state)).toBe(false);
  });

  it('repeats the same deal for a seed and changes it for another', () => {
    const a = deal(7, 1);
    const b = deal(7, 3);
    const c = deal(8, 3);
    expect(a.tableau.map((pile) => ids(pile))).toEqual(b.tableau.map((pile) => ids(pile)));
    expect(ids(a.stock)).toEqual(ids(b.stock));
    expect(ids(a.stock)).not.toEqual(ids(c.stock));
  });
});

describe('stock', () => {
  it('draws one card face up in draw-1', () => {
    const state = deal(3, 1);
    const top = state.stock[state.stock.length - 1]?.id;
    const result = draw(state);
    expect(result.ok).toBe(true);
    expect(result.state).not.toBe(state);
    expect(state.waste).toHaveLength(0);
    expect(result.state.waste.map((card) => card.id)).toEqual([top]);
    expect(result.state.waste[0]?.faceUp).toBe(true);
    expect(result.state.stock).toHaveLength(23);
    expect(result.state.moves).toBe(1);
    expect(result.state.score).toBe(0);
  });

  it('draws three cards with the last one on top', () => {
    const state = deal(3, 3);
    const stock = ids(state.stock);
    const result = draw(state);
    expect(result.ok).toBe(true);
    const drawn = stock.slice(-3).reverse();
    expect(ids(result.state.waste)).toEqual(drawn);
    expect(result.state.waste.every((card) => card.faceUp)).toBe(true);
    expect(result.state.stock).toHaveLength(21);
  });

  it('draws only the cards that remain', () => {
    let state = buildPosition({
      drawCount: 3,
      stock: [makeCard('s', 1, false), makeCard('h', 2, false)],
      waste: [],
      tableau: [[makeCard('d', 13, true)]],
    });
    // Fill the rest so this is only about the draw count, not a full deck.
    state = { ...state, stock: [makeCard('s', 1, false), makeCard('h', 2, false)] };
    const result = draw(state);
    expect(ids(result.state.waste)).toEqual(['h2', 's1']);
    expect(result.state.stock).toHaveLength(0);
  });

  it('turns the waste over as a unit when the stock is empty', () => {
    const state = buildPosition({
      drawCount: 3,
      stock: [],
      waste: [makeCard('s', 1), makeCard('h', 2), makeCard('d', 3), makeCard('c', 4)],
    });
    const result = draw(state);
    expect(result.ok).toBe(true);
    expect(result.state.waste).toHaveLength(0);
    // The old bottom card is the first one dealt on the next pass.
    expect(ids(result.state.stock)).toEqual(['c4', 'd3', 'h2', 's1']);
    expect(result.state.stock.every((card) => !card.faceUp)).toBe(true);
    expect(result.state.score).toBe(-20);
    const again = draw(result.state);
    expect(ids(again.state.waste)).toEqual(['s1', 'h2', 'd3']);
    expect(ids(again.state.stock)).toEqual(['c4']);
  });

  it('charges more to recycle in draw-1', () => {
    const state = buildPosition({
      drawCount: 1,
      stock: [],
      waste: [makeCard('s', 1), makeCard('h', 2)],
    });
    expect(draw(state).state.score).toBe(-100);
  });

  it('does nothing when both piles are empty', () => {
    const state = buildPosition({ stock: [], waste: [] });
    const result = draw(state);
    expect(result.ok).toBe(false);
    expect(result.state).toBe(state);
  });
});

describe('moves', () => {
  it('builds down in alternating colors and refuses the illegal cousins', () => {
    const state = buildPosition({
      waste: [makeCard('s', 9), makeCard('h', 9)],
      tableau: [[makeCard('s', 10)], [makeCard('h', 10)], [makeCard('c', 8)], [], [], [], []],
    });

    const redOnBlack = moveCards(state, { zone: 'waste', index: 1 }, 1, { zone: 'tableau', index: 0 });
    expect(redOnBlack.ok).toBe(true);
    expect(ids(redOnBlack.state.tableau[0] ?? [])).toEqual(['s10', 'h9']);
    expect(redOnBlack.state.score).toBe(5);
    expect(state.tableau[0]).toHaveLength(1);

    const sameColor = moveCards(state, { zone: 'waste', index: 1 }, 1, { zone: 'tableau', index: 1 });
    expect(sameColor.ok).toBe(false);
    expect(sameColor.state).toBe(state);

    const wrongRank = moveCards(state, { zone: 'waste', index: 1 }, 1, { zone: 'tableau', index: 2 });
    expect(wrongRank.ok).toBe(false);

    const buriedWaste = moveCards(state, { zone: 'waste', index: 0 }, 0, { zone: 'tableau', index: 0 });
    expect(buriedWaste.ok).toBe(false);

    const nonKing = moveCards(state, { zone: 'waste', index: 1 }, 1, { zone: 'tableau', index: 3 });
    expect(nonKing.ok).toBe(false);
  });

  it('moves a face-up run and refuses buried or broken runs', () => {
    const state = buildPosition({
      tableau: [
        [makeCard('h', 13), makeCard('s', 12), makeCard('d', 11)],
        [makeCard('d', 13)],
        [makeCard('c', 9, false), makeCard('h', 8)],
        [makeCard('s', 4), makeCard('h', 4)],
        [],
        [],
        [],
      ],
    });

    const run = moveCards(state, { zone: 'tableau', index: 0 }, 1, { zone: 'tableau', index: 1 });
    expect(run.ok).toBe(true);
    expect(ids(run.state.tableau[1] ?? [])).toEqual(['d13', 's12', 'd11']);
    expect(ids(run.state.tableau[0] ?? [])).toEqual(['h13']);

    const buried = moveCards(state, { zone: 'tableau', index: 2 }, 0, { zone: 'tableau', index: 4 });
    expect(buried.ok).toBe(false);

    const broken = moveCards(state, { zone: 'tableau', index: 3 }, 0, { zone: 'tableau', index: 4 });
    expect(broken.ok).toBe(false);
    const topOnly = moveCards(state, { zone: 'tableau', index: 3 }, 1, { zone: 'tableau', index: 4 });
    expect(topOnly.ok).toBe(false);
  });

  it('turns the uncovered card face up and scores it', () => {
    const state = buildPosition({
      tableau: [
        [makeCard('c', 9, false), makeCard('h', 8)],
        [makeCard('s', 9)],
        [],
        [],
        [],
        [],
        [],
      ],
    });
    const result = moveCards(state, { zone: 'tableau', index: 0 }, 1, { zone: 'tableau', index: 1 });
    expect(result.ok).toBe(true);
    expect(result.state.tableau[0]?.[0]).toMatchObject({ id: 'c9', faceUp: true });
    expect(result.state.score).toBe(5);
    expect(state.tableau[0]?.[0]?.faceUp).toBe(false);
  });

  it('starts a foundation on the ace and climbs in suit', () => {
    const state = buildPosition({
      waste: [makeCard('h', 2), makeCard('s', 2), makeCard('h', 1)],
    });
    const wrongPile = moveCards(state, { zone: 'waste', index: 2 }, 2, { zone: 'foundation', index: 0 });
    expect(wrongPile.ok).toBe(false);

    const ace = moveCards(state, { zone: 'waste', index: 2 }, 2, { zone: 'foundation', index: 1 });
    expect(ace.ok).toBe(true);
    expect(ids(ace.state.foundations[1] ?? [])).toEqual(['h1']);
    expect(ace.state.score).toBe(10);

    const wrongSuit = moveCards(ace.state, { zone: 'waste', index: 1 }, 1, { zone: 'foundation', index: 1 });
    expect(wrongSuit.ok).toBe(false);

    const next = buildPosition({
      waste: [makeCard('h', 2)],
      foundations: [[], [makeCard('h', 1)], [], []],
    });
    const two = moveCards(next, { zone: 'waste', index: 0 }, 0, { zone: 'foundation', index: 1 });
    expect(two.ok).toBe(true);
    expect(ids(two.state.foundations[1] ?? [])).toEqual(['h1', 'h2']);

    const skip = buildPosition({
      waste: [makeCard('h', 3)],
      foundations: [[], [makeCard('h', 1)], [], []],
    });
    expect(moveCards(skip, { zone: 'waste', index: 0 }, 0, { zone: 'foundation', index: 1 }).ok).toBe(false);
  });

  it('only plays the top waste card and the top foundation card', () => {
    const state = buildPosition({
      waste: [makeCard('h', 1), makeCard('s', 13)],
      tableau: [[], [], [], [], [], [], []],
    });
    expect(moveCards(state, { zone: 'waste', index: 0 }, 0, { zone: 'foundation', index: 1 }).ok).toBe(false);

    const back = buildPosition({
      foundations: [[], [makeCard('h', 1)], [], []],
      tableau: [[makeCard('s', 2)], [], [], [], [], [], []],
    });
    const moved = moveCards(back, { zone: 'foundation', index: 1 }, 0, { zone: 'tableau', index: 0 });
    expect(moved.ok).toBe(true);
    expect(moved.state.score).toBe(-15);
    expect(ids(moved.state.tableau[0] ?? [])).toEqual(['s2', 'h1']);
    expect(moveCards(moved.state, { zone: 'foundation', index: 1 }, 0, { zone: 'tableau', index: 1 }).ok).toBe(false);
  });

  it('sends a king, and only a king, into an empty column', () => {
    const state = buildPosition({
      tableau: [[makeCard('c', 2, false), makeCard('s', 13)], [], [], [], [], [], []],
    });
    const moved = moveCards(state, { zone: 'tableau', index: 0 }, 1, { zone: 'tableau', index: 1 });
    expect(moved.ok).toBe(true);
    expect(ids(moved.state.tableau[1] ?? [])).toEqual(['s13']);
    expect(moved.state.tableau[0]?.[0]?.faceUp).toBe(true);
  });
});

describe('tap destinations', () => {
  it('prefers a tableau build, then a foundation, and skips a useless empty column', () => {
    const building = buildPosition({
      waste: [makeCard('h', 7)],
      foundations: [[], [makeCard('h', 1), makeCard('h', 2), makeCard('h', 3), makeCard('h', 4), makeCard('h', 5), makeCard('h', 6)], [], []],
      tableau: [[makeCard('s', 8)], [], [], [], [], [], []],
    });
    expect(findBestMove(building, { zone: 'waste', index: 0 }, 0)).toEqual({ zone: 'tableau', index: 0 });
    expect(findFoundationMove(building, { zone: 'waste', index: 0 }, 0)).toEqual({ zone: 'foundation', index: 1 });

    const ace = buildPosition({ waste: [makeCard('s', 1)], tableau: [[], [], [], [], [], [], []] });
    expect(findBestMove(ace, { zone: 'waste', index: 0 }, 0)).toEqual({ zone: 'foundation', index: 0 });

    const loneKing = buildPosition({
      tableau: [[makeCard('s', 13)], [], [], [], [], [], []],
    });
    expect(findBestMove(loneKing, { zone: 'tableau', index: 0 }, 0)).toBeNull();

    const buriedKing = buildPosition({
      tableau: [[makeCard('h', 2, false), makeCard('s', 13)], [], [], [], [], [], []],
    });
    expect(findBestMove(buriedKing, { zone: 'tableau', index: 0 }, 1)).toEqual({ zone: 'tableau', index: 1 });
  });

  it('will not offer a foundation for a multi-card run', () => {
    const state = buildPosition({
      tableau: [[makeCard('s', 13), makeCard('h', 12)], [], [], [], [], [], []],
    });
    expect(findFoundationMove(state, { zone: 'tableau', index: 0 }, 0)).toBeNull();
    expect(findBestMove(state, { zone: 'tableau', index: 0 }, 1)).toBeNull();
  });
});

describe('undo', () => {
  it('reverses draws, recycles, moves, and flips without rewinding the clock', () => {
    let state = deal(11, 3);
    state = { ...state, elapsedMs: 1000 };
    const drawn = draw(state).state;
    const recycled = (() => {
      let cursor = drawn;
      while (cursor.stock.length > 0) cursor = draw(cursor).state;
      return draw(cursor).state;
    })();
    expect(recycled.stock.length).toBeGreaterThan(0);
    expect(recycled.waste).toHaveLength(0);

    const undoneRecycle = undo({ ...recycled, elapsedMs: 4000 });
    expect(undoneRecycle.ok).toBe(true);
    expect(undoneRecycle.state.elapsedMs).toBe(4000);
    expect(undoneRecycle.state.waste.length).toBeGreaterThan(0);
    expect(undoneRecycle.state.stock).toHaveLength(0);

    const flipCase = buildPosition({
      elapsedMs: 50,
      tableau: [
        [makeCard('c', 4, false), makeCard('h', 3)],
        [makeCard('s', 4)],
        [],
        [],
        [],
        [],
        [],
      ],
      score: 15,
      moves: 2,
    });
    const moved = moveCards(flipCase, { zone: 'tableau', index: 0 }, 1, { zone: 'tableau', index: 1 }).state;
    expect(moved.tableau[0]?.[0]?.faceUp).toBe(true);
    const back = undo({ ...moved, elapsedMs: 90 }).state;
    expect(back.elapsedMs).toBe(90);
    expect(back.tableau[0]?.[0]).toMatchObject({ id: 'c4', faceUp: false });
    expect(ids(back.tableau[0] ?? [])).toEqual(['c4', 'h3']);
    expect(back.score).toBe(15);
    expect(back.moves).toBe(2);
    expect(undo(back).ok).toBe(false);
  });

  it('walks back several actions to the exact earlier table', () => {
    const start = deal(21, 1);
    const first = draw(start).state;
    const second = draw(first).state;
    const third = draw(second).state;
    const twice = undo(undo(third).state).state;
    expect(ids(twice.waste)).toEqual(ids(first.waste));
    expect(ids(twice.stock)).toEqual(ids(first.stock));
    expect(twice.moves).toBe(1);
    const origin = undo(twice).state;
    expect(origin.moves).toBe(0);
    expect(origin.waste).toHaveLength(0);
    expect(ids(origin.stock)).toEqual(ids(start.stock));
  });
});

describe('win and auto-complete', () => {
  it('detects a cleared deck and lets undo reopen it', () => {
    const foundations = SUITS.map((suit) => {
      const pile: Card[] = [];
      for (let rank = 1; rank <= 13; rank++) pile.push(makeCard(suit, rank, true));
      return pile;
    });
    const won = buildPosition({ foundations });
    expect(isWon(won)).toBe(true);
    expect(draw(won).ok).toBe(false);
    expect(planAutoComplete(won)).toBeNull();

    const almost = buildPosition({
      foundations: fullFoundations(['s13', 'h13', 'd13', 'c13']),
      tableau: [[makeCard('s', 13)], [makeCard('h', 13)], [makeCard('d', 13)], [makeCard('c', 13)], [], [], []],
      score: 100,
      moves: 40,
    });
    expect(almost.won).toBe(false);
    const plan = planAutoComplete(almost);
    expect(plan).toHaveLength(4);
    let cursor = almost;
    for (const step of plan ?? []) {
      const applied = moveCards(cursor, step.from, step.index, step.to);
      expect(applied.ok).toBe(true);
      cursor = applied.state;
    }
    expect(isWon(cursor)).toBe(true);
    expect(cursor.score).toBe(140);
    const reopened = undo(cursor).state;
    expect(reopened.won).toBe(false);
    expect(reopened.foundations.some((pile) => pile.length === 12)).toBe(true);
  });

  it('finishes a waste pile when the cards are in order and stops when they are not', () => {
    const ready = buildPosition({
      foundations: fullFoundations(['h13']),
      waste: [makeCard('h', 13)],
    });
    const plan = planAutoComplete(ready);
    expect(plan).toHaveLength(1);
    const done = moveCards(ready, plan![0]!.from, plan![0]!.index, plan![0]!.to).state;
    expect(done.won).toBe(true);

    const blocked = buildPosition({
      waste: [makeCard('h', 1), makeCard('h', 13)],
      foundations: [[], [], [], []],
    });
    expect(planAutoComplete(blocked)).toBeNull();
  });

  it('does not auto-complete while any card is still face down', () => {
    const hidden = buildPosition({
      foundations: fullFoundations(['s13']),
      tableau: [[makeCard('s', 13, false)], [], [], [], [], [], []],
    });
    expect(planAutoComplete(hidden)).toBeNull();
    const stocked = buildPosition({
      foundations: fullFoundations(['s13']),
      stock: [makeCard('s', 13, false)],
    });
    expect(planAutoComplete(stocked)).toBeNull();
  });
});

describe('restart and resume', () => {
  it('replays the opening deal and clears the score, clock, and undo stack', () => {
    const start = deal(99, 1);
    const mid = draw(draw(start).state).state;
    const restarted = restartDeal({ ...mid, elapsedMs: 8000 });
    expect(ids(restarted.stock)).toEqual(ids(start.stock));
    expect(restarted.tableau.map((pile) => pile.map((card) => `${card.id}:${card.faceUp}`))).toEqual(
      start.tableau.map((pile) => pile.map((card) => `${card.id}:${card.faceUp}`)),
    );
    expect(restarted.moves).toBe(0);
    expect(restarted.score).toBe(0);
    expect(restarted.elapsedMs).toBe(0);
    expect(restarted.undos).toHaveLength(0);
    expect(restarted.waste).toHaveLength(0);
    expect(restarted.gameId).toBe(start.gameId);
  });

  it('round-trips a game through JSON and drops a corrupt save', () => {
    const moved = draw(deal(5, 3)).state;
    const saved = hydrate(JSON.parse(JSON.stringify(moved)) as unknown);
    expect(saved).not.toBeNull();
    expect(ids(saved!.waste)).toEqual(ids(moved.waste));
    expect(saved!.undos).toHaveLength(moved.undos.length);
    expect(saved!.seed).toBe(moved.seed);
    expect(hydrate('not json')).toBeNull();
    expect(hydrate({ ...moved, version: 2 })).toBeNull();
    expect(hydrate({ ...moved, stock: moved.stock.slice(1) })).toBeNull();
  });
});
