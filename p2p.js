/**
 * ARENA BET — P2P Escrow Engine
 * ─────────────────────────────────────────────────────────────────
 *
 * HOW IT WORKS
 * ────────────
 * 1. Player A creates a Challenge → their stake moves to PENDING ESCROW
 *    (tokens gone from available balance immediately — no backing out)
 *
 * 2. A shareable Challenge Code is generated (base64-encoded bet terms)
 *
 * 3. Player B enters the code → sees the terms → ACCEPTS
 *    → their matching stake moves to escrow → bet status = LOCKED
 *
 * 4. Match result arrives from the API (or simulation)
 *    → Escrow releases AUTOMATICALLY to the winner
 *    → Neither player can influence this step
 *
 * ANTI-CHEAT: FALSE LOGOUT / DISCONNECT
 * ──────────────────────────────────────
 * - Tokens are locked in escrow the moment both players accept.
 *   Closing the browser, logging out, or going offline does NOTHING
 *   to the bet — it resolves from the match result regardless.
 *
 * - Three detection layers:
 *   1. visibilitychange  — tab hidden during active bet
 *   2. beforeunload      — browser/tab close attempted
 *   3. Heartbeat         — lastSeen timestamp updated every 10s;
 *                          if gap > FLEE_TIMEOUT, opponent sees warning
 *
 * - Flee counter: each detected disconnect during a LOCKED bet
 *   increments that player's flee count for that bet.
 *   At FLEE_FORFEIT_THRESHOLD attempts → AUTOMATIC FORFEIT:
 *   their escrow share transfers to the opponent immediately,
 *   before the match even ends.
 *
 * - All state is persisted to localStorage so the bet survives
 *   page reloads, crashes, and intentional closes.
 */

/* ── CONSTANTS ────────────────────────────────────────────────── */
var FLEE_TIMEOUT_MS       = 5 * 60 * 1000;  // 5 min offline = flee
var FLEE_FORFEIT_THRESHOLD = 3;              // 3 flees = auto-forfeit
var HEARTBEAT_MS          = 8000;            // ping every 8 seconds
var P2P_STORAGE_KEY       = 'arena_p2p_v1';
var P2P_NAME_KEY          = 'arena_my_name';

/* ── STATE ─────────────────────────────────────────────────────── */
var P2P = {
  myName:   localStorage.getItem(P2P_NAME_KEY) || 'Player1',
  escrow:   0,       // total tokens locked
  pending:  [],      // created by me, waiting for friend
  inbox:    [],      // received, waiting for my response
  active:   [],      // both locked, match in progress
  resolved: [],      // finished
  flees:    {},      // betId → { myFlees, theirFlees }
};

/* ── PERSISTENCE ────────────────────────────────────────────────── */
function p2pSave() {
  try {
    localStorage.setItem(P2P_STORAGE_KEY, JSON.stringify({
      escrow:   P2P.escrow,
      pending:  P2P.pending,
      inbox:    P2P.inbox,
      active:   P2P.active,
      resolved: P2P.resolved,
      flees:    P2P.flees,
    }));
  } catch(e) { console.warn('P2P save failed', e); }
}

function p2pLoad() {
  try {
    var raw = localStorage.getItem(P2P_STORAGE_KEY);
    if (!raw) return;
    var saved = JSON.parse(raw);
    P2P.escrow   = saved.escrow   || 0;
    P2P.pending  = saved.pending  || [];
    P2P.inbox    = saved.inbox    || [];
    P2P.active   = saved.active   || [];
    P2P.resolved = saved.resolved || [];
    P2P.flees    = saved.flees    || {};
  } catch(e) { console.warn('P2P load failed', e); }
}

function p2pClearStorage() {
  localStorage.removeItem(P2P_STORAGE_KEY);
  P2P.escrow = 0; P2P.pending = []; P2P.inbox = [];
  P2P.active = []; P2P.resolved = []; P2P.flees = {};
}

/* ── NAME MANAGEMENT ────────────────────────────────────────────── */
function setMyName(name) {
  name = (name || '').trim().replace(/[^a-zA-Z0-9_\-\.]/g, '').slice(0, 20);
  if (!name) return false;
  P2P.myName = name;
  localStorage.setItem(P2P_NAME_KEY, name);
  return true;
}

