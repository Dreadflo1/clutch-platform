/**
 * Challenge Board API — with HMAC signing and server-side escrow
 *
 * GET  /api/challenges         — list open challenges
 * POST /api/challenges         — create (auth required, locks escrow server-side)
 * POST /api/challenges?accept  — accept (auth required, locks escrow server-side)
 * POST /api/challenges?cancel  — creator cancels an unaccepted challenge (refund)
 */
import crypto from 'crypto';
import { kvGet, kvSet, kvLock, kvUnlock } from '../_kv.js';
import { authenticate, requireAuth } from '../_auth.js';
import { mutateBalance, BalanceError } from '../_balance.js';
import {
  getOpenList, saveOpenList, addActive, persist, cancelOpen, SETTLE_WINDOW_MS,
} from '../_challenges.js';

const CHALLENGE_SECRET = process.env.CHALLENGE_SECRET || 'dev-challenge-secret-change-me';
const VALID_GAMES = ['valorant','lol','dota2','clashroyale','brawlstars','cs2','fortnite','apex','ow2','rl','fifa','cod'];

function signChallenge(ch) {
  const canonical = JSON.stringify({ id: ch.id, game: ch.game, stake: ch.stake, creator: ch.creatorUserId, createdAt: ch.createdAt });
  return crypto.createHmac('sha256', CHALLENGE_SECRET).update(canonical).digest('hex');
}

function verifyChallengeSig(ch) {
  return ch.sig === signChallenge(ch);
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
    const challenges = await getOpenList();
    const open = challenges.filter(c => c.expiresAt > Date.now() && c.status === 'open');
    return res.status(200).json({ challenges: open, count: open.length });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // POST requires auth
  const user = requireAuth(req, res);
  if (!user) return;

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

  // ── CANCEL FLOW ── creator reclaims the stake of an unaccepted challenge
  if (req.query.cancel && body.challengeId) {
    // Share the accept lock so cancel and accept are mutually exclusive.
    const lockKey = `lock:accept:${body.challengeId}`;
    const gotLock = await kvLock(lockKey, 10);
    if (!gotLock) return res.status(409).json({ error: 'Challenge is busy — retry shortly' });
    try {
      const ch = await kvGet(`ch:${body.challengeId}`);
      if (!ch) return res.status(404).json({ error: 'Challenge not found' });
      if (ch.creatorUserId !== user.userId) {
        return res.status(403).json({ error: 'Only the creator can cancel' });
      }
      if (ch.status !== 'open') {
        return res.status(409).json({ error: `Cannot cancel — challenge is ${ch.status}` });
      }
      const outcome = await cancelOpen(ch, 'creator_cancelled');
      if (outcome === 'noop') return res.status(409).json({ error: 'Challenge could not be cancelled' });

      // Log refund transaction
      const bal = await kvGet(`bal:${user.userId}`);
      const txId = `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      await kvSet(`tx:${txId}`, { id: txId, userId: user.userId, type: 'refund', amount: ch.stake, ref: ch.id, ts: Date.now(), balAfter: bal?.available }, 7776000);
      const txlog = (await kvGet(`txlog:${user.userId}`)) || [];
      txlog.unshift(txId);
      await kvSet(`txlog:${user.userId}`, txlog.slice(0, 200));

      return res.status(200).json({ status: 'cancelled', challenge: ch, message: 'Challenge cancelled — stake refunded' });
    } finally {
      await kvUnlock(lockKey);
    }
  }

  // ── ACCEPT FLOW ──
  if (req.query.accept && body.challengeId) {
    const challenges = await getOpenList();
    const idx = challenges.findIndex(c => c.id === body.challengeId);
    if (idx === -1) return res.status(404).json({ error: 'Challenge not found or expired' });

    const ch = challenges[idx];

    if (ch.creatorUserId === user.userId) {
      return res.status(400).json({ error: 'Cannot accept your own challenge' });
    }
    if (ch.status !== 'open') {
      return res.status(409).json({ error: 'Challenge is no longer open' });
    }

    // Prevent double-accept with an atomic lock (SET NX) — two concurrent
    // acceptors can never both pass this gate.
    const lockKey = `lock:accept:${ch.id}`;
    const gotLock = await kvLock(lockKey, 10);
    if (!gotLock) return res.status(409).json({ error: 'Challenge is being accepted by another player' });

    try {
      // Lock acceptor's escrow atomically: available -> escrow, only if funded.
      let bal;
      try {
        bal = await mutateBalance(user.userId, {
          dAvailable: -ch.stake,
          dEscrow: ch.stake,
          minAvailable: ch.stake,
        });
      } catch (e) {
        if (e instanceof BalanceError) {
          if (e.code === 'NO_ACCOUNT' || e.code === 'INSUFFICIENT_AVAILABLE') {
            return res.status(400).json({ error: `Insufficient balance. Need ${ch.stake} CLU` });
          }
        }
        throw e;
      }

      // Update challenge
      ch.status = 'active';
      ch.opponentUserId = user.userId;
      ch.opponentName = user.addr ? (user.addr.slice(0, 6) + '...' + user.addr.slice(-4)) : 'Player';
      ch.acceptedAt = Date.now();
      ch.settleDeadline = ch.acceptedAt + SETTLE_WINDOW_MS;

      // Drop from the open board, track in the active list, persist without TTL
      // (the record must never expire while it still holds escrow).
      challenges.splice(idx, 1);
      await saveOpenList(challenges);
      await addActive(ch.id);
      await persist(ch);

      // Log transaction
      const txId = `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      await kvSet(`tx:${txId}`, { id: txId, userId: user.userId, type: 'escrow_lock', amount: -ch.stake, ref: ch.id, ts: Date.now(), balAfter: bal.available }, 7776000);
      const txlog = (await kvGet(`txlog:${user.userId}`)) || [];
      txlog.unshift(txId);
      await kvSet(`txlog:${user.userId}`, txlog.slice(0, 200));

      return res.status(200).json({ challenge: ch, message: 'Challenge accepted — escrow locked' });
    } finally {
      await kvUnlock(lockKey);
    }
  }

  // ── CREATE FLOW ──
  const errors = validateChallenge(body);
  if (errors.length) return res.status(400).json({ errors });

  const stake = parseInt(body.stake);

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

  // Lock creator's escrow atomically — fails if underfunded, no race.
  let bal;
  try {
    bal = await mutateBalance(user.userId, {
      dAvailable: -stake,
      dEscrow: stake,
      minAvailable: stake,
    });
  } catch (e) {
    if (e instanceof BalanceError) {
      if (e.code === 'NO_ACCOUNT' || e.code === 'INSUFFICIENT_AVAILABLE') {
        return res.status(400).json({ error: `Insufficient balance. Need ${stake} CLU` });
      }
    }
    throw e;
  }

  // Store challenge without TTL (it holds escrow until accepted/cancelled).
  await persist(challenge);

  // Add to open board
  const challenges = await getOpenList();
  challenges.unshift(challenge);
  await saveOpenList(challenges);

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
