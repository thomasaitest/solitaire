import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSettings, saveSettings } from './storage.ts';

function stubStorage(initial: Record<string, string> = {}): Record<string, string> {
  const data = { ...initial };
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
  });
  return data;
}

afterEach(() => vi.unstubAllGlobals());

describe('settings', () => {
  it('turns smart tap on for a save that predates the setting (an old autoFoundation value is ignored)', () => {
    stubStorage({ 'klondike-settings-v1': JSON.stringify({ theme: 'night', drawCount: 1, installHintDismissed: true, autoFoundation: false }) });
    const settings = loadSettings();
    expect(settings.smartTap).toBe(true);
    expect(settings.drawCount).toBe(1);
  });

  it('defaults to on with no save at all', () => {
    stubStorage();
    expect(loadSettings().smartTap).toBe(true);
  });

  it('remembers an explicit off', () => {
    stubStorage();
    saveSettings({ ...loadSettings(), smartTap: false });
    expect(loadSettings().smartTap).toBe(false);
  });
});
