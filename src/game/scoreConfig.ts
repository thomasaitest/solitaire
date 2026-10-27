/**
 * Every scoring number in one place. Tweak here; the rules text in Valg is
 * built from these values, so it stays in sync.
 *
 * Costs are positive numbers that are subtracted; rewards are added.
 * The score has no floor: it can go negative.
 */
export const SCORE = {
  /** The score at the start of every deal (also after Start på nytt). */
  startScore: 0,

  /** Charged for every move, including drawing from the stock. */
  movePenalty: 1,
  /** Extra charge for flipping the waste back into the stock. */
  recyclePenalty: 5,
  /** Tapping a movable card that has nowhere to go. Not a move. */
  mistapPenalty: 3,
  /** Charged every second while the clock runs. */
  secondPenalty: 1,
  /** Hint (once per hint on screen) and every Angre. */
  hintPenalty: 10,
  undoPenalty: 10,

  /** A card goes up to a foundation. Taking it back down costs the same. */
  foundationReward: 15,
  /** Turning a face-down tableau card. */
  revealReward: 10,
  /** Waste to tableau. */
  wasteToTableauReward: 5,
  /** Emptying a tableau column, once per column per deal. */
  emptyColumnReward: 10,
  /** Completing the game. */
  winReward: 200,
} as const;

export type ScoreConfig = typeof SCORE;
