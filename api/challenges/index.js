/**
 * Challenge Board API — with HMAC signing and server-side escrow
 *
 * GET  /api/challenges         — list open challenges
 * GET  /api/challenges?mine    — the authed player's own challenges (any status)
 * GET  /api/challenges?recent  — the last settled duels, public fields only (no auth)
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
  addUserChallenge, getUserChallengeIds, getRecentSettled,
} from '../_challenges.js';
import { findMode } from '../_modes.js';
import { isBanned } from '../_integrity.js';
import { isAgeConfirmed } from '../_age.js';
import { getUserStats, cohortFromStats } from '../_userstats.js';
import { limit } from '../_ratelimit.js';
import { secretFor } from '../_secrets.js';
import { readJson, cleanText, isChallengeId } from '../_sanitize.js';

const challengeSecret = () => secretFor('CHALLENGE_SECRET', 'challenge');
const CHALLENGE_TYPES = ['outcome', 'target', 'custom'];
const VALID_GAMES = ['valorant','lol','dota2','clashroyale','brawlstars','cs2','fortnite','apex','ow2','rl','fifa','cod'];

function signChallenge(ch) {
  const canonical = JSON.stringify({ id: ch.id, game: ch.game, stake: ch.stake, creator: ch.creatorUserId, createdAt: ch.createdAt });
  return crypto.createHmac('sha256', challengeSecret()).update(canonical).digest('hex');
}

/**
 * What anyone may see of an open challenge on the public board. Internal fields
 * (the HMAC, raw user ids, submissions) stay server-side; the viewer's own
 * challenges keep creatorUserId so the client can offer Cancel.
 */
export function publicOpenView(c, viewerId) {
  const mine = Boolean(viewerId) && c.creatorUserId === viewerId;
  return {
    id: c.id,
    game: c.game,
    modeId: c.modeId,
    modeLabel: c.modeLabel,
    modeVerifiable: Boolean(c.modeVerifiable),
    mode: c.mode,
    challengeType: c.challengeType || c.betType || 'outcome',
    condition: c.condition,
    stake: c.stake,
    creatorName: c.creatorName,
    creatorWins: Number(c.creatorWins) || 0,
    creatorCohort: c.creatorCohort,
    status: c.status,
    createdAt: c.createdAt,
    expiresAt: c.expiresAt,
    mine,
    ...(mine ? { creatorUserId: c.creatorUserId } : {}),
  };
}