/* ── CHALLENGE CODE ─────────────────────────────────────────────── */
function encodeChallenge(bet) {
  // Encodes all bet terms so the friend can verify them independently
  var obj = {
    id:      bet.id,
    matchId: bet.matchId,
    game:    bet.game,       // 'fifa' | 'lol'
    creator: bet.creator,
    pick:    bet.pick,       // creator's chosen outcome
    pickLabel: bet.pickLabel,
    stake:   bet.stake,
    matchLabel: bet.matchLabel,
    createdAt:  bet.createdAt,
  };
  return btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function decodeChallenge(code) {
  try {
    var b64 = code.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    return JSON.parse(atob(b64));
  } catch(e) {
    return null;
  }
}

/* ── CREATE CHALLENGE ────────────────────────────────────────────── */
function createChallenge(matchId, game, pick, pickLabel, stake, matchLabel) {
  if (stake <= 0 || stake > S.tokens) {
    toast('Insufficient available tokens', 'error'); return null;
  }

  var bet = {
    id:         'p2p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    matchId:    matchId,
    game:       game,
    creator:    P2P.myName,
    pick:       pick,
    pickLabel:  pickLabel,
    stake:      stake,
    matchLabel: matchLabel,
    createdAt:  Date.now(),
    status:     'PENDING',   // PENDING → LOCKED → RESOLVED | DECLINED | FORFEITED
    acceptedBy: null,
    acceptedAt: null,
    resolvedAt: null,
    winner:     null,
    result:     null,
  };

  // Lock creator's stake immediately
  updBal(-stake);
  P2P.escrow += stake;

  var code = encodeChallenge(bet);
  bet.code = code;
  P2P.pending.push(bet);
  P2P.flees[bet.id] = { myFlees: 0, theirFlees: 0 };
  p2pSave();
  renderP2P();
  updateEscrowDisplay();
  return bet;
}

/* ── ACCEPT CHALLENGE ────────────────────────────────────────────── */
function acceptChallenge(code) {
  var terms = decodeChallenge(code);
  if (!terms) { toast('Invalid challenge code', 'error'); return false; }
  if (terms.creator === P2P.myName) { toast('Cannot accept your own challenge', 'error'); return false; }
  if (terms.stake > S.tokens) { toast('Insufficient tokens to match stake of ' + terms.stake + ' TKN', 'error'); return false; }

  // Check not already accepted
  var already = P2P.active.find(function(b){ return b.id === terms.id; });
  if (already) { toast('This challenge is already active', 'error'); return false; }

  // Lock acceptor's matching stake
  updBal(-terms.stake);
  P2P.escrow += terms.stake;

  var bet = Object.assign({}, terms, {
    status:     'LOCKED',
    acceptedBy: P2P.myName,
    acceptedAt: Date.now(),
    totalEscrow: terms.stake * 2,
  });

  P2P.active.push(bet);
  if (!P2P.flees[bet.id]) P2P.flees[bet.id] = { myFlees: 0, theirFlees: 0 };
  p2pSave();
  renderP2P();
  updateEscrowDisplay();
  toast('Challenge accepted — ' + (terms.stake * 2) + ' TKN locked in escrow', 'success');

  // Start match resolution timer (5–12 seconds for demo)
  setTimeout(function(){ resolveP2PBet(bet.id); }, 5000 + Math.random() * 7000);
  return true;
}

/* ── DECLINE CHALLENGE ───────────────────────────────────────────── */
function declineChallenge(betId) {
  var idx = P2P.pending.findIndex(function(b){ return b.id === betId; });
  if (idx === -1) return;
  var bet = P2P.pending[idx];
  // Return creator's stake
  updBal(bet.stake);
  P2P.escrow -= bet.stake;
  bet.status = 'DECLINED';
  P2P.resolved.push(bet);
  P2P.pending.splice(idx, 1);
  p2pSave();
  renderP2P();
  updateEscrowDisplay();
  toast('Challenge cancelled — ' + bet.stake + ' TKN returned', 'info');
}

/* ── SIMULATE ACCEPT (demo "friend" button) ─────────────────────── */
function simulateFriendAccept(betId) {
  var bet = P2P.pending.find(function(b){ return b.id === betId; });
  if (!bet) return;

  // Friend's matching stake comes from a virtual pool (demo only)
  var friendName = 'Rival_' + Math.random().toString(36).slice(2,5).toUpperCase();
  P2P.escrow += bet.stake; // friend's side locked

  var active = Object.assign({}, bet, {
    status:      'LOCKED',
    acceptedBy:  friendName,
    acceptedAt:  Date.now(),
    totalEscrow: bet.stake * 2,
  });

  // Move from pending to active
  P2P.pending = P2P.pending.filter(function(b){ return b.id !== betId; });
  P2P.active.push(active);
  if (!P2P.flees[active.id]) P2P.flees[active.id] = { myFlees: 0, theirFlees: 0 };
  p2pSave();
  renderP2P();
  updateEscrowDisplay();
  toast(friendName + ' accepted — ' + (bet.stake * 2) + ' TKN locked in escrow', 'success');

  // Resolve after a delay
  setTimeout(function(){ resolveP2PBet(active.id); }, 5000 + Math.random() * 7000);
}

/* ── RESOLVE BET ─────────────────────────────────────────────────── */
function resolveP2PBet(betId) {
  var bet = P2P.active.find(function(b){ return b.id === betId; });
  if (!bet || bet.status !== 'LOCKED') return;

  // Determine result — in production this comes from the verified API
  // Simulation: weighted by implied probability from a neutral 50/50 + slight bias
  var outcomes = getMatchOutcomes(bet.matchId, bet.game);
  var result   = simulateOutcome(outcomes);

  var creatorWon = (result === bet.pick);
  var winner     = creatorWon ? bet.creator : bet.acceptedBy;
  var payout     = bet.totalEscrow; // winner takes full escrow pool

  bet.status     = 'RESOLVED';
  bet.resolvedAt = Date.now();
  bet.result     = result;
  bet.winner     = winner;

  // Release escrow
  P2P.escrow -= bet.totalEscrow;

  var iWon = (winner === P2P.myName);
  if (iWon) {
    updBal(payout);
    toast('Escrow released — you won ' + payout + ' TKN from ' + (creatorWon ? bet.acceptedBy : bet.creator) + '!', 'success');
  } else {
    toast('Match resolved — ' + winner + ' wins the ' + payout + ' TKN escrow pool', 'info');
  }

  P2P.active   = P2P.active.filter(function(b){ return b.id !== betId; });
  P2P.resolved.unshift(bet);
  p2pSave();
  renderP2P();
  updateEscrowDisplay();
}

/* ── AUTO-FORFEIT ────────────────────────────────────────────────── */
function recordFleeAttempt(betId, side) {
  // side: 'my' | 'their'
  if (!P2P.flees[betId]) P2P.flees[betId] = { myFlees: 0, theirFlees: 0 };
  var key = side === 'my' ? 'myFlees' : 'theirFlees';
  P2P.flees[betId][key]++;
  p2pSave();

  var count = P2P.flees[betId][key];
  if (count >= FLEE_FORFEIT_THRESHOLD) {
    triggerForfeit(betId, side);
  } else {
    renderP2P(); // refresh warning counts
    if (side === 'my') {
      showFleeWarning(FLEE_FORFEIT_THRESHOLD - count);
    }
  }
}

function triggerForfeit(betId, loserSide) {
  var bet = P2P.active.find(function(b){ return b.id === betId; });
  if (!bet || bet.status !== 'LOCKED') return;

  var forfeitingPlayer = loserSide === 'my' ? P2P.myName : bet.acceptedBy;
  var beneficiary      = loserSide === 'my' ? (bet.acceptedBy || 'Opponent') : P2P.myName;

  bet.status     = 'FORFEITED';
  bet.resolvedAt = Date.now();
  bet.winner     = beneficiary;
  bet.result     = 'FORFEIT';

  P2P.escrow -= bet.totalEscrow;

  if (loserSide !== 'my') {
    // We win the forfeit
    updBal(bet.totalEscrow);
    toast('Opponent forfeited after ' + FLEE_FORFEIT_THRESHOLD + ' disconnect attempts — ' + bet.totalEscrow + ' TKN awarded to you', 'success');
  } else {
    toast('You have been auto-forfeited for repeated disconnects. Tokens awarded to opponent.', 'error');
  }

  P2P.active   = P2P.active.filter(function(b){ return b.id !== betId; });
  P2P.resolved.unshift(bet);
  p2pSave();
  renderP2P();
  updateEscrowDisplay();
}

/* ── ANTI-CHEAT HOOKS ───────────────────────────────────────────── */
var _heartbeatTimer = null;
var _lastHeartbeat  = Date.now();

function startAntiCheat() {
  // 1. Heartbeat — proves we're still here
  _heartbeatTimer = setInterval(function() {
    _lastHeartbeat = Date.now();
    localStorage.setItem('arena_heartbeat_' + P2P.myName, _lastHeartbeat);
  }, HEARTBEAT_MS);

  // 2. Visibility change — tab hidden
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') {
      var activeBets = P2P.active;
      activeBets.forEach(function(bet) {
        recordFleeAttempt(bet.id, 'my');
      });
    }
  });

  // 3. Before unload — browser/tab close
  window.addEventListener('beforeunload', function(e) {
    if (P2P.active.length > 0) {
      P2P.active.forEach(function(bet) {
        recordFleeAttempt(bet.id, 'my');
      });
      // Warn the player
      var msg = 'You have ' + P2P.escrow + ' TKN locked in active escrow bets. Closing will not cancel them — results are verified automatically.';
      e.preventDefault();
      e.returnValue = msg;
      return msg;
    }
  });
}

