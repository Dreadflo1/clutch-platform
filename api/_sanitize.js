/**
 * Input sanitization utilities — imported by API endpoints
 */

export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export function validateRiotId(riotId) {
  if (!riotId || typeof riotId !== 'string') return null;
  const clean = riotId.trim();
  if (clean.length < 3 || clean.length > 60) return null;
  if (!clean.includes('-')) return null;
  const parts = clean.split('-');
  if (parts.length < 2) return null;
  const gameName = parts.slice(0, -1).join('-');
  const tagLine = parts[parts.length - 1];
  if (gameName.length < 1 || tagLine.length < 1 || tagLine.length > 5) return null;
  if (/[<>"';&]/.test(clean)) return null;
  return { gameName, tagLine };
}

export function validateSteamId(steamId) {
  if (!steamId || typeof steamId !== 'string') return null;
  const clean = steamId.trim();
  if (!/^\d{10,20}$/.test(clean)) return null;
  return clean;
}

export function validatePlayerTag(tag) {
  if (!tag || typeof tag !== 'string') return null;
  const clean = tag.trim().replace('#', '');
  if (!/^[A-Za-z0-9]{3,15}$/.test(clean)) return null;
  return '%23' + clean;
}

export function validateStake(stake) {
  const n = parseInt(stake);
  if (isNaN(n) || n < 10 || n > 100000) return null;
  return n;
}

export function validateImageUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (/[<>"']/.test(url)) return null;
    return url;
  } catch {
    return null;
  }
}
