/**
 * Challenge Board API — with HMAC signing and server-side escrow
 *
 * GET  /api/challenges         — list open challenges
 * GET  /api/challenges?mine    — the authed player's own challenges (any status)
 * POST /api/challenges         — create (auth required, locks escrow server-side)
 * POST /api/challenges?accept  — accept (auth required, locks escrow server-side)
 * POST /api/challenges?cancel  — creator cancels an unaccepted challenge (refund)
 */
import crypto from 'crypto';
import { kvGet, kvLock, kvUnlock } from '../_kv.js';
import { authenticate, requireAuth } from '../_auth.js';
import { mutateBalance, BalanceError } from '../_balance.js';
import {
  getOpenList, addOpen, removeOpen, addActive, persist, cancelOpen, SETTLE_WINDOW_MS,
  addUserChallenge, getUserChallengeIds,
} from '../_challenges.js';
import { appendTx, newTxId } from '../_payments.js';
import { requireSecret } from '../_secrets.js';
import { findMode } from '../_modes.js';
import { isBanned } from '../_integrity.js';
import { isAgeConfirmed } from '../_age.js';
import { getUserStats, cohortFromStats } from '../_userstats.js';
import { limit } from '../_ratelimit.js';

const challengeSecret = () => requireSecret('CHALLENGE_SECRET', 'dev-challenge-secret-change-me');
const VALID_GAMES = ['valorant','lol','dota2','clashroyale','brawlstars','cs2','fortnite','apex','ow2','rl','fifa','cod'];

function signChallenge(ch) {
  const canonical = JSON.stringify({ id: ch.id, game: ch.game, stake: ch.stake, creator: ch.creatorUserId, createdAt: ch.createdAt });
  return crypto.createHmac('sha256', challengeSecret()).update(canonical).digest('hex');
}

function verifyChallengeSig(ch) {
  const expected = Buffer.from(signChallenge(ch));
  const got = Buffer.from(String(ch.sig || ''));
  return got.length === expected.length && crypto.timingSafeEqual(got, expected);
}

/** Public display name: the name the player chose, never an email or wallet address. */
function displayName(user) {
  return String(user.name || '').replace(/[<>"']/g, '').slice(0, 22) || 'Player';
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

  // GET ?mine — the authenticated player's own challenges (any status)
  if (req.method === 'GET' && req.query.mine !== undefined) {
    const user = requireAuth(req, res);
    if (!user) return;
    const ids = await getUserChallengeIds(user.userId);
    const raw = await Promise.all(ids.map(id => kvGet(`ch:${id}`)));
    const mine = raw
      .filter(Boolean)
      .map(c => (c.challengeType ? c : { ...c, challengeType: c.betType || 'outcome' }));
    return res.status(200).json({ challenges: mine, count: mine.length });
  }

  // GET — public list of open challenges, no auth needed
  if (req.method === 'GET') {
    const challenges = await getOpenList();
    const open = challenges
      .filter(c => c.expiresAt > Date.now() && c.status === 'open')
      // Normalize legacy records so the client only ever sees `challengeType`.
      .map(c => (c.challengeType ? c : { ...c, challengeType: c.betType || 'outcome' }));
    return res.status(200).json({ challenges: open, count: open.length });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // POST requires auth
  const user = requireAuth(req, res);
  if (!user) return;
  // Every POST here locks or moves escrow (create / accept / cancel).
  if (!(await limit(req, res, 'challenge', { limit: 20, windowSec: 60, id: user.userId }))) return;

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  // The app sends a bare flag (`?accept`, `?cancel`), which parses to ''. Test
  // for presence, not truthiness, or the request falls through to "create".
  const has = (k) => req.query[k] !== undefined;

  // ── CANCEL FLOW ── creator reclaims the stake of an unaccepted challenge
  if (has('cancel') && body.challengeId) {
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
      await appendTx(user.userId, { id: newTxId(), userId: user.userId, type: 'refund', amount: ch.stake, ref: ch.id, ts: Date.now(), balAfter: bal?.available });

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
  if (has('accept') && body.challengeId) {
    // Take the lock FIRST, then read the authoritative record. Reading the board
    // before locking let a second acceptor (or a cancel that ran in between)
    // act on a stale "open" copy: it locked the second player's entry and
    // overwrote the first opponent, trapping the first player's escrow.
    const lockKey = `lock:accept:${body.challengeId}`;
    const gotLock = await kvLock(lockKey, 10);
    if (!gotLock) return res.status(409).json({ error: 'Challenge is being accepted by another player' });

    try {
      const ch = await kvGet(`ch:${body.challengeId}`);
      if (!ch || !verifyChallengeSig(ch)) return res.status(404).json({ error: 'Challenge not found or expired' });
      if (ch.creatorUserId === user.userId) {
        return res.status(400).json({ error: 'Cannot accept your own challenge' });
      }
      if (ch.status !== 'open') {
        return res.status(409).json({ error: 'Challenge is no longer open' });
      }
      if (ch.expiresAt <= Date.now()) {
        return res.status(409).json({ error: 'Challenge has expired' });
      }

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

      ch.status = 'active';
      ch.opponentUserId = user.userId;
      ch.opponentName = displayName(user);
      ch.acceptedAt = Date.now();
      ch.settleDeadline = ch.acceptedAt + SETTLE_WINDOW_MS;

      // Persist first (no TTL: the record must never expire while it holds
      // escrow), then move it from the open board to the active list.
      await persist(ch);
      await removeOpen(ch.id);
      await addActive(ch.id);
      await addUserChallenge(user.userId, ch.id); // index the opponent

      await appendTx(user.userId, { id: newTxId(), userId: user.userId, type: 'escrow_lock', amount: -ch.stake, ref: ch.id, ts: Date.now(), balAfter: bal.available });

      return res.status(200).json({ challenge: ch, message: 'Challenge accepted — escrow locked' });
    } finally {
      await kvUnlock(lockKey);
    }
  }

  // ── CREATE FLOW ──
  const errors = validateChallenge(body);
  if (errors.length) return res.status(400).json({ errors });

  const stake = parseInt(body.stake);

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

  const challenge = {
    id: 'CH_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex'),
    game: body.game,
    modeId,
    modeLabel: modeDef ? modeDef.label : 'Custom duel',
    modeVerifiable,
    mode: (body.mode || (modeDef ? modeDef.label : '')).replace(/[<>"']/g, '').slice(0, 200),
    // challengeType: how the outcome is measured (outcome | target | custom).
    // Accepts the legacy `betType` key on input during the client transition.
    challengeType: body.challengeType || body.betType || 'outcome',
    condition: (body.condition || body.mode || '').replace(/[<>"']/g, '').slice(0, 200),
    stake,
    creatorUserId: user.userId,
    creatorName: displayName(user),
    creatorWins: parseInt(body.creatorWins) || 0,
    creatorCohort,
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
  await addUserChallenge(user.userId, challenge.id); // index the creator

  // Add to open board
  await addOpen(challenge);

  await appendTx(user.userId, { id: newTxId(), userId: user.userId, type: 'escrow_lock', amount: -stake, ref: challenge.id, ts: Date.now(), balAfter: bal.available });

  // Return signed challenge code (short — just id + sig)
  const code = Buffer.from(JSON.stringify({ id: challenge.id, sig: challenge.sig })).toString('base64url');

  return res.status(201).json({ challenge, code, message: 'Challenge posted — stake locked in escrow' });
}