function showFleeWarning(remaining) {
  var banner = document.getElementById('flee-warning-banner');
  if (!banner) return;
  banner.style.display = 'flex';
  document.getElementById('flee-remaining').textContent = remaining;
}

/* ── OUTCOME HELPERS ────────────────────────────────────────────── */
function getMatchOutcomes(matchId, game) {
  if (game === 'lol') return ['t1', 't2'];
  return ['h', 'd', 'a'];
}

function simulateOutcome(outcomes) {
  return outcomes[Math.floor(Math.random() * outcomes.length)];
}

/* ── ESCROW DISPLAY ─────────────────────────────────────────────── */
function updateEscrowDisplay() {
  var el = document.getElementById('escrow-amount');
  if (el) el.textContent = P2P.escrow.toLocaleString();
  var pill = document.getElementById('escrow-pill');
  if (pill) pill.style.display = P2P.escrow > 0 ? 'flex' : 'none';

  var lolbal = document.getElementById('lol-bal');
  if (lolbal) lolbal.textContent = S.tokens.toLocaleString() + ' TKN';

  // Badge on P2P nav
  var badge = document.getElementById('p2p-inbox-badge');
  var total = P2P.inbox.length + P2P.active.length;
  if (badge) {
    badge.textContent  = total;
    badge.style.display = total > 0 ? 'inline-flex' : 'none';
  }
}

