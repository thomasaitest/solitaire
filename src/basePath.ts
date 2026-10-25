/**
 * Vite `base` for this build. Absolute paths get a leading and trailing slash.
 * `./` is kept so a build can use document-relative asset URLs.
 */
export function normalizeBasePath(value: string | undefined): string {
  const raw = (value ?? '').trim();
  if (raw === '' || raw === '/') return '/';
  if (raw === './') return './';
  const withLead = raw.startsWith('/') || raw.startsWith('./') ? raw : `/${raw}`;
  return withLead.endsWith('/') ? withLead : `${withLead}/`;
}
