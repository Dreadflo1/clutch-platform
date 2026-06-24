/**
 * CLUTCH — Trending Hub Engine
 * Live gaming content: Twitch clips, YouTube highlights, RSS news, interactive votes.
 * Falls back to curated content when API keys are missing.
 */

/* ════════════════════════════════════════════════════════════
   TWITCH — Clips from top gaming categories
   ════════════════════════════════════════════════════════════ */
var _twitchToken = null;
var _twitchTokenExpiry = 0;

async function getTwitchToken() {
  if (_twitchToken && Date.now() < _twitchTokenExpiry) return _twitchToken;
  if (!hasKey(ARENA_CONFIG.TWITCH_CLIENT_ID) || !hasKey(ARENA_CONFIG.TWITCH_CLIENT_SECRET)) return null;

  try {
    const res = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `client_id=${ARENA_CONFIG.TWITCH_CLIENT_ID}&client_secret=${ARENA_CONFIG.TWITCH_CLIENT_SECRET}&grant_type=client_credentials`
    });
    const data = await res.json();
    _twitchToken = data.access_token;
    _twitchTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return _twitchToken;
  } catch (e) {
    console.warn('[Hub] Twitch token failed:', e.message);
    return null;
  }
}

async function fetchTwitchClips(gameId, count) {
  count = count || 6;
  var token = await getTwitchToken();
  if (!token) return null;

  var gameIds = {
    valorant: '516575', lol: '21779', cs2: '32399',
    fortnite: '33214', apex: '511224', overwatch2: '515025'
  };
  var gid = gameIds[gameId] || gameId || '516575';

  try {
    var res = await fetch(
      'https://api.twitch.tv/helix/clips?game_id=' + gid + '&first=' + count + '&started_at=' + new Date(Date.now() - 86400000).toISOString(),
      { headers: { 'Client-ID': ARENA_CONFIG.TWITCH_CLIENT_ID, 'Authorization': 'Bearer ' + token } }
    );
    var data = await res.json();
    if (!data.data || !data.data.length) return null;

    return data.data.map(function(c) {
      return {
        id: c.id,
        title: c.title,
        url: c.url,
        thumbnail: c.thumbnail_url,
        embedUrl: c.embed_url,
        views: c.view_count,
        creator: c.creator_name,
        game: c.game_id,
        createdAt: c.created_at,
        source: 'Twitch'
      };
    });
  } catch (e) {
    console.warn('[Hub] Twitch clips failed:', e.message);
    return null;
  }
}

/* ════════════════════════════════════════════════════════════
   YOUTUBE — Gaming clips search
   ════════════════════════════════════════════════════════════ */
async function fetchYouTubeClips(query, count) {
  count = count || 4;
  if (!hasKey(ARENA_CONFIG.YOUTUBE_API_KEY)) return null;

  var q = query || 'esports highlights clutch plays';
  try {
    var res = await fetch(
      'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoDuration=short&maxResults=' + count +
      '&q=' + encodeURIComponent(q) + '&order=date&key=' + ARENA_CONFIG.YOUTUBE_API_KEY
    );
    var data = await res.json();
    if (!data.items || !data.items.length) return null;

    return data.items.map(function(v) {
      return {
        id: v.id.videoId,
        title: v.snippet.title,
        url: 'https://youtube.com/watch?v=' + v.id.videoId,
        thumbnail: v.snippet.thumbnails.high ? v.snippet.thumbnails.high.url : v.snippet.thumbnails.default.url,
        embedUrl: 'https://www.youtube.com/embed/' + v.id.videoId,
        channel: v.snippet.channelTitle,
        publishedAt: v.snippet.publishedAt,
        source: 'YouTube'
      };
    });
  } catch (e) {
    console.warn('[Hub] YouTube clips failed:', e.message);
    return null;
  }
}

/* ════════════════════════════════════════════════════════════
   RSS NEWS — Esports feeds (no API key needed)
   ════════════════════════════════════════════════════════════ */
