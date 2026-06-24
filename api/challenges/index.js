/**
 * Challenge Board API
 *
 * GET  /api/challenges         — list open challenges
 * POST /api/challenges         — create an open challenge
 * POST /api/challenges?accept  — accept a challenge
 *
 * Storage: Vercel KV (free tier) or fallback to in-memory (dev only)
 *
 * Environment variables:
 *   KV_REST_API_URL   — from Vercel KV dashboard
 *   KV_REST_API_TOKEN — from Vercel KV dashboard
 */

// In-memory fallback for local dev (not persistent across deploys)
let memStore = [];

async function kvGet(key) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;

  const res = await fetch(`${url}/get/${key}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.result ? JSON.parse(data.result) : null;
}

async function kvSet(key, value, exSeconds) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return false;

  const args = exSeconds ? `EX/${exSeconds}` : '';
  const res = await fetch(`${url}/set/${key}/${encodeURIComponent(JSON.stringify(value))}${args ? '/' + args : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok;
}

async function getOpenChallenges() {
  const stored = await kvGet('challenges:open');
  if (stored) return stored;
  return memStore.filter(c => c.status === 'open' && c.expiresAt > Date.now());
}

async function saveChallenges(challenges) {
  memStore = challenges;
  await kvSet('challenges:open', challenges, 86400);
}

function validateChallenge(body) {
  const errors = [];
  if (!body.game || typeof body.game !== 'string') errors.push('game is required');
  if (!body.stake || body.stake < 10) errors.push('stake must be >= 10 CLU');
  if (body.stake > 100000) errors.push('stake cannot exceed 100,000 CLU');
  if (!body.mode || typeof body.mode !== 'string') errors.push('mode is required');
  if (!body.creator || typeof body.creator !== 'string') errors.push('creator address is required');
  if (!body.creatorName || typeof body.creatorName !== 'string') errors.push('creatorName is required');
  return errors;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET — list open challenges
  if (req.method === 'GET') {
    const challenges = await getOpenChallenges();
    const active = challenges.filter(c => c.expiresAt > Date.now());
    return res.status(200).json({
      challenges: active,
      count: active.length,
      fetchedAt: new Date().toISOString(),
    });
  }

  // POST — create or accept
  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    // Accept flow
    if (req.query.accept && body.challengeId) {
      const challenges = await getOpenChallenges();
      const idx = challenges.findIndex(c => c.id === body.challengeId);
      if (idx === -1) return res.status(404).json({ error: 'Challenge not found or expired' });

      const challenge = challenges[idx];
      if (challenge.creator === body.acceptor) {
        return res.status(400).json({ error: 'Cannot accept your own challenge' });
      }

      challenge.status = 'accepted';
      challenge.opponent = body.acceptor;
      challenge.opponentName = body.acceptorName || 'Anonymous';
      challenge.acceptedAt = Date.now();
      challenges[idx] = challenge;
      await saveChallenges(challenges);

      return res.status(200).json({ challenge, message: 'Challenge accepted — escrow locked' });
    }

    // Create flow
    const errors = validateChallenge(body);
    if (errors.length) return res.status(400).json({ errors });

    const challenge = {
      id: 'CH_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      game: body.game,
      mode: body.mode,
      betType: body.betType || 'outcome',
      condition: body.condition || body.mode,
      stake: body.stake,
      creator: body.creator,
      creatorName: body.creatorName,
      creatorRank: body.creatorRank || null,
      creatorWins: body.creatorWins || 0,
      status: 'open',
      createdAt: Date.now(),
      expiresAt: Date.now() + (body.expiryHours || 24) * 3600000,
      opponent: null,
      opponentName: null,
    };

    const challenges = await getOpenChallenges();
    challenges.unshift(challenge);

    // Cap at 100 open challenges
    const trimmed = challenges.slice(0, 100);
    await saveChallenges(trimmed);

    return res.status(201).json({ challenge, message: 'Challenge posted to board' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
