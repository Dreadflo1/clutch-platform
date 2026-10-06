/* ════════════════════════════════════════════════════════════
   CLUTCH — landing hub: esports news + the live board.
   Everything shown here is real: news from /api/news (server-side RSS),
   results and numbers from /api/feed (settled duels), open challenges from
   /api/challenges. When there is nothing to show, it says so.
   ════════════════════════════════════════════════════════════ */

function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function timeAgo(date) {
  var t = new Date(date).getTime();
  if (!t) return '';
  var s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

var _hubBase = (typeof ARENA_CONFIG !== 'undefined' && ARENA_CONFIG.API_BASE) || '';

var NEWS_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 22h16a2 2 0 002-2V4a2 2 0 00-2-2H8a2 2 0 00-2 2v16a2 2 0 01-2 2zm0 0a2 2 0 01-2-2v-9c0-1.1.9-2 2-2h2"/></svg>';
var ICON_CHECK = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5l8-3z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>';
var ICON_TROPHY = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4zM7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3"/></svg>';
var ICON_SWORDS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2"/><path d="M9.5 6.5L21 18v3h-3L6.5 9.5"/></svg>';

/* ── NEWS ─────────────────────────────────────────────────── */
function renderNews(articles) {
  var container = document.getElementById('hub-news');
  if (!container) return;
  if (!articles || !articles.length) {
    container.innerHTML = '<div class="lb-empty">Esports news is unavailable right now.</div>';
    return;
  }
  var SHOW_LIMIT = 6;
  var html = '';
  articles.forEach(function (a, idx) {
    var color = a.accent || '#229ed9';
    var link = (a.link && /^https?:\/\//.test(a.link) && !/[<>"']/.test(a.link)) ? a.link : null;
    var tag = link ? 'a' : 'div';
    var attrs = link ? ' href="' + encodeURI(link) + '" target="_blank" rel="noopener noreferrer"' : '';
    var extra = idx >= SHOW_LIMIT ? ' data-news-extra style="--nc-accent:' + color + ';display:none"' : ' style="--nc-accent:' + color + '"';
    var img = (a.image && /^https?:\/\//.test(a.image) && !/[<>"']/.test(a.image))
      ? '<div class="nc-img"><img src="' + encodeURI(a.image) + '" alt="" loading="lazy" decoding="async" onerror="this.parentElement.style.display=\'none\'"/></div>' : '';
    var desc = a.description ? String(a.description).slice(0, 95) + (a.description.length > 95 ? '…' : '') : '';
    html += '<' + tag + ' class="news-card"' + extra + attrs + '>' + img +
      '<div class="nc-head"><div class="nc-icon" style="background:' + color + '22;color:' + color + '">' + NEWS_ICON + '</div>' +
      '<div class="nc-content"><div class="nc-tag" style="background:' + color + '22;color:' + color + '">' + _esc(String(a.category || 'NEWS').slice(0, 15)) + '</div>' +
      '<div class="nc-title">' + _esc(a.title) + '</div>' + (desc ? '<div class="nc-desc">' + _esc(desc) + '</div>' : '') + '</div></div>' +
      '<div class="nc-foot"><span class="nc-src">' + _esc(a.source || 'News') + '</span><span>' + timeAgo(a.date) + '</span></div></' + tag + '>';
  });
  if (articles.length > SHOW_LIMIT) {
    html += '<button class="news-show-more" type="button" onclick="showMoreNews(this)">Show ' + (articles.length - SHOW_LIMIT) + ' more articles</button>';
  }
  container.innerHTML = html;
}

function showMoreNews(btn) {
  document.querySelectorAll('[data-news-extra]').forEach(function (el) { el.style.display = ''; });
  if (btn) btn.remove();
}

/* Ticker under the hero: latest real headlines, hidden when there are none. */
function renderTicker(articles) {
  var wrap = document.getElementById('news-ticker');
  var track = document.getElementById('news-ticker-track');
  if (!wrap || !track) return;
  if (!articles || !articles.length) { wrap.hidden = true; return; }
  var html = '';
  articles.slice(0, 8).forEach(function (a) {
    html += '<span class="nt-item"><span class="nt-dot" style="background:' + (a.accent || 'var(--acc)') + '"></span>' +
      _esc(String(a.title).slice(0, 90)) + '<span class="nt-meta">' + _esc(a.source || '') + ' · ' + timeAgo(a.date) + '</span></span>';
  });
  track.innerHTML = html + html; // doubled for the seamless loop
  wrap.hidden = false;
}

/* ── LIVE BOARD ───────────────────────────────────────────── */
function _fmt(n) { return (Number(n) || 0).toLocaleString('en-US'); }

function renderLiveStats(feed, openCount) {
  var set = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
  set('lb-settled', _fmt(feed.settledTotal));
  set('lb-settled-sub', _fmt(feed.settledThisWeek) + ' this week');
  set('lb-players', _fmt(feed.players));
  set('lb-open', _fmt(openCount));
}

function renderResults(results) {
  var el = document.getElementById('lb-results');
  if (!el) return;
  if (!results.length) {
    el.innerHTML = '<div class="lb-empty">No duel has been settled yet. The first result posted here could be yours.' +
      '<button class="lb-btn" type="button" onclick="quickConnect()">Start a duel</button></div>';
    return;
  }
  el.innerHTML = results.slice(0, 8).map(function (r) {
    var score = r.score ? '<span class="lb-score">' + _esc(r.score[0]) + '-' + _esc(r.score[1]) + '</span>' : '';
    return '<a class="lb-row" href="/r/' + encodeURIComponent(r.id) + '">' +
      '<span class="lb-ico">' + ICON_TROPHY + '</span>' +
      '<span class="lb-main"><span class="lb-title"><b>' + _esc(r.winner) + '</b> beat ' + _esc(r.loser) + ' ' + score + '</span>' +
      '<span class="lb-sub">' + _esc(r.gameLabel) + (r.mode ? ' · ' + _esc(r.mode) : '') + ' · ' + timeAgo(r.settledAt) + '</span></span>' +
      (r.verified ? '<span class="lb-tag ok">' + ICON_CHECK + 'Verified</span>' : '') +
      '<span class="lb-pot">' + _fmt(r.pot) + ' CLU</span></a>';
  }).join('');
}

function renderOpenChallenges(list) {
  var el = document.getElementById('lb-open-list');
  if (!el) return;
  if (!list.length) {
    el.innerHTML = '<div class="lb-empty">No open challenges right now. Post one and send the link to your rival.' +
      '<button class="lb-btn" type="button" onclick="quickConnect()">Post a challenge</button></div>';
    return;
  }
  el.innerHTML = list.slice(0, 6).map(function (c) {
    var left = Math.max(0, c.expiresAt - Date.now());
    var hours = Math.floor(left / 3600000);
    return '<div class="lb-row">' +
      '<span class="lb-ico">' + ICON_SWORDS + '</span>' +
      '<span class="lb-main"><span class="lb-title"><b>' + _esc(c.creatorName || 'Player') + '</b> · ' + _esc(c.modeLabel || c.mode || 'Duel') + '</span>' +
      '<span class="lb-sub">' + _esc(GAME_NAMES[c.game] || c.game) + (c.modeVerifiable ? ' · auto-verified' : ' · both players report') + ' · ' + (hours >= 1 ? hours + 'h left' : 'under 1h left') + '</span></span>' +
      '<span class="lb-pot">' + _fmt(c.stake) + ' CLU entry</span>' +
      '<button class="lb-btn sm" type="button" onclick="quickConnect()">Take it on</button></div>';
  }).join('');
}

var GAME_NAMES = {
  valorant: 'Valorant', lol: 'League of Legends', dota2: 'Dota 2', clashroyale: 'Clash Royale',
  brawlstars: 'Brawl Stars', cs2: 'Counter-Strike 2', fortnite: 'Fortnite', apex: 'Apex Legends',
  ow2: 'Overwatch 2', rl: 'Rocket League', fifa: 'EA Sports FC', cod: 'Call of Duty'
};

function loadLiveBoard() {
  if (!document.getElementById('lb-results')) return;
  var get = function (u) { return fetch(_hubBase + u).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); };
  Promise.all([get('/api/feed'), get('/api/challenges')]).then(function (out) {
    var feed = out[0] || { settledTotal: 0, settledThisWeek: 0, players: 0, recent: [] };
    var open = (out[1] && out[1].challenges) || [];
    renderLiveStats(feed, open.length);
    renderResults(feed.recent || []);
    renderOpenChallenges(open);
  });
}

/* ── INIT ─────────────────────────────────────────────────── */
function initHub() {
  window._hubInited = true; // app.js calls initHub() too; run once
  loadLiveBoard();
  fetch(_hubBase + '/api/news?limit=12')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var list = (data && data.articles) || [];
      renderNews(list);
      renderTicker(list);
    })
    .catch(function () { renderNews([]); renderTicker([]); });
}

function _bootHub() { if (!window._hubInited) initHub(); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _bootHub);
else _bootHub();
