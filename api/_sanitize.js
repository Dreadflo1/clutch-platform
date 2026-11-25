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

/**
 * Parse a JSON request body safely. Returns a plain object, or null when the
 * body is not valid JSON or not an object (callers answer 400).
 */
export function readJson(req) {
  let b = req && req.body;
  if (b === undefined || b === null || b === '') return {};
  if (Buffer.isBuffer(b)) b = b.toString('utf8');
  if (typeof b === 'string') {
    if (b.length > 100000) return null;
    try { b = JSON.parse(b); } catch { return null; }
  }
  return b && typeof b === 'object' && !Array.isArray(b) ? b : null;
}

/** Reads the body or answers 400. Returns the object, or null after responding. */
export function bodyOr400(req, res) {
  const b = readJson(req);
  if (!b) { res.status(400).json({ error: 'Invalid JSON body' }); return null; }
  return b;
}

/**
 * Display names come from players and from OAuth/Telegram profiles. Keep them
 * plain text: drop markup and control characters, collapse spaces, cap length.
 */
export function cleanDisplayName(name, fallback = 'Player', max = 32) {
  const n = String(name == null ? '' : name)
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f<>"'`&\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
  return n || fallback;
}

/** Short free-text fields (mode, condition): plain text, capped. */
export function cleanText(s, max = 200) {
  return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>"'`]/g, '').trim().slice(0, max);
}

/** Server-issued challenge ids: CH_<ms>_<8 hex>. */
export function isChallengeId(id) {
  return typeof id === 'string' && /^CH_\d{10,16}_[a-f0-9]{8}$/.test(id);
}

const TRUSTED_ORIGINS = ['https://www.clutch.best', 'https://clutch.best', 'https://clutch-wine.vercel.app'];
/**
 * The site origin to build callback/redirect URLs with. A client-sent Origin is
 * only used when it is one of ours (or localhost in dev); otherwise the main site.
 */
export function trustedOrigin(req) {
  const o = String((req && req.headers && req.headers.origin) || '');
  if (TRUSTED_ORIGINS.includes(o)) return o;
  const isDev = !(process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview' || process.env.NODE_ENV === 'production');
  if (isDev && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) return o;
  return TRUSTED_ORIGINS[0];
}
