/** Windows-style standard scoring, displayed on top of the move score. */
export interface ScoreParts {
  /** Points from moves only (may be negative before the clock is applied). */
  play: number;
  /** 2 points lost for every 10 seconds of play. */
  timePenalty: number;
  /** 700,000 / seconds, added once the game is won. */
  bonus: number;
  total: number;
}

export function scoreParts(playScore: number, elapsedMs: number, won: boolean): ScoreParts {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const timePenalty = Math.floor(seconds / 10) * 2;
  const bonus = won && seconds > 0 ? Math.round(700_000 / seconds) : 0;
  const total = Math.max(0, playScore - timePenalty + bonus);
  return { play: playScore, timePenalty, bonus, total };
}

export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}