export function validateChallenge(body) {
  const errors = [];
  if (!body.game || !VALID_GAMES.includes(body.game)) errors.push('invalid game');
  const stake = Number(body.stake);
  if (!Number.isInteger(stake) || stake < 10) errors.push('stake must be >= 10 CLU');
  if (stake > 100000) errors.push('stake cannot exceed 100,000 CLU');
  if (!body.mode || typeof body.mode !== 'string' || body.mode.length < 2) errors.push('mode is required');
  if (body.mode && body.mode.length > 200) errors.push('mode too long');
  if (body.mode !== undefined && typeof body.mode !== 'string') errors.push('mode must be text');
  if (body.condition !== undefined && body.condition !== null && typeof body.condition !== 'string') errors.push('condition must be text');
  if (/[<>]/.test(typeof body.mode === 'string' ? body.mode : '')) errors.push('invalid characters');
  const type = body.challengeType || body.betType || 'outcome';
  if (!CHALLENGE_TYPES.includes(type)) errors.push('invalid challengeType');
  return errors;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET ?recent — public feed of the latest settled duels (newest first). Only
  // public fields (see publicResult in _challenges.js); safe to cache briefly.
  if (req.method === 'GET' && req.query.recent !== undefined) {
    if (!(await limit(req, res, 'recent', { limit: 60, windowSec: 60 }))) return;
    const results = await getRecentSettled(6);
    res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30, stale-while-revalidate=60');
    return res.status(200).json({ results, count: results.length });
  }

  // GET ?mine — the authenticated player's own challenges (any status)
  if (req.method === 'GET' && req.query.mine !== undefined) {
    const user = requireAuth(req, res);
    if (!user) return;
    const ids = await getUserChallengeIds(user.userId);
    const raw = await Promise.all(ids.map(id => kvGet(`ch:${id}`)));
    const mine = raw
      .filter(Boolean)
      .map(({ sig, ...c }) => (c.challengeType ? c : { ...c, challengeType: c.betType || 'outcome' }));
    return res.status(200).json({ challenges: mine, count: mine.length });
  }

  // GET — public list of open challenges, no auth needed
  if (req.method === 'GET') {
    const challenges = await getOpenList();
    const viewer = authenticate(req); // optional: marks the viewer's own challenges
    const open = challenges
      .filter(c => c.expiresAt > Date.now() && c.status === 'open')
      .map(c => publicOpenView(c, viewer && viewer.userId));
    return res.status(200).json({ challenges: open, count: open.length });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // POST requires auth
  const user = requireAuth(req, res);
  if (!user) return;
  // Every POST here locks or moves escrow (create / accept / cancel).
  if (!(await limit(req, res, 'challenge', { limit: 20, windowSec: 60, id: user.userId }))) return;

  const body = readJson(req);
  if (!body) return res.status(400).json({ error: 'Invalid JSON body' });
  if (body.challengeId !== undefined && !isChallengeId(body.challengeId)) {
    return res.status(400).json({ error: 'Invalid challengeId' });
  }

  // ── CANCEL FLOW ── creator reclaims the stake of an unaccepted challenge
  if (req.query.cancel !== undefined && body.challengeId) {
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

      return res.status(200).json({
        status: 'cancelled',
        challenge: ch,
        message: 'Challenge cancelled — stake refunded',
        warning: 'Cancelled before acceptance: full refund, no commission.',
      });
    } finally {
      await kvUnlock(lockKey);
    }
  }

  // Age gate — must confirm 16+ to play. (Real cash-out is 18+, gated at
  // deposit/withdraw.) Banned players can still CANCEL to reclaim a stake above,
  // but neither can start or accept new duels.
  if (!(await isAgeConfirmed(user.userId))) {
    return res.status(403).json({ error: 'Confirm your date of birth to play.', code: 'age_required' });
  }
  if (await isBanned(user.userId)) {
    return res.status(403).json({ error: 'Account suspended after repeated disputes — you can no longer start or accept duels.' });
  }

  // ── ACCEPT FLOW ──
  if (req.query.accept !== undefined && body.challengeId) {
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
      await addUserChallenge(user.userId, ch.id); // index the opponent
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

  const stake = Number(body.stake);

  // Structured mode: validate the modeId against the catalog for this game.
  // Unknown/absent modeId falls back to the free-form "custom" mode.
  const modeDef = findMode(body.game, body.modeId) || findMode(body.game, 'custom');
  const modeId = modeDef ? modeDef.id : 'custom';
  const modeVerifiable = !!(modeDef && modeDef.verifiable);

  // Soft skill cohort, stamped at creation so the open board can sort toward
  // similar-skill opponents without a per-card lookup. See _userstats.js —
  // this is a bias for display/sort order, never a hard accept restriction.
  const creatorStats = await getUserStats(user.userId);
  const creatorCohort = cohortFromStats(creatorStats);
  const expiryHours = Math.max(1, Math.min(parseInt(body.expiryHours, 10) || 24, 168));

  const challenge = {
    id: 'CH_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex'),
    game: body.game,
    modeId,
    modeLabel: modeDef ? modeDef.label : 'Custom duel',
    modeVerifiable,
    mode: cleanText(body.mode || (modeDef ? modeDef.label : '')),
    // challengeType: how the outcome is measured (outcome | target | custom).
    // Accepts the legacy `betType` key on input during the client transition.
    challengeType: body.challengeType || body.betType || 'outcome',
    condition: cleanText(body.condition || body.mode || ''),
    stake,
    creatorUserId: user.userId,
    creatorName: user.addr ? (user.addr.slice(0, 6) + '...' + user.addr.slice(-4)) : 'Player',
    // Server-side record only: a client-sent win count is ignored.
    creatorWins: Number(creatorStats && creatorStats.wins) || 0,
    creatorCohort,
    status: 'open',
    createdAt: Date.now(),
    expiresAt: Date.now() + expiryHours * 3600000,
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
  await addUserChallenge(user.userId, challenge.id); // index the creator

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