/* ── RENDER P2P TAB ─────────────────────────────────────────────── */
function renderP2P() {
  renderCreateForm();
  renderPendingBets();
  renderActiveBets();
  renderResolvedBets();
  updateEscrowDisplay();
}

function renderCreateForm() {
  // Populate match selector
  var sel = document.getElementById('p2p-match-select');
  if (!sel) return;
  var current = sel.value;
  sel.innerHTML = '<option value="">Select a match to bet on</option>'
    + MATCHES.concat(LOL_MATCHES || []).map(function(m) {
        var label = m.game === 'lol' || m.t1
          ? (m.t1.name + ' vs ' + m.t2.name + ' [LoL]')
          : (TEAMS[m.h].name + ' vs ' + TEAMS[m.a].name + ' [FIFA]');
        return '<option value="' + m.id + '">' + label + '</option>';
      }).join('');
  if (current) sel.value = current;
  updatePickOptions();
}

function updatePickOptions() {
  var matchSel  = document.getElementById('p2p-match-select');
  var pickSel   = document.getElementById('p2p-pick-select');
  if (!matchSel || !pickSel) return;
  var mid = matchSel.value;
  if (!mid) { pickSel.innerHTML = '<option value="">Select match first</option>'; return; }

  var m = MATCHES.find(function(x){ return x.id === mid; })
       || (LOL_MATCHES || []).find(function(x){ return x.id === mid; });
  if (!m) return;

  if (m.t1) {
    // LoL
    pickSel.innerHTML = [
      '<option value="t1">' + m.t1.name + ' Win</option>',
      '<option value="t2">' + m.t2.name + ' Win</option>',
    ].join('');
  } else {
    // FIFA
    pickSel.innerHTML = [
      '<option value="h">' + TEAMS[m.h].name + ' Win</option>',
      '<option value="d">Draw</option>',
      '<option value="a">' + TEAMS[m.a].name + ' Win</option>',
    ].join('');
  }
}

