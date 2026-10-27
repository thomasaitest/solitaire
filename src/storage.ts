import { hydrate } from './game/engine.ts';
import { emptyStats } from './game/stats.ts';
import type { GameState } from './game/types.ts';
import type { PendingWin, Stats } from './game/stats.ts';

const GAME_KEY = 'klondike-game-v1';
const STATS_KEY = 'klondike-stats-v1';
const SETTINGS_KEY = 'klondike-settings-v1';

export interface Settings {
  theme: 'felt' | 'night';
  drawCount: 1 | 3;
  installHintDismissed: boolean;
  /** A tap sends a legal, safe card to its foundation before trying the tableau. */
  smartTap: boolean;
}

function bucket(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function readJson(key: string): unknown {
  const store = bucket();
  if (!store) return null;
  const raw = store.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  const store = bucket();
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode and full disks should not stop the game.
  }
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function defaultSettings(): Settings {
  const night =
    typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  return {
    theme: night ? 'night' : 'felt',
    drawCount: 3,
    installHintDismissed: false,
    smartTap: true,
  };
}

export function loadSettings(): Settings {
  const value = readJson(SETTINGS_KEY);
  const defaults = defaultSettings();
  if (!value || typeof value !== 'object') return defaults;
  const data = value as Partial<Settings>;
  return {
    theme: data.theme === 'night' || data.theme === 'felt' ? data.theme : defaults.theme,
    drawCount: data.drawCount === 1 ? 1 : data.drawCount === 3 ? 3 : defaults.drawCount,
    installHintDismissed: data.installHintDismissed === true,
    smartTap: data.smartTap !== false,
  };
}

export function saveSettings(settings: Settings): void {
  writeJson(SETTINGS_KEY, settings);
}

function pendingWin(value: unknown): PendingWin | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as PendingWin;
  if (typeof data.gameId !== 'string' || (data.drawCount !== 1 && data.drawCount !== 3)) return null;
  if (typeof data.timeMs !== 'number') return null;
  return {
    gameId: data.gameId,
    drawCount: data.drawCount,
    timeMs: data.timeMs,
    prevBest: data.prevBest == null ? null : numberOr(data.prevBest, 0),
  };
}

export function loadStats(): Stats {
  const value = readJson(STATS_KEY);
  if (!value || typeof value !== 'object') return emptyStats();
  const data = value as Partial<Stats>;
  const best = data.bestMs ?? { '1': null, '3': null };
  return {
    played: Math.max(0, Math.round(numberOr(data.played, 0))),
    won: Math.max(0, Math.round(numberOr(data.won, 0))),
    bestMs: {
      '1': best['1'] == null ? null : Math.max(0, numberOr(best['1'], 0)),
      '3': best['3'] == null ? null : Math.max(0, numberOr(best['3'], 0)),
    },
    countedGameId: typeof data.countedGameId === 'string' ? data.countedGameId : null,
    pendingWin: pendingWin(data.pendingWin),
  };
}

export function saveStats(stats: Stats): void {
  writeJson(STATS_KEY, stats);
}

export function loadGame(): GameState | null {
  return hydrate(readJson(GAME_KEY));
}

export function saveGame(state: GameState): void {
  writeJson(GAME_KEY, state);
}
