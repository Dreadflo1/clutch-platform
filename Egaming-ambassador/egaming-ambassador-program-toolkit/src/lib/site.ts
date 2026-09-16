/**
 * Shared links to the live Clutch platform (the existing vanilla app that holds
 * wallet, escrow and auth). Set NEXT_PUBLIC_APP_URL / API_BASE in the
 * environment for production; the defaults point at the public domain.
 */
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://clutch.best";

/**
 * Base URL of the live challenge API. Server-only (no NEXT_PUBLIC_ prefix) so
 * the Next app proxies the board through its own /api/duels route and browsers
 * never hit the origin cross-domain. Falls back to APP_URL.
 */
export const API_BASE = process.env.API_BASE ?? APP_URL;

/** Deep link into the live arena, optionally to a specific challenge. */
export function arenaUrl(challengeId?: string) {
  if (!challengeId) return APP_URL;
  return `${APP_URL}/?challenge=${encodeURIComponent(challengeId)}`;
}
