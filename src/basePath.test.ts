import { describe, expect, it } from 'vitest';
import { normalizeBasePath } from './basePath.ts';

describe('normalizeBasePath', () => {
  it('defaults to the site root', () => {
    expect(normalizeBasePath(undefined)).toBe('/');
    expect(normalizeBasePath('')).toBe('/');
    expect(normalizeBasePath('/')).toBe('/');
    expect(normalizeBasePath('  /  ')).toBe('/');
  });

  it('turns a project folder into a trailing-slash base', () => {
    expect(normalizeBasePath('solitaire')).toBe('/solitaire/');
    expect(normalizeBasePath('/solitaire')).toBe('/solitaire/');
    expect(normalizeBasePath('/solitaire/')).toBe('/solitaire/');
  });

  it('keeps an explicit relative base', () => {
    expect(normalizeBasePath('./')).toBe('./');
  });
});