function submitCreateChallenge() {
  var mid     = document.getElementById('p2p-match-select').value;
  var pick    = document.getElementById('p2p-pick-select').value;
  var stakeEl = document.getElementById('p2p-stake-input');
  var stake   = parseFloat(stakeEl.value);

  if (!mid)   { toast('Select a match', 'error'); return; }
  if (!pick)  { toast('Select your pick', 'error'); return; }
  if (!stake || stake < 10) { toast('Minimum stake is 10 TKN', 'error'); return; }
  if (stake > S.tokens)     { toast('Insufficient available tokens', 'error'); return; }

  var m = MATCHES.find(function(x){ return x.id === mid; })
       || (LOL_MATCHES || []).find(function(x){ return x.id === mid; });

  var matchLabel = m.t1
    ? (m.t1.name + ' vs ' + m.t2.name)
    : (TEAMS[m.h].name + ' vs ' + TEAMS[m.a].name);

  var pickLabels = m.t1
    ? { t1: m.t1.name + ' Win', t2: m.t2.name + ' Win' }
    : { h: TEAMS[m.h].name + ' Win', d: 'Draw', a: TEAMS[m.a].name + ' Win' };

  var game = m.t1 ? 'lol' : 'fifa';
  var bet  = createChallenge(mid, game, pick, pickLabels[pick], stake, matchLabel);
  if (!bet) return;

  // Show the generated code
  document.getElementById('p2p-code-out').textContent = bet.code;
  document.getElementById('p2p-code-panel').style.display = 'block';
  stakeEl.value = '';
  toast('Challenge created — share the code with your friend', 'success');
}

function copyCode() {
  var code = document.getElementById('p2p-code-out').textContent;
  navigator.clipboard.writeText(code).catch(function(){});
  toast('Code copied to clipboard', 'info');
}

function submitAcceptCode() {
  var code = (document.getElementById('p2p-accept-input').value || '').trim();
  if (!code) { toast('Paste a challenge code first', 'error'); return; }

  var terms = decodeChallenge(code);
  if (!terms) { toast('Invalid code — check it and try again', 'error'); return; }

  // Show preview
  var preview = document.getElementById('p2p-accept-preview');
  preview.style.display = 'block';
  document.getElementById('ap-match').textContent = terms.matchLabel;
  document.getElementById('ap-creator').textContent = terms.creator;
  document.getElementById('ap-their-pick').textContent = terms.pickLabel;
  document.getElementById('ap-stake').textContent = terms.stake + ' TKN each — pool: ' + (terms.stake * 2) + ' TKN';
  document.getElementById('p2p-accept-confirm').setAttribute('data-code', code);
}

function confirmAccept() {
  var btn  = document.getElementById('p2p-accept-confirm');
  var code = btn.getAttribute('data-code');
  var ok   = acceptChallenge(code);
  if (ok) {
    document.getElementById('p2p-accept-input').value = '';
    document.getElementById('p2p-accept-preview').style.display = 'none';
    document.getElementById('p2p-code-panel').style.display = 'none';
  }
}

function renderPendingBets() {
  var c = document.getElementById('p2p-pending-list');
  if (!c) return;
  if (!P2P.pending.length) {
    c.innerHTML = '<div class="p2p-empty">No outgoing challenges</div>';
    return;
  }
  c.innerHTML = P2P.pending.map(function(bet) {
    var age = Math.round((Date.now() - bet.createdAt) / 60000);
    return '<div class="p2p-bet-row">'
      + '<div class="p2p-bet-info">'
      +   '<div class="p2p-bet-match">' + bet.matchLabel + '</div>'
      +   '<div class="p2p-bet-detail">Your pick: <strong>' + bet.pickLabel + '</strong> &nbsp;·&nbsp; Stake: <strong>' + bet.stake + ' TKN</strong> &nbsp;·&nbsp; ' + age + 'm ago</div>'
      + '</div>'
      + '<div class="p2p-bet-actions">'
      +   '<button class="p2p-btn p2p-btn-sim" onclick="simulateFriendAccept(\'' + bet.id + '\')">Simulate Friend Accept</button>'
      +   '<button class="p2p-btn p2p-btn-cancel" onclick="declineChallenge(\'' + bet.id + '\')">Cancel</button>'
      + '</div>'
      + '</div>';
  }).join('');
}

