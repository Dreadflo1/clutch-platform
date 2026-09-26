/**
 * POST /api/challenges/verify-shot
 * Body: { challengeId, handle, image }   image = dataURL or raw base64
 *
 * Screenshot + AI verification for honor-system (non-API) games. Each player
 * uploads their end-of-match scoreboard and declares their in-game name. Claude
 * vision reads each screenshot independently; the server settles ONLY when both
 * screenshots corroborate — same winner, both declared names present, high
 * confidence, no tamper flag. Anything short of that goes to dispute (admin),
 * never an automatic payout off one image.
 */
import { requireAuth } from '../_auth.js';
import { kvGet, kvSet, kvLock, kvUnlock } from '../_kv.js';
import { BalanceError } from '../_balance.js';
import { persist, saveChallenge, settleToWinner } from '../_challenges.js';
import { readScoreboard, nameMatches, visionConfigured } from '../_vision.js';

const MIN_CONFIDENCE = 0.55;
const SHOT_WINDOW_MS = (parseInt(process.env.SHOT_WINDOW_SECONDS) || 300) * 1000; // partner must upload within this of the first shot
const MAX_IMAGE_B64 = 8_000_000; // ~6 MB image
const TERMINAL = new Set(['settled', 'refunded', 'cancelled', 'disputed']);

/** Split a data URL / raw base64 into { data, mediaType }. */
function parseImage(image) {
  if (typeof image !== 'string' || !image) return null;
  const m = image.match(/^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/);
  if (m) return { mediaType: m[1] === 'image/jpg' ? 'image/jpeg' : m[1], data: m[3] };
  if (/^[A-Za-z0-9+/=]+$/.test(image)) return { mediaType: 'image/png', data: image };
  return null;
}

/** Which account a verdict says won, or null if it doesn't cleanly name both. */
function whoWon(v, hC, hO) {
  const winnerIsC = nameMatches(v.winnerName, hC);
  const winnerIsO = nameMatches(v.winnerName, hO);
  if (winnerIsC && !winnerIsO) return 'creator';
  if (winnerIsO && !winnerIsC) return 'opponent';
  return null;
}

async function dispute(res, ch, reason) {
  ch.status = 'disputed';
  ch.disputeReason = reason;
  ch.disputedAt = Date.now();
  await saveChallenge(ch);
  return res.status(200).json({ status: 'disputed', reason, message: 'Screenshots did not agree — sent to review.' });
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const user = requireAuth(req, res);
  if (!user) return;

  if (!visionConfigured()) {
    return res.status(503).json({ error: 'Screenshot verification is not enabled on this server yet.' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  const { challengeId, handle } = body;
  if (!challengeId) return res.status(400).json({ error: 'challengeId required' });
  if (!handle || String(handle).trim().length < 2) return res.status(400).json({ error: 'Your in-game name is required' });

  const img = parseImage(body.image);
  if (!img) return res.status(400).json({ error: 'A PNG/JPEG screenshot is required' });
  if (img.data.length > MAX_IMAGE_B64) return res.status(413).json({ error: 'Screenshot too large (max ~6 MB)' });

  const lockKey = `lock:settle:${challengeId}`;
  let holding = await kvLock(lockKey, 20);
  if (!holding) return res.status(409).json({ error: 'Verification in progress — retry shortly' });
  const release = async () => { if (holding) { holding = false; await kvUnlock(lockKey); } };

  try {
    let ch = await kvGet(`ch:${challengeId}`);
    if (!ch) return res.status(404).json({ error: 'Challenge not found' });
    if (TERMINAL.has(ch.status)) return res.status(409).json({ error: `Already ${ch.status}` });
    if (ch.status !== 'active' && ch.status !== 'awaiting_result') {
      return res.status(400).json({ error: `Cannot verify (status: ${ch.status})` });
    }
    const isCreator = user.userId === ch.creatorUserId;
    const isOpponent = user.userId === ch.opponentUserId;
    if (!isCreator && !isOpponent) return res.status(403).json({ error: 'You are not part of this duel' });
    if (ch.settleDeadline && Date.now() > ch.settleDeadline) {
      return res.status(400).json({ error: 'The result window for this duel has closed.' });
    }

    // One submission per side; re-upload replaces your own pending shot.
    const already = isCreator ? ch.creatorShot : ch.opponentShot;
    const otherShot = isCreator ? ch.opponentShot : ch.creatorShot;

    // Bind the in-game handle to this account (anti-impersonation), same as the
    // API path — a second account can't submit under someone else's name.
    const normHandle = String(handle).trim().toLowerCase();
    const claimKey = `ghandle:${ch.game}:${normHandle}`;
    const claimedBy = await kvGet(claimKey);
    if (claimedBy && claimedBy !== user.userId) {
      return res.status(403).json({ error: 'That game handle is already linked to another CLUTCH account.' });
    }
    if (!claimedBy) await kvSet(claimKey, user.userId);

    // Read this screenshot with the AI (unlocked would be nicer, but the call is
    // short and the lock TTL covers it; a slow call just re-locks on retry).
    const otherName = otherShot ? otherShot.handle : (isCreator ? ch.opponentName : ch.creatorName) || 'Opponent';
    const verdict = await readScoreboard({
      imageBase64: img.data, mediaType: img.mediaType, game: ch.game,
      playerName: String(handle), opponentName: otherName,
    });
    if (!verdict.ok) {
      return res.status(502).json({ error: 'Could not read that screenshot — try a clearer full scoreboard.', detail: verdict.error });
    }

    const shot = {
      handle: String(handle), at: Date.now(),
      winnerName: verdict.winnerName, loserName: verdict.loserName,
      confidence: verdict.confidence, looksEdited: verdict.looksEdited,
      gameDetected: verdict.gameDetected, notes: verdict.notes,
    };
    if (isCreator) ch.creatorShot = shot; else ch.opponentShot = shot;

    const bothPresent = ch.creatorShot && ch.opponentShot;
    if (!bothPresent) {
      ch.status = 'awaiting_result';
      await persist(ch);
      return res.status(200).json({ status: 'awaiting_result', message: 'Screenshot received — waiting for your opponent.' });
    }

    // Freshness: the two screenshots must be uploaded close together.
    if (Math.abs(ch.creatorShot.at - ch.opponentShot.at) > SHOT_WINDOW_MS) {
      return dispute(res, ch, 'shot_window_exceeded');
    }

    const vC = ch.creatorShot, vO = ch.opponentShot;
    if (vC.looksEdited || vO.looksEdited) return dispute(res, ch, 'possible_tampering');
    if (vC.confidence < MIN_CONFIDENCE || vO.confidence < MIN_CONFIDENCE) return dispute(res, ch, 'low_confidence');

    const hC = vC.handle, hO = vO.handle;
    const wc = whoWon(vC, hC, hO);
    const wo = whoWon(vO, hC, hO);
    if (!wc || !wo) return dispute(res, ch, 'names_not_matched');
    if (wc !== wo) return dispute(res, ch, 'result_conflict');

    const winnerId = wc === 'creator' ? ch.creatorUserId : ch.opponentUserId;
    const loserId = wc === 'creator' ? ch.opponentUserId : ch.creatorUserId;
    ch.verifiedByScreenshot = true;
    try {
      await settleToWinner(ch, winnerId, loserId);
    } catch (e) {
      if (e instanceof BalanceError) return res.status(409).json({ error: `Cannot settle escrow (${e.code})` });
      throw e;
    }
    await saveChallenge(ch);
    return res.status(200).json({ status: ch.status, winner: wc, message: 'Verified by screenshots — winner paid.' });
  } finally {
    await release();
  }
}