async function fetchRSSNews() {
  var feeds = ARENA_CONFIG.RSS_FEEDS || [];
  var proxy = ARENA_CONFIG.CORS_PROXY || 'https://api.allorigins.win/raw?url=';
  var allArticles = [];

  var promises = feeds.map(function(feed) {
    var controller = new AbortController();
    var timeout = setTimeout(function() { controller.abort(); }, 5000);
    return fetch(proxy + encodeURIComponent(feed.url), { signal: controller.signal })
      .then(function(r) { clearTimeout(timeout); return r.text(); })
      .then(function(xml) {
        var parser = new DOMParser();
        var doc = parser.parseFromString(xml, 'text/xml');
        var items = doc.querySelectorAll('item');
        var articles = [];
        for (var i = 0; i < Math.min(items.length, 5); i++) {
          var item = items[i];
          var title = item.querySelector('title');
          var link = item.querySelector('link');
          var pubDate = item.querySelector('pubDate');
          var desc = item.querySelector('description');
          var category = item.querySelector('category');

          articles.push({
            title: title ? title.textContent.trim() : 'No title',
            link: link ? link.textContent.trim() : '#',
            date: pubDate ? new Date(pubDate.textContent) : new Date(),
            description: desc ? desc.textContent.replace(/<[^>]*>/g, '').slice(0, 120) : '',
            category: category ? category.textContent.trim().toUpperCase() : 'NEWS',
            source: feed.name,
            accent: feed.accent
          });
        }
        return articles;
      })
      .catch(function(e) {
        console.warn('[Hub] RSS failed for ' + feed.name + ':', e.message);
        return [];
      });
  });

  var results = await Promise.all(promises);
  results.forEach(function(a) { allArticles = allArticles.concat(a); });

  allArticles.sort(function(a, b) { return b.date - a.date; });
  return allArticles.slice(0, 10);
}

/* ════════════════════════════════════════════════════════════
   HOT TAKES — Interactive vote system (localStorage)
   ════════════════════════════════════════════════════════════ */
var VOTES_KEY = 'clutch_hub_votes';

function getVotes() {
  try { return JSON.parse(localStorage.getItem(VOTES_KEY)) || {}; } catch(e) { return {}; }
}

function saveVote(takeId, choice) {
  var votes = getVotes();
  votes[takeId] = choice;
  localStorage.setItem(VOTES_KEY, JSON.stringify(votes));
}

function hasVoted(takeId) {
  return getVotes()[takeId] || null;
}

var HOT_TAKES_DATA = [
  { id:'ht1', category:'META',        statement:'"Ranked matchmaking is more broken in 2025 than it has ever been."',      agree:67, disagree:33, total:2847 },
  { id:'ht2', category:'SKILL',       statement:'"If you can\'t reach Diamond solo queue, you simply don\'t have what it takes for pro play."', agree:41, disagree:59, total:4210 },
  { id:'ht3', category:'PRO SCENE',   statement:'"Faker is the GOAT of all esports — not just LoL. No debate."',           agree:78, disagree:22, total:8932 },
  { id:'ht4', category:'GAME DESIGN', statement:'"Fortnite building killed competitive FPS for an entire generation of players."', agree:55, disagree:45, total:3501 },
  { id:'ht5', category:'HOT TAKE',    statement:'"Controller aim assist in PC lobbies is literally soft aimbot."',          agree:62, disagree:38, total:6120 },
];

function castVote(takeId, choice) {
  if (hasVoted(takeId)) return;
  saveVote(takeId, choice);

  var take = HOT_TAKES_DATA.find(function(t) { return t.id === takeId; });
  if (take) {
    take.total++;
    if (choice === 'agree') take.agree = Math.round((take.agree * (take.total - 1) / take.total) + (100 / take.total));
    else take.disagree = 100 - take.agree;
  }

  renderHotTakes();
}

/* ════════════════════════════════════════════════════════════
   RENDERERS — Build DOM from live data
   ════════════════════════════════════════════════════════════ */