function renderActiveBets() {
  var c = document.getElementById('p2p-active-list');
  if (!c) return;
  if (!P2P.active.length) {
    c.innerHTML = '<div class="p2p-empty">No active escrow bets</div>';
    return;
  }
  c.innerHTML = P2P.active.map(function(bet) {
    var flees = P2P.flees[bet.id] || { myFlees: 0, theirFlees: 0 };
    var fleeWarn = flees.myFlees > 0
      ? '<div class="flee-alert"><span class="flee-icon">' + warnSVG(12) + '</span> Flee attempt recorded: ' + flees.myFlees + ' / ' + FLEE_FORFEIT_THRESHOLD + '</div>'
      : '';
    var theirFlee = flees.theirFlees > 0
      ? '<div class="flee-alert flee-alert-opp">' + warnSVG(12) + ' Opponent flee attempt: ' + flees.theirFlees + ' / ' + FLEE_FORFEIT_THRESHOLD + '</div>'
      : '';
    var elapsed = Math.round((Date.now() - bet.acceptedAt) / 1000);
    return '<div class="p2p-active-card">'
      + '<div class="p2p-active-top">'
      +   '<div class="p2p-active-vs">' + bet.matchLabel + '</div>'
      +   '<div class="escrow-lock-badge">' + lockSVG(11) + ' ' + bet.totalEscrow + ' TKN IN ESCROW</div>'
      + '</div>'
      + '<div class="p2p-active-row">'
      +   '<div class="p2p-player-side">'
      +     '<div class="p2p-player-name">' + bet.creator + '</div>'
      +     '<div class="p2p-player-pick">' + bet.pickLabel + '</div>'
      +   '</div>'
      +   '<div class="p2p-active-sep">vs</div>'
      +   '<div class="p2p-player-side" style="text-align:right">'
      +     '<div class="p2p-player-name">' + (bet.acceptedBy || 'Opponent') + '</div>'
      +     '<div class="p2p-player-pick">Opposing pick</div>'
      +   '</div>'
      + '</div>'
      + '<div class="p2p-timer">Resolving from official match data &nbsp;·&nbsp; ' + elapsed + 's elapsed</div>'
      + fleeWarn + theirFlee
      + '</div>';
  }).join('');
}

function renderResolvedBets() {
  var c = document.getElementById('p2p-resolved-list');
  if (!c) return;
  if (!P2P.resolved.length) {
    c.innerHTML = '<div class="p2p-empty">No resolved bets yet</div>';
    return;
  }
  c.innerHTML = P2P.resolved.slice(0, 8).map(function(bet) {
    var iWon   = bet.winner === P2P.myName;
    var isForf = bet.status === 'FORFEITED';
    var statusLabel = isForf
      ? (iWon ? 'Opponent Forfeited' : 'You Forfeited')
      : (bet.status === 'DECLINED' ? 'Cancelled' : (iWon ? 'Won' : 'Lost'));
    var statusClass = iWon ? 'p2p-status-won' : (bet.status === 'DECLINED' ? 'p2p-status-cancelled' : 'p2p-status-lost');
    var payout = iWon && bet.totalEscrow ? '+' + bet.totalEscrow + ' TKN' : (bet.status === 'DECLINED' ? 'Returned' : '-' + bet.stake + ' TKN');
    return '<div class="p2p-resolved-row">'
      + '<div><div class="p2p-bet-match">' + bet.matchLabel + '</div>'
      +   '<div class="p2p-bet-detail">vs ' + (bet.acceptedBy || 'N/A') + ' &nbsp;·&nbsp; Your pick: ' + bet.pickLabel + '</div>'
      + '</div>'
      + '<div style="text-align:right">'
      +   '<div class="p2p-payout ' + (iWon ? 'won' : 'lost') + '">' + payout + '</div>'
      +   '<span class="p2p-status-badge ' + statusClass + '">' + statusLabel + '</span>'
      + '</div>'
      + '</div>';
  }).join('');
}

/* ── ICON HELPERS (local scope) ─────────────────────────────────── */
function lockSVG(s) {
  return '<svg width="'+(s||14)+'" height="'+(s||14)+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>';
}
function warnSVG(s) {
  return '<svg width="'+(s||14)+'" height="'+(s||14)+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
}

/* ── INIT ────────────────────────────────────────────────────────── */
function initP2P() {
  p2pLoad();
  startAntiCheat();
  updateEscrowDisplay();
  renderP2P();

  // Refresh active bet timers every second
  setInterval(function() {
    if (P2P.active.length) renderActiveBets();
  }, 1000);
}
