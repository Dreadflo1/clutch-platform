/**
 * POST /api/auth/age  { dob: 'YYYY-MM-DD' }   (auth required)
 * Confirms the signed-in user's date of birth (16+ to play; 18+ unlocks money).
 * Used by wallet/Telegram accounts — email signup collects the DOB inline.
 * GET returns the current { confirmed, adult } status.
 */
import { requireAuth } from '../_auth.js';
import { confirmAge, ageStatus, MIN_AGE } from '../_age.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    return res.status(200).json(await ageStatus(user.userId));
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  const result = await confirmAge(user.userId, body.dob);
  if (!result.ok) {
    if (result.error === 'under_min') {
      return res.status(403).json({ error: `You must be at least ${MIN_AGE} to use CLUTCH.`, code: 'under_min' });
    }
    return res.status(400).json({ error: 'Enter a valid date of birth.' });
  }
  return res.status(200).json({ confirmed: true, adult: result.adult });
}
