/**
 * Challenge Board API — with HMAC signing and server-side escrow
 *
 * GET  /api/challenges         — list open challenges
 * POST /api/challenges         — create (auth required, locks escrow server-side)
 * POST /api/challenges?accept  — accept (auth required, locks escrow server-side)
 */
import crypto from 'crypto';
import { kvGet, kvSet } from '../_kv.js';
import { authenticate, requireAuth } from '../_auth.js';

const CHALLENGE_SECRET = process.env.CHALLENGE_SECRET || 'dev-challenge-secret-change-me';
const VALID_GAMES = ['valorant','lol','dota2','clashroyale','brawlstars','cs2','fortnite','apex','ow2','rl','fifa','cod'];

function signChallenge(ch) {
  const canonical = JSON.stringify({ id: ch.id, game: ch.game, stake: ch.stake, creator: ch.creatorUserId, createdAt: ch.createdAt });
  return crypto.createHmac('sha256', CHALLENGE_SECRET).update(canonical).digest('hex');
}

function verifyChallengeSig(ch) {
  return ch.sig === signChallenge(ch);
}

async function getOpenChallenges() {
  return (await kvGet('challenges:open')) || [];
}

async function saveChallenges(challenges) {
  await kvSet('challenges:open', challenges, 86400);
}

function validateChallenge(body) {
  const errors = [];
  if (!body.game || !VALID_GAMES.includes(body.game)) errors.push('invalid game');
  const stake = parseInt(body.stake);
  if (isNaN(stake) || stake < 10) errors.push('stake must be >= 10 CLU');
  if (stake > 100000) errors.push('stake cannot exceed 100,000 CLU');
  if (!body.mode || typeof body.mode !== 'string' || body.mode.length < 2) errors.push('mode is required');
  if (body.mode && body.mode.length > 200) errors.push('mode too long');
  if (/[<>]/.test(body.mode || '')) errors.push('invalid characters');
  return errors;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET — public, no auth needed
  if (req.method === 'GET') {
    const challenges = await getOpenChallenges();
    const active = challenges.filter(c => c.expiresAt > Date.now() && c.status === 'open');
    return res.status(200).json({ challenges: active, count: active.length });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // POST requires auth
  const user = requireAuth(req, res);
  if (!user) return;

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

  // ── ACCEPT FLOW ──
  if (req.query.accept && body.challengeId) {
    const challenges = await getOpenChallenges();
    const idx = challenges.findIndex(c => c.id === body.challengeId);
    if (idx === -1) return res.status(404).json({ error: 'Challenge not found or expired' });

    const ch = challenges[idx];

    // Prevent double-accept with lock
    const lockKey = `lock:${ch.id}`;
    const locked = await kvGet(lockKey);
    if (locked) return res.status(409).json({ error: 'Challenge is being accepted by another player' });
    await kvSet(lockKey, true, 10);

    if (ch.creatorUserId === user.userId) {
      return res.status(400).json({ error: 'Cannot accept your own challenge' });
    }

    // Check acceptor balance
    const bal = await kvGet(`bal:${user.userId}`);
    if (!bal || bal.available < ch.stake) {
      return res.status(400).json({ error: `Insufficient balance. Need ${ch.stake} CLU, have ${bal?.available || 0}` });
    }

    // Lock acceptor's escrow
    bal.available -= ch.stake;
    bal.escrow += ch.stake;
    bal.version++;
    await kvSet(`bal:${user.userId}`, bal);

    // Update challenge
    ch.status = 'active';
    ch.opponentUserId = user.userId;
    ch.opponentName = user.addr ? (user.addr.slice(0, 6) + '...' + user.addr.slice(-4)) : 'Player';
    ch.acceptedAt = Date.now();
    challenges[idx] = ch;
    await saveChallenges(challenges);

    // Store full challenge for settlement
    await kvSet(`ch:${ch.id}`, ch, 172800);

    // Log transaction
    const txId = `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    await kvSet(`tx:${txId}`, { id: txId, userId: user.userId, type: 'escrow_lock', amount: -ch.stake, ref: ch.id, ts: Date.now(), balAfter: bal.available }, 7776000);
    const txlog = (await kvGet(`txlog:${user.userId}`)) || [];
    txlog.unshift(txId);
    await kvSet(`txlog:${user.userId}`, txlog.slice(0, 200));

    return res.status(200).json({ challenge: ch, message: 'Challenge accepted — escrow locked' });
  }

  // ── CREATE FLOW ──
  const errors = validateChallenge(body);
  if (errors.length) return res.status(400).json({ errors });

  const stake = parseInt(body.stake);

  // Check creator balance
  const bal = await kvGet(`bal:${user.userId}`);
  if (!bal || bal.available < stake) {
    return res.status(400).json({ error: `Insufficient balance. Need ${stake} CLU, have ${bal?.available || 0}` });
  }

  const challenge = {
    id: 'CH_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex'),
    game: body.game,
    mode: (body.mode || '').replace(/[<>"']/g, '').slice(0, 200),
    betType: body.betType || 'outcome',
    condition: (body.condition || body.mode || '').replace(/[<>"']/g, '').slice(0, 200),
    stake,
    creatorUserId: user.userId,
    creatorName: user.addr ? (user.addr.slice(0, 6) + '...' + user.addr.slice(-4)) : 'Player',
    creatorWins: parseInt(body.creatorWins) || 0,
    status: 'open',
    createdAt: Date.now(),
    expiresAt: Date.now() + Math.min(parseInt(body.expiryHours) || 24, 168) * 3600000,
    opponentUserId: null,
    opponentName: null,
    creatorResult: null,
    opponentResult: null,
  };

  // Sign the challenge
  challenge.sig = signChallenge(challenge);

  // Lock creator's escrow
  bal.available -= stake;
  bal.escrow += stake;
  bal.version++;
  await kvSet(`bal:${user.userId}`, bal);

  // Store challenge
  await kvSet(`ch:${challenge.id}`, challenge, 172800);

  // Add to open list
  const challenges = await getOpenChallenges();
  challenges.unshift(challenge);
  await saveChallenges(challenges.slice(0, 100));

  // Log transaction
  const txId = `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  await kvSet(`tx:${txId}`, { id: txId, userId: user.userId, type: 'escrow_lock', amount: -stake, ref: challenge.id, ts: Date.now(), balAfter: bal.available }, 7776000);
  const txlog = (await kvGet(`txlog:${user.userId}`)) || [];
  txlog.unshift(txId);
  await kvSet(`txlog:${user.userId}`, txlog.slice(0, 200));

  // Return signed challenge code (short — just id + sig)
  const code = Buffer.from(JSON.stringify({ id: challenge.id, sig: challenge.sig })).toString('base64url');

  return res.status(201).json({ challenge, code, message: 'Challenge posted — stake locked in escrow' });
}
