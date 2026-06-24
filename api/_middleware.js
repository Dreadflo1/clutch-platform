/**
 * Rate limiter — shared across all API endpoints
 * In-memory store (resets on cold start, which is fine for abuse prevention)
 * Limit: 30 requests per minute per IP
 */
const RATE_LIMIT = 30;
const WINDOW_MS = 60 * 1000;
const store = new Map();

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.socket?.remoteAddress
    || 'unknown';
}

function isRateLimited(ip) {
  const now = Date.now();
  const entry = store.get(ip);
  if (!entry || now - entry.start > WINDOW_MS) {
    store.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT) return true;
  return false;
}

// Cleanup old entries every 5 min
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of store) {
    if (now - entry.start > WINDOW_MS * 2) store.delete(ip);
  }
}, 300000);

export default function middleware(req, res) {
  const ip = getClientIP(req);
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Rate limited. Try again in 60 seconds.', retryAfter: 60 });
  }
}
