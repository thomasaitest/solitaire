import { describe, expect, it } from 'vitest';
import { shouldShowInstallHint } from './shell.ts';

describe('shouldShowInstallHint', () => {
  it('shows the hint only in mobile Safari outside a home-screen session', () => {
    expect(shouldShowInstallHint({ native: false, iosBrowser: true, standalone: false, dismissed: false })).toBe(true);
  });

  it('stays hidden inside the native app, standalone mode, and after dismissal', () => {
    const base = { native: false, iosBrowser: true, standalone: false, dismissed: false };
    expect(shouldShowInstallHint({ ...base, native: true })).toBe(false);
    expect(shouldShowInstallHint({ ...base, standalone: true })).toBe(false);
    expect(shouldShowInstallHint({ ...base, dismissed: true })).toBe(false);
    expect(shouldShowInstallHint({ ...base, iosBrowser: false })).toBe(false);
  });
});