function timeAgo(date) {
  var diff = (Date.now() - new Date(date).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

function formatViews(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

var CATEGORY_ICONS = {
  'PATCH NOTES': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>',
  'TOURNAMENT': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 010-5H6"/><path d="M18 9h1.5a2.5 2.5 0 000-5H18"/><path d="M4 22h16"/><path d="M18 2H6v7a6 6 0 0012 0V2z"/></svg>',
  'ROSTER MOVE': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>',
  'META SHIFT': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10"/></svg>',
  'LEAK': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  'NEWS': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 22h16a2 2 0 002-2V4a2 2 0 00-2-2H8a2 2 0 00-2 2v16a2 2 0 01-2 2zm0 0a2 2 0 01-2-2v-9c0-1.1.9-2 2-2h2"/></svg>',
  'DRAMA': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"/></svg>',
  'UPDATE': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10"/></svg>',
  'TRANSFER': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>',
  'RUMOR': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
};

var CATEGORY_COLORS = {
  'PATCH NOTES': '#e8344a', 'TOURNAMENT': '#e8a020', 'ROSTER MOVE': '#3d7ff5',
  'META SHIFT': '#9b5cf6', 'LEAK': '#00d46e', 'NEWS': '#229ed9', 'DRAMA': '#ff6b35',
  'UPDATE': '#00d46e', 'TRANSFER': '#3d7ff5', 'RUMOR': '#9b5cf6'
};

function renderClips(clips, containerId) {
  var container = document.getElementById(containerId || 'hub-clips');
  if (!container || !clips || !clips.length) return;

  var html = '<div class="clip-section-hdr"><span class="gi gi-sm gi-purple"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg></span> VIRAL CLIPS</div>';
  clips.forEach(function(clip) {
    html += '<div class="clip-card" onclick="window.open(\'' + clip.url + '\',\'_blank\')">' +
      '<div class="clip-thumb">' +
        '<div class="clip-thumb-bg" style="background-image:url(' + clip.thumbnail + ')"></div>' +
        '<div class="clip-thumb-overlay"></div>' +
        (clip.source === 'Twitch' ? '<div class="clip-live-badge">CLIP</div>' : '') +
        '<div class="clip-src-badge">' + clip.source + '</div>' +
        '<div class="clip-play"><svg width="20" height="20" fill="white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>' +
        (clip.views ? '<div class="clip-views-overlay"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline;vertical-align:-1px"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> ' + formatViews(clip.views) + '</div>' : '') +
      '</div>' +
      '<div class="clip-meta">' +
        '<div class="clip-title">' + clip.title + '</div>' +
        '<div class="clip-stats">' +
          '<span><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="display:inline;vertical-align:-1px"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ' + (clip.creator || clip.channel || 'Unknown') + '</span>' +
          '<span><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="display:inline;vertical-align:-1px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ' + timeAgo(clip.createdAt || clip.publishedAt) + '</span>' +
        '</div>' +
      '</div>' +
    '</div>';
  });
  container.innerHTML = html;
}

function renderNews(articles, containerId) {
  var container = document.getElementById(containerId || 'hub-news');
  if (!container) return;

  if (!articles || !articles.length) {
    container.innerHTML = '<div style="text-align:center;padding:24px;color:var(--txt3);font-size:13px">Loading esports news...</div>';
    return;
  }

  var SHOW_LIMIT = 5;
  var html = '<div class="clip-section-hdr"><span class="gi gi-sm gi-blue"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 22h16a2 2 0 002-2V4a2 2 0 00-2-2H8a2 2 0 00-2 2v16a2 2 0 01-2 2zm0 0a2 2 0 01-2-2v-9c0-1.1.9-2 2-2h2"/></svg></span> ESPORTS NEWS</div>';
  articles.forEach(function(article, idx) {
    var cat = article.category.toUpperCase().slice(0, 15);
    var color = CATEGORY_COLORS[cat] || article.accent || '#229ed9';
    var icon = CATEGORY_ICONS[cat] || '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 22h16a2 2 0 002-2V4a2 2 0 00-2-2H8a2 2 0 00-2 2v16a2 2 0 01-2 2zm0 0a2 2 0 01-2-2v-9c0-1.1.9-2 2-2h2"/></svg>';
    var hidden = idx >= SHOW_LIMIT ? ' style="display:none" data-news-extra' : '';

    var imgHtml = '';
    if (article.image && /^https?:\/\//.test(article.image) && !/[<>"']/.test(article.image)) {
      imgHtml = '<div class="nc-img"><img src="' + encodeURI(article.image) + '" alt="" loading="lazy" onerror="this.parentElement.style.display=\'none\'"/></div>';
    }

    var safeLink = (article.link && /^https?:\/\//.test(article.link)) ? article.link.replace(/'/g,'') : '#';
    html += '<div class="news-card"' + hidden + ' style="--nc-accent:' + color + '" data-href="' + safeLink + '" onclick="if(this.dataset.href!==\'#\')window.open(this.dataset.href,\'_blank\')">' +
      imgHtml +
      '<div class="nc-head">' +
        '<div class="nc-icon" style="background:' + color + '22">' + icon + '</div>' +
        '<div class="nc-content">' +
          '<div class="nc-tag" style="background:' + color + '22;color:' + color + '">' + cat + '</div>' +
          '<div class="nc-title">' + article.title + '</div>' +
          (article.description ? '<div class="nc-desc">' + article.description + '</div>' : '') +
        '</div>' +
      '</div>' +
      '<div class="nc-foot">' +
        '<span class="nc-src">' + article.source + '</span>' +
        '<span>' + timeAgo(article.date) + '</span>' +
      '</div>' +
    '</div>';
  });

  if (articles.length > SHOW_LIMIT) {
    html += '<button class="news-show-more" onclick="showMoreNews(this)">Show ' + (articles.length - SHOW_LIMIT) + ' more articles</button>';
  }

  container.innerHTML = html;
}

function renderHotTakes(containerId) {
  var container = document.getElementById(containerId || 'hub-takes');
  if (!container) return;

  var html = '<div class="clip-section-hdr"><span class="gi gi-sm gi-red"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"/></svg></span> HOT TAKES — YOU DECIDE</div>';
  HOT_TAKES_DATA.forEach(function(take) {
    var voted = hasVoted(take.id);
    var isVoted = !!voted;

    html += '<div class="hot-take-card' + (isVoted ? ' voted' : '') + '">' +
      '<div class="ht-category">' + take.category + '</div>' +
      '<div class="ht-statement">' + take.statement + '</div>';

    if (isVoted) {
      html += '<div class="ht-bar"><div class="ht-bar-fill" style="width:' + take.agree + '%"></div></div>' +
        '<div class="ht-bar-lbl"><span>' + take.agree + '% agree</span><span>' + formatViews(take.total) + ' votes</span></div>';
    } else {
      html += '<div class="ht-vote-row">' +
        '<button class="ht-vote-btn agree" onclick="castVote(\'' + take.id + '\',\'agree\')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg><span>AGREE</span></button>' +
        '<button class="ht-vote-btn disagree" onclick="castVote(\'' + take.id + '\',\'disagree\')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10zM17 2h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17"/></svg><span>DISAGREE</span></button>' +
      '</div>';
    }

    html += '</div>';
  });
  container.innerHTML = html;
}

/* ════════════════════════════════════════════════════════════
   TICKER — Animated news ticker from live data
   ════════════════════════════════════════════════════════════ */
function renderTicker(articles) {
  var track = document.querySelector('.ticker-track');
  if (!track || !articles || !articles.length) return;

  var html = '';
  articles.slice(0, 8).forEach(function(a) {
    var cat = a.category.toUpperCase().slice(0, 12);
    var color = CATEGORY_COLORS[cat] || a.accent || '#00d46e';
    html += '<div class="ticker-item">' +
      '<span class="ti-dot" style="background:' + color + '"></span>' +
      '<span class="ti-tag" style="background:' + color + '22;color:' + color + '">' + cat + '</span> ' +
      a.title.slice(0, 80) + (a.title.length > 80 ? '…' : '') +
    '</div>';
  });
  track.innerHTML = html + html;
}

/* ════════════════════════════════════════════════════════════
   TAB FILTERING
   ════════════════════════════════════════════════════════════ */
var _hubActiveTab = 'all';

function showMoreNews(btn) {
  document.querySelectorAll('[data-news-extra]').forEach(function(el) {
    el.style.display = '';
  });
  if (btn) btn.remove();
}

function setHubTab(tab) {
  _hubActiveTab = tab;

  document.querySelectorAll('.hub-tab').forEach(function(t) {
    t.classList.toggle('active', t.getAttribute('data-tab') === tab);
  });

  var clipsCol = document.getElementById('hub-clips');
  var newsCol = document.getElementById('hub-news');
  var takesCol = document.getElementById('hub-takes');

  if (clipsCol) clipsCol.style.display = (tab === 'all' || tab === 'clips') ? '' : 'none';
  if (newsCol) newsCol.style.display = (tab === 'all' || tab === 'news') ? '' : 'none';
  if (takesCol) takesCol.style.display = (tab === 'all' || tab === 'takes') ? '' : 'none';
}

/* ════════════════════════════════════════════════════════════
   INIT — Load everything on page ready
   ════════════════════════════════════════════════════════════ */
var _hubClipsCache = null;
var _hubNewsCache = null;

var FALLBACK_NEWS = [
  { title:'Riot nerfs 7 champions at once — ranked queue is complete chaos', source:'RiotGames', category:'PATCH NOTES', accent:'#ef4444', date:new Date(Date.now()-7200000), link:'#' },
  { title:'ESL Pro League S20: massive upset — #1 seed drops out in groups', source:'HLTV', category:'TOURNAMENT', accent:'#f59e0b', date:new Date(Date.now()-14400000), link:'#' },
  { title:'G2 Esports signs surprise AWPer — community splits on the pick', source:'Dot Esports', category:'ROSTER MOVE', accent:'#8b5cf6', date:new Date(Date.now()-18000000), link:'#' },
  { title:'New Apex movement tech discovered — pros are already abusing it', source:'Reddit', category:'META SHIFT', accent:'#22c55e', date:new Date(Date.now()-28800000), link:'#' },
  { title:'CoD map pack leaked — fan-favourite location confirmed returning', source:'CharlieIntel', category:'LEAK', accent:'#06b6d4', date:new Date(Date.now()-36000000), link:'#' },
];

async function initHub() {
  renderHotTakes();

  document.querySelectorAll('.hub-tab').forEach(function(t) {
    t.addEventListener('click', function() { setHubTab(this.getAttribute('data-tab')); });
  });

  // Fetch live news from backend RSS proxy
  var base = (typeof ARENA_CONFIG !== 'undefined' && ARENA_CONFIG.API_BASE) || '';
  var newsPromise = fetch(base + '/api/news?limit=15')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.articles && data.articles.length) {
        _hubNewsCache = data.articles;
        renderNews(data.articles);
        renderTicker(data.articles);
      } else {
        renderNews(FALLBACK_NEWS);
      }
    })
    .catch(function() {
      renderNews(FALLBACK_NEWS);
    });

  var twitchPromise = fetchTwitchClips('valorant', 3).then(function(clips) {
    if (clips) {
      var ytPromise = fetchYouTubeClips('esports clutch plays 2025', 3);
      return ytPromise.then(function(ytClips) {
        var combined = clips.concat(ytClips || []);
        _hubClipsCache = combined;
        renderClips(combined);
        return combined;
      });
    }
    return fetchYouTubeClips('esports clutch plays 2025', 6).then(function(ytClips) {
      if (ytClips) {
        _hubClipsCache = ytClips;
        renderClips(ytClips);
      }
      return ytClips;
    });
  }).catch(function() {
    console.info('[Hub] Clip APIs unavailable, keeping curated content');
  });

  await Promise.all([newsPromise, twitchPromise]);
}

/* ════════════════════════════════════════════════════════════
   LIVE ACTIVITY PULSE — rotating fake activity feed
   ════════════════════════════════════════════════════════════ */
var ACTIVITY_TEMPLATES = [
  { dot:'green', tpl:'{name} won <span class="lp-amount">{amount} CLU</span> in a {game} duel' },
  { dot:'gold',  tpl:'{name} created a <span class="lp-amount">{amount} CLU</span> {game} challenge' },
  { dot:'purple',tpl:'{name} accepted a {game} duel · escrow locked' },
  { dot:'green', tpl:'{name} collected <span class="lp-amount">{amount} CLU</span> from {game}' },
  { dot:'gold',  tpl:'{name} is looking for a {game} opponent · <span class="lp-amount">{amount} CLU</span> stake' },
];
var ACTIVITY_NAMES = ['0xAb3..f2','TurboKid','ShadowFx','GhostPepper','Luna_Pro','NightOwl','FragMaster','IceVein','CryptoGamer','PixelSniper','NoScope_Q','VoidWalker'];
var ACTIVITY_GAMES = ['Valorant','CS2','LoL','Fortnite','Apex Legends','Overwatch 2'];
var ACTIVITY_AMOUNTS = ['500','1,000','2,000','2,500','5,000','10,000'];

function generateActivity() {
  var t = ACTIVITY_TEMPLATES[Math.floor(Math.random()*ACTIVITY_TEMPLATES.length)];
  var name = ACTIVITY_NAMES[Math.floor(Math.random()*ACTIVITY_NAMES.length)];
  var game = ACTIVITY_GAMES[Math.floor(Math.random()*ACTIVITY_GAMES.length)];
  var amount = ACTIVITY_AMOUNTS[Math.floor(Math.random()*ACTIVITY_AMOUNTS.length)];
  var text = t.tpl.replace('{name}',name).replace('{game}',game).replace('{amount}',amount);
  return { dot: t.dot, html: '<strong>' + name.split(' ')[0] + '</strong> ' + text.replace('<strong>'+name+'</strong>','').replace(name,''), time: 'just now' };
}

function pushActivity() {
  var bar = document.getElementById('live-pulse-bar');
  if (!bar) return;
  var act = generateActivity();
  var card = document.createElement('div');
  card.className = 'lp-card';
  card.style.opacity = '0';
  card.style.transform = 'translateX(-20px)';
  card.innerHTML = '<span class="lp-dot ' + act.dot + '"></span> ' + act.html + ' <span class="lp-time">' + act.time + '</span>';
  bar.insertBefore(card, bar.firstChild);
  requestAnimationFrame(function() {
    card.style.transition = 'all .4s ease';
    card.style.opacity = '1';
    card.style.transform = 'translateX(0)';
  });
  if (bar.children.length > 8) bar.removeChild(bar.lastChild);
}

function animatePlayerCount() {
  var el = document.querySelector('.hub-live-count');
  if (!el) return;
  var base = 800 + Math.floor(Math.random() * 200);
  setInterval(function() {
    base += Math.floor(Math.random() * 7) - 3;
    if (base < 750) base = 750;
    if (base > 1200) base = 1200;
    el.innerHTML = '<span class="hlc-dot"></span> ' + base.toLocaleString() + ' players online now';
  }, 8000);
}

/* ════════════════════════════════════════════════════════════
   ANIMATED COUNTERS — hero stats count up on load
   ════════════════════════════════════════════════════════════ */
function animateCounter(el, target, suffix) {
  suffix = suffix || '';
  var duration = 1500;
  var start = 0;
  var startTime = null;
  function step(ts) {
    if (!startTime) startTime = ts;
    var progress = Math.min((ts - startTime) / duration, 1);
    var eased = 1 - Math.pow(1 - progress, 3);
    var current = Math.floor(eased * target);
    el.textContent = current.toLocaleString() + suffix;
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function initHeroCounters() {
  var duels = document.getElementById('stat-duels');
  var volume = document.getElementById('stat-volume');
  var players = document.getElementById('stat-players');
  if (duels) animateCounter(duels, 1247, '');
  if (volume) animateCounter(volume, 42, ' ETH');
  if (players) animateCounter(players, 893, '');
}

/* ════════════════════════════════════════════════════════════
   BOOT
   ════════════════════════════════════════════════════════════ */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(initHub, 500);
    setTimeout(initHeroCounters, 800);
    setTimeout(animatePlayerCount, 1000);
    setInterval(pushActivity, 12000);
  });
} else {
  setTimeout(initHub, 500);
  setTimeout(initHeroCounters, 800);
  setTimeout(animatePlayerCount, 1000);
  setInterval(pushActivity, 12000);
}
