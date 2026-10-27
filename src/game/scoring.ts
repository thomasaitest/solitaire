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

/** The score as a whole number. It can be negative. */
export function shownScore(state: { score: number }): number {
  return Math.round(state.score);
}

/** Score text with a real minus sign for negatives: −12. */
export function formatScore(value: number): string {
  const rounded = Math.round(value);
  const text = Math.abs(rounded).toLocaleString('en-US');
  return rounded < 0 ? `\u2212${text}` : text;
}
