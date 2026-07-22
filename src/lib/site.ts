/** Canonical public site URL (privacy, terms, invites, checkout redirects). */
export const SITE_URL = 'https://proteinquest.app';

/**
 * Origin for user-facing links in production builds.
 * Always prefer the canonical domain so preview/vercel hosts never leak into shares.
 */
export function publicSiteOrigin(): string {
  return SITE_URL;
}
