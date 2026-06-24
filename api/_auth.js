/**
 * Auth middleware — extracts and verifies JWT from Authorization header
 * Returns { userId, addr, via } or null
 */
import { verifyJwt } from './_jwt.js';

export function authenticate(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const payload = verifyJwt(token);
  if (!payload || !payload.sub) return null;
  return { userId: payload.sub, addr: payload.addr, via: payload.via };
}

export function requireAuth(req, res) {
  const user = authenticate(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  return user;
}
