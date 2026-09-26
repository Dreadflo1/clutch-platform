// ═══════════════════════════════════════════════════════
//  CLU v2 — Main Application Script
// ═══════════════════════════════════════════════════════

var CLU_USD   = (window.ARENA_CONFIG && ARENA_CONFIG.TOKEN_USD_RATE) || 0.10;
var PLATFORM_FEE = 0.025;

// ── SCREEN NAVIGATION ─────────────────────────────────
var SCREEN_TITLES = {
  dashboard:'Dashboard', create:'New Duel', accept:'Accept Duel',
  board:'Duel Board', duels:'My Duels', history:'Duel History',
  tokens:'Token Store', leaderboard:'Leaderboard', terms:'Terms & Legal', profile:'Profile',
  wallet:'Wallet', admin:'Admin'
};

function initAppShell() {
  var body = document.body;
  var app = document.getElementById('page-app');
  var landing = document.getElementById('page-landing');
  var toast = document.getElementById('toast-wrap');
  var ids = ['win-modal','loss-modal','result-modal','connect-modal'];
  ids.forEach(function(id){
    var el = document.getElementById(id);
    if (el && el.parentElement !== body) body.appendChild(el);
  });
  if (app && app.parentElement !== body) {
    if (landing && landing.parentElement === body) {
      body.insertBefore(app, landing.nextSibling);
    } else {
      body.appendChild(app);
    }
  }
  if (toast && toast.parentElement !== body) body.insertBefore(toast, body.firstChild);
  var content = app && app.querySelector('.app-content');
  if (content) {
    var main = app.querySelector('.app-main');
    if (main) {
      var looseScreens = main.querySelectorAll(':scope > .screen');
      looseScreens.forEach(function(s){ content.appendChild(s); });
    }
    if (content.children.length === 0) {
      console.warn('[AppShell] No screens in .app-content — rebuilding shell reference');
    }
  }
  try { window.scrollTo(0, 0); } catch(e){}
  return true;
}

// Open the Clutch Ambassador HQ (separate app) in a new tab. URL from config.
function openAmbassadors() {
  var url = (window.ARENA_CONFIG && ARENA_CONFIG.AMBASSADOR_URL) || '';
  if (!url) { if (typeof toast === 'function') toast('Ambassador program link not configured yet', 'info'); return; }
  window.open(url, '_blank', 'noopener,noreferrer');
}

function goTo(id) {
  var target = document.getElementById('scr-' + id);
  if (!target) {
    console.warn('[goTo] Screen not found: scr-' + id);
    return;
  }
  document.querySelectorAll('.screen').forEach(function(s){ s.classList.remove('active'); });
  target.classList.add('active');
  var tb = document.getElementById('topbar-title');
  if (tb) tb.textContent = SCREEN_TITLES[id] || '';
  document.querySelectorAll('.snav-item').forEach(function(el){
    el.classList.toggle('active', el.dataset.s === id);
  });
  document.querySelectorAll('.bnav-item').forEach(function(el){
    var match = (el.getAttribute('onclick') || '').indexOf("'"+id+"'") > -1;
    el.classList.toggle('active', match);
  });
  if (window.innerWidth < 768) closeSidebar();
  if (id === 'board') { try { initBoard(); } catch(e){} }
  if (id === 'profile') { try { renderProfile(); } catch(e){} }
  if (id === 'wallet') { try { syncBalance().then(function(){ renderWallet(); }); } catch(e){} }
  if (id === 'admin') { try { renderAdmin(); } catch(e){} }
  if (id === 'duels') { try { renderDuels(); } catch(e){} }
  if (id === 'history') { try { renderHistory(); } catch(e){} }
  if (id === 'tokens') { try { renderTokens(); } catch(e){} }
  if (id === 'leaderboard') { try { renderLeaderboard(); } catch(e){} }
  if (id === 'dashboard') { try { if (!window._hubInited) { initHub(); window._hubInited = true; } } catch(e){} }
  if (id === 'create') {
    try { buildGameGrids(); renderWizPresets(); wizGoTo(1); } catch(e){}
  }
  var appContent = document.querySelector('.app-content');
  if (appContent) { appContent.scrollTop = 0; }
  window.scrollTo(0, 0);
}

// ── MOBILE SIDEBAR (hamburger) ────────────────────────
// Below 768px .sidebar is display:none by default (styles.css); these
// toggle the .open class (sidebar) + .show class (overlay) that make it
// visible as an off-canvas panel. No-op above 768px since the sidebar is
// already visible inline and there's nothing to open/close.
function openSidebar() {
  var sidebar = document.getElementById('app-sidebar');
  var overlay = document.getElementById('sidebar-overlay');
  var btn = document.getElementById('topbar-menu-btn');
  if (sidebar) sidebar.classList.add('open');
  if (overlay) overlay.classList.add('show');
  if (btn) btn.setAttribute('aria-expanded', 'true');
}
function closeSidebar() {
  var sidebar = document.getElementById('app-sidebar');
  var overlay = document.getElementById('sidebar-overlay');
  var btn = document.getElementById('topbar-menu-btn');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('show');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}
function toggleSidebar() {
  var sidebar = document.getElementById('app-sidebar');
  if (sidebar && sidebar.classList.contains('open')) closeSidebar();
  else openSidebar();
}
document.addEventListener('keydown', function(e){
  if (e.key === 'Escape') closeSidebar();
});
// Safety net: if the viewport is resized past the mobile breakpoint while
// the off-canvas sidebar is open, drop the open/show state so it doesn't
// linger as a fixed-position panel once .sidebar is display:flex inline again.
window.addEventListener('resize', function(){
  if (window.innerWidth >= 768) closeSidebar();
});

// ── SAFE PLAY ────────────────────────────────────────
var SAFE_PLAY = (function(){
  try { return JSON.parse(localStorage.getItem('clutch_safeplay')||'{}'); } catch(e){ return {}; }
})();
var SESSION = (function(){
  try { return JSON.parse(sessionStorage.getItem('clutch_session')||'{}'); } catch(e){ return {}; }
})();
function saveSafePlay(){ try { localStorage.setItem('clutch_safeplay', JSON.stringify(SAFE_PLAY)); } catch(e){} }
function saveSession(){ try { sessionStorage.setItem('clutch_session', JSON.stringify(SESSION)); } catch(e){} }

var STREAK = (function(){
  try { return JSON.parse(localStorage.getItem('clutch_streak')||'{"current":0,"type":"none"}'); } catch(e){ return {current:0,type:'none'}; }
})();
function saveStreak(){ try { localStorage.setItem('clutch_streak', JSON.stringify(STREAK)); } catch(e){} }

var FIRST_BUY_DONE = (function(){
  return localStorage.getItem('clutch_firstbuy')==='1';
})();

var BUNDLES = [
  {id:'starter',   icon:'S', name:'STARTER',   clu:500,    bonus:0,     price:'$4.99',  badge:null,      cls:''},
  {id:'challenger',icon:'C', name:'CHALLENGER', clu:2000,   bonus:200,   price:'$19.99', badge:'NEW',     cls:'new'},
  {id:'pro',       icon:'P', name:'PRO',        clu:5000,   bonus:750,   price:'$49.99', badge:'POPULAR', cls:'pop'},
  {id:'whale',     icon:'W', name:'WHALE',      clu:15000,  bonus:3000,  price:'$129.99',badge:'VALUE',   cls:'val'},
  {id:'legend',    icon:'L', name:'LEGEND',     clu:50000,  bonus:12500, price:'$399.99',badge:null,      cls:''},
];

var STARTING_BALANCE = 500;

var GAMES = [
  {id:'valorant',     name:'Valorant',            api:true,  apiName:'Riot API',      color:'#ff4655', verify:'auto'},
  {id:'lol',          name:'League of Legends',    api:true,  apiName:'Riot API',      color:'#c89b3c', verify:'auto'},
  {id:'dota2',        name:'Dota 2',               api:true,  apiName:'Steam API',     color:'#c23c2a', verify:'auto'},
  {id:'clashroyale',  name:'Clash Royale',         api:false, apiName:null,            color:'#4ba3e3', verify:'screenshot'},
  {id:'brawlstars',   name:'Brawl Stars',          api:false, apiName:null,            color:'#f0c832', verify:'screenshot'},
  {id:'cs2',          name:'Counter-Strike 2',     api:false, apiName:null,            color:'#de9b35', verify:'screenshot'},
  {id:'fortnite',     name:'Fortnite',             api:false, apiName:null,            color:'#9d4dff', verify:'screenshot'},
  {id:'apex',         name:'Apex Legends',         api:false, apiName:null,            color:'#FF4D5E', verify:'screenshot'},
  {id:'ow2',          name:'Overwatch 2',          api:false, apiName:null,            color:'#f99e1a', verify:'screenshot'},
  {id:'rl',           name:'Rocket League',        api:false, apiName:null,            color:'#0078f2', verify:'screenshot'},
  {id:'fifa',         name:'EA FC',                api:false, apiName:null,            color:'#00FF87', verify:'screenshot'},
  {id:'cod',          name:'Call of Duty',         api:false, apiName:null,            color:'#ffffff', verify:'screenshot'},
];

var U = {
  addr:null, name:null, via:null,
  balance:STARTING_BALANCE, escrow:0,
  avatar:null, streak:0
};

var CREATE = { game:null, challengeType:'outcome' };
var PENDING_ACCEPT = null;
var _selectedResult = null;
var _resultDuelId   = null;
var _proofDataUrl   = null; // last uploaded screenshot (data URL) for AI verification

function loadDuels(){ try { var arr = JSON.parse(localStorage.getItem('clutch_duels')||'[]'); return arr.map(function(d){ if(d && !d.challengeType) d.challengeType = d.betType || 'outcome'; return d; }); } catch(e){ return []; } }
function saveDuels(){ try { localStorage.setItem('clutch_duels', JSON.stringify(DUELS)); } catch(e){} }
var DUELS = loadDuels();

function saveProfile(){
  var data = {addr:U.addr,name:U.name,via:U.via,avatar:U.avatar,streak:U.streak};
  if (!_authToken) {
    data.balance = U.balance;
    data.escrow = U.escrow;
  }
  try { localStorage.setItem('clutch_profile', JSON.stringify(data)); } catch(e){}
}
function loadProfile(){
  try {
    var d = JSON.parse(localStorage.getItem('clutch_profile')||'null');
    if(d && d.addr){
      U.addr=d.addr; U.name=d.name; U.via=d.via; U.avatar=d.avatar; U.streak=d.streak||0;
      if (_authToken) {
        U.balance = 0; U.escrow = 0;
      } else {
        U.balance = d.balance||STARTING_BALANCE; U.escrow = d.escrow||0;
      }
      return true;
    }
  } catch(e){}
  return false;
}

// ── TOAST ─────────────────────────────────────────────
function toast(msg, type) {
  type = type || 'info';
  var wrap = document.querySelector('.toast-wrap');
  if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
  var t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(function() { t.style.opacity = '0'; t.style.transform = 'translateY(12px)'; setTimeout(function() { t.remove(); }, 200); }, 3000);
}

// ── MODALS ────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

// ── DEPOSIT / WITHDRAW (real, server-backed) ─────────────
function _cluRate() { return (window.ARENA_CONFIG && ARENA_CONFIG.TOKEN_USD_RATE) || 0.10; }
function setDep(u) { var el = document.getElementById('dep-usd'); if (el) { el.value = u; updDepPreview(); } }
function updDepPreview() {
  var u = parseFloat((document.getElementById('dep-usd') || {}).value) || 0;
  var clu = Math.floor(u / _cluRate());
  var e = document.getElementById('dep-equiv');
  if (e) e.innerHTML = 'You receive: <strong>' + clu + ' CLU</strong>';
}
function openDepositModal() {
  if (!_authToken) { toast('Connect your wallet first', 'error'); return; }
  updDepPreview(); openModal('deposit-modal');
}
async function submitDeposit(method) {
  if (!_authToken) { toast('Connect your wallet first', 'error'); return; }
  var usd = parseFloat((document.getElementById('dep-usd') || {}).value);
  if (!usd || usd < 1 || usd > 500) { toast('Enter an amount between $1 and $500', 'error'); return; }
  var st = document.getElementById('dep-status'); if (st) st.textContent = 'Creating payment…';
  var url = method === 'stripe' ? '/api/wallet/stripe-checkout' : '/api/wallet/nowpayments-create';
  try {
    var res = await authFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usd: usd }) });
    var data = await res.json();
    if (res.status === 503) { toast((method === 'stripe' ? 'Card' : 'Crypto') + ' payments not enabled yet', 'error'); if (st) st.textContent = ''; return; }
    if (!res.ok || !data.url) { toast(data.error || 'Payment failed', 'error'); if (st) st.textContent = ''; return; }
    if (st) st.textContent = 'Redirecting to secure payment…';
    window.location.href = data.url;
  } catch (e) { toast('Payment error', 'error'); if (st) st.textContent = ''; }
}
function openWithdrawModal() {
  if (!_authToken) { toast('Connect your wallet first', 'error'); return; }
  var a = document.getElementById('wd-avail'); if (a) a.textContent = (U.balance || 0);
  openModal('withdraw-modal');
}
async function submitWithdraw() {
  if (!_authToken) { toast('Connect your wallet first', 'error'); return; }
  var clu = parseInt((document.getElementById('wd-clu') || {}).value);
  var cur = (document.getElementById('wd-cur') || {}).value;
  var addr = (((document.getElementById('wd-addr') || {}).value) || '').trim();
  if (!clu || clu < 10) { toast('Minimum withdrawal is 10 CLU', 'error'); return; }
  if (addr.length < 12) { toast('Enter a valid destination address', 'error'); return; }
  var st = document.getElementById('wd-status'); if (st) st.textContent = 'Requesting…';
  try {
    var res = await authFetch('/api/wallet/withdraw', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: clu, rail: 'crypto', destination: addr, currency: cur }) });
    var data = await res.json();
    if (!res.ok) { toast(data.error || 'Withdrawal failed', 'error'); if (st) st.textContent = ''; return; }
    toast('Withdrawal requested — payout is queued', 'success');
    closeModal('withdraw-modal'); syncBalance();
  } catch (e) { toast('Withdrawal error', 'error'); if (st) st.textContent = ''; }
}
// Legacy token-page handlers → route to the real deposit flow (were undefined)
function buyWithETH() { openDepositModal(); }
function buyBundle() { openDepositModal(); }
function openFiat() { openDepositModal(); }
function setEth() {} function updBuyPreview() {}
function toggleEthPanel() {
  var p = document.getElementById('eth-panel'); var a = document.getElementById('eth-toggle-arrow');
  if (p) p.style.display = (p.style.display === 'none' || !p.style.display) ? 'block' : 'none';
  if (a) a.classList.toggle('open');
}

// ── FEE DROPDOWN ─────────────────────────────────────
function toggleFeeDropdown() {
  var body = document.getElementById('fee-body');
  var chev = document.getElementById('fee-chevron');
  body.classList.toggle('hidden');
  chev.classList.toggle('open');
}

// ── QUICK PLAY FUNNEL ────────────────────────────────
var GAME_PRESETS = {
  valorant: { label:'Valorant', presets:[
    {name:'Casual 1v1', desc:'Deathmatch, first to win', stake:50, mode:'1v1 Deathmatch'},
    {name:'Ranked Match', desc:'Competitive match outcome', stake:250, mode:'Ranked Win'},
    {name:'Big Flex', desc:'Best of 3, winner takes all', stake:1000, mode:'Best of 3'},
  ]},
  lol: { label:'League of Legends', presets:[
    {name:'Solo Queue', desc:'Next ranked game, winner takes pot', stake:100, mode:'Ranked Solo'},
    {name:'1v1 Mid', desc:'Custom 1v1 mid lane, first blood wins', stake:250, mode:'1v1 Mid First Blood'},
    {name:'Bo3 Series', desc:'Best of 3 ranked games', stake:500, mode:'Best of 3'},
  ]},
  cs2: { label:'CS2', presets:[
    {name:'Quick Match', desc:'Next competitive map, winner takes it', stake:100, mode:'Competitive Win'},
    {name:'Aim Duel', desc:'1v1 aim map, first to 16 kills', stake:250, mode:'1v1 Aim Duel'},
    {name:'Premier', desc:'Premier mode, rating on the line', stake:500, mode:'Premier Match'},
  ]},
  fortnite: { label:'Fortnite', presets:[
    {name:'Kill Race', desc:'Same lobby, most eliminations wins', stake:100, mode:'Kill Race'},
    {name:'1v1 Build', desc:'Creative 1v1, best of 5 rounds', stake:250, mode:'1v1 Creative'},
    {name:'Victory Crown', desc:'First to get a Victory Royale', stake:500, mode:'Victory Royale'},
  ]},
  apex: { label:'Apex Legends', presets:[
    {name:'Damage Race', desc:'Same match, highest damage wins', stake:100, mode:'Damage Race'},
    {name:'Win Race', desc:'First to win a BR match', stake:250, mode:'First Win'},
    {name:'Ranked Grind', desc:'Most RP gained in 3 games', stake:500, mode:'Ranked RP Race'},
  ]},
  dota2: { label:'Dota 2', presets:[
    {name:'Pub Match', desc:'Next pub game, winner takes pot', stake:100, mode:'Pub Win'},
    {name:'Ranked', desc:'Ranked match outcome', stake:250, mode:'Ranked Win'},
    {name:'1v1 Mid', desc:'Solo mid, first to 2 kills or tower', stake:500, mode:'1v1 Mid'},
  ]},
  clashroyale: { label:'Clash Royale', presets:[
    {name:'Ladder Match', desc:'Next ladder game, crowns decide', stake:50, mode:'Ladder Win'},
    {name:'Bo3', desc:'Best of 3 ladder games', stake:150, mode:'Best of 3'},
    {name:'Challenge Run', desc:'Who gets more wins in a classic challenge', stake:250, mode:'Challenge Wins'},
  ]},
  brawlstars: { label:'Brawl Stars', presets:[
    {name:'Quick Match', desc:'Next 3v3 game outcome', stake:50, mode:'3v3 Win'},
    {name:'Showdown', desc:'Higher placement in solo showdown', stake:100, mode:'Showdown Placement'},
    {name:'Power League', desc:'Ranked Power League match', stake:250, mode:'Power League Win'},
  ]},
};

function showGamePresets(game) {
  var data = GAME_PRESETS[game];
  if (!data) { quickConnect(); return; }
  document.querySelectorAll('.qp-game').forEach(function(b){ b.classList.remove('active'); });
  var btn = document.querySelector('.qp-game[data-game="'+game+'"]');
  if (btn) btn.classList.add('active');
  document.getElementById('qp-game-label').textContent = data.label + ' — pick your duel:';
  var html = '';
  data.presets.forEach(function(p) {
    html += '<button class="qp-preset" onclick="quickChallenge(\''+game+'\',\''+p.mode+'\','+p.stake+')">'
      + '<div class="qp-preset-name">'+p.name+'</div>'
      + '<div class="qp-preset-desc">'+p.desc+'</div>'
      + '<div class="qp-preset-stake">'+p.stake.toLocaleString()+' CLU</div>'
      + '<div class="qp-preset-tag">Instant · 24h expiry</div>'
      + '</button>';
  });
  document.getElementById('qp-presets').innerHTML = html;
  document.getElementById('qp-step1').style.display = 'none';
  document.getElementById('qp-step2').classList.remove('hidden');
}

function hideGamePresets() {
  document.getElementById('qp-step1').style.display = '';
  document.getElementById('qp-step2').classList.add('hidden');
  document.querySelectorAll('.qp-game').forEach(function(b){ b.classList.remove('active'); });
}

function quickConnect() {
  switchAuthTab('signup');
  document.getElementById('connect-modal').classList.remove('hidden');
}

function scrollFac(pageIndex) {
  var scroller = document.getElementById('fac-scroll');
  if (!scroller) return;
  var card = scroller.querySelector('.fac-card');
  if (!card) return;
  var cardWidth = card.getBoundingClientRect().width;
  var style = window.getComputedStyle(scroller);
  var gap = parseFloat(style.columnGap || style.gap || 0) || 14;
  var scrollAmount = pageIndex * (cardWidth * 3 + gap * 2);
  scroller.scrollTo({ left: scrollAmount, behavior: 'smooth' });
}

document.addEventListener('DOMContentLoaded', function () {
  var facScroller = document.getElementById('fac-scroll');
  if (!facScroller) return;
  var facDots = document.querySelectorAll('#fac-dots .fac-scroll-dot');
  var currentActive = 0;
  facScroller.addEventListener('scroll', function () {
    var card = facScroller.querySelector('.fac-card');
    if (!card) return;
    var cardWidth = card.getBoundingClientRect().width;
    var style = window.getComputedStyle(facScroller);
    var gap = parseFloat(style.columnGap || style.gap || 0) || 14;
    var pageWidth = cardWidth * 3 + gap * 2;
    var scrollLeft = facScroller.scrollLeft;
    var idx = Math.max(0, Math.round(scrollLeft / pageWidth));
    idx = Math.min(idx, facDots.length - 1);
    if (idx !== currentActive) {
      if (facDots[currentActive]) facDots[currentActive].classList.remove('active');
      if (facDots[idx]) facDots[idx].classList.add('active');
      currentActive = idx;
    }
  }, { passive: true });
});

// Auth tab switcher (Sign up / Log in)
function switchAuthTab(which) {
  var fs = document.getElementById('auth-form-signup');
  var fl = document.getElementById('auth-form-login');
  var ts = document.getElementById('tab-signup');
  var tl = document.getElementById('tab-login');
  if (!fs || !fl || !ts || !tl) return;
  if (which === 'login') {
    fs.style.display = 'none';
    fl.style.display = 'block';
    ts.style.background = 'transparent';
    ts.style.color = 'var(--txt2)';
    ts.style.boxShadow = 'none';
    ts.style.fontWeight = '800';
    tl.style.background = 'linear-gradient(180deg,#1dffab,#00d972)';
    tl.style.color = '#04130a';
    tl.style.boxShadow = '0 8px 22px rgba(0,255,135,.3),0 1px 0 rgba(255,255,255,.35) inset';
    tl.style.fontWeight = '900';
  } else {
    fs.style.display = 'block';
    fl.style.display = 'none';
    tl.style.background = 'transparent';
    tl.style.color = 'var(--txt2)';
    tl.style.boxShadow = 'none';
    tl.style.fontWeight = '800';
    ts.style.background = 'linear-gradient(180deg,#1dffab,#00d972)';
    ts.style.color = '#04130a';
    ts.style.boxShadow = '0 8px 22px rgba(0,255,135,.3),0 1px 0 rgba(255,255,255,.35) inset';
    ts.style.fontWeight = '900';
  }
}

// Auth form handler — creates fake session for demo then redirects into challenge flow or app
function submitAuth(e, mode) {
  e.preventDefault();
  var btn = e.target.querySelector('button[type=submit]');
  var original = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = 'Entering Clutch…'; }
  var restore = function(){ if (btn) { btn.disabled = false; btn.innerHTML = original; } };
  var email, password, name;
  if (mode === 'login') {
    email = ((document.getElementById('li-email')||{}).value || '').trim();
    password = (document.getElementById('li-password')||{}).value || '';
  } else {
    email = ((document.getElementById('su-email')||{}).value || '').trim();
    password = (document.getElementById('su-password')||{}).value || '';
    name = (document.getElementById('su-username')||{}).value || '';
  }
  fetch((ARENA_CONFIG.API_BASE || '') + '/api/auth/email', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ mode: mode, email: email, password: password, name: name })
  }).then(function(res){ return res.json().catch(function(){ return {}; }).then(function(data){ return { ok: res.ok, data: data }; }); })
    .then(async function(r){
      if (!r.ok || !r.data.token) { toast(r.data.error || 'Sign-in failed', 'error'); restore(); return; }
      _authToken = r.data.token;
      try { sessionStorage.setItem('clutch_jwt', _authToken); } catch(err) {}
      U.userId = r.data.user.id; U.name = r.data.user.name; U.via = 'email'; U.addr = r.data.user.id;
      await syncBalance();
      if (typeof saveProfile === 'function') saveProfile();
      closeModal('connect-modal');
      restore();
      toast(mode === 'login' ? 'Welcome back, ' + (U.name||'') + '!' : 'Account created — welcome to Clutch!', 'success');
      var qc = sessionStorage.getItem('quick_challenge');
      if (qc) { try { qc = JSON.parse(qc); executeQuickChallenge(qc.game, qc.mode, qc.stake); return; } catch(err){} }
      enterApp();
    }).catch(function(){ toast('Connection error — try again', 'error'); restore(); });
  return false;
}

// Legacy demo flow retained (unused, never called) — kept out of the reachable path.
function _submitAuthLegacyUnused(e, mode) {
  e.preventDefault();
  var btn = e.target.querySelector('button[type=submit]');
  var original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" style=\"display:inline-block;vertical-align:-2px;margin-right:8px;animation:spin .9s linear infinite\"><circle cx=\"12\" cy=\"12\" r=\"9\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-dasharray=\"38\" stroke-dashoffset=\"10\" stroke-linecap=\"round\"/></svg>Entering Clutch...';
  setTimeout(function(){
    // Set fake auth session (demo mode)
    sessionStorage.setItem('clutch_auth_via', mode === 'login' ? 'login' : 'signup');
    try {
      var uField = mode === 'login' ? document.getElementById('li-email').value : document.getElementById('su-username').value;
      if (uField) U.name = U.addr = uField.trim().substring(0,16);
    } catch(err){}
    closeModal('connect-modal');
    btn.disabled = false;
    btn.innerHTML = original;
    toast(mode === 'login' ? 'Welcome back ' + (U.name||'champ') + '!' : 'Account created · Welcome to Clutch!', 'success');
    // If user had a pending quick challenge, execute it now — else go to APP
    var qc = sessionStorage.getItem('quick_challenge');
    if (qc) {
      try { qc = JSON.parse(qc); executeQuickChallenge(qc.game, qc.mode, qc.stake); return; } catch(e){}
    }
    // Otherwise enter app flow
    if (typeof showAppPage === 'function') { showAppPage(); }
    else {
      try {
        var pg = document.getElementById('page-landing');
        var pa = document.getElementById('page-app');
        if (pg) pg.style.display = 'none';
        if (pa) pa.style.display = 'block';
      } catch(err){}
      if (typeof refreshAll === 'function') refreshAll();
      if (typeof buildGameGrids === 'function') buildGameGrids();
      if (typeof buildCondFields === 'function') buildCondFields();
      if (typeof buildGamesRow === 'function') buildGamesRow();
    }
  }, 900);
  return false;
}

// Quick social/auth shortcuts (Wallet/Telegram/Discord/Steam — fake session + flow
function quickAuth(which) {
  // Only the wallet path is a real, server-verified login (MetaMask signature -> JWT).
  if (which === 'wallet') { closeModal('connect-modal'); connectMeta(); return; }
  var _soon = {telegram:'Telegram',discord:'Discord',steam:'Steam'};
  toast((_soon[which] || which) + ' sign-in is coming soon — use Connect Wallet, or browse as guest', 'info');
  return;
  var names = {wallet:'Crypto Wallet',telegram:'Telegram',discord:'Discord',steam:'Steam'};
  var icons = {wallet:'var(--purple)',telegram:'#26A5E4',discord:'var(--purple)',steam:'var(--txt)'};
  closeModal('connect-modal');
  sessionStorage.setItem('clutch_auth_via', which);
  U.name = U.addr = (which === 'wallet' ? '0x7F…A2…' : (which.charAt(0).toUpperCase()+which.slice(1)+'Gamer'));
  U.via = which;
  toast('Connected via '+names[which]+' · Entering Clutch arena', 'success');
  // Execute pending challenge or enter app
  var qc = sessionStorage.getItem('quick_challenge');
  if (qc) {
    try { qc = JSON.parse(qc); executeQuickChallenge(qc.game, qc.mode, qc.stake); return; } catch(e){}
  }
  if (typeof showAppPage === 'function') { showAppPage(); }
  else {
    try { var pg = document.getElementById('page-landing'); var pa = document.getElementById('page-app');
      if (pg) pg.style.display = 'none'; if (pa) pa.style.display = 'block';
    } catch(err){}
    if (typeof refreshAll === 'function') refreshAll();
    if (typeof buildGameGrids === 'function') buildGameGrids();
  }
}

function quickChallenge(game, mode, stake) {
  sessionStorage.setItem('quick_challenge', JSON.stringify({game:game,mode:mode,stake:stake}));
  if (U.addr && U.via !== 'guest') {
    executeQuickChallenge(game, mode, stake);
  } else {
    quickConnect();
  }
}

async function executeQuickChallenge(game, mode, stake) {
  if (!_authToken) { toast('Connect your wallet to play for real','info'); return; }
  if (U.balance < stake) { toast('Not enough CLU — get more tokens','error'); return; }

  if (_authToken) {
    // Server-side: create challenge via API
    try {
      var res = await authFetch('/api/challenges', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({game:game, mode:mode, stake:stake, challengeType:'outcome', condition:mode, expiryHours:24, creatorWins:0})
      });
      var data = await res.json();
      if (data.error || data.errors) { toast(data.error || data.errors.join(', '),'error'); return; }
      await syncBalance();
      DUELS.push(data.challenge); saveDuels();
      showQRModal(data.challenge, data.code);
      toast('Duel locked on server! Share with your friend.','success');
    } catch(e) { toast('Server error: '+e.message,'error'); }
  } else {
    // Guest fallback: local only
    var duel = {id:'D'+Date.now(), creator:U.addr, opponent:null, game:game, challengeType:'outcome', condition:{type:'outcome',value:mode}, stake:stake, totalPot:stake*2, expiry:Date.now()+86400000, createdAt:Date.now(), status:'pending', creatorResult:null, opponentResult:null, winner:null};
    DUELS.push(duel); saveDuels();
    U.balance -= stake; U.escrow += stake; saveProfile();
    var code = btoa(JSON.stringify({id:duel.id,creator:duel.creator,game:duel.game,challengeType:duel.challengeType,condition:duel.condition,stake:duel.stake,expiry:duel.expiry,createdAt:duel.createdAt}));
    refreshAll();
    showQRModal(duel, code);
    toast('Duel locked (guest mode — local only).','info');
  }
}

// ── HERO CAROUSEL ─────────────────────────────────────
var _slideIdx = 0;
var _slideCount = 4;
var _slideTimer = null;

function goSlide(idx) {
  _slideIdx = idx;
  var slides = document.querySelectorAll('.hc-slide');
  var dots = document.querySelectorAll('.hc-dot');
  slides.forEach(function(s, i) { s.classList.toggle('active', i === idx); });
  dots.forEach(function(d, i) { d.classList.toggle('active', i === idx); });
}

function nextSlide() {
  goSlide((_slideIdx + 1) % _slideCount);
}

function initCarousel() {
  if (!document.getElementById('hero-carousel')) return;
  _slideTimer = setInterval(nextSlide, 5000);
  var carousel = document.getElementById('hero-carousel');
  carousel.addEventListener('mouseenter', function() { clearInterval(_slideTimer); });
  carousel.addEventListener('mouseleave', function() { _slideTimer = setInterval(nextSlide, 5000); });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCarousel);
} else {
  setTimeout(initCarousel, 100);
}

function scrollToHow() {
  var target = document.getElementById('how-it-works');
  if (!target) return;
  var NAV_OFFSET = 80;
  var rect = target.getBoundingClientRect();
  var scrollEl = document.body;
  var currentTop = document.body.scrollTop || 0;
  var targetY = Math.max(0, rect.top + currentTop - NAV_OFFSET);
  var duration = 450, startY = currentTop, diff = targetY - currentTop;
  if (Math.abs(diff) < 2) { target.scrollIntoView({behavior:'smooth'}); return; }
  var startTime = null;
  function ease(t){return t<.5 ? 2*t*t : -1+(4-2*t)*t;}
  function step(ts){if(!startTime)startTime=ts;var p=Math.min(1,(ts-startTime)/duration);scrollEl.scrollTop=startY+diff*ease(p);if(p<1)requestAnimationFrame(step);}
  requestAnimationFrame(step);
}

// ── LANDING NAVIGATION — smooth scroll + active state ─────
(function initLandNav() {
  var NAV_MAP = {
    dashboard:   'land-dashboard',
    leaderboard: 'land-leaderboard',
    rewards:     'land-rewards',
    challenges:  'land-challenges',
    friends:     'land-friends'
  };
  var NAV_OFFSET = 80;
  var _navigatingLockUntil = 0;

  function getScrollEl() {
    if (document.body && document.body.scrollTop > 0) return document.body;
    if (document.documentElement && document.documentElement.scrollTop > 0) return document.documentElement;
    if (window.scrollY > 0) return window;
    var bodyStyle = getComputedStyle(document.body);
    if (bodyStyle.overflowY === 'auto' || bodyStyle.overflowY === 'scroll') return document.body;
    return (document.scrollingElement || document.documentElement);
  }
  function getScrollTop() {
    var el = getScrollEl();
    if (el === window) return window.scrollY || window.pageYOffset || 0;
    return el.scrollTop || 0;
  }
  function getAbsTop(el) {
    return el.getBoundingClientRect().top + getScrollTop();
  }
  function smoothScrollTo(targetY, duration) {
    duration = duration || 500;
    var el = getScrollEl();
    var startY = getScrollTop();
    var diff = targetY - startY;
    if (Math.abs(diff) < 2) return;
    var startTime = null;
    function ease(t) { return t<.5 ? 2*t*t : -1+(4-2*t)*t; }
    function step(ts) {
      if (!startTime) startTime = ts;
      var p = Math.min(1, (ts - startTime) / duration);
      var y = startY + diff * ease(p);
      if (el === window) window.scrollTo(0, y);
      else el.scrollTop = y;
      if (p < 1) requestAnimationFrame(step);
      else _navigatingLockUntil = 0;
    }
    requestAnimationFrame(step);
  }

  function setActiveNav(key) {
    var items = document.querySelectorAll('.land-nav-menu-item');
    items.forEach(function(it) {
      if (it.getAttribute('data-nav') === key) it.classList.add('active');
      else it.classList.remove('active');
    });
  }

  document.addEventListener('click', function(e) {
    var item = e.target.closest('.land-nav-menu-item');
    if (!item) return;
    var key = item.getAttribute('data-nav');
    if (!key || !NAV_MAP[key]) return;
    e.preventDefault();
    setActiveNav(key);
    var target = document.getElementById(NAV_MAP[key]);
    if (!target) return;
    var absTop = getAbsTop(target) - NAV_OFFSET;
    _navigatingLockUntil = Date.now() + 650;
    smoothScrollTo(Math.max(0, absTop), 500);
  });

  var sections = [];
  Object.keys(NAV_MAP).forEach(function(key) {
    var el = document.getElementById(NAV_MAP[key]);
    if (el) sections.push({ key: key, el: el });
  });
  function sortSectionsByTop() {
    sections.sort(function(a, b) { return getAbsTop(a.el) - getAbsTop(b.el); });
  }
  if (sections.length === 0) return;
  sortSectionsByTop();
  window.addEventListener('resize', function(){ sortSectionsByTop(); });

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function() {
      if (Date.now() < _navigatingLockUntil) { ticking = false; return; }
      var scrollTop = getScrollTop();
      var mid = scrollTop + (window.innerHeight || 900) * 0.25;
      var currentKey = sections[0].key;
      for (var i = 0; i < sections.length; i++) {
        var top = getAbsTop(sections[i].el) - NAV_OFFSET;
        if (mid >= top) currentKey = sections[i].key;
      }
      var active = document.querySelector('.land-nav-menu-item.active');
      if (active && active.getAttribute('data-nav') !== currentKey) setActiveNav(currentKey);
      else if (!active) setActiveNav(currentKey);
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  document.body.addEventListener('scroll', onScroll, { passive: true });
  setTimeout(onScroll, 120);
})();

// ── AUTH TOKEN (in-memory only — never localStorage) ─────
var _authToken = null;

function authFetch(url, opts) {
  opts = opts || {};
  opts.headers = opts.headers || {};
  if (_authToken) opts.headers['Authorization'] = 'Bearer ' + _authToken;
  return fetch((ARENA_CONFIG.API_BASE || '') + url, opts);
}

async function syncBalance() {
  if (!_authToken) return;
  try {
    var res = await authFetch('/api/wallet/balance');
    var data = await res.json();
    if (data.available !== undefined) {
      U.balance = data.available;
      U.escrow = data.escrow || 0;
      saveProfile();
      refreshAll();
    }
  } catch(e) {}
}

// ── CONNECTION ────────────────────────────────────────
async function connectMeta() {
  if (typeof window.ethereum === 'undefined') { toast('MetaMask not found — install it first','error'); return; }
  try {
    var accounts = await window.ethereum.request({method:'eth_requestAccounts'});
    var addr = accounts[0].toLowerCase();

    // Step 1: Get nonce from server
    toast('Authenticating...','info');
    var nonceRes = await fetch((ARENA_CONFIG.API_BASE || '') + '/api/auth/nonce?addr=' + addr);
    var nonceData = await nonceRes.json();
    if (!nonceData.message) { toast('Auth server error','error'); return; }

    // Step 2: Sign the nonce with MetaMask
    var signature = await window.ethereum.request({
      method: 'personal_sign',
      params: [nonceData.message, accounts[0]]
    });

    // Step 3: Verify signature on server, get JWT
    var authRes = await fetch((ARENA_CONFIG.API_BASE || '') + '/api/auth/metamask', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ addr: addr, signature: signature })
    });
    var authData = await authRes.json();
    if (!authData.token) { toast(authData.error || 'Auth failed','error'); return; }

    // Step 4: Store token in sessionStorage (survives a payment redirect;
    // cleared when the tab closes — not persisted to localStorage).
    _authToken = authData.token;
    try { sessionStorage.setItem('clutch_jwt', _authToken); } catch(e) {}
    U.addr = authData.user.addr;
    U.name = authData.user.name;
    U.via = 'metamask';
    U.userId = authData.user.id;

    // Step 5: Fetch real balance from server
    await syncBalance();
    saveProfile();
    enterApp();
    toast('Wallet verified — connected via MetaMask','success');
  } catch(e) {
    toast('Connection rejected: ' + (e.message || ''),'error');
  }
}

async function connectTelegram() {
  closeModal('connect-modal');
  try {
    var probeRes = await fetch((ARENA_CONFIG.API_BASE || '') + '/api/auth/telegram');
    var probe = await probeRes.json().catch(function(){ return {configured:false}; });
    if (!probe.configured || !probe.bot_username) {
      toast('Telegram not configured on this server. Please use MetaMask instead.', 'info');
      return;
    }
    openModal('telegram-login-modal');
    var container = document.getElementById('telegram-login-widget');
    if (container) {
      container.innerHTML = '';
      var scr = document.createElement('script');
      scr.async = true;
      scr.src = 'https://telegram.org/js/telegram-widget.js?22';
      scr.setAttribute('data-telegram-login', probe.bot_username);
      scr.setAttribute('data-size', 'large');
      scr.setAttribute('data-onauth', 'onTelegramAuth(user)');
      scr.setAttribute('data-request-access', 'write');
      scr.setAttribute('data-corner-radius', '8');
      container.appendChild(scr);
    }
  } catch(e) {
    toast('Telegram unavailable — try MetaMask.', 'error');
  }
}

async function onTelegramAuth(user) {
  if (!user || !user.id || !user.hash) { toast('Invalid Telegram auth', 'error'); return; }
  closeModal('telegram-login-modal');
  try {
    var res = await fetch((ARENA_CONFIG.API_BASE || '') + '/api/auth/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user)
    });
    var data = await res.json();
    if (!res.ok || !data.token) { toast(data.error || 'Telegram auth failed', 'error'); return; }
    _authToken = data.token;
    try { localStorage.setItem('clutch_token', _authToken); } catch(e) {}
    U.addr = data.user.addr;
    U.name = data.user.name;
    U.via = 'telegram';
    U.userId = data.user.id;
    await syncBalance();
    saveProfile();
    enterApp();
    toast('Welcome ' + (data.user.name || '') + ' — connected via Telegram ✓','success');
  } catch(e) {
    toast('Login error: ' + (e.message || ''), 'error');
  }
}

function connectGuest() {
  _authToken = null;
  U.addr = 'guest_' + Date.now(); U.name = 'Guest'; U.via = 'guest';
  U.balance = 0; U.escrow = 0;
  saveProfile(); enterApp(); toast('Browsing as guest — connect a wallet for real duels','info');
}

function connectTwitch() { toast('Twitch login coming soon','info'); }
function connectDiscord() { toast('Discord login coming soon','info'); }
function connectWC() { toast('WalletConnect coming soon','info'); }

function enterApp() {
  initAppShell();
  document.getElementById('page-landing').style.display = 'none';
  document.getElementById('page-app').style.display = 'block';
  document.getElementById('connect-modal').classList.add('hidden');
  refreshAll(); buildGameGrids(); buildCondFields(); buildGamesRow();
  // Always land on a real screen first (never leave page-app blank/black).
  goTo('dashboard');
  try { if (!window._hubInited) { initHub(); window._hubInited = true; } } catch(e){}
  // A pending quick challenge only auto-runs for a real (authenticated) session.
  // For a guest/no-token it would be blocked by the read-only guard and leave a
  // blank screen — so we just clear it and stay on the dashboard.
  var qc = sessionStorage.getItem('quick_challenge');
  if (qc) {
    sessionStorage.removeItem('quick_challenge');
    if (_authToken) {
      try { var preset = JSON.parse(qc); setTimeout(function(){ executeQuickChallenge(preset.game, preset.mode, preset.stake); }, 700); } catch(e){}
    }
  }
}

function doDisconnect() {
  saveProfile();
  _authToken = null;
  try { sessionStorage.removeItem('clutch_jwt'); } catch(e) {}
  U = { addr:null, name:null, via:null, balance:STARTING_BALANCE, escrow:0, avatar:null, streak:0 };
  document.getElementById('page-app').style.display = 'none';
  document.getElementById('page-landing').style.display = 'flex';
  document.getElementById('page-landing').style.flexDirection = 'column';
}

// ── SESSION RESTORE + PAYMENT RETURN ─────────────────────
function _decodeJwt(t) {
  try { return JSON.parse(atob(t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))); } catch(e) { return null; }
}
async function restoreSession() {
  var t; try { t = sessionStorage.getItem('clutch_jwt'); } catch(e) { return false; }
  if (!t) return false;
  var p = _decodeJwt(t);
  if (!p || (p.exp && p.exp < Math.floor(Date.now()/1000))) { try{ sessionStorage.removeItem('clutch_jwt'); }catch(e){} return false; }
  _authToken = t;
  U.addr = p.addr || U.addr; U.name = p.name || U.name; U.userId = p.sub; U.via = p.via || 'metamask';
  enterApp();
  await syncBalance();
  return true;
}
(function(){
  function boot() {
    initAppShell();
    var params = new URLSearchParams(location.search);
    restoreSession().then(function(ok){
      var dep = params.get('deposit');
      if (dep === 'success') {
        toast('Payment received — your balance will update shortly', 'success');
        if (ok) { syncBalance(); setTimeout(syncBalance, 4000); }
        history.replaceState({}, '', location.pathname);
      } else if (dep === 'cancelled') {
        toast('Payment cancelled', 'info');
        history.replaceState({}, '', location.pathname);
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

// ── SERVER-AUTHORITATIVE BALANCE SYNC ────────────────
// Periodic + visibility-triggered sync. The server is always the source of truth.
(function setupBalanceSync() {
  setInterval(function() {
    if (_authToken) syncBalance();
  }, 15000);
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible' && _authToken) syncBalance();
  });
})();

// ── REFRESH ──────────────────────────────────────────
function refreshAll() {
  var balEl = document.getElementById('sb-balance'); if (balEl) balEl.textContent = (U.balance||0).toLocaleString();
  var escEl = document.getElementById('sb-escrow'); if (escEl) escEl.textContent = (U.escrow||0).toLocaleString();
  var nameEl = document.getElementById('sb-name'); if (nameEl) nameEl.textContent = U.name || 'Player';
  var addrEl = document.getElementById('sb-addr'); if (addrEl) addrEl.textContent = U.via || '';
  var avEl = document.getElementById('sb-avatar'); if (avEl) avEl.textContent = (U.name||'P').charAt(0).toUpperCase();
  var topBal = document.getElementById('top-balance'); if (topBal) topBal.textContent = (U.balance||0).toLocaleString();
  // ── Sidebar Stats Snapshot (guest + player) ──
  (function updateSbStats() {
    try {
      var duels = Array.isArray(DUELS) ? DUELS : [];
      var me = (U.addr||'').toString().toLowerCase();
      var mine = me ? duels.filter(function(d){ return ((d.creator||'').toString().toLowerCase()===me) || ((d.opponent||'').toString().toLowerCase()===me); }) : [];
      var active = mine.filter(function(d){ return (d.status||'pending')==='pending' || d.status==='accepted' || d.status==='playing'; }).length;
      var finished = mine.filter(function(d){ return d.status==='completed' || d.status==='settled' || d.status==='closed'; });
      var wins = 0, losses = 0, net = 0;
      var gameMap = {};
      var gameWins = {};
      // Sorted trend (oldest → newest, last 8)
      var sorted = finished.slice().sort(function(a,b){ return (a.settledAt||a.createdAt||0) - (b.settledAt||b.createdAt||0); });
      var trend = [];
      finished.forEach(function(d){
        var role = (d.creator||'').toString().toLowerCase()===me ? 'creator' : 'opponent';
        var res = role==='creator' ? (d.creatorResult||'') : (d.opponentResult||'');
        if (res==='win') { wins++; net += (d.stake||0); gameMap[d.game]=(gameMap[d.game]||0)+1; gameWins[d.game]=(gameWins[d.game]||0)+1; }
        else if (res==='lose' || res==='loss') { losses++; net -= (d.stake||0); gameMap[d.game]=(gameMap[d.game]||0)+1; }
        else { gameMap[d.game]=(gameMap[d.game]||0)+1; }
      });
      // Trend bars (8 max): w = win, l = loss, n = neutral/draw
      var lastN = sorted.slice(-8);
      for (var i=0; i<lastN.length; i++) {
        var d2 = lastN[i]; var role2 = (d2.creator||'').toString().toLowerCase()===me ? 'creator' : 'opponent';
        var r2 = role2==='creator' ? (d2.creatorResult||'') : (d2.opponentResult||'');
        if (r2==='win') trend.push('w');
        else if (r2==='lose'||r2==='loss') trend.push('l');
        else trend.push('n');
      }
      // Pad left with 'n' (neutral) so always 8 bars
      while (trend.length < 8) trend.unshift('n');

      var best = Object.keys(gameMap).sort(function(a,b){ return (gameMap[b]||0)-(gameMap[a]||0); })[0];
      var bestGame = 'Try free board', bestCount = 0, bestWins = 0, gColor = 'var(--gold)';
      var gIcon = null, shortName = null;
      if (best) {
        var g = (GAMES||[]).find(function(x){ return x.id===best; });
        shortName = g ? (g.shortName||g.name) : best;
        bestCount = gameMap[best]||0;
        bestWins = gameWins[best]||0;
        bestGame = shortName;
        gColor = g ? (g.color||'var(--gold)') : 'var(--gold)';
        if (GAME_LOGOS && GAME_LOGOS[best]) gIcon = GAME_LOGOS[best];
      }
      var total = wins+losses;
      var wr = total>0 ? Math.round(100*wins/total) : 0;
      var badge = '#GUEST-0';
      var isGuest = U.via === 'guest';
      if (isGuest) {
        badge = '#GUEST-'+(U.addr||'0').toString().slice(-4).toUpperCase().replace(/[^A-Z0-9]/g,'0');
        if (active===0 && total===0) { bestGame = 'Try free board'; }
      } else if (U.addr) {
        badge = '#'+(U.addr||'').toString().slice(-5).toUpperCase();
      }
      var netLabel = 'No duels yet';
      if (total>0 && net>0) netLabel = '+'+net.toLocaleString()+' earned';
      else if (total>0 && net<0) netLabel = (net).toLocaleString()+' net';
      else if (total>0) netLabel = 'Break even';
      var netCls = 'neu';
      if (total>0 && net>0) netCls = 'pos'; else if (total>0 && net<0) netCls = 'neg';

      // ── Populate DOM ──
      var badgeEl = document.getElementById('sb-stats-badge'); if (badgeEl) badgeEl.textContent = badge;

      // ── Hero: Win rate ring ──
      var wrEl = document.getElementById('sb-stats-winrate'); if (wrEl) wrEl.textContent = (total>0?wr:'0')+'%';
      var wlEl = document.getElementById('sb-stats-wl'); if (wlEl) wlEl.textContent = wins+'W · '+losses+'L';
      var ringFill = document.getElementById('sb-ring-fill');
      if (ringFill) {
        var CIRC = 116.24; // 2π × r=18.5
        var pct = Math.max(4, Math.min(100, wr)) / 100;
        ringFill.style.strokeDashoffset = String(CIRC * (1 - pct));
      }

      // ── Hero: Net CLU ──
      var netEl = document.getElementById('sb-stats-net');
      if (netEl) {
        netEl.textContent = (net||0).toLocaleString();
        netEl.className = 'sb-hero-net-num ' + netCls;
      }
      var histEl = document.getElementById('sb-stats-history'); if (histEl) histEl.textContent = netLabel;

      // ── Performance strip: Active mini ──
      var actEl = document.getElementById('sb-stats-active'); if (actEl) actEl.textContent = String(active||0);

      // ── Performance strip: Best Game card ──
      var bgEl = document.getElementById('sb-stats-bestgame');
      var bgMeta = document.getElementById('sb-bg-meta');
      var bgIconWrap = document.getElementById('sb-bg-icon');
      var bgWrap = document.getElementById('sb-stats-bestgame-wrap');
      if (bgEl) bgEl.textContent = bestGame;
      if (bgMeta) {
        if (bestCount>0) bgMeta.textContent = bestCount+' duels · '+bestWins+' wins';
        else bgMeta.textContent = 'No duels yet · open the board';
      }
      if (bgIconWrap) {
        if (!best) {
          bgIconWrap.className = 'sb-bg-icon guest';
          if (GAME_LOGOS && GAME_LOGOS.guest) bgIconWrap.innerHTML = GAME_LOGOS.guest;
          else bgIconWrap.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M8 12h3M9.5 10.5v3"/><circle cx="15.5" cy="11.5" r="1"/><circle cx="17.5" cy="13.5" r="1"/></svg>';
        } else if (best) {
          bgIconWrap.className = 'sb-bg-icon';
          bgIconWrap.style.color = gColor;
          bgIconWrap.style.borderColor = gColor + '3d';
          bgIconWrap.style.background = gColor + '1a';
          if (gIcon) bgIconWrap.innerHTML = gIcon;
          else bgIconWrap.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7.5 4.2v9.6L12 21l-7.5-4.2V7.2L12 3z"/><path d="M12 12l7.5-4.3M12 12v9M12 12L4.5 7.7"/></svg>';
        } else {
          bgIconWrap.className = 'sb-bg-icon';
          bgIconWrap.style.color = ''; bgIconWrap.style.borderColor=''; bgIconWrap.style.background='';
          bgIconWrap.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7.5 4.2v9.6L12 21l-7.5-4.2V7.2L12 3z"/></svg>';
        }
      }
      if (bgWrap) bgWrap.onclick = function(){ goTo('board'); };

      // ── Performance strip: Sparkline trend ──
      var spark = document.getElementById('sb-spark');
      if (spark) {
        var bars = spark.querySelectorAll('span');
        for (var j=0; j<bars.length && j<trend.length; j++) {
          var cls = trend[j] === 'w' ? 'w' : (trend[j] === 'l' ? 'l' : 'n');
          bars[j].className = cls;
          var h = cls === 'n' ? 4 : (Math.round(6 + Math.random()*15));
          bars[j].style.height = (cls === 'n' ? 4 : (cls === 'w' ? (10 + Math.min(12, bestWins)) : (8 + Math.min(12, losses)))) + 'px';
        }
      }
      var sw = document.getElementById('sb-spark-w'); if (sw) sw.textContent = wins+'W';
      var sl = document.getElementById('sb-spark-l'); if (sl) sl.textContent = losses+'L';
    } catch(e){}
  })();
  // Update integrity badge
  var intBadge = document.getElementById('prof-integrity-badge');
  if (intBadge) {
    var integrity = getIntegrity();
    var intColor = integrity.score >= 80 ? 'var(--acc)' : integrity.score >= 50 ? 'var(--gold)' : 'var(--red)';
    var intLabel = integrity.score >= 80 ? 'Trusted' : integrity.score >= 50 ? 'Under review' : 'Suspended';
    intBadge.style.color = intColor;
    intBadge.textContent = integrity.score + ' ' + intLabel;
  }
  // Update profile fields
  var profName = document.getElementById('prof-name'); if (profName) profName.textContent = U.name || 'Player';
  var profAddr = document.getElementById('prof-addr'); if (profAddr) profAddr.textContent = U.addr ? (U.addr.slice(0,10)+'...') : 'Not connected';
  var profVia = document.getElementById('prof-via-badge'); if (profVia) profVia.textContent = U.via || '—';
}

function fetchEthPrice() {
  // Use static price for demo
}

var GAME_LOGOS = {
  valorant:'<svg viewBox="0 0 24 24" width="22" height="22"><path d="M2 4l8.5 16h3L5 4H2zm12.5 0L22 17.5V4h-3v8.5L14.5 4h-3z" fill="currentColor"/></svg>',
  lol:'<svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 3v18h14V3H5zm2 2h10v14H7V5zm3 2v10h4V7h-4z" fill="currentColor"/></svg>',
  dota2:'<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c3.87 0 7 3.13 7 7s-3.13 7-7 7-7-3.13-7-7 3.13-7 7-7zm-2 3v8l6-4-6-4z" fill="currentColor"/></svg>',
  clashroyale:'<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 2L4 7v5c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V7l-8-5zm0 3l5 3.12V12c0 3.86-2.56 7.63-5 8.88-2.44-1.25-5-5.02-5-8.88V8.12L12 5z" fill="currentColor"/></svg>',
  brawlstars:'<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 2l3 6h6l-5 4 2 7-6-4-6 4 2-7-5-4h6z" fill="currentColor"/></svg>',
  cs2:'<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><line x1="12" y1="2" x2="12" y2="6" stroke="currentColor" stroke-width="2"/><line x1="12" y1="18" x2="12" y2="22" stroke="currentColor" stroke-width="2"/><line x1="2" y1="12" x2="6" y2="12" stroke="currentColor" stroke-width="2"/><line x1="18" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>',
  fortnite:'<svg viewBox="0 0 24 24" width="22" height="22"><path d="M6 2h12v4h-8v4h6v4h-6v8H6V2z" fill="currentColor"/></svg>',
  apex:'<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 2L2 20h20L12 2zm0 5l6 11H6l6-11z" fill="currentColor"/></svg>',
  ow2:'<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 12c0-2.76 2.24-5 5-5s5 2.24 5 5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>',
  rl:'<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 12h10M12 7v10" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  fifa:'<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v4l3 2-1 4 4 1v4M12 22v-4l-3-2 1-4-4-1V7" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  cod:'<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><line x1="12" y1="2" x2="12" y2="6" stroke="currentColor" stroke-width="1.5"/><line x1="12" y1="18" x2="12" y2="22" stroke="currentColor" stroke-width="1.5"/><line x1="2" y1="12" x2="6" y2="12" stroke="currentColor" stroke-width="1.5"/><line x1="18" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="1.5"/></svg>',
};

function buildGameGrids() {
  var grid = document.getElementById('wiz-game-grid');
  if (!grid) return;
  grid.innerHTML = GAMES.map(function(g) {
    var logo = GAME_LOGOS[g.id] || '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/></svg>';
    var badge = g.api
      ? '<div class="go-verify api"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="display:inline;vertical-align:-1px"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> '+g.apiName+'</div>'
      : '<div class="go-verify manual">Screenshot</div>';
    return '<div class="go'+(CREATE.game===g.id?' sel':'')+'" data-game="'+g.id+'" onclick="selGame(\''+g.id+'\',this)">'
      + '<div class="go-icon" style="background:'+g.color+'15;color:'+g.color+'">'+logo+'</div>'
      + '<div class="go-name">'+g.name+'</div>'
      + badge
      + '</div>';
  }).join('');
}

function selGame(id, el) {
  CREATE.game = id;
  document.querySelectorAll('#wiz-game-grid .go').forEach(function(e){ e.classList.remove('sel'); });
  if (el) el.classList.add('sel');
  var nextBtn = document.getElementById('wiz-next-1');
  if (nextBtn) nextBtn.disabled = false;
}

function selBT(el, t) {
  CREATE.challengeType = t;
  document.querySelectorAll('.wiz-tc').forEach(function(e){ e.classList.remove('sel'); });
  if (el) el.classList.add('sel');
  buildCondFields();
}

var COMMON_CONDITIONS = {
  valorant: ['I win our 1v1 deathmatch','I get more kills this match','I win the ranked game','I ace at least once','First to 13 rounds'],
  lol: ['I win the ranked game','I get more kills than you','First blood goes to me','I get 200+ CS by 20min','I carry with most damage'],
  dota2: ['I win the match','I get more last hits','I win mid lane','My team wins under 40min','I get a rampage'],
  cs2: ['I win the competitive match','I top frag','I get an ace','I clutch a 1vX round','I get 25+ kills'],
  fortnite: ['I get the Victory Royale','I get more eliminations','I outlive you','I get 10+ kills','First to win a match'],
  clashroyale: ['I win the ladder match','I 3-crown you','I win with less elixir spent','Best of 3 ladder games','I win using off-meta deck'],
  brawlstars: ['I win the 3v3 match','I deal more damage','I become star player','I win showdown','Best of 5 matches'],
  apex: ['I get more damage this game','I get the most kills','I win the BR match','I survive longer than you','I get 2000+ damage'],
  _default: ['I win the match','Best of 3 — first to 2 wins','I outperform you in stats','I hit a specific goal','Custom condition'],
};

function buildCondFields() {
  var wrap = document.getElementById('cond-fields');
  if (!wrap) return;
  var bt = CREATE.challengeType || 'outcome';
  var game = CREATE.game || '';
  var presets = COMMON_CONDITIONS[game] || COMMON_CONDITIONS._default;

  var presetsHtml = '<div class="field"><label>Quick pick</label>'
    + '<div class="cond-presets">'
    + presets.map(function(p) {
      return '<button class="cond-preset-btn" onclick="pickCondPreset(this,\'' + bt + '\')" data-val="' + p + '">' + p + '</button>';
    }).join('')
    + '</div></div>';

  if (bt === 'outcome') {
    wrap.innerHTML = presetsHtml + '<div class="field"><label>Or write your own</label><input class="fi" id="c-out" placeholder="e.g. I win our 1v1 match" oninput="updPreview()"/></div>';
  } else if (bt === 'target') {
    wrap.innerHTML = presetsHtml + '<div class="field"><label>Or write your own</label><input class="fi" id="c-tval" placeholder="e.g. 20 kills this game" oninput="updPreview()"/></div>';
  } else {
    wrap.innerHTML = presetsHtml + '<div class="field"><label>Or write your own</label><textarea class="ft" id="c-cust" placeholder="e.g. First to reach Gold rank." oninput="updPreview()"></textarea></div>';
  }
}

function pickCondPreset(btn, bt) {
  document.querySelectorAll('.cond-preset-btn').forEach(function(b) { b.classList.remove('sel'); });
  btn.classList.add('sel');
  var val = btn.getAttribute('data-val');
  var input = document.getElementById('c-out') || document.getElementById('c-tval') || document.getElementById('c-cust');
  if (input) { input.value = val; updPreview(); }
}

function buildGamesRow() {
  var row = document.getElementById('games-row');
  if (!row) return;
  row.innerHTML = GAMES.map(function(g) {
    return '<div class="game-pill" style="--gc:'+g.color+'">'
      + '<span class="gp-dot" style="background:'+g.color+'"></span>'
      + '<span class="gp-name">'+g.name+'</span>'
      + (g.api ? '<span class="gp-api">API</span>' : '')
      + '</div>';
  }).join('');
}

function startBreak() {
  closeModal('loss-modal');
  toast('Take a breather. Come back stronger.','info');
}

function nav(screen) { goTo(screen); }

function timeUntil(ts) {
  var diff = ts - Date.now();
  if (diff <= 0) return 'Expired';
  var h = Math.floor(diff / 3600000);
  var m = Math.floor((diff % 3600000) / 60000);
  return h + 'h ' + m + 'm remaining';
}

// ── PIN SYSTEM ────────────────────────────────────────
var PIN_STORAGE_KEY = 'clutch_pin';
var PIN_SETUP_KEY   = 'clutch_pin_set';
var _pinBuffer = '';
var _pinMode   = 'check'; // 'setup' | 'confirm' | 'check'
var _pinSetupFirst = '';
var _pinAttempts = 0;
var PIN_MAX_ATTEMPTS = 3;

function pinHash(s){ // Simple deterministic transform for demo
  var h=0; for(var i=0;i<s.length;i++) h=((h<<5)-h)+s.charCodeAt(i);
  return (h>>>0).toString(16);
}

function showPinOverlay(mode){
  _pinMode = mode || 'check';
  _pinBuffer = '';
  _pinAttempts = 0;
  updatePinDots();
  var o = document.getElementById('pin-overlay');
  if (o) { o.style.display='flex'; }
  if (_pinMode==='setup'){
    document.getElementById('pin-title').textContent='Set your 8-digit PIN';
    document.getElementById('pin-sub').textContent='Secure your CLU session — required every time you open the app';
  } else if (_pinMode==='confirm'){
    document.getElementById('pin-title').textContent='Confirm your PIN';
    document.getElementById('pin-sub').textContent='Re-enter your PIN to confirm';
  } else {
    document.getElementById('pin-title').textContent='Enter your PIN';
    document.getElementById('pin-sub').textContent='Welcome back — verify your identity';
  }
}

function hidePinOverlay(){
  var o = document.getElementById('pin-overlay');
  if(o) o.style.display='none';
}

function updatePinDots(){
  for(var i=0;i<8;i++){
    var d=document.getElementById('pd'+i);
    if(!d) continue;
    d.className='pin-dot'+(i<_pinBuffer.length?' filled':'');
  }
}

function pinDotError(){
  var dots=document.getElementById('pin-dots');
  if(!dots) return;
  for(var i=0;i<8;i++){ var d=document.getElementById('pd'+i); if(d) d.classList.add('error'); }
  dots.classList.add('pin-shake');
  setTimeout(function(){
    dots.classList.remove('pin-shake');
    _pinBuffer=''; updatePinDots();
    for(var i=0;i<8;i++){ var d=document.getElementById('pd'+i); if(d) d.classList.remove('error'); }
  },400);
}

function pinKey(k){
  if(_pinBuffer.length>=8) return;
  _pinBuffer+=k;
  updatePinDots();
  if(_pinBuffer.length===8){
    setTimeout(function(){ pinSubmit(); },120);
  }
}

function pinDel(){
  _pinBuffer=_pinBuffer.slice(0,-1);
  updatePinDots();
}

function pinSubmit(){
  var stored = localStorage.getItem(PIN_STORAGE_KEY);
  if(_pinMode==='setup'){
    _pinSetupFirst=_pinBuffer; _pinBuffer='';
    showPinOverlay('confirm');
  } else if(_pinMode==='confirm'){
    if(_pinBuffer===_pinSetupFirst){
      localStorage.setItem(PIN_STORAGE_KEY, pinHash(_pinBuffer));
      localStorage.setItem(PIN_SETUP_KEY,'1');
      hidePinOverlay();
      toast('PIN set! Your session is secured.','success');
    } else {
      pinDotError();
      document.getElementById('pin-sub').textContent="PINs don't match — try again";
      _pinSetupFirst='';
      setTimeout(function(){ showPinOverlay('setup'); },500);
    }
  } else {
    if(pinHash(_pinBuffer)===stored){
      hidePinOverlay(); _pinAttempts=0;
    } else {
      _pinAttempts++;
      pinDotError();
      if(_pinAttempts>=PIN_MAX_ATTEMPTS){
        document.getElementById('pin-sub').textContent="Too many attempts — reconnect your wallet to reset";
        document.getElementById('pin-title').textContent="Session locked";
      } else {
        document.getElementById('pin-sub').textContent=( PIN_MAX_ATTEMPTS-_pinAttempts)+" attempts remaining";
      }
    }
  }
}

function pinForgot(){
  localStorage.removeItem(PIN_STORAGE_KEY);
  localStorage.removeItem(PIN_SETUP_KEY);
  hidePinOverlay();
  logout();
  toast('PIN reset — reconnect your wallet to set a new one','info');
}

// Keyboard PIN support
document.addEventListener('keydown',function(e){
  var o=document.getElementById('pin-overlay');
  if(!o||o.style.display==='none') return;
  if(e.key>='0'&&e.key<='9') pinKey(e.key);
  if(e.key==='Backspace') pinDel();
});

// ── QR CODE GENERATION ────────────────────────────────
function generateQRUrl(data){
  return 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=10&data=' + encodeURIComponent(data);
}

function showQRModal(duel, code){
  var g = GAMES.find(function(x){ return x.id===duel.game; })||{name:duel.game,color:'#8a95b3',short:'?'};
  var stakeUsd = (duel.stake * CLU_USD).toFixed(2);
  var potUsd   = (duel.totalPot * CLU_USD).toFixed(2);
  var qrUrl    = generateQRUrl(code);
  var rows = (window._customRows||[]).filter(function(r){ return r.trim(); });
  if (rows.length === 0) { toast('Enter at least one condition','error'); return null; }
  var proof = (document.getElementById('c-proof')||{}).value||'screenshot';
  return { text: rows.join(' + '), proof: proof };
  if (t==='target') {
    var rows = (window._targetRows||[]).filter(function(r){ return r.val.trim(); });
    if (rows.length === 0) { toast('Set at least one target value','error'); return null; }
    var ctx = (document.getElementById('c-ctx')||{}).value||'';
    var text = rows.map(function(r){ return r.stat+': '+r.val; }).join(' · ') + (ctx?' ('+ctx+')':'');
    return { text: text };
  }
  var txt=(document.getElementById('c-cust')||{}).value||'';
  if (!txt.trim()){ toast('Describe the condition','error'); return null; }
  return { text:txt.trim(), proof:(document.getElementById('c-proof')||{}).value||'screenshot' };
}

function condLabel(d) {
  var t=d.challengeType, c=d.condition||{};
  if (t==='outcome') return c.text||'Win the match';
  if (t==='target')  return 'Hit '+c.value+' '+c.stat+(c.context?' ('+c.context+')':'');
  return c.text||'Custom condition';
}

// ── PREVIEW ───────────────────────────────────────────
function updPreview() {
  // Null-safe: wizard uses rev-* elements (only present on step 5)
  function setText(id, val) { var el=document.getElementById(id); if(el) el.textContent=val; }
  var g = GAMES.find(function(x){ return x.id===CREATE.game; });
  setText('prev-game',  g ? g.name : '—');
  setText('prev-type',  {outcome:'Match Outcome',target:'Performance Target',custom:'Custom'}[CREATE.challengeType]||'—');
  setText('prev-verify', g ? (g.api ? '✓ '+g.apiName : 'Screenshot proof') : '—');
  var condEl = document.getElementById('c-out')||document.getElementById('c-tval')||document.getElementById('c-cust');
  setText('prev-cond', (condEl&&condEl.value) ? condEl.value : '—');
  var stake = parseInt((document.getElementById('stake-input')||{}).value)||0;
  var pot = stake * 2;
  setText('prev-pot',     pot.toLocaleString());
  setText('prev-pot-usd','≈ $'+(pot*(CLU_USD||0)).toFixed(2));
  setText('stake-usd',   '≈ $'+(stake*(CLU_USD||0)).toFixed(2)+' · Pot: '+pot.toLocaleString()+' CLU');
}

function setSt(v){ document.getElementById('stake-input').value=v; updPreview(); }

// ── CREATE DUEL ───────────────────────────────────────
function gatherCond() {
  var t = CREATE.challengeType;
  if (t==='outcome') {
    var chips = window._condChips || [];
    if (chips.length === 0) { toast('Pick at least one win condition','error'); return null; }
    return { text: chips.join(' + '), username:(document.getElementById('c-user')||{}).value||'' };
  }
  if (t==='target') {
    var rows = (window._targetRows||[]).filter(function(r){ return String(r.val).trim(); });
    if (rows.length === 0) { toast('Set at least one target value','error'); return null; }
    var ctx = (document.getElementById('c-ctx')||{}).value||'';
    var text = rows.map(function(r){ return r.stat+': '+r.val; }).join(' · ') + (ctx?' ('+ctx+')':'');
    return { text: text };
  }
  var rows = (window._customRows||[]).filter(function(r){ return r.trim(); });
  if (rows.length === 0) { toast('Enter at least one condition','error'); return null; }
  var proof = (document.getElementById('c-proof')||{}).value||'screenshot';
  return { text: rows.join(' + '), proof: proof };
}

async function createDuel() {
  if (!_authToken) { toast('Connect your wallet to play for real','info'); return; }
  if (!U.addr || U.via==='guest') { toast('Connect a wallet to create duels','error'); return; }
  if (!CREATE.game) { toast('Pick a game first','error'); return; }
  var stake = parseInt(document.getElementById('stake-input').value);
  if (!stake||stake<10) { toast('Minimum entry is 10 CLU','error'); return; }
  if (stake > U.balance) { toast('Not enough CLU — get more tokens','error'); return; }
  var cond = gatherCond(); if (!cond) return;
  var expiry = parseInt(document.getElementById('expiry-sel').value);
  var expiryHours = Math.round(expiry / 3600000) || 24;

  if (_authToken) {
    try {
      var res = await authFetch('/api/challenges', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({game:CREATE.game, mode:cond.text||cond, stake:stake, challengeType:CREATE.challengeType, condition:cond.text||cond, expiryHours:expiryHours, creatorWins:0})
      });
      var data = await res.json();
      if (data.error || data.errors) { toast(data.error || data.errors.join(', '),'error'); return; }
      await syncBalance();
      DUELS.push(data.challenge); saveDuels();
      showQRModal(data.challenge, data.code);
      toast('Duel locked on server!','success');
    } catch(e) { toast('Server error','error'); }
  } else {
    var duel = {id:'D'+Date.now(), creator:U.addr, opponent:null, game:CREATE.game, challengeType:CREATE.challengeType, condition:cond, stake:stake, totalPot:stake*2, expiry:Date.now()+expiry, createdAt:Date.now(), status:'pending', creatorResult:null, opponentResult:null, winner:null};
    DUELS.push(duel); saveDuels();
    U.balance -= stake; U.escrow += stake; saveProfile();
    var code = btoa(JSON.stringify({id:duel.id,creator:duel.creator,game:duel.game,challengeType:duel.challengeType,condition:duel.condition,stake:duel.stake,expiry:duel.expiry,createdAt:duel.createdAt}));
    refreshAll();
    showQRModal(duel, code);
    toast('Duel locked (local mode).','info');
  }
}

function copyCode() {
  var el = document.getElementById('code-val');
  var code = el ? (el.value || el.textContent) : '';
  if(!code){ toast('No code to copy','error'); return; }
  if(navigator.clipboard){
    navigator.clipboard.writeText(code).then(function(){ toast('Code copied!','success'); });
  } else {
    var ta=document.createElement('textarea'); ta.value=code;
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta); toast('Code copied!','success');
  }
}

// ── ACCEPT ────────────────────────────────────────────
function renderAcceptFairness(them) {
  var me = buildMyProfile();
  var fair = calcFairness(me, them);
  var fp = document.getElementById('ap-fair-predict');
  if (fp) {
    fp.innerHTML = '<div style="text-align:left"><div style="font-size:10px;letter-spacing:.08em;color:var(--txt3);font-weight:700">' + (U.name || 'YOU') + '</div><div style="font-size:26px;font-weight:900;color:#00FF87;margin-top:2px">'+fair.pctYou+'%</div></div>'
      + '<div style="text-align:center;padding:4px 12px;background:#13141a;border:1px solid #262a36;border-radius:999px"><div style="font-size:10px;font-weight:800;color:#fff;padding:2px 8px;background:#7000FF;border-radius:999px;letter-spacing:.04em;margin-bottom:4px">'+fair.diff+'</div><div style="font-size:10px;color:var(--txt3)">vs</div></div>'
      + '<div style="text-align:right"><div style="font-size:10px;letter-spacing:.08em;color:var(--txt3);font-weight:700">' + (them && them.name || 'OPPONENT') + '</div><div style="font-size:26px;font-weight:900;color:var(--purple-txt);margin-top:2px">'+fair.pctThem+'%</div></div>';
  }
  var fs = document.getElementById('ap-fair-score');
  if (fs) {
    var fcls = fair.overall >= 85 ? 'hi' : (fair.overall >= 65 ? 'lo' : 'very-lo');
    var numCls = (fcls === 'hi') ? '#00FF87' : (fcls === 'lo' ? '#f0c832' : '#FF4D5E');
    fs.innerHTML = '<div><span style="font-size:10px;color:var(--txt3);letter-spacing:.1em;font-weight:700">OVERALL FAIRNESS</span> <span style="font-size:18px;font-weight:900;color:'+numCls+';margin-left:6px">'+fair.overall+'%</span></div>'
      + '<div style="font-size:11px;color:#8692ad;max-width:60%;text-align:right;line-height:1.3">'+fair.rec+'</div>';
  }
  var fbk = document.getElementById('ap-fair-breakdown');
  if (fbk) {
    fbk.innerHTML = fair.breakdown.map(function(b){
      var cls = b.v >= 85 ? 'color:#00FF87' : (b.v >= 65 ? 'color:#f0c832' : 'color:#FF4D5E');
      return '<div style="background:#13141a;border:1px solid #262a36;border-radius:8px;padding:8px 10px">'
        + '<div style="font-size:9px;color:var(--txt3);font-weight:700;letter-spacing:.06em;margin-bottom:4px">'+b.k+'</div>'
        + '<div style="font-size:14px;font-weight:900;'+cls+'">'+b.v+'%</div>'
        + '<div style="height:3px;background:#262a36;border-radius:999px;margin-top:6px;overflow:hidden"><div style="height:100%;width:'+Math.min(100,b.v)+'%;background:linear-gradient(90deg,#00FF87,#7000FF);border-radius:999px"></div></div>'
        + '</div>';
    }).join('');
  }
}

function previewAccept() {
  var raw = document.getElementById('accept-input').value.trim();
  if (!raw) { toast('Paste a code first','error'); return; }
  var data; try { data=JSON.parse(atob(raw)); } catch(e){ toast('Invalid code','error'); return; }
  if (Date.now()>data.expiry) { toast('This duel has expired','error'); return; }
  if (U.addr && data.creator.toLowerCase()===U.addr.toLowerCase()) { toast("That's your own duel!",'error'); return; }
  PENDING_ACCEPT = data;
  var g = GAMES.find(function(x){ return x.id===data.game; })||{name:data.game,api:false};
  var rows = [
    ['Game', g.name + (g.api?' <span style="color:var(--acc);font-size:11px">✓ API verified</span>':'')],
    ['Duel type', {outcome:'Match Outcome',target:'Performance Target',custom:'Custom Condition'}[data.challengeType]||data.challengeType],
    ['Condition', condLabel(data)],
    ['Duelist', '<span style="font-family:monospace;font-size:12px">'+data.creator+'</span>'],
    ['Expires', timeUntil(data.expiry)],
  ];
  document.getElementById('accept-preview-rows').innerHTML = rows.map(function(r){
    return '<div class="preview-row"><span class="preview-lbl">'+r[0]+'</span><span class="preview-val">'+r[1]+'</span></div>';
  }).join('');
  var isFree = !!data.free || (data.stake||0)===0;
  var pot = document.getElementById('ap-pot');
  var potLabel = document.getElementById('ap-pot-label');
  if (pot) pot.classList.toggle('free', isFree);
  if (isFree) {
    document.getElementById('ap-stake').textContent = 'FREE · No stake';
    document.getElementById('ap-stake').style.color = '#b88aff';
    document.getElementById('ap-usd').textContent = 'Bragging rights only';
    if (potLabel) potLabel.textContent = 'Friendly duel · escrow is waived, verification is kept';
  } else {
    document.getElementById('ap-stake').style.color = '';
    document.getElementById('ap-stake').textContent = data.stake.toLocaleString() + ' CLU';
    document.getElementById('ap-usd').textContent = '≈ $'+(data.stake*CLU_USD).toFixed(2);
    if (potLabel) potLabel.textContent = 'Your Entry (locked in neutral escrow)';
  }
  try {
    var them = PLAYER_PROFILES[data.creator] || { name: data.creator, game: data.game, official:{ wr:50, matches:0 }, clutch:{ rating:700, form:50, opponentQ:50, consistency:50, pressure:50 }, dna:[], recentForm:['W','L','W','L','W','W','L','L','W','W'], opponent:{ wrRaw:'Unknown',avgTier:'Unknown',difficulty:'Unknown'} };
    them.name = data.creator;
    renderAcceptFairness(them);
  } catch(e) { console.warn(e); }
  document.getElementById('accept-preview-panel').style.display = 'block';
  document.getElementById('accept-preview-panel').scrollIntoView({behavior:'smooth'});
}

async function confirmAccept() {
  var d = PENDING_ACCEPT; if (!d) return;
  var isFree = !!d.free || (d.stake||0)===0;
  if (!isFree) {
    if (!_authToken) { toast('Connect your wallet to play for real','info'); return; }
    if (!U.addr||U.via==='guest') { toast('Connect a wallet to accept paid duels','error'); return; }
    if (d.stake > U.balance) { toast('Not enough CLU — get tokens first','error'); goTo('tokens'); return; }
  } else {
    if (!U.addr) { toast('Please sign in (or browse as guest) to accept free duels','info'); return; }
  }

  if (_authToken && d.id) {
    try {
      var res = await authFetch('/api/challenges?accept', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({challengeId: d.id})
      });
      var data = await res.json();
      if (data.error) { toast(data.error,'error'); return; }
      await syncBalance();
      DUELS.push(data.challenge || {id:d.id,creator:d.creator,opponent:U.addr,game:d.game,challengeType:d.challengeType,condition:d.condition,stake:d.stake,totalPot:d.stake*2,status:'active',acceptedAt:Date.now()});
      saveDuels();
    } catch(e) { toast('Server error','error'); return; }
  } else {
    var ex = DUELS.find(function(x){ return x.id===d.id; });
    if (ex) { ex.opponent=U.addr; ex.status='active'; ex.acceptedAt=Date.now(); }
    else { DUELS.push({id:d.id,creator:d.creator,opponent:U.addr,game:d.game,challengeType:d.challengeType,condition:d.condition,stake:d.stake,totalPot:d.stake*2,expiry:d.expiry,createdAt:d.createdAt,acceptedAt:Date.now(),status:'active',creatorResult:null,opponentResult:null,winner:null}); }
    saveDuels();
    U.balance -= d.stake; U.escrow += d.stake; saveProfile();
  }

  PENDING_ACCEPT = null;
  document.getElementById('accept-input').value = '';
  document.getElementById('accept-preview-panel').style.display = 'none';
  refreshAll();
  toast('Duel accepted! Tokens locked. Go play!','success');
  goTo('duels');
}

// ── CHALLENGE BOARD ───────────────────────────────────
// -- CLUTCH V2: PLAYER DATA MODEL ------------------------


// ======== PIN + PAID/FREE INJECTED ========
/* =========================================================
   PIN 6-DIGIT SECURITY + PAID/FREE MODE
   ========================================================= */
/* Simple obfuscated hash for PIN (demo, never in prod - use server side) */
function _pinHash(s) {
  var h = 5381; for (var i=0;i<s.length;i++) h = (((h<<5)+h)+s.charCodeAt(i)) & 0x7fffffff;
  return h.toString(36) + '_' + s.split('').reverse().map(function(c){return String.fromCharCode((c.charCodeAt(0)+17)%127);}).join('').replace(/\W/g,'x').slice(0,8);
}
function _hasPinSet(){ try { return !!localStorage.getItem('clutch_pin_hash'); } catch(e){ return false; } }
function _setPin(digits){ try { localStorage.setItem('clutch_pin_hash',_pinHash(digits)); localStorage.setItem('clutch_pin_created', String(Date.now())); return true; } catch(e){ return false; } }
function _verifyPin(digits){ try { return localStorage.getItem('clutch_pin_hash') === _pinHash(digits); } catch(e){ return false; } }
function _clearPin(){ try { localStorage.removeItem('clutch_pin_hash'); localStorage.removeItem('clutch_pin_created'); } catch(e){} }

var _pinUnlockUntil = 0;
function _isPinUnlocked(){ return Date.now() < _pinUnlockUntil; }
function _pinUnlockSession(ms){ _pinUnlockUntil = Date.now() + (ms||120000); }

/* ===== PIN Setup (2-step: create + confirm) ===== */
var _pinSetup = { step:1, code1:'', code2:'' };
function openPinSetup(force){
  if (!force && _hasPinSet()) return;
  _pinSetup = { step:1, code1:'', code2:'' };
  var m = document.getElementById('pin-setup-modal'); if (!m) return;
  m.classList.add('open');
  _pinSetupRender();
  _pinSetupBind();
}
function closePinSetupSkip(){
  if (!_hasPinSet() && !confirm('You can set a passcode later. No duel can be accepted until a passcode is set. Skip anyway?')) return;
  var m = document.getElementById('pin-setup-modal'); if (m) m.classList.remove('open');
}
function _pinSetupRender(){
  var slots = document.querySelectorAll('#pin-setup-slots .pin-slot');
  var step = _pinSetup.step;
  var code = step===1 ? _pinSetup.code1 : _pinSetup.code2;
  slots.forEach(function(s, i){ s.textContent = i < code.length ? '•' : ''; s.classList.toggle('filled', i < code.length); s.classList.remove('shake'); });
  document.getElementById('pin-step-ind').textContent = step===1 ? 'STEP 1 · CREATE CODE' : 'STEP 2 · CONFIRM CODE';
  document.getElementById('pin-setup-title').textContent = step===1 ? 'Set your CLUTCH Passcode' : 'Confirm your Passcode';
  document.getElementById('pin-setup-sub').textContent = step===1
    ? '6-digit secret number. Required to accept duels, withdraw CLU, unlock sensitive data.'
    : 'Re-enter the exact same 6 digits to confirm.';
  document.getElementById('pin-setup-hint').textContent = (step===1 ? _pinSetup.code1 : _pinSetup.code2).length + ' / 6 digits';
  document.getElementById('pin-setup-match').classList.toggle('show', step===2 && _pinSetup.code2.length===6 && _pinSetup.code1===_pinSetup.code2);
}
function _pinSetupBind(){
  var kp = document.getElementById('pin-setup-keypad'); if (!kp || kp.dataset.bound) return;
  kp.dataset.bound = '1';
  kp.addEventListener('click', function(ev){
    var btn = ev.target.closest('button'); if (!btn) return;
    var step = _pinSetup.step;
    var codeRef = step===1 ? 'code1' : 'code2';
    if (btn.dataset.pin !== undefined) {
      if (_pinSetup[codeRef].length >= 6) return;
      _pinSetup[codeRef] += btn.dataset.pin;
      _pinSetupRender();
      if (_pinSetup.code1.length === 6 && step === 1) {
        setTimeout(function(){ _pinSetup.step = 2; _pinSetupRender(); }, 180);
      }
    } else if (btn.dataset.pinAction === 'delete') {
      if (_pinSetup[codeRef].length > 0) _pinSetup[codeRef] = _pinSetup[codeRef].slice(0, -1);
      _pinSetupRender();
    } else if (btn.dataset.pinAction === 'confirm') {
      if (step===1 && _pinSetup.code1.length < 6) { _shakePinSetup(); return; }
      if (step===2 && _pinSetup.code1 !== _pinSetup.code2) {
        var err = document.getElementById('pin-setup-err'); err.textContent = 'Codes do not match — try again'; err.classList.add('show');
        setTimeout(function(){ _pinSetup = { step:1, code1:'', code2:'' }; _pinSetupRender(); err.classList.remove('show'); }, 900);
        _shakePinSetup(); return;
      }
      if (step===2 && _pinSetup.code1 === _pinSetup.code2 && _pinSetup.code1.length===6) {
        _setPin(_pinSetup.code1);
        _pinUnlockSession(300000);
        var m = document.getElementById('pin-setup-modal'); if (m) m.classList.remove('open');
        toast('Passcode set · CLUTCH is now secured','success');
      }
    }
  });
}
function _shakePinSetup(){
  var slots = document.querySelectorAll('#pin-setup-slots .pin-slot');
  slots.forEach(function(s){ s.classList.remove('shake'); void s.offsetWidth; s.classList.add('shake'); });
}

/* ===== PIN Verify (unlock) ===== */
var _pinVerify = { remaining:3, code:'', onSuccess:null, onCancel:null, title:'', sub:'', context:'' };
function openPinVerify(opts){
  opts = opts || {};
  if (_isPinUnlocked() && !opts.force) { if (typeof opts.onSuccess === 'function') setTimeout(opts.onSuccess, 50); return; }
  _pinVerify = { remaining:3, code:'', onSuccess: opts.onSuccess || null, onCancel: opts.onCancel || null, title: opts.title || 'Enter your CLUTCH Passcode', sub: opts.sub || 'Required to confirm this action.', context: opts.context || '' };
  var m = document.getElementById('pin-verify-modal'); if (!m) return;
  document.getElementById('pin-verify-title').textContent = _pinVerify.title;
  document.getElementById('pin-verify-sub').textContent = _pinVerify.sub;
  document.getElementById('pin-verify-left').textContent = _pinVerify.remaining + ' attempts left';
  m.classList.add('open');
  _pinVerifyRender();
  _pinVerifyBind();
}
function closePinVerify(){
  var m = document.getElementById('pin-verify-modal'); if (m) m.classList.remove('open');
  if (typeof _pinVerify.onCancel === 'function') try { _pinVerify.onCancel(); } catch(e){}
}
function _pinVerifyRender(){
  var slots = document.querySelectorAll('#pin-verify-slots .pin-slot');
  slots.forEach(function(s, i){ s.textContent = i < _pinVerify.code.length ? '•' : ''; s.classList.toggle('filled', i < _pinVerify.code.length); s.classList.remove('shake'); });
  document.getElementById('pin-verify-err').classList.remove('show');
  document.getElementById('pin-verify-left').textContent = _pinVerify.remaining + ' attempt' + (_pinVerify.remaining===1 ? '' : 's') + ' left';
}
function _pinVerifyBind(){
  var kp = document.getElementById('pin-verify-keypad'); if (!kp || kp.dataset.bound) return;
  kp.dataset.bound = '1';
  kp.addEventListener('click', function(ev){
    var btn = ev.target.closest('button'); if (!btn) return;
    if (btn.dataset.pin !== undefined) {
      if (_pinVerify.code.length >= 6) return;
      _pinVerify.code += btn.dataset.pin;
      _pinVerifyRender();
      if (_pinVerify.code.length === 6) setTimeout(_pinVerifyAttempt, 140);
    } else if (btn.dataset.pinAction === 'delete') {
      if (_pinVerify.code.length > 0) _pinVerify.code = _pinVerify.code.slice(0, -1);
      _pinVerifyRender();
    } else if (btn.dataset.pinAction === 'unlock') {
      if (_pinVerify.code.length < 6) { _shakePinVerify(); return; }
      _pinVerifyAttempt();
    }
  });
  // Click outside overlay = cancel
  var m = document.getElementById('pin-verify-modal');
  if (m && !m.dataset.obound) { m.dataset.obound='1'; m.addEventListener('click', function(ev){ if (ev.target === m) closePinVerify(); }); }
}
function _pinVerifyAttempt(){
  if (!_verifyPin(_pinVerify.code)) {
    _pinVerify.remaining--;
    var err = document.getElementById('pin-verify-err'); err.textContent = 'Wrong passcode — ' + _pinVerify.remaining + ' attempt' + (_pinVerify.remaining===1 ? '' : 's') + ' remaining'; err.classList.add('show');
    _shakePinVerify();
    if (_pinVerify.remaining <= 0) {
      err.textContent = 'Too many attempts · please try again in 30 seconds';
      var kp = document.getElementById('pin-verify-keypad'); if (kp) kp.style.pointerEvents='none';
      setTimeout(function(){
        _pinVerify.remaining = 3; _pinVerify.code='';
        if (kp) kp.style.pointerEvents='auto';
        _pinVerifyRender();
      }, 30000);
    } else {
      setTimeout(function(){ _pinVerify.code=''; _pinVerifyRender(); }, 700);
    }
    return;
  }
  // Success
  _pinUnlockSession(120000);
  var cb = _pinVerify.onSuccess;
  var m = document.getElementById('pin-verify-modal'); if (m) m.classList.remove('open');
  if (typeof cb === 'function') try { cb(); } catch(e){ toast('Action error: '+e.message,'error'); }
}
function _shakePinVerify(){
  var slots = document.querySelectorAll('#pin-verify-slots .pin-slot');
  slots.forEach(function(s){ s.classList.remove('shake'); void s.offsetWidth; s.classList.add('shake'); });
}
function pinForgot(){
  if (!confirm('Resetting passcode requires you to re-authenticate with your wallet. Continue?')) return;
  _clearPin();
  var vm = document.getElementById('pin-verify-modal'); if (vm) vm.classList.remove('open');
  toast('Passcode cleared — please re-authenticate to set a new one','info');
  doDisconnect();
}

/* ===== STAKING MODE (PAID / FREE) ===== */
var _wizMode = 'paid';
function wizSetStakeMode(mode, el){
  _wizMode = mode;
  var btns = document.querySelectorAll('.stake-mode-switch .sm-btn');
  btns.forEach(function(b){ b.classList.remove('active'); });
  if (el) el.classList.add('active');
  document.getElementById('stake-free-note').style.display = mode==='free' ? 'block' : 'none';
  document.getElementById('wiz-pot-calc').style.display = mode==='free' ? 'none' : 'grid';
  document.getElementById('fee-dropdown').style.display = mode==='free' ? 'none' : 'block';
  var stakeInput = document.getElementById('stake-input');
  var nextBtn = document.getElementById('wiz-next-2');
  if (mode === 'free') {
    CREATE.stake = 0;
    if (stakeInput) { stakeInput.disabled = true; stakeInput.value = ''; stakeInput.placeholder = 'Free duel · no stake'; }
    if (nextBtn) nextBtn.disabled = false;
    wizUpdatePotFree();
  } else {
    CREATE.stake = CREATE.stake || 0;
    if (stakeInput) { stakeInput.disabled = false; if (CREATE.stake) stakeInput.value = CREATE.stake; stakeInput.placeholder = 'Min 10 CLU'; }
    if (nextBtn) nextBtn.disabled = CREATE.stake >= 10 ? false : true;
    wizUpdatePot();
  }
  // Review page hero coloring
  setTimeout(function(){
    var hero = document.querySelector('.wiz-pot-hero'); if (hero) hero.classList.toggle('free', mode==='free');
    var lock = document.querySelector('.wiz-lock-btn'); if (lock) lock.classList.toggle('free', mode==='free');
  }, 60);
}
function wizUpdatePotFree(){
  document.getElementById('wiz-pot-you').textContent = '0 CLU';
  document.getElementById('wiz-pot-friend').textContent = '0 CLU';
  document.getElementById('wiz-pot-win').textContent = 'Bragging rights';
}

/* Post-challenge modal mode */
function pcmSetMode(mode, el){
  var btns = document.querySelectorAll('#post-challenge-modal .stake-mode-switch .sm-btn');
  btns.forEach(function(b){ b.classList.remove('active'); });
  if (el) el.classList.add('active');
  var fld = document.getElementById('pcm-stake-field');
  var label = document.getElementById('pcm-stake-label');
  var inp = document.getElementById('board-stake');
  if (mode === 'free') {
    if (fld) fld.style.display = 'none';
    CREATE.postMode = 'free';
  } else {
    if (fld) fld.style.display = 'block';
    if (label) label.textContent = 'Stake (CLU)';
    if (inp) { inp.disabled=false; inp.placeholder='Min 10 CLU'; }
    CREATE.postMode = 'paid';
  }
}

/* Patch seedBoardChallenges + renderBoard to include paid/free flag */
if (typeof _boardSeed !== 'undefined') {
  _boardSeed.forEach(function(c){ if (c.stake===0) c.free = true; else c.free = false; });
}

/* Patch openPostChallengeModal to set default */
if (typeof openPostChallengeModal === 'function') {
  var _origOPCM = openPostChallengeModal;
  openPostChallengeModal = function(){
    _origOPCM.apply(this, arguments);
    setTimeout(function(){
      var paid = document.getElementById('pcm-paid'); if (paid && !paid.classList.contains('active')) { paid.classList.add('active'); }
      var free = document.getElementById('pcm-free'); if (free) free.classList.remove('active');
      var fld = document.getElementById('pcm-stake-field'); if (fld) fld.style.display='block';
      var inp = document.getElementById('board-stake'); if (inp) inp.disabled=false;
      CREATE.postMode = 'paid';
    }, 40);
  };
}

/* Patch postChallenge to honor free */
if (typeof postChallenge === 'function') {
  var _origPC = postChallenge;
  postChallenge = function(){
    if (CREATE.postMode === 'free') {
      CREATE.stake = 0;
      var g = document.getElementById('board-game');
      var mode = document.getElementById('board-mode') || {value:'1v1 friendly'};
      var exp = document.getElementById('board-expiry') || {value:'24'};
      var ch = { id:'CB'+(Date.now().toString(36)).toUpperCase(),
        game: (g&&g.value) || 'valorant',
        challengeType: 'outcome',
        condition:{ type:'outcome', value:(mode&&mode.value)||'Free friendly duel' },
        stake: 0,
        free: true,
        creator: (U&&U.addr) || 'You',
        created: Date.now(),
        expiresAt: Date.now() + (parseInt((exp&&exp.value)||'24',10)*3600000),
        title: (mode&&mode.value) || 'Friendly warm-up',
        description: 'No-stake bragging-rights duel · both sides play for pride.',
        format: 'Best of 1',
        participants: 1,
        maxParticipants: 2,
        isNew: true
      };
      _boardCache.unshift(ch);
      try { localStorage.setItem('clutch_board_cache', JSON.stringify(_boardCache)); } catch(e){}
      closeModal('post-challenge-modal');
      renderBoard();
      toast('Free duel posted on the Duel Board','success');
      return;
    }
    _origPC.apply(this, arguments);
  };
}

/* Patch wiz-lock-btn to unlock with PIN before executing */
if (typeof lockWiz === 'function') {
  var _origLock = lockWiz;
  lockWiz = function(){
    if (_wizMode === 'paid' && !_isPinUnlocked() && _hasPinSet()) {
      openPinVerify({
        title:'Enter Passcode to Lock Stake',
        sub:'Your CLU entry will be held in escrow until result verification.',
        onSuccess:function(){ _origLock(); }
      });
      return;
    }
    if (_wizMode === 'paid' && !_hasPinSet()) {
      alert('Please set your 6-digit CLUTCH passcode first — required for any paid duel.');
      openPinSetup(true);
      return;
    }
    _origLock();
  };
}

/* Patch acceptBoardChallenge -> PIN before accepting */
if (typeof acceptBoardChallenge === 'function') {
  var _origABC = acceptBoardChallenge;
  acceptBoardChallenge = function(id){
    var ch = _boardCache.find(function(x){ return x.id === id; });
    var needsPin = !ch || ch.stake > 0;
    var cb = function(){ _origABC(id); };
    if (!_hasPinSet()) {
      if (confirm('You must set a 6-digit passcode before accepting duels. Set it now?')) openPinSetup(true);
      else toast('Set a passcode in your profile to accept duels','info');
      return;
    }
    if (needsPin && !_isPinUnlocked()) {
      openPinVerify({
        title: ch && ch.free ? 'Enter Passcode to Accept Duel' : 'Enter Passcode to Accept & Lock Stake',
        sub: ch && ch.free ? 'Required to confirm this free match.' : 'Your matching CLU stake will lock into escrow after successful verification.',
        onSuccess: cb
      });
      return;
    }
    cb();
  };
}

/* Patch wallet buttons */
if (typeof openWithdraw === 'function') {
  var _origOW = openWithdraw;
  openWithdraw = function(){
    if (!_hasPinSet()) { if (confirm('Set a 6-digit passcode first to protect your wallet?')) { openPinSetup(true); return; } }
    if (!_isPinUnlocked()) { openPinVerify({ title:'Unlock Wallet', sub:'Enter your passcode to access withdrawal & balance details.', onSuccess:_origOW }); return; }
    _origOW();
  };
}

/* Patch wizSetStake to keep free mode handling correct */
if (typeof wizSetStake === 'function') {
  var _origWS = wizSetStake;
  wizSetStake = function(n, el){
    _wizMode = 'paid';
    var paidBtn = document.getElementById('sm-paid'); var freeBtn = document.getElementById('sm-free');
    if (paidBtn) paidBtn.classList.add('active'); if (freeBtn) freeBtn.classList.remove('active');
    document.getElementById('stake-free-note').style.display = 'none';
    document.getElementById('wiz-pot-calc').style.display = 'grid';
    document.getElementById('fee-dropdown').style.display = 'block';
    var st = document.getElementById('stake-input'); if (st) st.disabled=false;
    _origWS(n, el);
  };
}
if (typeof wizCustomStake === 'function') {
  var _origWCS = wizCustomStake;
  wizCustomStake = function(v){
    _wizMode = 'paid';
    var paidBtn = document.getElementById('sm-paid'); var freeBtn = document.getElementById('sm-free');
    if (paidBtn) paidBtn.classList.add('active'); if (freeBtn) freeBtn.classList.remove('active');
    document.getElementById('stake-free-note').style.display = 'none';
    document.getElementById('wiz-pot-calc').style.display = 'grid';
    document.getElementById('fee-dropdown').style.display = 'block';
    _origWCS(v);
  };
}

/* ===== BOARD PAID/FREE FILTER ===== */
var _boardPaidFilter = 'all';
/* Inject filter buttons HTML into cb-toolbar */
(function injectToolbarFilters(){
  function doInject(){
    var left = document.querySelector('.cb-tb-left');
    if (!left || left.querySelector('.cb-mode-group')) return;
    var wrap = document.createElement('div');
    wrap.className = 'cb-mode-group';
    wrap.innerHTML =
      '<button class="cb-mode-pill active all" data-mode="all" onclick="setBoardPaidFilter(\'all\',this)"><span class="d"></span>All</button>' +
      '<button class="cb-mode-pill paid" data-mode="paid" onclick="setBoardPaidFilter(\'paid\',this)"><span class="d"></span>Paid</button>' +
      '<button class="cb-mode-pill free" data-mode="free" onclick="setBoardPaidFilter(\'free\',this)"><span class="d"></span>Free</button>';
    left.insertBefore(wrap, left.firstChild);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', doInject);
  else setTimeout(doInject, 200);
})();
function setBoardPaidFilter(mode, el){
  _boardPaidFilter = mode;
  var all = document.querySelectorAll('.cb-mode-pill');
  all.forEach(function(b){ b.classList.remove('active','all','paid','free'); b.classList.add(b.dataset.mode); });
  if (el) { el.classList.add('active'); el.classList.add(el.dataset.mode); }
  applyBoardFilters();
}

/* ===== Patch applyBoardFilters & renderBoard to honor free tag + visual mark ===== */
if (typeof applyBoardFilters === 'function') {
  var _origABF = applyBoardFilters;
  applyBoardFilters = function(){
    if (typeof _origABF === 'function') _origABF();
  };
}
/* Patch applyBoardFilters POST: use _origABF + inject paid/free filter + pass list explicitly */
(function patchABFPaidFree(){
  if (typeof _origABF !== 'function' || typeof _origABF === 'undefined') return;
  var originalPost = applyBoardFilters;
  applyBoardFilters = function(){
    _origABF();
    // Re-derive filter output from _boardCache the same way original ABF did
    var out = _boardCache.slice();
    if (_boardFilter !== 'all') out = out.filter(function(c){ return c.game === _boardFilter; });
    var vOnly = document.getElementById('cb-verified');
    if (vOnly && vOnly.checked) out = out.filter(function(c){ return PLAYER_PROFILES[c.creator] && PLAYER_PROFILES[c.creator].verified; });
    var sortSel = document.getElementById('cb-sort');
    var sortBy = (sortSel && sortSel.value) || 'newest';
    if (sortBy === 'highest') out.sort(function(a,b){ return b.stake - a.stake; });
    else if (sortBy === 'expiring') out.sort(function(a,b){ return a.expiresAt - b.expiresAt; });
    else out.sort(function(a,b){ return (b.created||0)-(a.created||0); });
    if (_boardPaidFilter === 'paid') out = out.filter(function(c){ return !c.free && (c.stake||0)>0; });
    else if (_boardPaidFilter === 'free') out = out.filter(function(c){ return !!c.free || (c.stake||0)===0; });
    renderBoard(out);
  };
})();

/* Patch seedBoardChallenges to include 2x free duels in seed */
if (typeof _seedBoardChallenges === 'function') {
  var _origSeed = _seedBoardChallenges;
  _seedBoardChallenges = function(){
    var r = _origSeed();
    if (Array.isArray(r) && r.length) {
      // Mark first two as free examples (shadowtitan + cyberghost) and add dedicated free entries
      var free1 = Object.assign({}, r[2] || r[0], { id: 'CBF'+Date.now().toString(36).slice(-6).toUpperCase()+'1', free:true, stake:0,
        title:'Warm-up session · no stake', description:'Bragging rights only. First to 2 wins in VALORANT unrated.',
        creator:'ShadowTitan', participants:1, maxParticipants:2, isNew:false });
      var free2 = Object.assign({}, r[6] || r[1], { id: 'CBF'+Date.now().toString(36).slice(-6).toUpperCase()+'2', free:true, stake:0,
        title:'Friendly 1v1 · pride only', description:'No CLU. No pressure. Just let\'s see who plays better.',
        creator:'CyberGhost', game:'cs2', participants:1, maxParticipants:2, isNew:true });
      r.push(free1); r.push(free2);
    }
    return r;
  };
  if (typeof _boardSeed !== 'undefined') {
    try {
      var x = _seedBoardChallenges();
      if (Array.isArray(x) && x.length) { _boardCache = x; }
    } catch(e){}
  }
}

/* Patch enterApp() to prompt PIN setup if not set */
if (typeof enterApp === 'function') {
  var _origEA = enterApp;
  enterApp = function(){
    _origEA.apply(this, arguments);
    if (!_hasPinSet() && U.via !== 'guest') { setTimeout(openPinSetup, 900); }
    if (!_hasPinSet() && U.via === 'guest') { /* guests can skip */ }
  };
}

// ======== /PIN + PAID/FREE END ========

var PLAYER_PROFILES = {
  'NovaStriker': {
    game:'valorant', verified:true, online:true, status:'In Game',
    official:{ rank:'Diamond II', tier:'D2', wr:54, matches:1842, seasonAct:'Episode 9 Act 2', rr:18 },
    clutch:{ rating:847, percentile:'TOP 8%', conf:'high', confMatches:1842,
             adjWr:56.8, form:92, opponentQ:86, consistency:78, pressure:91 },
    dna:[ {k:'Aggressive', v:82}, {k:'Mechanical', v:91}, {k:'Clutch', v:88}, {k:'Consistent', v:70}, {k:'Team Play', v:62} ],
    recentForm:['W','W','L','W','W','W','W','L','W','W'],
    opponent:{ wrRaw:'vs avg Platinum I', avgTier:'Ascendant-adjacent', difficulty:'High Competition' }
  },
  'FragMaster': {
    game:'cs2', verified:true, online:false, status:'Offline 3h',
    official:{ rank:'Gold Nova III', tier:'GN3', wr:61, matches:1284, seasonAct:'Premier Season 7', rr:1210 },
    clutch:{ rating:722, percentile:'TOP 22%', conf:'high', confMatches:1284,
             adjWr:59.1, form:80, opponentQ:72, consistency:85, pressure:76 },
    dna:[ {k:'Aggressive', v:76}, {k:'Mechanical', v:80}, {k:'Clutch', v:68}, {k:'Consistent', v:85}, {k:'Strategic', v:72} ],
    recentForm:['W','L','W','W','W','L','W','W','D','W'],
    opponent:{ wrRaw:'vs avg Silver Elite', avgTier:'AK-MG adjacent', difficulty:'Balanced' }
  },
  'ShadowTitan': {
    game:'lol', verified:true, online:true, status:'In Lobby',
    official:{ rank:'Platinum I', tier:'P1', wr:51, matches:2105, seasonAct:'Split 2', lp:42 },
    clutch:{ rating:789, percentile:'TOP 12%', conf:'high', confMatches:2105,
             adjWr:54.3, form:88, opponentQ:92, consistency:71, pressure:84 },
    dna:[ {k:'Aggressive', v:64}, {k:'Mechanical', v:71}, {k:'Clutch', v:84}, {k:'Consistent', v:70}, {k:'Strategic', v:90} ],
    recentForm:['W','W','W','L','W','W','L','W','W','W'],
    opponent:{ wrRaw:'vs avg Gold II', avgTier:'Emerald-adjacent', difficulty:'High Opponent Quality' }
  },
  'ViperLynx': {
    game:'fortnite', verified:true, online:true, status:'Ranked Match',
    official:{ rank:'Elite', tier:'E1', wr:42, matches:924, seasonAct:'Chapter 6 S1', rp:8820 },
    clutch:{ rating:694, percentile:'TOP 31%', conf:'medium', confMatches:924,
             adjWr:48.2, form:76, opponentQ:78, consistency:64, pressure:70 },
    dna:[ {k:'Aggressive', v:88}, {k:'Mechanical', v:82}, {k:'Clutch', v:58}, {k:'Consistent', v:64}, {k:'Adaptive', v:72} ],
    recentForm:['W','L','L','W','W','L','W','L','W','W'],
    opponent:{ wrRaw:'vs avg Diamond', avgTier:'Champion-adjacent', difficulty:'Tough Lobbies' }
  },
  'KiiTheorem': {
    game:'apex', verified:true, online:false, status:'Offline 1d',
    official:{ rank:'Diamond IV', tier:'D4', wr:48, matches:612, seasonAct:'Ranked Split 2', rp:9850 },
    clutch:{ rating:748, percentile:'TOP 18%', conf:'medium', confMatches:612,
             adjWr:52.1, form:72, opponentQ:84, consistency:66, pressure:78 },
    dna:[ {k:'Aggressive', v:80}, {k:'Mechanical', v:76}, {k:'Clutch', v:78}, {k:'Consistent', v:66}, {k:'Team Play', v:86} ],
    recentForm:['L','W','W','L','W','L','L','W','W','W'],
    opponent:{ wrRaw:'vs avg Platinum II', avgTier:'Master-adjacent', difficulty:'High Quality' }
  },
  'ClutchWizard': {
    game:'rl', verified:true, online:true, status:'In Game',
    official:{ rank:'Champion II', tier:'C2', wr:57, matches:3108, seasonAct:'Season 15', mmr:1620 },
    clutch:{ rating:874, percentile:'TOP 5%', conf:'high', confMatches:3108,
             adjWr:59.7, form:94, opponentQ:88, consistency:82, pressure:95 },
    dna:[ {k:'Aggressive', v:74}, {k:'Mechanical', v:93}, {k:'Clutch', v:95}, {k:'Consistent', v:82}, {k:'Team Play', v:84} ],
    recentForm:['W','W','W','W','L','W','W','W','L','W'],
    opponent:{ wrRaw:'vs avg Champion I', avgTier:'Grand Champion-adjacent', difficulty:'Top Tier' }
  },
  'CyberGhost': {
    game:'dota2', verified:true, online:true, status:'Queueing',
    official:{ rank:'Ancient II', tier:'A2', wr:49, matches:1792, seasonAct:'Patch 7.40', mmr:4020 },
    clutch:{ rating:812, percentile:'TOP 9%', conf:'high', confMatches:1792,
             adjWr:52.8, form:85, opponentQ:90, consistency:73, pressure:87 },
    dna:[ {k:'Aggressive', v:60}, {k:'Mechanical', v:76}, {k:'Clutch', v:87}, {k:'Consistent', v:73}, {k:'Strategic', v:92} ],
    recentForm:['W','L','W','W','L','W','W','L','W','W'],
    opponent:{ wrRaw:'vs avg Legend', avgTier:'Divine-adjacent', difficulty:'High Competition' }
  },
  'NightOwl_X': {
    game:'cod', verified:true, online:true, status:'In Match',
    official:{ rank:'Crimson I', tier:'CR1', wr:58, matches:864, seasonAct:'Season 4 Reloaded', sr:23100 },
    clutch:{ rating:758, percentile:'TOP 15%', conf:'medium', confMatches:864,
             adjWr:56.2, form:82, opponentQ:74, consistency:79, pressure:81 },
    dna:[ {k:'Aggressive', v:86}, {k:'Mechanical', v:82}, {k:'Clutch', v:81}, {k:'Consistent', v:79}, {k:'Objective-Focused', v:74} ],
    recentForm:['W','W','W','L','W','L','W','W','W','L'],
    opponent:{ wrRaw:'vs avg Amber IV', avgTier:'Crimson-adjacent', difficulty:'Balanced' }
  }
};
// Shortcut to build self-profile on demand
function buildMyProfile() {
  var name = U.name || 'You';
  var game = 'valorant';
  return {
    game:game, verified:!!_authToken, online:true, status:(_authToken ? 'Online' : 'Guest'),
    official:{ rank:'Diamond III', tier:'D3', wr:52, matches:(_authToken? 482 : 0), seasonAct:'Episode 9 Act 2', rr:42 },
    clutch:{ rating:798, percentile:'TOP 11%', conf:(_authToken? 'medium' : 'insuf'), confMatches:(_authToken? 482 : 0),
             adjWr:55.1, form:74, opponentQ:76, consistency:72, pressure:80 },
    dna:[ {k:'Aggressive', v:70}, {k:'Mechanical', v:78}, {k:'Clutch', v:80}, {k:'Consistent', v:72}, {k:'Team Play', v:68} ],
    recentForm:['W','L','W','W','L','W','W','L','W','D'],
    opponent:{ wrRaw:'vs avg Platinum III', avgTier:'Ascendant-adjacent', difficulty:'Rising Competition' }
  };
}
function calcFairness(you, them) {
  if (!you || !them) return { overall:50, breakdown:[], pctYou:50, pctThem:50, diff:'Competitive', rec:'Not enough data.' };
  var skillYou = you.clutch.rating;
  var skillThem = them.clutch.rating;
  var skillBal = 100 - Math.min(100, Math.abs(skillYou - skillThem));
  var formBal = 100 - Math.min(100, Math.abs((you.clutch.form||50) - (them.clutch.form||50)) * 2);
  var expBal = 100 - Math.min(100, Math.abs((you.official.matches||0) - (them.official.matches||0)) / 30);
  var oppBal = 100 - Math.min(100, Math.abs((you.clutch.opponentQ||50) - (them.clutch.opponentQ||50)) * 2);
  var fam = Math.min(100, 70 + Math.random()*15);
  skillBal = Math.round(skillBal); formBal = Math.round(formBal); expBal = Math.round(expBal); oppBal = Math.round(oppBal); fam = Math.round(fam);
  var weights = [0.4, 0.2, 0.15, 0.15, 0.1];
  var overall = Math.round(skillBal*weights[0] + formBal*weights[1] + expBal*weights[2] + oppBal*weights[3] + fam*weights[4]);
  var mean = (skillYou + skillThem) / 2;
  var delta = skillThem - skillYou;
  var winPct = Math.max(2, Math.min(98, Math.round(50 - delta * 0.35)));
  var losePct = 100 - winPct;
  var diff;
  if (winPct >= 70) diff = 'Easy';
  else if (winPct >= 58) diff = 'Competitive';
  else if (winPct >= 45) diff = 'Hard';
  else diff = 'Very Hard';
  var rec;
  if (overall >= 90) rec = 'This duel is expected to be highly competitive and fair.';
  else if (overall >= 75) rec = 'This duel is expected to be competitive — slight edge on one side.';
  else rec = 'Skill mismatch detected — consider a closer opponent for a more balanced match.';
  return {
    overall: overall, breakdown:[
      {k:'Skill Balance', v:skillBal}, {k:'Recent Form', v:formBal}, {k:'Experience', v:expBal},
      {k:'Opponent Strength', v:oppBal}, {k:'Game Familiarity', v:fam}
    ],
    pctYou: winPct, pctThem: losePct, diff: diff, rec: rec
  };
}

// -- CLUTCH V2: BOARD STATE + MOCK DATA -----------------
var _boardFilter = 'all';
var _boardView = 'grid';
var _boardSeed = null;
var _myCohort = null; // fetched lazily, see _ensureMyCohort()

// Skill cohort colors — soft sort/display only, not a hard rank.
var COHORT_COLORS = { Diamond:'#6ee7ff', Gold:'#e8a020', Silver:'#c8cfe0', Bronze:'#cd7f32', Unranked:'var(--txt3)' };

function _ensureMyCohort() {
  if (_myCohort || !U.addr) return Promise.resolve(_myCohort);
  return authFetch('/api/profile/achievements')
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(d){ _myCohort = (d && d.cohort) || null; return _myCohort; })
    .catch(function(){ return null; });
}

function _seedBoardChallenges() {
  var now = Date.now();
  return [
    { id:'cb-nova',     game:'valorant',   isNew:true,  creator:'NovaStriker',     crRankShort:'Diamond II',   stake:5000,  format:'Best of 3', modeShort:'Bo3', title:'5 kills in a row? Prove it.',   desc:'First to get 5 kills in a row wins.',                       created:now-120000,    expiresAt:now+86400000,  participants:'1 / 2' },
    { id:'cb-frag',     game:'cs2',        isNew:true,  creator:'FragMaster',      crRankShort:'Gold Nova III',stake:2500,  format:'Best of 1', modeShort:'Bo1', title:'AWP only, no scopes only.',   desc:'No scope AWP kills only. Most kills in 10 rounds.',        created:now-300000,    expiresAt:now+82800000,  participants:'1 / 2' },
    { id:'cb-shadow',   game:'lol',        isNew:true,  creator:'ShadowTitan',     crRankShort:'Platinum I',   stake:3000,  format:'Best of 1', modeShort:'Bo1', title:'1v1 Mid lane. No excuses.',    desc:'First blood + 100 CS by 10 min wins.',                      created:now-600000,    expiresAt:now+79200000,  participants:'1 / 2' },
    { id:'cb-viper',    game:'fortnite',   isNew:false, creator:'ViperLynx',       crRankShort:'Elite',        stake:1000,  format:'First to 3', modeShort:'Ft3', title:'Build fight to the death.',    desc:'Box fight 1v1. First to 3 wins.',                          created:now-720000,    expiresAt:now+75600000,  participants:'1 / 2' },
    { id:'cb-kii',      game:'apex',       isNew:false, creator:'KiiTheorem',      crRankShort:'Diamond IV',   stake:2000,  format:'Best of 3', modeShort:'Bo3', title:'2v2 Arenas duel.',        desc:'You + a friend vs us. Best of 3. Let\'s see it.',           created:now-1080000,   expiresAt:now+72000000,  participants:'2 / 4' },
    { id:'cb-wiz',      game:'rl',         isNew:false, creator:'ClutchWizard',    crRankShort:'Champion II',  stake:1500,  format:'Best of 3', modeShort:'Bo3', title:'1v1 for the rank.',            desc:'Winner takes the rank. No rematches.',                      created:now-1500000,   expiresAt:now+68400000,  participants:'1 / 2' },
    { id:'cb-ghost',    game:'dota2',      isNew:false, creator:'CyberGhost',      crRankShort:'Ancient II',   stake:2000,  format:'Best of 1', modeShort:'Bo1', title:'Mid only or lose.',            desc:'Mid lane only. 1v1. No jungle, no help.',                   created:now-1920000,   expiresAt:now+64800000,  participants:'1 / 2' },
    { id:'cb-owl',      game:'cod',        isNew:false, creator:'NightOwl_X',      crRankShort:'Crimson I',    stake:1000,  format:'Best of 1', modeShort:'Bo1', title:'Sniper only. Quickscopes.',    desc:'First to 20 kills wins. Search & Destroy.',                 created:now-2400000,   expiresAt:now+61200000,  participants:'1 / 2' }
  ];
}
function _initToPillsColor(g) {
  var map = { valorant:'#ff4655', lol:'#5687c7', dota2:'#e68c80', clashroyale:'#7cbcf0', brawlstars:'#f2d768',
              cs2:'#e7b877', fortnite:'#ff6aac', apex:'#ff8591', ow2:'#ffbd55', rl:'#6ab0ff',
              fifa:'#3bffa7', cod:'#00FF87' };
  return map[g] || '#00FF87';
}
function _initToDisplayName(g) {
  var map = { valorant:'VALORANT', lol:'LEAGUE OF LEGENDS', dota2:'DOTA 2', clashroyale:'CLASH ROYALE', brawlstars:'BRAWL STARS',
              cs2:'CS2', fortnite:'FORTNITE', apex:'APEX LEGENDS', ow2:'OVERWATCH 2', rl:'ROCKET LEAGUE',
              fifa:'EA FC', cod:'CALL OF DUTY' };
  return map[g] || (g||'').toUpperCase();
}
function _initToShortName(g) {
  var map = { valorant:'V', lol:'L', dota2:'D', clashroyale:'CR', brawlstars:'BS', cs2:'CS', fortnite:'F',
              apex:'A', ow2:'OW', rl:'RL', fifa:'FC', cod:'MW' };
  return map[g] || (g||'?').charAt(0).toUpperCase();
}
function _timeAgo(ts) {
  var d = Math.floor((Date.now() - ts) / 60000);
  if (d < 1) return 'now';
  if (d < 60) return d + 'm ago';
  var h = Math.floor(d / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h/24) + 'd ago';
}
function _rankIcon(g) {
  return '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l10 5-10 20L2 7z"/></svg>';
}

// -- CLUTCH V2: BOARD FUNCTIONS -------------------------
function initBoard() {
  var filterWrap = document.getElementById('board-filters');
  if (!filterWrap) return;
  var allActive = (_boardFilter === 'all') ? ' active' : '';
  var html = '<button class="cb-pill'+allActive+'" data-filter="all" onclick="filterBoard(\'all\',this)">All</button>';
  GAMES.forEach(function(g) {
    var gActive = (_boardFilter === g.id) ? ' active' : '';
    html += '<button class="cb-pill'+gActive+'" data-filter="'+g.id+'" onclick="filterBoard(\''+g.id+'\',this)">'+g.name+'</button>';
  });
  filterWrap.innerHTML = html;
  var sel = document.getElementById('board-game');
  if (sel) {
    sel.innerHTML = '<option value="">Select game...</option>';
    GAMES.forEach(function(g) {
      var badge = g.api ? ' [API Verified]' : '';
      sel.innerHTML += '<option value="'+g.id+'">'+g.name+badge+'</option>';
    });
  }
  loadBoard();
}
function loadBoard() {
  var base = ARENA_CONFIG.API_BASE || '';
  var done = function(data) {
    if (data && data.challenges && data.challenges.length) {
      _boardCache = data.challenges;
    } else {
      var stored = [];
      try { stored = JSON.parse(localStorage.getItem('clutch_board') || '[]'); } catch(e) { stored = []; }
      stored = stored.filter(function(c) { return c.expiresAt > Date.now() && c.status === 'open'; });
      if (stored.length) {
        _boardCache = stored;
      } else {
        if (!_boardSeed) _boardSeed = _seedBoardChallenges();
        _boardCache = _boardSeed.slice();
      }
    }
    applyBoardFilters();
    // Skill cohort loads lazily/async; re-render once known so same-cohort
    // duels can move up without blocking the initial board paint.
    _ensureMyCohort().then(function(c){ if (c) applyBoardFilters(); });
  };
  fetch(base + '/api/challenges').then(function(r){ return r.json(); }).then(done).catch(function(){ done(null); });
}
function applyBoardFilters() {
  var out = _boardCache.slice();
  if (_boardFilter !== 'all') {
    out = out.filter(function(c) { return c.game === _boardFilter; });
  }
  var vOnly = document.getElementById('cb-verified');
  if (vOnly && vOnly.checked) {
    out = out.filter(function(c){ return PLAYER_PROFILES[c.creator] && PLAYER_PROFILES[c.creator].verified; });
  }
  var sortSel = document.getElementById('cb-sort');
  var sortBy = (sortSel && sortSel.value) || 'newest';
  var within = function(a,b) {
    if (sortBy === 'highest') return b.stake - a.stake;
    if (sortBy === 'expiring') return a.expiresAt - b.expiresAt;
    return (b.created||0) - (a.created||0);
  };
  // Soft bias: same-cohort-as-you duels float up first (never hides others —
  // it's a sort preference, not a matchmaking restriction).
  if (_myCohort) {
    out.sort(function(a,b){
      var am = (a.creatorCohort||'Unranked')===_myCohort ? 0 : 1;
      var bm = (b.creatorCohort||'Unranked')===_myCohort ? 0 : 1;
      return am - bm || within(a,b);
    });
  } else {
    out.sort(within);
  }
  renderBoard(out);
}
function sortBoard(v) { applyBoardFilters(); }
function setBoardView(mode) {
  _boardView = mode;
  var gBtn = document.getElementById('cb-view-grid');
  var lBtn = document.getElementById('cb-view-list');
  var list = document.getElementById('board-list');
  if (mode === 'grid') {
    if (gBtn) gBtn.classList.add('active');
    if (lBtn) lBtn.classList.remove('active');
    if (list) list.classList.remove('list-view');
  } else {
    if (gBtn) gBtn.classList.remove('active');
    if (lBtn) lBtn.classList.add('active');
    if (list) list.classList.add('list-view');
  }
}
function renderBoard(challenges) {
  var list = document.getElementById('board-list');
  var pag = document.getElementById('board-pag');
  if (!list) return;
  if (!challenges || !challenges.length) {
    list.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px 24px;color:var(--txt3)">'
      + '<div style="font-size:22px;font-weight:800;color:#c8cfe0;margin-bottom:6px">No open duels match</div>'
      + '<div style="font-size:12px">Post the first duel or clear some filters.</div></div>';
    if (pag) pag.innerHTML = '';
    return;
  }
  var perPage = 8;
  var totalPages = Math.max(1, Math.ceil(challenges.length / perPage));
  challenges = challenges.slice(0, perPage);
  list.innerHTML = challenges.map(function(c) {
    var prof = PLAYER_PROFILES[c.creator] || { verified:false };
    var init = (c.creator || '?').charAt(0);
    var avVar = 'v-' + c.game;
    var pillClr = _initToPillsColor(c.game);
    var gameDisp = _initToDisplayName(c.game);
    var shortG = _initToShortName(c.game);
    var isOwn = U.addr && c.creator === U.addr;
    var cohort = c.creatorCohort || 'Unranked';
    var cohortClr = COHORT_COLORS[cohort] || 'var(--txt3)';
    var cohortSameAsMe = _myCohort && cohort === _myCohort;
    var cohortTag = '<span style="color:'+cohortClr+';font-weight:700'+(cohortSameAsMe?';text-decoration:underline':'')+'" title="Skill cohort — activity-based, not a hard match requirement">'+cohort+'</span>';
    var time = _timeAgo(c.created || Date.now());
    var parts = c.participants || '1 / 2';
    var verifiedBadge = prof.verified ? '<div class="cb-avatar-check">✓</div>' : '';
    var isNew = c.isNew ? '<div class="cb-new-badge">New</div>' : '';
    var rankShort = c.crRankShort || '';
    var free = !!c.free || (c.stake||0)===0;
    var typeTag = free
      ? '<div class="cb-type-tag free"><span class="ico">★</span>FREE</div>'
      : '<div class="cb-type-tag paid"><span class="ico">$</span>CLU STAKE</div>';
    var stakeBlock = free
      ? '<div class="cb-stake" style="color:#b88aff"><span class="clu-ico" style="background:#7000FF;color:#fff">★</span> <span style="color:#b88aff">0</span> <span style="color:var(--txt3);font-weight:700">· No escrow</span></div>'
      : '<div class="cb-stake"><span class="clu-ico">◈</span> '+(c.stake||0).toLocaleString()+' <span style="color:var(--txt3);font-weight:700">CLU</span></div>';
    return '<div class="cb-card '+(free?'free':'paid')+'" data-id="'+c.id+'">'
      + '<div class="cb-card-bg"></div>'
      + '<div class="cb-card-inner">'
      +   '<div class="cb-card-hdr">'
      +     '<div class="cb-game-lbl" style="color:'+pillClr+'">'
      +       '<div class="cb-game-dot" style="background:'+pillClr+'">'+shortG+'</div> '
      +       gameDisp
      +     '</div>'
      +     isNew
      +     typeTag
      +   '</div>'
      +   '<div class="cb-player-row">'
      +     '<div class="cb-avatar '+avVar+'">'+init+verifiedBadge+'</div>'
      +     '<div class="cb-player-info">'
      +       '<div class="cb-player-name">'+c.creator
      +         (prof.verified ? ' <svg width="12" height="12" viewBox="0 0 24 24" fill="#00FF87"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' : '')
      +       '</div>'
      +       '<div class="cb-player-rank"><span class="rnk-gem" style="color:'+pillClr+'">'+_rankIcon(c.game)+'</span> '+rankShort+(rankShort?' · ':'')+cohortTag+'</div>'
      +     '</div>'
      +   '</div>'
      +   '<div class="cb-title-row">'+c.title+'</div>'
      +   '<div class="cb-desc-row">'+(c.desc || '')+'</div>'
      +   '<div class="cb-meta-row">'
      +     '<div class="cb-meta-left">'
      +       stakeBlock
      +       '<div class="cb-format">'+((window._escAcc||String)(c.format || c.modeLabel || c.modeShort || c.mode || ''))
      +         (c.modeVerifiable ? ' <span style="color:var(--acc);font-size:10px;font-weight:800" title="Result auto-verified via game API">✓ VERIFIED</span>' : '')
      +       '</div>'
      +     '</div>'
      +   '</div>'
      +   '<div class="cb-action-row">'
      +     (isOwn
        ? '<button class="cb-accept-btn c-'+c.game+'" onclick="cancelChallenge(\''+c.id+'\')" style="filter:grayscale(.6)">Cancel</button>'
        : '<button class="cb-accept-btn c-'+c.game+'" onclick="acceptBoardChallenge(\''+c.id+'\')">Accept Duel</button>')
      +     '<button class="cb-chat-btn" onclick="toast(\'Direct chat coming soon\',\'info\')" title="Message player">'
      +       '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
      +     '</button>'
      +   '</div>'
      +   '<div class="cb-foot">'
      +     '<span>'+time+'</span>'
      +     '<span class="cb-part"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> '+parts+'</span>'
      +   '</div>'
      + '</div></div>';
  }).join('');
  if (pag) {
    var ph = '';
    for (var i = 1; i <= Math.min(totalPages, 5); i++) {
      ph += '<button class="cb-page-btn'+(i===1?' active':'')+'">'+i+'</button>';
    }
    if (totalPages > 5) {
      ph += '<button class="cb-page-btn dots">…</button><button class="cb-page-btn">'+totalPages+'</button>';
    }
    if (totalPages > 1) {
      pag.innerHTML = '<button class="cb-page-btn" style="opacity:.5">‹</button>' + ph + '<button class="cb-page-btn">›</button>';
    } else {
      pag.innerHTML = '<button class="cb-page-btn active">1</button>';
    }
  }
}
function filterBoard(gameId, el) {
  _boardFilter = gameId;
  document.querySelectorAll('#board-filters .cb-pill').forEach(function(b) { b.classList.remove('active'); });
  if (el) el.classList.add('active');
  applyBoardFilters();
}


// ── CLUTCH V2: PROFILE RENDERING ────────────────────────
var _ocView = 'both';
function switchOCView(which, el) {
  _ocView = which;
  var offTab = document.getElementById('oc-tab-off');
  var clTab = document.getElementById('oc-tab-clutch');
  var grid = document.getElementById('profile-oc-grid');
  if (!offTab || !clTab || !grid) return;
  offTab.classList.remove('active');
  clTab.classList.remove('active');
  if (el) el.classList.add('active');
  var cols = grid.querySelectorAll('.ps-oc-col');
  cols.forEach(function(c){ c.style.opacity = '1'; c.style.transform = 'none'; c.style.filter = ''; });
  if (which === 'off') {
    cols.forEach(function(c,i){ if (i===1) { c.style.opacity='.25'; c.style.filter='blur(1px)'; } });
  } else if (which === 'clutch') {
    cols.forEach(function(c,i){ if (i===0) { c.style.opacity='.25'; c.style.filter='blur(1px)'; } });
  }
}

function _dimVal(game, dimName, prof) {
  try {
    if (prof && prof.clutch && prof.clutch.dims && prof.clutch.dims[dimName] != null) return prof.clutch.dims[dimName];
  } catch(e) {}
  var seed = ((game||'') + '|' + dimName + '|' + ((prof && prof.official && prof.official.rank) || '')).split('').reduce(function(a,c){return (a*31 + c.charCodeAt(0)) & 0x7fffffff;}, 7);
  return 55 + (seed % 40);
}

function _buildDims(game, prof) {
  var maps = {
    valorant: ['Mechanical Skill','Aim','Decision Making','Clutch','Consistency','Team Impact','Recent Form','Opponent Strength'],
    cs2:      ['Aim','Game Sense','Positioning','Clutch','Consistency','Utility Usage','Recent Form','Opponent Strength'],
    lol:      ['Laning','Teamfighting','Macro','Clutch','Consistency','Vision','Recent Form','Opponent Strength'],
    dota2:    ['Laning','Teamfights','Draft','Clutch','Consistency','Farm','Recent Form','Opponent Strength'],
    fortnite: ['Aim','Build/Edit','Positioning','Clutch','Consistency','Rotations','Recent Form','Opponent Strength'],
    apex:     ['Aim','Movement','Positioning','Team Play','Clutch','Consistency','Recent Form','Opponent Strength'],
    rl:       ['Mechanical','Positioning','Passing','Defense','Consistency','Boost Mgmt','Recent Form','Opponent Strength'],
    cod:      ['Aim','Movement','Rotations','Clutch','Consistency','Objective','Recent Form','Opponent Strength'],
    ow2:      ['Aim','Positioning','Ult Economy','Clutch','Consistency','Team Synergy','Recent Form','Opponent Strength'],
    clashroyale: ['Deck Mastery','Win Rate','Opp. Strength','Consistency','Adaptability','Decisions','Recent Form','Elixir Mgmt'],
    brawlstars:['Mechanics','Game Sense','Brawler Mastery','Adaptability','Team Play','Consistency','Recent Form','Opp. Strength'],
    fifa:     ['Finishing','Passing','Defense','Possession','Adaptability','Consistency','Recent Form','Opponent Strength']
  };
  var names = maps[game] || maps.valorant;
  return names.map(function(n) { return { k:n, v:_dimVal(game,n.toLowerCase().replace(/[^a-z0-9]/g,''),prof) }; });
}

async function _fetchLolStats(handle, region) {
  try {
    var res = await fetch((ARENA_CONFIG.API_BASE || '') + '/api/stats/lol?handle=' + encodeURIComponent(String(handle).replace('#', '-')) + '&region=' + encodeURIComponent(region));
    var d = await res.json();
    return res.ok ? { ok: true, d: d } : { ok: false, error: d.error || 'error' };
  } catch (e) { return { ok: false, error: 'network' }; }
}
async function runCompare() {
  var out = document.getElementById('cmp-result'); if (!out) return;
  var esc = (typeof _escAcc === 'function') ? _escAcc : function(s){ return String(s==null?'':s); };
  var aEl = document.getElementById('cmp-a'), bEl = document.getElementById('cmp-b');
  var accts = (typeof loadConnectedAccounts === 'function') ? loadConnectedAccounts() : {};
  if (aEl && !aEl.value.trim() && accts.riot && accts.riot.name) aEl.value = accts.riot.name;
  var a = (aEl.value || '').trim(), b = (bEl.value || '').trim();
  var region = (document.getElementById('cmp-region') || {}).value || 'europe';
  if (!a || !b) { out.innerHTML = '<div style="color:var(--txt3);font-size:12px">Enter two Riot IDs (Name#TAG).</div>'; return; }
  out.innerHTML = '<div style="color:var(--txt3);font-size:12px">Loading both players…</div>';
  var ra = await _fetchLolStats(a, region), rb = await _fetchLolStats(b, region);
  if (!ra.ok || !rb.ok) {
    out.innerHTML = '<div style="color:var(--red);font-size:12px;line-height:1.6">' +
      (!ra.ok ? ('Player A: ' + esc(ra.error) + '<br/>') : '') + (!rb.ok ? ('Player B: ' + esc(rb.error)) : '') + '</div>';
    return;
  }
  out.innerHTML = _compareHtml(ra.d, rb.d);
}
function _cmpRow(label, av, bv, aWins, bWins) {
  function col(v, win) { return '<div style="flex:1;text-align:center;font-weight:' + (win ? '900' : '600') + ';color:' + (win ? 'var(--acc)' : 'var(--txt)') + '">' + v + (win ? ' ▲' : '') + '</div>'; }
  return '<div style="display:flex;align-items:center;padding:9px 0;border-bottom:1px solid var(--b)">' +
    col(av, aWins) + '<div style="width:104px;text-align:center;font-size:9.5px;color:var(--txt3);text-transform:uppercase;letter-spacing:.05em">' + label + '</div>' + col(bv, bWins) + '</div>';
}
function _compareHtml(a, b) {
  var esc = (typeof _escAcc === 'function') ? _escAcc : function(s){ return String(s==null?'':s); };
  function cmp(x, y) { return [x > y, y > x]; }
  var cs = cmp(a.clutchScore, b.clutchScore), wr = cmp(a.winRate, b.winRate), kda = cmp(a.perf.kda, b.perf.kda), csm = cmp(a.perf.avgCs, b.perf.avgCs);
  return '<div style="display:flex;align-items:center;margin-bottom:6px">' +
      '<div style="flex:1;text-align:center;font-weight:800;font-size:13px;overflow:hidden;text-overflow:ellipsis">' + esc(a.handle) + '</div>' +
      '<div style="width:104px;text-align:center;font-size:10px;color:var(--txt3)">vs</div>' +
      '<div style="flex:1;text-align:center;font-weight:800;font-size:13px;overflow:hidden;text-overflow:ellipsis">' + esc(b.handle) + '</div></div>' +
    _cmpRow('Clutch Score', a.clutchScore, b.clutchScore, cs[0], cs[1]) +
    _cmpRow('Win rate', a.winRate + '%', b.winRate + '%', wr[0], wr[1]) +
    _cmpRow('KDA', a.perf.kda, b.perf.kda, kda[0], kda[1]) +
    _cmpRow('Avg CS', a.perf.avgCs, b.perf.avgCs, csm[0], csm[1]) +
    '<div style="font-size:10px;color:var(--txt3);margin-top:10px;text-align:center;line-height:1.5">Last ' + a.gamesPlayed + ' vs ' + b.gamesPlayed + ' games · Clutch Score = ' + esc(a.scoreParts.formula) + '</div>';
}
// ── Progression (goals & badges) — reads server-tracked stats, non-editable ──
async function renderProfileProgress() {
  var el = document.getElementById('prof-progress');
  if (!el) return;
  var streakEl = document.getElementById('prog-streak');
  if (!_authToken) {
    el.innerHTML = '<div style="color:var(--txt3);font-size:12px;line-height:1.6">Connect your wallet to start earning badges from settled duels.</div>';
    if (streakEl) streakEl.textContent = '';
    return;
  }
  el.innerHTML = '<div style="color:var(--txt3);font-size:12px">Loading your progress…</div>';
  try {
    var res = await authFetch('/api/profile/achievements');
    var d = await res.json();
    if (!res.ok) { el.innerHTML = '<div style="color:var(--red);font-size:12px">Progress unavailable: ' + (window._escAcc||String)(d.error || 'error') + '</div>'; if (streakEl) streakEl.textContent=''; return; }
    if (d.cohort) _myCohort = d.cohort; // reuse for Duel Board sort, avoids a second fetch
    el.innerHTML = _progressHtml(d);
    if (streakEl) streakEl.innerHTML = (d.stats.currentStreak > 0) ? ('🔥 ' + d.stats.currentStreak + ' win streak') : '';
  } catch (e) {
    el.innerHTML = '<div style="color:var(--red);font-size:12px">Could not load progress right now.</div>';
    if (streakEl) streakEl.textContent = '';
  }
}
function _progressHtml(d) {
  var esc = (window._escAcc || String);
  var s = d.stats, b = d.badges;
  var stat = function(v, l) { return '<div style="text-align:center;flex:1"><div style="font-size:18px;font-weight:900;color:var(--acc)">' + v + '</div><div style="font-size:9px;color:var(--txt3);text-transform:uppercase;letter-spacing:.05em;margin-top:2px">' + l + '</div></div>'; };
  var cohortClr = (window.COHORT_COLORS||{})[d.cohort] || 'var(--txt3)';
  var cohortChip = d.cohort ? '<div style="text-align:center;margin-bottom:10px;font-size:11px;color:var(--txt3)">Skill cohort: <b style="color:' + cohortClr + '">' + esc(d.cohort) + '</b> <span style="opacity:.7">· based on recent win rate, not a public rating</span></div>' : '';
  var head = cohortChip + '<div style="display:flex;gap:8px;margin-bottom:16px;background:rgba(255,255,255,.02);border:1px solid var(--b);border-radius:12px;padding:12px 8px">'
    + stat(s.played, 'Played') + stat(s.wins, 'Wins') + stat(s.winRate + '%', 'Win rate') + stat(s.bestStreak, 'Best streak') + stat(s.verifiedWins, 'Verified') + '</div>';
  var tierClr = { gold: '#e8a020', silver: '#c8cfe0', bronze: '#cd7f32' };
  var earnedHtml = b.earned.length
    ? '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:8px;margin-bottom:16px">'
      + b.earned.map(function(x) { return '<div title="' + esc(x.desc) + '" style="text-align:center;padding:10px 6px;border-radius:12px;background:rgba(0,255,135,.06);border:1px solid rgba(0,255,135,.2)">'
        + '<div style="font-size:22px">' + x.icon + '</div>'
        + '<div style="font-size:10px;font-weight:800;margin-top:4px;color:' + (tierClr[x.tier] || 'var(--txt)') + '">' + esc(x.label) + '</div></div>'; }).join('')
      + '</div>'
    : '<div style="color:var(--txt3);font-size:12px;margin-bottom:16px">No badges yet — win your first duel to earn <b>First Blood</b> 🩸</div>';
  var nextHtml = b.next.length
    ? '<div style="font-size:11px;font-weight:800;color:var(--txt3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Next up</div>'
      + b.next.slice(0, 4).map(function(x) { return '<div style="margin-bottom:10px">'
        + '<div style="display:flex;justify-content:space-between;gap:8px;font-size:11.5px;margin-bottom:4px"><span>' + x.icon + ' <b>' + esc(x.label) + '</b> <span style="color:var(--txt3)">· ' + esc(x.desc) + '</span></span><span style="color:var(--txt3);font-weight:700;white-space:nowrap">' + x.progress + '/' + x.goal + '</span></div>'
        + '<div style="height:6px;border-radius:6px;background:var(--b);overflow:hidden"><div style="height:100%;width:' + x.pct + '%;background:linear-gradient(90deg,var(--acc),#7000FF)"></div></div></div>'; }).join('')
    : '<div style="color:var(--acc);font-size:12px;font-weight:700">🏆 All badges unlocked — legend.</div>';
  return head + earnedHtml + nextHtml;
}

function _statHtml(label, val) {
  return '<div style="text-align:center"><div style="font-size:19px;font-weight:900;color:var(--acc)">' + val + '</div>' +
    '<div style="font-size:9.5px;color:var(--txt3);text-transform:uppercase;letter-spacing:.05em;margin-top:2px">' + label + '</div></div>';
}
function _statsCardHtml(d) {
  var esc = (typeof _escAcc === 'function') ? _escAcc : function(s){ return String(s==null?'':s); };
  return '<div style="display:flex;align-items:center;gap:16px;margin-bottom:14px">' +
      '<div style="width:66px;height:66px;flex-shrink:0;border-radius:16px;background:linear-gradient(135deg,rgba(0,255,135,.16),rgba(112,0,255,.16));border:1px solid var(--b);display:flex;flex-direction:column;align-items:center;justify-content:center">' +
        '<div style="font-size:23px;font-weight:900;color:var(--acc);line-height:1">' + d.clutchScore + '</div>' +
        '<div style="font-size:9.5px;color:var(--txt3);letter-spacing:.06em;margin-top:3px">CLUTCH</div></div>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-weight:800;font-size:14px;overflow:hidden;text-overflow:ellipsis">' + esc(d.handle) +
          ' <span style="font-size:11px;color:var(--txt3);font-weight:600">· last ' + d.gamesPlayed + ' games</span></div>' +
        '<div style="font-size:10.5px;color:var(--txt3);margin-top:3px;line-height:1.5">Clutch Score = ' + esc(d.scoreParts.formula) +
          '<br/>→ ' + d.scoreParts.winRatePct + '% win · ' + d.scoreParts.perfPct + '% perf</div></div>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:13px;background:var(--l2);border:1px solid var(--b);border-radius:12px">' +
      _statHtml('Win rate', d.winRate + '%') +
      _statHtml('KDA', d.perf.kda) +
      _statHtml('K / D / A', d.perf.avgKills + ' / ' + d.perf.avgDeaths + ' / ' + d.perf.avgAssists) +
      _statHtml('Avg CS', d.perf.avgCs) +
    '</div>';
}
async function renderProfileStats() {
  var el = document.getElementById('prof-stats');
  if (!el) return;
  var esc = (typeof _escAcc === 'function') ? _escAcc : function(s){ return String(s==null?'':s); };
  var accts = (typeof loadConnectedAccounts === 'function') ? loadConnectedAccounts() : {};
  var riot = accts.riot;
  if (!riot || !riot.name) {
    el.innerHTML = '<div style="color:var(--txt3);font-size:12px;line-height:1.6">No Riot ID linked yet. Add it in <b>Connected Accounts</b> above, then load your stats.</div>';
    return;
  }
  var region = (document.getElementById('stats-region') || {}).value || 'europe';
  var handle = String(riot.name).replace('#', '-'); // endpoint accepts # or -
  el.innerHTML = '<div style="color:var(--txt3);font-size:12px">Loading your real match stats…</div>';
  try {
    var res = await fetch((ARENA_CONFIG.API_BASE || '') + '/api/stats/lol?handle=' + encodeURIComponent(handle) + '&region=' + encodeURIComponent(region));
    var d = await res.json();
    if (!res.ok) {
      el.innerHTML = '<div style="color:var(--red);font-size:12px;line-height:1.6">Stats unavailable: ' + esc(d.error || 'error') + '</div>';
      return;
    }
    el.innerHTML = _statsCardHtml(d);
  } catch (e) {
    el.innerHTML = '<div style="color:var(--red);font-size:12px">Could not load stats right now.</div>';
  }
}

function renderProfile() {
  var card = document.getElementById('profile-stat-card');
  if (!card) return;

  var prof = buildMyProfile();
  var nameEl = document.getElementById('prof-name-input');
  if (nameEl && !nameEl.value && U.name) nameEl.value = U.name;

  var vBadge = document.getElementById('prof-verified-badge');
  if (vBadge) vBadge.style.display = prof.verified ? 'inline-flex' : 'none';
  var gd = document.getElementById('prof-game-dot');
  if (gd) { gd.style.background = _initToPillsColor(prof.game); }
  var gn = document.getElementById('prof-game-name');
  if (gn) gn.textContent = _initToDisplayName(prof.game);
  var ri = document.getElementById('prof-rank-inline');
  if (ri) ri.textContent = prof.official.rank;

  var st = document.getElementById('prof-status-el');
  if (st) {
    st.textContent = prof.online ? prof.status : 'Offline';
    st.className = 'ps-status ' + (prof.online ? 'online' : '');
    if (!prof.online) { st.style.background='rgba(134,146,173,.08)'; st.style.color='#8692ad'; st.style.border='1px solid #262a36'; }
  }

  var cs = document.getElementById('pr-clutch-score');
  if (cs) cs.innerHTML = prof.clutch.rating + '<span class="ps-rn-max"> / 1000</span>';
  var pp = document.getElementById('pr-pct');
  if (pp) pp.textContent = prof.clutch.percentile;

  var conf = prof.clutch.conf || 'medium';
  var confLabel = ({high:'HIGH CONFIDENCE', medium:'MEDIUM CONFIDENCE', low:'LOW CONFIDENCE', insuf:'INSUFFICIENT DATA'})[conf] || 'MEDIUM CONFIDENCE';
  var confMatches = (prof.clutch.confMatches||0).toLocaleString() + ' VERIFIED MATCHES';
  var csEl = document.getElementById('pr-conf-state');
  if (csEl) { csEl.className = 'ps-conf-state ' + (conf === 'insuf' ? 'insuf' : conf); csEl.textContent = confLabel; }
  var ccEl = document.getElementById('pr-conf-count');
  if (ccEl) ccEl.textContent = confMatches;
  var cfEl = document.getElementById('pr-conf-fill');
  if (cfEl) cfEl.className = 'ps-conf-fill ' + (conf === 'insuf' ? 'low' : conf);

  var p1 = document.getElementById('pr-off-rank'); if (p1) p1.textContent = prof.official.rank;
  var p2 = document.getElementById('pr-off-season'); if (p2) p2.textContent = prof.official.seasonAct || 'Season';
  var p3 = document.getElementById('pr-wr-off'); if (p3) p3.textContent = prof.official.wr + '%';
  var p4 = document.getElementById('pr-matches-off'); if (p4) p4.textContent = (prof.official.matches||0).toLocaleString();

  var rrTxt = (prof.official.rr!=null?'RR':prof.official.lp!=null?'LP':'MMR');
  var rrVal = (prof.official.rr!=null?prof.official.rr:prof.official.lp!=null?prof.official.lp:prof.official.mmr||0);
  var o5 = document.getElementById('oc-off-rank'); if (o5) o5.textContent = prof.official.rank + ' · ' + rrVal + ' ' + rrTxt;
  var o1 = document.getElementById('oc-off-wr'); if (o1) o1.textContent = prof.official.wr + '%';
  var o2 = document.getElementById('oc-off-matches'); if (o2) o2.textContent = (prof.official.matches||0).toLocaleString();
  var streakEl = document.getElementById('oc-off-streak');
  try {
    var wins = prof.recentForm.slice(0,3).filter(function(r){return r==='W'}).length;
    var losses = prof.recentForm.slice(0,3).filter(function(r){return r==='L'}).length;
    if (streakEl) streakEl.textContent = (wins>losses ? wins+'W' : losses + 'L');
  } catch(e) {}
  var c1 = document.getElementById('oc-clutch-rank'); if (c1) c1.textContent = prof.clutch.rating + ' / 1000 · ' + prof.clutch.percentile;
  var c2 = document.getElementById('oc-clutch-wr'); if (c2) c2.textContent = prof.clutch.adjWr + '%';
  var c3 = document.getElementById('oc-clutch-form'); if (c3) c3.textContent = prof.clutch.form + ' / 100';
  var c4 = document.getElementById('oc-clutch-opp'); if (c4) c4.textContent = prof.clutch.opponentQ + ' / 100';
  var c5 = document.getElementById('oc-clutch-pres'); if (c5) c5.textContent = prof.clutch.pressure + ' / 100';

  var dims = _buildDims(prof.game, prof);
  var dimsGrid = document.getElementById('pr-dims-grid');
  if (dimsGrid) {
    dimsGrid.innerHTML = dims.slice(0,8).map(function(d){
      return '<div class="ps-dim"><div class="ps-dim-k">' + d.k + '</div>'
        + '<div class="ps-dim-v">' + d.v + '</div>'
        + '<div class="ps-dim-bar"><div class="ps-dim-fill" style="width:'+Math.min(100,d.v)+'%"></div></div></div>';
    }).join('');
  }

  var dnaGrid = document.getElementById('pr-dna-grid');
  if (dnaGrid) {
    dnaGrid.innerHTML = prof.dna.map(function(d){
      return '<div class="ps-dna-row"><div class="ps-dna-k">' + d.k + '</div>'
        + '<div class="ps-dna-track"><div class="ps-dna-fill" style="width:'+Math.min(100,d.v)+'%"></div></div>'
        + '<div class="ps-dna-v">' + d.v + '</div></div>';
    }).join('');
  }

  var formStrip = document.getElementById('pr-form-strip');
  if (formStrip) {
    formStrip.innerHTML = prof.recentForm.map(function(r,i){
      var letter = r;
      return '<div class="ps-result ' + r.toLowerCase() + '" title="Match ' + (i+1) + ': ' + (r==='W'?'Win':r==='L'?'Loss':'Draw') + '">' + letter + '</div>';
    }).join('');
  }
  var formTrend = document.getElementById('pr-form-trend');
  if (formTrend) {
    var last5 = prof.recentForm.slice(-5);
    var w5 = last5.filter(function(r){return r==='W'}).length;
    var l5 = last5.filter(function(r){return r==='L'}).length;
    var delta = w5 - l5;
    formTrend.textContent = (delta >=0 ? '▲ ' : '▼ ') + Math.abs(delta) + ' net W/L over last 5 · trend ' + (delta>=0?'UP':'DOWN');
    formTrend.style.color = (delta >=0 ? '#00FF87' : '#FF4D5E');
  }

  var oppGrid = document.getElementById('pr-opp-grid');
  if (oppGrid) {
    oppGrid.innerHTML = [
      { lbl:'RAW WIN RATE', val: prof.official.wr + '%', sub:prof.opponent.wrRaw },
      { lbl:'AVERAGE OPPONENT', val: prof.opponent.avgTier, sub: prof.opponent.difficulty },
      { lbl:'OPPONENT-ADJ',   val: prof.clutch.adjWr + '%', sub:'Adjusted for quality' }
    ].map(function(o){
      return '<div class="ps-opp-cell"><div class="ps-opp-lbl">' + o.lbl + '</div>'
        + '<div class="ps-opp-val">' + o.val + '</div>'
        + '<div class="ps-opp-sub">' + o.sub + '</div></div>';
    }).join('');
  }

  var them = PLAYER_PROFILES['NovaStriker'];
  var fair = calcFairness(prof, them);
  var fp = document.getElementById('pr-fair-predict');
  if (fp) {
    fp.innerHTML = '<div class="ps-fp-you"><div class="ps-fp-name">' + (U.name || 'YOU') + '</div><div class="ps-fp-val">' + fair.pctYou + '%</div></div>'
      + '<div class="ps-fp-vs"><div class="ps-fp-diff">' + fair.diff + '</div><div style="font-size:10px;color:var(--txt3)">50%</div></div>'
      + '<div class="ps-fp-them"><div class="ps-fp-name">NOVASTRIKER</div><div class="ps-fp-val">' + fair.pctThem + '%</div></div>';
  }
  var fs = document.getElementById('pr-fair-score');
  if (fs) {
    var fairClass = fair.overall >= 85 ? 'hi' : (fair.overall >= 65 ? 'lo' : 'very-lo');
    fs.innerHTML = '<div class="ps-fair-pct">FAIRNESS <span class="'+fairClass+'">' + fair.overall + '%</span></div>'
      + '<div class="ps-fair-label">' + fair.rec + '</div>';
  }
  var fbk = document.getElementById('pr-fair-brk');
  if (fbk) {
    fbk.innerHTML = fair.breakdown.map(function(b){
      return '<div class="ps-fair-item"><div class="ps-fair-k">' + b.k + '</div>'
        + '<div class="ps-fair-v"><span class="pct">' + b.v + '%</span></div>'
        + '<div class="ps-fair-mini"><div class="ps-fair-mini-fill" style="width:'+Math.min(100,b.v)+'%"></div></div></div>';
    }).join('');
  }

  try {
    var winEl = document.getElementById('pr-wins');
    var loseEl = document.getElementById('pr-losses');
    var rateEl = document.getElementById('pr-rate');
    if (winEl && winEl.textContent === '0') {
      var m = prof.official.matches || 0;
      var wr = prof.official.wr || 0;
      var w = Math.round(m * wr / 100);
      var l = m - w;
      winEl.textContent = w.toLocaleString();
      loseEl.textContent = l.toLocaleString();
      if (rateEl) rateEl.textContent = wr + '%';
    }
  } catch(e) {}
}
(function patchRefreshProfile(){
  try {
    var origRefresh = refreshAll;
    window.refreshAll = function(){
      try { origRefresh(); } catch(e){}
      var profScr = document.getElementById('scr-profile');
      if (profScr && profScr.classList.contains('active')) { try { renderProfile(); } catch(e){} }
    };
  } catch(e) {}
})();

function boardGameChanged() {
  var sel = document.getElementById('board-game');
  var g = GAMES.find(function(x) { return x.id === sel.value; });
  var verifyEl = document.getElementById('board-post-verify');
  populateBoardModes(sel.value);
  if (!g || !verifyEl) { if(verifyEl) verifyEl.innerHTML=''; return; }
  if (g.api) {
    verifyEl.innerHTML = '<div style="background:rgba(0,212,110,.05);border:1px solid rgba(0,212,110,.15);border-radius:8px;padding:10px 12px;font-size:11px;color:var(--acc)">'
      + '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="display:inline;vertical-align:-1px"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> '
      + g.name+' results are auto-verified via '+g.apiName+'. No screenshots needed.</div>';
  } else {
    verifyEl.innerHTML = '<div style="background:rgba(232,160,32,.05);border:1px solid rgba(232,160,32,.15);border-radius:8px;padding:10px 12px;font-size:11px;color:var(--gold)">'
      + g.name+' requires screenshot verification. Both players must agree on outcome.</div>';
  }
}

// Populate the structured challenge-mode picker from the catalog (single source
// of truth = /api/modes). Falls back to a "custom" option if the fetch fails.
async function populateBoardModes(game) {
  var sel = document.getElementById('board-mode-select');
  if (!sel) return;
  window._boardModes = {};
  if (!game) {
    sel.innerHTML = '<option value="">Pick a game first…</option>';
    boardModeChanged();
    return;
  }
  sel.innerHTML = '<option value="">Loading modes…</option>';
  try {
    var res = await fetch('/api/modes?game=' + encodeURIComponent(game));
    var data = await res.json();
    var modes = (data && data.modes) || [];
    if (!modes.length) throw new Error('no modes');
    modes.forEach(function(m){ window._boardModes[m.id] = m; });
    sel.innerHTML = modes.map(function(m){
      return '<option value="' + (window._escAcc||String)(m.id) + '">' + (window._escAcc||String)(m.label) + '</option>';
    }).join('');
  } catch(e) {
    window._boardModes = { custom: { id:'custom', label:'Custom duel', rule:'Agree your own terms (self-reported).', verifiable:false } };
    sel.innerHTML = '<option value="custom">Custom duel</option>';
  }
  boardModeChanged();
}

// Show the selected mode's rule + verifiable/honor badge; reveal the free-text
// terms box only for the "custom" mode.
function boardModeChanged() {
  var sel = document.getElementById('board-mode-select');
  var ruleEl = document.getElementById('board-mode-rule');
  var custom = document.getElementById('board-mode');
  if (!sel) return;
  var m = (window._boardModes || {})[sel.value];
  if (custom) custom.style.display = (sel.value === 'custom') ? 'block' : 'none';
  if (!ruleEl) return;
  if (!m) { ruleEl.innerHTML = ''; return; }
  var badge = m.verifiable
    ? '<span style="color:var(--acc);font-weight:700">✓ Auto-verified</span>'
    : '<span style="color:var(--gold);font-weight:700">Honor-system</span>';
  ruleEl.innerHTML = badge + ' · ' + (window._escAcc||String)(m.rule);
}

function openPostChallengeModal() {
  if (!U.addr || U.via === 'guest') { toast('Connect a wallet to post duels','error'); return; }
  closeModal('post-challenge-modal');
  document.getElementById('board-game').value = '';
  document.getElementById('board-mode').value = '';
  document.getElementById('board-stake').value = '';
  document.getElementById('board-post-verify').innerHTML = '';
  populateBoardModes('');
  openModal('post-challenge-modal');
}

async function postChallenge() {
  if (!_authToken) { toast('Connect your wallet to play for real','info'); return; }
  var game = document.getElementById('board-game').value;
  var modeSel = document.getElementById('board-mode-select');
  var modeId = modeSel ? modeSel.value : '';
  var modeObj = (window._boardModes || {})[modeId];
  var customText = (document.getElementById('board-mode') || {value:''}).value.trim();
  // Free-text terms only for the "custom" mode; otherwise use the catalog label.
  var mode = (modeId === 'custom') ? (customText || 'Custom duel') : (modeObj ? modeObj.label : '');
  var stake = parseInt(document.getElementById('board-stake').value);
  var expiry = parseInt(document.getElementById('board-expiry').value);

  if (!game) { toast('Pick a game','error'); return; }
  if (!modeId) { toast('Pick a duel mode','error'); return; }
  if (modeId === 'custom' && !customText) { toast('Describe your custom terms','error'); return; }
  if (!stake || stake < 10) { toast('Minimum stake is 10 CLU','error'); return; }
  if (stake > U.balance) { toast('Not enough CLU','error'); return; }

  var integrity = getIntegrity();
  if (integrity.banned) { toast('Account suspended','error'); return; }
  var wins = DUELS.filter(function(d) { return d.winner && d.winner === U.addr; }).length;

  if (_authToken) {
    try {
      var res = await authFetch('/api/challenges', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({game:game, modeId:modeId, mode:mode, stake:stake, challengeType:'outcome', condition:mode, expiryHours:expiry, creatorWins:wins})
      });
      var data = await res.json();
      if (data.error || data.errors) { toast(data.error || data.errors.join(', '),'error'); return; }
      await syncBalance();
      if (data.challenge) _boardCache.unshift(data.challenge);
      renderBoard(_boardCache);
      toast('Duel posted — stake locked on server!','success');
    } catch(e) { toast('Server error','error'); return; }
  } else {
    var challenge = {id:'CB_'+Date.now()+'_'+Math.random().toString(36).slice(2,6), game:game, modeId:modeId, modeLabel:(modeObj?modeObj.label:mode), modeVerifiable:!!(modeObj&&modeObj.verifiable), mode:mode, challengeType:'outcome', condition:mode, stake:stake, creator:U.addr, creatorName:U.name||'Anonymous', creatorWins:wins, status:'open', createdAt:Date.now(), expiresAt:Date.now()+expiry*3600000};
    U.balance -= stake; U.escrow += stake; saveProfile();
    _boardCache.unshift(challenge);
    renderBoard(_boardCache);
    toast('Duel posted (local mode)','info');
  }
  refreshAll();
  closeModal('post-challenge-modal');
}

async function acceptBoardChallenge(challengeId) {
  if (!_authToken) { toast('Connect your wallet to play for real','info'); return; }
  var c = _boardCache.find(function(x) { return x.id === challengeId; });
  if (!c) { toast('Duel not found','error'); return; }
  if (!U.addr || U.via === 'guest') { toast('Connect a wallet first','error'); return; }
  if (c.creatorUserId === (U.userId||'') || c.creator === U.addr) { toast('Cannot accept your own duel','error'); return; }
  if (c.stake > U.balance) { toast('Not enough CLU — need ' + c.stake + ' CLU','error'); return; }

  var integrity = getIntegrity();
  if (integrity.banned) { toast('Account suspended','error'); return; }

  // Navigate to accept preview with fairness
  var codePayload = { id:c.id, game:c.game, challengeType:'outcome', condition:{type:'outcome',value:c.format||'bo1'}, stake:c.stake, creator:c.creator, created:c.created||Date.now(), expiry:c.expiresAt||Date.now()+86400000 };
  try { document.getElementById('accept-input').value = btoa(JSON.stringify(codePayload)); } catch(e){}
  goTo('accept');
  setTimeout(function(){
    try { previewAccept(); } catch(e) {}
  }, 60);
  // Immediate legacy push as backup (will save to DUELS if confirmed)
  PENDING_ACCEPT = codePayload;
}

// ── INTEGRITY SYSTEM ──────────────────────────────────
var INTEGRITY_KEY = 'clutch_integrity';
function getIntegrity() {
  try { return JSON.parse(localStorage.getItem(INTEGRITY_KEY)||'{"score":100,"strikes":0,"disputes":0,"bans":0,"banned":false}'); }
  catch(e) { return {score:100,strikes:0,disputes:0,bans:0,banned:false}; }
}
function saveIntegrity(data) { localStorage.setItem(INTEGRITY_KEY, JSON.stringify(data)); }
function addStrike(reason) {
  var i = getIntegrity();
  i.strikes++;
  i.score = Math.max(0, i.score - 15);
  i.disputes++;
  if (i.strikes >= 3) {
    i.banned = true;
    i.bans++;
    i.banReason = reason;
    i.bannedAt = Date.now();
  }
  saveIntegrity(i);
  return i;
}

// ── RESULT SUBMISSION ─────────────────────────────────
function openResultModal(duelId) {
  var d = DUELS.find(function(x){ return x.id===duelId; });
  if (!d) return;

  // Check if banned
  var integrity = getIntegrity();
  if (integrity.banned) {
    toast('Account suspended for integrity violations. Contact support.','error');
    return;
  }

  var role = U.addr && d.creator.toLowerCase()===U.addr.toLowerCase() ? 'creator' : 'opponent';
  if (role==='creator'?d.creatorResult:d.opponentResult) { toast('Already submitted','info'); return; }
  var g = GAMES.find(function(x){ return x.id===d.game; })||{};
  _selectedResult = null; _resultDuelId = duelId; _proofDataUrl = null;

  // Integrity score badge
  var intColor = integrity.score >= 80 ? 'var(--acc)' : integrity.score >= 50 ? 'var(--gold)' : 'var(--red)';
  var intLabel = integrity.score >= 80 ? 'Trusted' : integrity.score >= 50 ? 'Under review' : 'Low trust';

  var html = '';

  // Integrity warning banner
  html += '<div style="background:rgba(61,127,245,.06);border:1px solid rgba(61,127,245,.15);border-radius:10px;padding:12px 14px;margin-bottom:16px;display:flex;align-items:flex-start;gap:10px">'
    +'<span class="gi gi-sm gi-blue" style="flex-shrink:0;margin-top:1px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></span>'
    +'<div style="flex:1">'
    +'<div style="font-size:12px;font-weight:800;color:var(--txt);margin-bottom:3px">Integrity-protected outcome</div>'
    +'<div style="font-size:11px;color:var(--txt2);line-height:1.6">'
    +(g.api
      ? 'This game supports <strong style="color:var(--acc)">server-side verification</strong>. Your declared result will be cross-checked against '+g.apiName+' match data.'
      : 'Both players declare independently. If results conflict, evidence is reviewed by automated systems.')
    +'</div>'
    +'</div>'
    +'<div style="text-align:center;flex-shrink:0;padding:4px 10px;border-radius:8px;background:rgba(0,0,0,.2);border:1px solid '+intColor+'">'
    +'<div style="font-size:14px;font-weight:900;color:'+intColor+'">'+integrity.score+'</div>'
    +'<div style="font-size:9.5px;color:var(--txt3);font-weight:700;text-transform:uppercase;letter-spacing:.04em">'+intLabel+'</div>'
    +'</div>'
    +'</div>';

  html += '<p style="font-size:13px;color:var(--txt2);margin-bottom:4px">Choose outcome <em>from your perspective</em>:</p>'
    +'<div style="font-size:12px;color:var(--txt3);margin-bottom:16px">'+condLabel(d)+'</div>'
    +'<div class="result-grid">'
    +'<div class="ropt" id="rw" onclick="pickResult(\'win\')">'
    +'<div class="ropt-icon"><svg width="32" height="32" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" stroke="var(--acc)" stroke-width="2"/><path d="M10 16l4 4 8-8" stroke="var(--acc)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>'
    +'<div class="ropt-label">I Won</div><div class="ropt-sub">Condition met</div>'
    +'</div>'
    +'<div class="ropt" id="rl" onclick="pickResult(\'loss\')">'
    +'<div class="ropt-icon"><svg width="32" height="32" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" stroke="var(--red)" stroke-width="2"/><path d="M11 11l10 10M21 11l-10 10" stroke="var(--red)" stroke-width="2.5" stroke-linecap="round"/></svg></div>'
    +'<div class="ropt-label">I Lost</div><div class="ropt-sub">Condition not met</div>'
    +'</div></div>';

  if (g.api) {
    var apiType = getGameApiType(g.id);
    html += '<div class="api-verify">'
      +'<div class="api-verify-title"><span class="gi gi-sm gi-green"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></span> Auto-verify via '+g.apiName+'</div>'
      +'<div style="font-size:11px;color:var(--txt3);margin-bottom:10px">Result is fetched directly from game servers — no screenshots needed</div>'
      +'<div class="api-verify-row"><input id="av-u" placeholder="'+getApiPlaceholder(apiType)+'" value="'+(d.condition&&d.condition.username||'')+'"/>'
      +'<button class="btn btn-o btn-sm" onclick="doAPIVerify(\''+duelId+'\',\''+g.id+'\')">Verify</button></div>'
      +'<div class="api-result" id="av-res"></div></div>';
  } else {
    html += '<div style="background:rgba(232,160,32,.06);border:1px solid rgba(232,160,32,.15);border-radius:10px;padding:12px;margin:12px 0;font-size:12px;color:var(--gold)">'
      +'<strong>Screenshot verification</strong> — '+g.name+' has no public API. Upload your end-of-match scoreboard and enter your in-game name; both players\' screenshots are read by AI and must agree before anyone is paid.</div>'
      +'<div class="field" style="margin:0 0 10px"><input class="fi" id="shot-handle" placeholder="Your exact in-game name (as it appears on the scoreboard)" style="padding:11px 13px;font-size:13px"/></div>'
      +'<div class="proof-drop"><input type="file" accept="image/*" onchange="handleProofWithMeta(event)"/>'
      +'<div class="proof-drop-text">Upload screenshot of the result / scoreboard screen</div></div>'
      +'<div id="proof-prev"></div>'
      +'<div id="proof-meta" style="display:none"></div>';
  }

  // False declaration warning
  html += '<div style="background:rgba(232,52,74,.05);border:1px solid rgba(232,52,74,.15);border-radius:10px;padding:12px 14px;margin-top:16px;display:flex;align-items:flex-start;gap:10px">'
    +'<span class="gi gi-sm gi-red" style="flex-shrink:0;margin-top:1px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>'
    +'<div style="font-size:11px;color:var(--txt2);line-height:1.6">'
    +'<strong style="color:var(--red)">False declarations result in permanent ban.</strong> '
    +(g.api ? 'Your answer is verified against live '+g.apiName+' data. Lying is automatically detected.' : 'If results conflict, metadata analysis and dispute review determine truth. ')
    +'Integrity score drops on each dispute. <strong>3 strikes = account suspension + escrow forfeiture.</strong>'
    +'</div>'
    +'</div>';

  html += '<div style="display:flex;gap:10px;margin-top:16px">'
    +'<button class="btn btn-s btn-sm" onclick="closeModal(\'result-modal\')">Cancel</button>'
    +'<button class="btn btn-p btn-lg" style="flex:1" onclick="submitResult()">Declare Outcome</button>'
    +'</div>';

  document.getElementById('result-modal-body').innerHTML = html;
  openModal('result-modal');
}

function pickResult(r) {
  _selectedResult = r;
  document.getElementById('rw').className = 'ropt'+(r==='win'?' win':'');
  document.getElementById('rl').className = 'ropt'+(r==='loss'?' loss':'');
}

function handleProof(e) {
  var f=e.target.files[0]; if(!f) return;
  var rd=new FileReader();
  rd.onload=function(ev){
    var el=document.getElementById('proof-prev');
    if(el) el.innerHTML='<div class="proof-preview"><img src="'+ev.target.result+'"/></div>';
  };
  rd.readAsDataURL(f);
}

function getGameApiType(gameId) {
  if (gameId === 'valorant' || gameId === 'lol' || gameId === 'tft') return 'riot';
  if (gameId === 'dota2') return 'dota2';
  if (gameId === 'clashroyale' || gameId === 'brawlstars') return 'supercell';
  return null;
}

function getApiPlaceholder(type) {
  if (type === 'riot') return 'Riot ID (e.g. Player-EUW)';
  if (type === 'dota2') return 'Steam64 ID (e.g. 76561198...)';
  if (type === 'supercell') return 'Player tag (e.g. #ABC123)';
  return 'Username';
}

async function doAPIVerify(duelId, gameId) {
  var uEl = document.getElementById('av-u');
  if (!uEl || !uEl.value.trim()) { toast('Enter your game username','error'); return; }
  var resEl = document.getElementById('av-res');
  var username = uEl.value.trim();
  var apiType = getGameApiType(gameId);
  var base = ARENA_CONFIG.API_BASE || '';

  resEl.innerHTML = '<span style="color:var(--txt3)">Contacting game servers...</span>';

  try {
    var url;
    if (apiType === 'riot') {
      var region = ARENA_CONFIG.RIOT_REGION || 'europe';
      url = base + '/api/verify/riot?game=' + gameId + '&region=' + region + '&riotId=' + encodeURIComponent(username) + '&matchCount=3';
    } else if (apiType === 'dota2') {
      url = base + '/api/verify/dota2?steamId=' + encodeURIComponent(username) + '&matchCount=3';
    } else if (apiType === 'supercell') {
      url = base + '/api/verify/supercell?game=' + gameId + '&playerTag=' + encodeURIComponent(username);
    } else {
      resEl.innerHTML = '<span style="color:var(--red)">No API available for this game</span>';
      return;
    }

    var res = await fetch(url);
    var data = await res.json();

    if (data.error) {
      resEl.innerHTML = '<span style="color:var(--red)">' + data.error + '</span>';
      return;
    }

    if (!data.matches || !data.matches.length) {
      resEl.innerHTML = '<span style="color:var(--gold)">No recent matches found for this account</span>';
      return;
    }

    var latest = data.matches[0];
    var won = latest.win;

    resEl.innerHTML = '<div style="padding:10px;background:rgba('+(won?'0,212,110':'232,52,74')+',.08);border:1px solid rgba('+(won?'0,212,110':'232,52,74')+',.2);border-radius:8px;margin-top:8px">'
      + '<div style="font-size:13px;font-weight:800;color:'+(won?'var(--acc)':'var(--red)')+';margin-bottom:4px">'+(won?'WIN confirmed':'LOSS confirmed')+'</div>'
      + '<div style="font-size:11px;color:var(--txt2);line-height:1.6">'
      + (latest.champion ? 'Champion: '+latest.champion+' · ' : '')
      + (latest.kills !== undefined ? latest.kills+'/'+latest.deaths+'/'+latest.assists+' · ' : '')
      + (latest.duration ? latest.duration+'min · ' : '')
      + 'Source: '+data.source
      + '</div>'
      + '<div style="font-size:10px;color:var(--txt3);margin-top:4px">Match ID: '+(latest.matchId||'N/A')+' · Verified at '+data.fetchedAt+'</div>'
      + '</div>';

    pickResult(won ? 'win' : 'loss');
    toast('Result verified by game server','success');

  } catch (e) {
    resEl.innerHTML = '<span style="color:var(--red)">Server unreachable — deploy backend first (vercel --prod)</span>';
  }
}

// ── SCREENSHOT METADATA VERIFICATION ─────────────────
function handleProofWithMeta(e) {
  var f = e.target.files[0];
  if (!f) return;

  // Show image preview
  var rd = new FileReader();
  rd.onload = function(ev) {
    _proofDataUrl = ev.target.result; // captured for server-side AI verification
    var el = document.getElementById('proof-prev');
    if (el) el.innerHTML = '<div class="proof-preview"><img src="'+ev.target.result+'"/></div>';
    analyzeImageMeta(f, ev.target.result);
  };
  rd.readAsDataURL(f);
}

function analyzeImageMeta(file, dataUrl) {
  var metaEl = document.getElementById('proof-meta');
  if (!metaEl) return;
  metaEl.style.display = 'block';

  var checks = [];
  var warnings = [];

  // File type check
  var validTypes = ['image/png','image/jpeg','image/webp','image/bmp'];
  if (validTypes.indexOf(file.type) === -1) {
    warnings.push('Unexpected file type: ' + file.type);
  } else {
    checks.push('File type: ' + file.type.split('/')[1].toUpperCase());
  }

  // File size check (screenshots are typically 100KB-5MB)
  var sizeMB = (file.size / 1048576).toFixed(2);
  if (file.size < 10000) {
    warnings.push('File is suspiciously small (' + sizeMB + 'MB) — may be a thumbnail or crop');
  } else if (file.size > 15000000) {
    warnings.push('File is very large (' + sizeMB + 'MB) — unusual for a screenshot');
  } else {
    checks.push('File size: ' + sizeMB + 'MB');
  }

  // Last modified timestamp
  if (file.lastModified) {
    var fileDate = new Date(file.lastModified);
    var now = new Date();
    var ageHours = (now - fileDate) / 3600000;
    checks.push('Created: ' + fileDate.toLocaleString());
    if (ageHours > 48) {
      warnings.push('Image is ' + Math.round(ageHours/24) + ' days old — may not be from this match');
    }
    if (ageHours < 0.01) {
      warnings.push('Image created just now — could be a fresh edit');
    }
  }

  // Resolution check via Image object
  var img = new Image();
  img.onload = function() {
    checks.push('Resolution: ' + img.width + 'x' + img.height);
    // Common screenshot resolutions
    var isStdRes = (img.width >= 1280 && img.height >= 720) ||
                   (img.width >= 1920 && img.height >= 1080) ||
                   (img.width >= 2560);
    if (!isStdRes && img.width < 800) {
      warnings.push('Resolution is low (' + img.width + 'x' + img.height + ') — may be cropped or edited');
    }

    // Check aspect ratio (most game screenshots are 16:9 or 16:10)
    var ratio = img.width / img.height;
    if (ratio < 1.2 || ratio > 2.5) {
      warnings.push('Unusual aspect ratio (' + ratio.toFixed(2) + ') — not a standard game screenshot');
    }

    renderMetaResult(metaEl, checks, warnings);
  };
  img.onerror = function() {
    renderMetaResult(metaEl, checks, warnings);
  };
  img.src = dataUrl;
}

function renderMetaResult(el, checks, warnings) {
  var html = '<div style="margin-top:10px;padding:12px;border-radius:10px;border:1px solid '
    + (warnings.length ? 'rgba(232,160,32,.2);background:rgba(232,160,32,.04)' : 'rgba(0,212,110,.2);background:rgba(0,212,110,.04)')
    + '">';
  html += '<div style="font-size:12px;font-weight:800;margin-bottom:6px;color:'+(warnings.length?'var(--gold)':'var(--acc)')+'">Image Metadata Analysis</div>';

  checks.forEach(function(c) {
    html += '<div style="font-size:11px;color:var(--txt2);padding:2px 0"><span style="color:var(--acc);margin-right:4px">&#10003;</span> '+c+'</div>';
  });
  warnings.forEach(function(w) {
    html += '<div style="font-size:11px;color:var(--gold);padding:2px 0"><span style="margin-right:4px">&#9888;</span> '+w+'</div>';
  });

  if (!warnings.length) {
    html += '<div style="font-size:11px;color:var(--acc);margin-top:4px;font-weight:700">No red flags detected</div>';
  } else {
    html += '<div style="font-size:11px;color:var(--gold);margin-top:4px;font-weight:700">'+warnings.length+' flag(s) — opponent may want to review</div>';
  }

  html += '</div>';
  el.innerHTML = html;
}

async function submitResult() {
  if (!_authToken) { toast('Connect your wallet to play for real','info'); return; }

  var integrity = getIntegrity();
  if (integrity.banned) { toast('Account suspended','error'); closeModal('result-modal'); return; }

  var d = DUELS.find(function(x){return x.id===_resultDuelId;});
  if (!d) return;
  var _g = GAMES.find(function(x){ return x.id===d.game; }) || {};

  // Screenshot + AI verification path for non-API games (when a screenshot is uploaded).
  if (!_g.api && _proofDataUrl) {
    var shotHandle = ((document.getElementById('shot-handle')||{}).value || '').trim();
    if (!shotHandle) { toast('Enter your in-game name so the screenshot can be matched','error'); return; }
    try {
      var sres = await authFetch('/api/challenges/verify-shot', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ challengeId: d.id, handle: shotHandle, image: _proofDataUrl })
      });
      var sdata = await sres.json().catch(function(){ return {}; });
      if (sres.status !== 503) {
        if (sdata.error) { toast(sdata.error, 'error'); return; }
        await syncBalance();
        if (sdata.status === 'settled') { d.status='settled'; d.settledAt=Date.now(); saveDuels(); toast('Screenshots matched — winner paid. Check your balance.','success'); }
        else if (sdata.status === 'disputed') { d.status='disputed'; saveDuels(); toast('Screenshots did not agree ('+(sdata.reason||'conflict')+') — sent to review.','error'); }
        else { d.status='awaiting_result'; saveDuels(); toast('Screenshot received — waiting for your opponent to upload theirs.','info'); }
        _selectedResult=null; _resultDuelId=null; _proofDataUrl=null;
        closeModal('result-modal'); refreshAll(); renderDuels(); syncBalance();
        return;
      }
      // 503 -> screenshot verification not enabled on the server; fall through to manual declare.
    } catch(e) { toast('Server error verifying screenshot','error'); return; }
  }

  if (!_selectedResult){toast('Pick win or loss first','error');return;}

  // Submit to server if authenticated
  if (_authToken) {
    try {
      var res = await authFetch('/api/challenges/settle', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({challengeId: d.id, result: _selectedResult})
      });
      var data = await res.json();
      if (data.error) { toast(data.error,'error'); closeModal('result-modal'); return; }

      await syncBalance();

      if (data.status === 'settled') {
        d.status = 'settled';
        d.winner = data.challenge.winner;
        d.settledAt = Date.now();
        var isWinner = data.challenge.winner === U.userId;
        saveDuels();
        closeModal('result-modal');
        if (isWinner) { setTimeout(function(){ showWinModal(data.challenge.payout); }, 200); }
        else { setTimeout(function(){ showLossModal(d.stake); }, 200); }
      } else if (data.status === 'disputed') {
        d.status = 'disputed';
        var strikeResult = addStrike('Result conflict on duel '+d.id);
        saveDuels();
        closeModal('result-modal');
        if (strikeResult.banned) { toast('Integrity violation limit reached. Account suspended.','error'); }
        else { toast('Results conflict — dispute filed. Integrity: '+strikeResult.score+'/100. Strike '+strikeResult.strikes+'/3.','error'); }
      } else {
        d.status = 'awaiting_result';
        saveDuels();
        toast('Result submitted. Waiting for opponent.','success');
      }
    } catch(e) { toast('Server error','error'); }
    _selectedResult=null; _resultDuelId=null;
    closeModal('result-modal'); refreshAll(); renderDuels(); syncBalance();
    return;
  }

  // Fallback: local settlement for guests
  var role = U.addr&&d.creator.toLowerCase()===U.addr.toLowerCase()?'creator':'opponent';
  if (role==='creator') d.creatorResult=_selectedResult; else d.opponentResult=_selectedResult;

  if (d.creatorResult&&d.opponentResult) {
    if (d.creatorResult==='win'&&d.opponentResult==='loss') {
      settleDuelLocal(d, d.creator);
    } else if (d.creatorResult==='loss'&&d.opponentResult==='win') {
      settleDuelLocal(d, d.opponent);
    } else {
      d.status='disputed'; d.disputedAt=Date.now();
      var result = addStrike('Result conflict on duel '+d.id);
      saveDuels();
      if (result.banned) { toast('Integrity violation limit reached. Account suspended.','error'); }
      else { toast('Results conflict — dispute filed. Integrity: '+result.score+'/100. Strike '+result.strikes+'/3.','error'); }
      closeModal('result-modal'); refreshAll(); renderDuels(); return;
    }
  } else {
    d.status='awaiting_result';
    toast('Result submitted. Waiting for opponent.','success');
  }
  saveDuels(); _selectedResult=null; _resultDuelId=null;
  closeModal('result-modal'); refreshAll(); renderDuels();
}

function settleDuelLocal(d, winnerAddr) {
  d.status='settled'; d.winner=winnerAddr; d.settledAt=Date.now();
  var net = Math.floor(d.totalPot*(1-PLATFORM_FEE));
  var isWinner = U.addr && winnerAddr.toLowerCase()===U.addr.toLowerCase();
  if (isWinner) {
    U.escrow -= d.stake; U.balance += net;
    saveProfile(); refreshAll();
    setTimeout(function(){ showWinModal(net); }, 200);
  } else {
    U.escrow -= d.stake;
    saveProfile(); refreshAll();
    setTimeout(function(){ showLossModal(d.stake); }, 200);
  }
}

function statusLabel(s) {
  switch(s) {
    case 'pending': return 'Awaiting Opponent';
    case 'open': return 'Awaiting Opponent';
    case 'cancelled': return 'Cancelled';
    case 'active': return 'In Progress';
    case 'awaiting_result': return 'Awaiting Results';
    case 'disputed': return 'Disputed';
    case 'settled': return 'Settled';
    case 'timeout': return 'Timed Out';
    case 'refunded': return 'Refunded';
    default: return (s || '?').replace(/_/g,' ');
  }
}

function disputeDuel(duelId) {
  var d=DUELS.find(function(x){return x.id===duelId;});
  if(!d)return;
  d.status='disputed'; saveDuels(); renderDuels(); refreshAll();
  toast('Dispute opened — an arbitrator will review within 24h','info');
}

async function cancelChallenge(challengeId) {
  if (!_authToken) { toast('Connect your wallet to play for real','info'); return; }
  var d = DUELS.find(function(x){return x.id===challengeId;});
  var fromBoard = !d;
  var c = fromBoard ? _boardCache.find(function(x){return x.id===challengeId;}) : d;
  if (!c) { toast('Duel not found','error'); return; }

  var isCreator = (c.creatorUserId === (U.userId||'')) || (c.creator && U.addr && c.creator.toLowerCase()===U.addr.toLowerCase());
  if (!isCreator) { toast('Only the creator can cancel','error'); return; }

  if (_authToken && c.id && (c.status === 'open' || c.status === 'pending')) {
    try {
      var res = await authFetch('/api/challenges?cancel', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({challengeId: c.id})
      });
      var data = await res.json();
      if (data.error) { toast(data.error,'error'); return; }
      await syncBalance();
      if (fromBoard) {
        _boardCache = _boardCache.filter(function(x){return x.id!==challengeId;});
        renderBoard(_boardCache);
      } else {
        d.status = 'cancelled';
        saveDuels();
        renderDuels();
      }
      toast(data.message || 'Duel cancelled — stake refunded','success');
      if (data.warning) toast(data.warning, 'info');
      refreshAll();
    } catch(e) { toast('Server error','error'); return; }
  } else {
    if (fromBoard) {
      _boardCache = _boardCache.filter(function(x){return x.id!==challengeId;});
      renderBoard(_boardCache);
    } else {
      d.status = 'cancelled';
    }
    U.balance += (c.stake||0); U.escrow -= (c.stake||0); saveProfile();
    saveDuels(); renderDuels(); refreshAll();
    toast('Duel cancelled — stake refunded (local mode)','info');
  }
}

// ── WALLET: Transactions + Overview ───────────────────
async function fetchTransactions(limit) {
  if (!_authToken) return [];
  limit = limit || 50;
  try {
    var res = await authFetch('/api/wallet/transactions?limit=' + limit);
    var data = await res.json();
    return data.transactions || [];
  } catch(e) { return []; }
}

function txTypeLabel(t) {
  switch (t.type) {
    case 'escrow_lock': return 'Escrow Lock';
    case 'deposit': return 'Deposit';
    case 'withdraw': return 'Withdraw';
    case 'refund': return 'Refund';
    case 'payout': return 'Payout';
    case 'fee': return 'Fee';
    default: return (t.type || 'tx').replace(/_/g,' ');
  }
}

function txTypeColor(t) {
  if (t.type === 'deposit' || t.type === 'refund' || t.type === 'payout') return 'var(--acc)';
  if (t.type === 'withdraw' || t.type === 'escrow_lock' || t.type === 'fee') return 'var(--red)';
  return 'var(--txt2)';
}

async function renderWallet() {
  var rate = CLU_USD || 0.10;
  var av = U.balance || 0, esc = U.escrow || 0, tot = av + esc;
  var elAv = document.getElementById('wallet-available'); if (elAv) elAv.textContent = av.toLocaleString();
  var elEsc = document.getElementById('wallet-escrow'); if (elEsc) elEsc.textContent = esc.toLocaleString();
  var elTot = document.getElementById('wallet-total'); if (elTot) elTot.textContent = tot.toLocaleString();
  var elAvU = document.getElementById('wallet-available-usd'); if (elAvU) elAvU.textContent = '≈ $' + (av*rate).toFixed(2);
  var elEscU = document.getElementById('wallet-escrow-usd'); if (elEscU) elEscU.textContent = '≈ $' + (esc*rate).toFixed(2);
  var elTotU = document.getElementById('wallet-total-usd'); if (elTotU) elTotU.textContent = '≈ $' + (tot*rate).toFixed(2);

  var listEl = document.getElementById('wallet-tx-list');
  if (!listEl) return;

  if (!_authToken) {
    listEl.innerHTML = '<div style="text-align:center;padding:32px;color:var(--txt3)"><div style="font-size:13px;font-weight:700;margin-bottom:4px">Read-only guest mode</div><div style="font-size:12px">Create an account or connect to see your transaction history.</div></div>';
    return;
  }

  listEl.innerHTML = '<div style="text-align:center;padding:32px;color:var(--txt3)">Loading transactions…</div>';
  var txs = await fetchTransactions(50);
  if (!txs.length) {
    listEl.innerHTML = '<div style="text-align:center;padding:32px;color:var(--txt3)"><div style="font-size:13px;font-weight:700;margin-bottom:4px">No transactions yet</div><div style="font-size:12px">Create your first duel to get started.</div></div>';
    return;
  }

  var html = '<div class="panel" style="margin:0;padding:0;overflow:hidden">'
    + '<table style="width:100%;border-collapse:collapse">'
    + '<thead style="background:var(--l2)"><tr>'
    + '<th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:800;letter-spacing:.08em;color:var(--txt3);text-transform:uppercase;white-space:nowrap">Date</th>'
    + '<th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:800;letter-spacing:.08em;color:var(--txt3);text-transform:uppercase">Type</th>'
    + '<th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:800;letter-spacing:.08em;color:var(--txt3);text-transform:uppercase">Ref</th>'
    + '<th style="text-align:right;padding:10px 14px;font-size:10px;font-weight:800;letter-spacing:.08em;color:var(--txt3);text-transform:uppercase">Amount</th>'
    + '<th style="text-align:right;padding:10px 14px;font-size:10px;font-weight:800;letter-spacing:.08em;color:var(--txt3);text-transform:uppercase;white-space:nowrap">Balance</th>'
    + '</tr></thead><tbody>';

  txs.forEach(function(t, idx) {
    var dt = new Date(t.ts || Date.now());
    var dateStr = dt.toLocaleDateString() + ' ' + dt.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    var amt = t.amount || 0;
    var sign = amt >= 0 ? '+' : '';
    var amtColor = amt >= 0 ? 'var(--acc)' : 'var(--red)';
    html += '<tr style="border-top:1px solid var(--b)">'
      + '<td style="padding:10px 14px;font-size:12px;color:var(--txt2);white-space:nowrap">' + dateStr + '</td>'
      + '<td style="padding:10px 14px;font-size:12px;font-weight:700;color:' + txTypeColor(t) + '">' + txTypeLabel(t) + '</td>'
      + '<td style="padding:10px 14px;font-size:11px;color:var(--txt3);font-family:monospace;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (t.ref || '—') + '</td>'
      + '<td style="padding:10px 14px;font-size:13px;font-weight:800;text-align:right;color:' + amtColor + ';white-space:nowrap">' + sign + amt.toLocaleString() + ' CLU</td>'
      + '<td style="padding:10px 14px;font-size:12px;color:var(--txt2);text-align:right;white-space:nowrap">' + ((t.balAfter !== undefined && t.balAfter !== null) ? (t.balAfter.toLocaleString() + ' CLU') : '—') + '</td>'
      + '</tr>';
  });

  html += '</tbody></table></div>';
  listEl.innerHTML = html;
}

function renderTokens() {
  var rate = CLU_USD || 0.10;
  var bal = U.balance || 0;
  var escrow = U.escrow || 0;
  var tpbBal = document.getElementById('tok-balance'); if (tpbBal) tpbBal.textContent = bal.toLocaleString();
  var tpbEscrow = document.getElementById('tok-escrow'); if (tpbEscrow) tpbEscrow.textContent = escrow.toLocaleString();
  var tpbPrice = document.getElementById('tpb-price'); if (tpbPrice) tpbPrice.textContent = '$' + rate.toFixed(2);
  var tpbChange = document.getElementById('tpb-change'); if (tpbChange) tpbChange.textContent = '+2.4%';
  var tpbPortfolio = document.getElementById('tok-portfolio'); if (tpbPortfolio) tpbPortfolio.textContent = '$' + (bal*rate).toFixed(2);
  var firstBanner = document.getElementById('first-buy-banner');
  if (firstBanner) {
    firstBanner.style.display = FIRST_BUY_DONE ? 'none' : 'flex';
  }
  var br = document.getElementById('bundle-row');
  if (!br) return;
  if (typeof BUNDLES === 'undefined') { br.innerHTML = '<div style="padding:32px;color:var(--txt3)">Loading bundles…</div>'; return; }
  br.innerHTML = BUNDLES.map(function(b) {
    var bonus = b.bonus || 0;
    var bonusTxt = bonus > 0 ? ('+ ' + bonus.toLocaleString() + ' bonus') : ' ';
    var badgeHtml = b.badge ? ('<div class="bc-badge ' + (b.cls||'').replace('pop','popular').replace('val','value') + '">' + b.badge + '</div>') : '';
    var totalClu = (b.clu||0) + bonus;
    return '<div class="bundle-card ' + (b.cls||'') + '" onclick="openDepositModal(\''+b.id+'\')">'
      + badgeHtml
      + '<div class="bc-icon">' + b.icon + '</div>'
      + '<div class="bc-name">' + b.name + '</div>'
      + '<div class="bc-clu">' + totalClu.toLocaleString() + ' <span style="font-size:10px;font-weight:600;color:var(--txt3)">CLU</span></div>'
      + '<div class="bc-bonus">' + bonusTxt + '</div>'
      + '<div class="bc-price">' + b.price + '</div>'
      + '<div class="bc-eth">Instant · Card or Crypto</div>'
      + '<button type="button" class="bc-cta" onclick="event.stopPropagation();openDepositModal(\''+b.id+'\')">Buy now</button>'
      + '</div>';
  }).join('');
}

// ── ADMIN PANEL ─────────────────────────────────────────
var _adminToken = null;

function tryAdminLogin() {
  var inp = document.getElementById('admin-secret-input');
  if (!inp) return;
  var secret = inp.value.trim();
  if (!secret) { toast('Enter ADMIN_SECRET', 'error'); return; }
  _adminToken = secret;
  var navItem = document.getElementById('snav-admin');
  if (navItem) navItem.style.display = '';
  document.getElementById('admin-gate').style.display = 'none';
  document.getElementById('admin-content').style.display = '';
  try { sessionStorage.setItem('clutch_admin', '1'); } catch(e) {}
  toast('Admin unlocked', 'success');
  loadAdminDisputes();
}

function adminLogout() {
  _adminToken = null;
  var navItem = document.getElementById('snav-admin');
  if (navItem) navItem.style.display = 'none';
  try { sessionStorage.removeItem('clutch_admin'); } catch(e) {}
  document.getElementById('admin-secret-input').value = '';
  document.getElementById('admin-gate').style.display = '';
  document.getElementById('admin-content').style.display = 'none';
  toast('Admin signed out', 'info');
}

function switchAdminTab(id, btn) {
  document.querySelectorAll('[id^="atab-"]').forEach(function(b){ b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  ['disputes','payouts','deposits','maintenance'].forEach(function(tid) {
    var el = document.getElementById('admin-' + tid);
    if (el) el.style.display = (tid === id) ? '' : 'none';
  });
  if (id === 'disputes') loadAdminDisputes();
  if (id === 'payouts') loadAdminPayouts();
  if (id === 'deposits') loadAdminDeposits();
}

function renderAdmin() {
  var gate = document.getElementById('admin-gate');
  var content = document.getElementById('admin-content');
  var navItem = document.getElementById('snav-admin');
  try {
    var hasAdmin = sessionStorage.getItem('clutch_admin') === '1';
    if (hasAdmin) navItem && (navItem.style.display = '');
  } catch(e) {}
  if (!gate || !content) return;
  if (_adminToken) {
    gate.style.display = 'none';
    content.style.display = '';
    loadAdminDisputes();
  } else {
    gate.style.display = '';
    content.style.display = 'none';
  }
}

async function adminFetch(url, body) {
  var opts = { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': _adminToken || '' } };
  if (body) opts.body = JSON.stringify(body);
  try { var res = await fetch((ARENA_CONFIG.API_BASE || '') + url, opts); return res; }
  catch(e) { return null; }
}

async function loadAdminDisputes() {
  var listEl = document.getElementById('admin-disputes-list');
  if (!listEl) return;
  listEl.innerHTML = '<div style="text-align:center;padding:32px;color:var(--txt3)">Loading disputes…</div>';
  var res = await adminFetch('/api/challenges/resolve', { action: 'list' });
  if (!res || !res.ok) {
    listEl.innerHTML = '<div style="text-align:center;padding:32px;color:var(--txt3)">No backend list endpoint — use API directly for now. Dispute resolution is wired via POST /api/challenges/resolve with {challengeId, resolution: creator|opponent|draw} and ADMIN_SECRET header.</div>';
    return;
  }
  var data = await res.json();
  if (!data.challenges || !data.challenges.length) {
    listEl.innerHTML = '<div style="text-align:center;padding:32px;color:var(--txt3)">No open disputes ✅</div>';
    return;
  }
  listEl.innerHTML = data.challenges.map(function(ch) {
    return '<div class="panel" style="margin-bottom:12px">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;flex-wrap:wrap;gap:10px">'
      + '<div>'
      + '<div style="font-size:12px;font-weight:800;color:var(--red);margin-bottom:4px">DISPUTED · ' + (ch.disputeReason || 'no reason') + '</div>'
      + '<div style="font-size:13px;font-weight:700">Duel ' + ch.id + ' · ' + (ch.game||'?') + '</div>'
      + '<div style="font-size:11px;color:var(--txt3);margin-top:2px">Stake: ' + (ch.stake||0) + ' CLU · Pot: ' + (ch.totalPot||(ch.stake*2)||0) + ' CLU</div>'
      + '</div>'
      + '<div style="text-align:right;font-size:11px;color:var(--txt2);line-height:1.6">'
      + '<div><b style="color:var(--acc)">Creator:</b> ' + (ch.creatorUserId || ch.creator || '?').slice(0,24) + '</div>'
      + '<div>Claim: ' + (ch.creatorResult || '-') + '</div>'
      + '<div><b style="color:var(--gold)">Opponent:</b> ' + (ch.opponentUserId || ch.opponent || '?').slice(0,24) + '</div>'
      + '<div>Claim: ' + (ch.opponentResult || '-') + '</div>'
      + '</div></div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
      + '<button class="btn btn-p btn-sm" onclick="resolveDispute(\''+ch.id+'\',\'creator\')">Creator Wins</button>'
      + '<button class="btn btn-o btn-sm" onclick="resolveDispute(\''+ch.id+'\',\'opponent\')">Opponent Wins</button>'
      + '<button class="btn btn-d btn-sm" onclick="resolveDispute(\''+ch.id+'\',\'draw\')">Draw (Refund Both)</button>'
      + '</div></div>';
  }).join('');
}

async function resolveDispute(challengeId, resolution) {
  if (!challengeId || !resolution) return;
  if (!confirm('Resolve ' + challengeId + ' as ' + resolution + '? This is final.')) return;
  var res = await adminFetch('/api/challenges/resolve', { challengeId: challengeId, resolution: resolution });
  if (!res) { toast('Server error', 'error'); return; }
  var data = await res.json().catch(function(){ return {}; });
  if (!res.ok) { toast(data.error || ('Failed: HTTP ' + res.status), 'error'); return; }
  toast('Resolved — ' + (resolution === 'draw' ? 'refunded' : resolution + ' paid'), 'success');
  loadAdminDisputes();
}

async function loadAdminPayouts() {
  var listEl = document.getElementById('admin-payouts-list');
  if (!listEl) return;
  listEl.innerHTML = '<div style="text-align:center;padding:32px;color:var(--txt3)">Loading payouts…</div>';
  var res = await adminFetch('/api/wallet/payouts-admin', { action: 'list' });
  if (!res || !res.ok) {
    listEl.innerHTML = '<div style="text-align:center;padding:32px;color:var(--txt3)">Payout queue at POST /api/wallet/payouts-admin with X-Admin-Secret header.<br><br>Body {action:"list"} → pending list · {action:"sent",id,ref} → mark sent · {action:"failed",id,reason} → refund.</div>';
    return;
  }
  var data = await res.json();
  if (!data.payouts || !data.payouts.length) {
    listEl.innerHTML = '<div style="text-align:center;padding:32px;color:var(--txt3)">No pending payouts ✅</div>';
    return;
  }
  listEl.innerHTML = data.payouts.map(function(p) {
    return '<div class="panel" style="margin-bottom:12px">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;flex-wrap:wrap;gap:10px">'
      + '<div>'
      + '<div style="font-size:13px;font-weight:800">' + (p.amount||0) + ' CLU · ' + (p.currency||'USDT') + '</div>'
      + '<div style="font-size:11px;color:var(--txt3);margin-top:2px">User: ' + (p.userId || '?').slice(0,32) + '</div>'
      + '<div style="font-size:11px;color:var(--txt3);font-family:monospace;word-break:break-all">Dest: ' + (p.destination || '?') + '</div>'
      + '</div>'
      + '<div style="text-align:right;font-size:11px;color:var(--txt2)">'
      + '<div>Rail: ' + (p.rail || 'crypto') + '</div>'
      + '<div>Requested: ' + new Date(p.createdAt || Date.now()).toLocaleString() + '</div>'
      + '</div></div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
      + '<input class="fi" style="flex:1;min-width:180px" placeholder="TX ref / payout ID" id="pref-'+p.id+'"/>'
      + '<button class="btn btn-p btn-sm" onclick="markPayout(\''+p.id+'\',\'sent\')">Mark Sent</button>'
      + '<button class="btn btn-d btn-sm" onclick="markPayout(\''+p.id+'\',\'failed\')">Fail & Refund</button>'
      + '</div></div>';
  }).join('');
}

async function markPayout(id, status) {
  var input = document.getElementById('pref-' + id);
  var ref = input ? input.value.trim() : '';
  if (status === 'sent' && !ref) { toast('Enter TX ref', 'error'); return; }
  var body = { action: status, id: id };
  if (ref) body.ref = ref;
  if (status === 'failed') body.reason = 'Manually rejected';
  var res = await adminFetch('/api/wallet/payouts-admin', body);
  if (!res) { toast('Server error', 'error'); return; }
  var data = await res.json().catch(function(){ return {}; });
  if (!res.ok) { toast(data.error || ('Failed: HTTP ' + res.status), 'error'); return; }
  toast('Payout ' + id + ' marked ' + status, 'success');
  loadAdminPayouts();
}

async function loadAdminDeposits() {
  var listEl = document.getElementById('admin-deposits-list');
  if (!listEl) return;
  listEl.innerHTML = '<div style="text-align:center;padding:32px;color:var(--txt3)">Loading deposits…</div>';
  var res = await adminFetch('/api/wallet/deposits-reconcile', { action: 'list' });
  if (!res || !res.ok) {
    listEl.innerHTML = '<div style="text-align:center;padding:32px;color:var(--txt3)">Deposit reconciliation at POST /api/wallet/deposits-reconcile.<br><br>{action:"list"} → stuck in crediting · {action:"credit"|"abandon", id}.</div>';
    return;
  }
  var data = await res.json();
  if (!data.deposits || !data.deposits.length) {
    listEl.innerHTML = '<div style="text-align:center;padding:32px;color:var(--txt3)">No stuck deposits ✅</div>';
    return;
  }
  listEl.innerHTML = data.deposits.map(function(d) {
    return '<div class="panel" style="margin-bottom:12px">'
      + '<div style="font-size:13px;font-weight:700;margin-bottom:6px">' + d.id + ' · ' + (d.usd || 0) + ' USD → ' + (d.clu || 0) + ' CLU</div>'
      + '<div style="font-size:11px;color:var(--txt3);margin-bottom:10px">User: ' + (d.userId || '?').slice(0,32) + ' · Provider: ' + (d.provider || '?') + ' · Ref: ' + (d.providerRef || '—') + '</div>'
      + '<div style="display:flex;gap:8px">'
      + '<button class="btn btn-p btn-sm" onclick="resolveDeposit(\''+d.id+'\',\'credit\')">Credit Now</button>'
      + '<button class="btn btn-d btn-sm" onclick="resolveDeposit(\''+d.id+'\',\'abandon\')">Abandon</button>'
      + '</div></div>';
  }).join('');
}

async function resolveDeposit(id, action) {
  if (!confirm(action + ' deposit ' + id + '?')) return;
  var res = await adminFetch('/api/wallet/deposits-reconcile', { action: action, id: id });
  if (!res) { toast('Server error', 'error'); return; }
  var data = await res.json().catch(function(){ return {}; });
  if (!res.ok) { toast(data.error || ('Failed: HTTP ' + res.status), 'error'); return; }
  toast('Deposit ' + action + 'd', 'success');
  loadAdminDeposits();
}

async function runAdminMaintenance() {
  if (!confirm('Run daily maintenance? (timeout refunds etc.)')) return;
  var res = await adminFetch('/api/challenges/maintenance', {});
  if (!res) { toast('Server error', 'error'); return; }
  var data = await res.json().catch(function(){ return {}; });
  if (!res.ok) { toast(data.error || ('Failed: HTTP ' + res.status), 'error'); return; }
  toast('Maintenance completed: ' + (data.message || (data.refunds || 0) + ' refunds'), 'success');
}

// ── RENDER: DASHBOARD ─────────────────────────────────
// Activity data for ticker
var ACTIVITY_FEED = [
  {msg:'xZerO dueled SpeedRunner on Valorant', t:'2m ago'},
  {msg:'NightHawk vs CryptoKing — LoL match settled', t:'7m ago'},
  {msg:'Fr0st locked 200 CLU vs Apex_Legend', t:'15m ago'},
  {msg:'Bolt claimed 400 CLU from CS2 match', t:'23m ago'},
  {msg:'GG_Wolf dueled ShadowByte on Fortnite', t:'31m ago'},
];

function isMyDuel(d) {
  if (!d || !U.addr) return false;
  var me = String(U.addr).toLowerCase();
  return String(d.creator||'').toLowerCase() === me || String(d.opponent||'').toLowerCase() === me;
}

function renderDashboard() {
  var my = DUELS.filter(isMyDuel);
  var won = my.filter(function(d){ return d.status==='settled'&&U.addr&&(d.winner||'').toLowerCase()===U.addr.toLowerCase(); });
  var active = my.filter(function(d){ return d.status!=='settled'; });
  document.getElementById('st-wins').textContent  = won.length;
  document.getElementById('st-tokens').textContent = (U.balance||0).toLocaleString();
  document.getElementById('st-active').textContent = active.length;
  document.getElementById('st-total').textContent  = my.length;
  document.getElementById('welcome-msg').textContent = 'Welcome back, '+(U.name||'Player')+'!';
  document.getElementById('dash-token-bal').textContent  = (U.balance||0).toLocaleString();
  document.getElementById('dash-escrow-bal').textContent = (U.escrow||0).toLocaleString();

  // Active duels list
  var ddEl = document.getElementById('dash-duels-list');
  var sorted = my.slice().sort(function(a,b){return (b.createdAt||0)-(a.createdAt||0);}).slice(0,5);
  if (!sorted.length) {
    ddEl.innerHTML = '<div class="empty"><div class="empty-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 2l3 7h7-6l2 7-6-4-6 4 2-7H2l7-7 3 5z" stroke="var(--txt3)" stroke-width="1.5" fill="none"/></svg></div><h3>No duels yet</h3><p>Create your first duel or accept a friend\'s code.</p></div>';
  } else {
    ddEl.innerHTML = sorted.map(duelListItem).join('');
  }

  // Mini leaderboard
  renderMiniLB();
  // Performance panel
  renderPerformancePanel();
}

function duelListItem(d) {
  var g=GAMES.find(function(x){return x.id===d.game;})||{name:d.game,color:'#8a95b3'};
  var statusMap={pending:'pending',open:'pending',cancelled:'settled',active:'active',awaiting_result:'active',disputed:'disputed',settled:'settled'};
  var iWon=d.status==='settled'&&U.addr&&(d.winner||'').toLowerCase()===U.addr.toLowerCase();
  return '<div class="duel-item">'
    +'<div class="di-status '+(statusMap[d.status]||d.status)+'"></div>'
    +'<div class="di-info">'
    +'<div class="di-title" style="color:'+g.color+'">'+g.name+' · '+condLabel(d)+'</div>'
    +'<div class="di-meta">vs '+shortAddr(d.opponent||'No opponent')+'</div>'
    +'</div>'
    +'<div class="di-right">'
    +'<div class="di-stake">'+d.stake.toLocaleString()+' CLU</div>'
    +'<div class="di-time">'+(d.status==='settled'?(iWon?'Won':'Lost'):statusLabel(d.status))+'</div>'
    +'</div></div>';
}

// ── RENDER: ACTIVE DUELS ─────────────────────────────
function renderDuels() {
  var el=document.getElementById('duels-list');
  var emptyEl=document.getElementById('duels-empty');
  var my=DUELS.filter(isMyDuel).sort(function(a,b){return (b.createdAt||0)-(a.createdAt||0);});
  if (!my.length) {
    el.innerHTML='';
    if (emptyEl) emptyEl.style.display='block';
    return;
  }
  if (emptyEl) emptyEl.style.display='none';
  el.innerHTML = my.map(duelFullCard).join('');
}

function duelFullCard(d) {
  var g=GAMES.find(function(x){return x.id===d.game;})||{name:d.game,color:'#8a95b3',api:false};
  var role=U.addr&&d.creator.toLowerCase()===U.addr.toLowerCase()?'creator':(U.addr&&(d.opponent||'').toLowerCase()===U.addr.toLowerCase()?'opponent':null);
  var myRes=role==='creator'?d.creatorResult:d.opponentResult;
  var iWon=d.status==='settled'&&U.addr&&(d.winner||'').toLowerCase()===U.addr.toLowerCase();
  var net=Math.floor(d.totalPot*(1-PLATFORM_FEE));
  var slbl=statusLabel(d.status);

  var badgeCls={pending:'pending',open:'pending',cancelled:'settled',active:'active',awaiting_result:'active',disputed:'disputed',settled:'settled'}[d.status]||d.status;
  var footerBtns='';
  if (role&&(d.status==='active'||d.status==='awaiting_result')) {
    if (!myRes) footerBtns='<button class="btn btn-p btn-sm" onclick="openResultModal(\''+d.id+'\')">Declare Outcome</button>';
    else footerBtns='<span style="font-size:12px;color:var(--txt3)">Result submitted ✓</span>';
    footerBtns+=' <button class="btn btn-d btn-sm" onclick="disputeDuel(\''+d.id+'\')">Dispute</button>';
  }
  if (d.status==='settled') footerBtns='<span style="font-size:14px;font-weight:800;color:'+(iWon?'var(--acc)':'var(--red)')+'">'+( iWon?'+'+net+' CLU':'Lost')+'</span>';
  if ((d.status==='pending'||d.status==='open') && !d.opponent && role==='creator') {
    footerBtns='<button class="btn btn-o btn-sm" onclick="copyDuelCode(\''+d.id+'\')">Copy Code</button>'
      +' <button class="btn btn-d btn-sm" onclick="cancelChallenge(\''+d.id+'\')">Cancel</button>';
  }

  return '<div class="panel" style="margin-bottom:16px;border-left:3px solid var(--'+badgeCls+')" >'
    +'<div class="panel-hdr">'
    +'<span class="outcome-badge '+badgeCls+'">'+slbl+'</span>'
    +(g.api?'<span style="font-size:11px;color:var(--acc);margin-left:8px">✓ API</span>':'<span style="font-size:11px;color:var(--txt3);margin-left:8px">Screenshot</span>')
    +'</div>'
    +'<div class="panel-body">'
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">'
    +'<div><div style="font-size:13px;font-weight:800;color:'+g.color+'">'+g.name+'</div><div style="font-size:12px;color:var(--txt2);margin-top:2px">'+{outcome:'Match Outcome',target:'Performance Target',custom:'Custom'}[d.challengeType]+'</div></div>'
    +'<div style="text-align:right"><div style="font-size:20px;font-weight:900;color:var(--gold)">'+d.totalPot.toLocaleString()+'<span style="font-size:11px;font-weight:600;color:var(--txt3);margin-left:4px">CLU pot</span></div><div style="font-size:11px;color:var(--txt3)">'+d.stake.toLocaleString()+' each</div></div>'
    +'</div>'
    +'<div style="background:var(--l2);border:1px solid var(--b);border-radius:var(--r);padding:12px;margin-bottom:14px;font-size:13px;font-style:italic;color:var(--txt2)">"'+condLabel(d)+'"</div>'
    +'<div style="display:flex;align-items:center;justify-content:space-between;font-size:12px">'
    +'<div style="display:flex;align-items:center;gap:20px">'
    +'<div><div style="font-weight:700">'+(role==='creator'?'<span style="color:var(--acc)">You</span>':'Duelist')+'</div><div style="color:var(--txt3);font-family:monospace">'+shortAddr(d.creator)+'</div></div>'
    +'<div style="color:var(--txt3);font-weight:800;font-size:11px;letter-spacing:.1em">VS</div>'
    +'<div><div style="font-weight:700">'+(role==='opponent'?'<span style="color:var(--acc)">You</span>':'Opponent')+'</div><div style="color:var(--txt3);font-family:monospace">'+(d.opponent?shortAddr(d.opponent):'Waiting…')+'</div></div>'
    +'</div>'
    +'<div style="color:var(--txt3)">'+timeUntil(d.expiry)+'</div>'
    +'</div>'
    +(footerBtns?'<div style="display:flex;align-items:center;gap:10px;margin-top:14px;padding-top:14px;border-top:1px solid var(--b)">'+footerBtns+'</div>':'')
    +'</div></div>';
}

function copyDuelCode(duelId) {
  var d=DUELS.find(function(x){return x.id===duelId;});
  if(!d)return;
  var code=btoa(JSON.stringify({id:d.id,creator:d.creator,game:d.game,challengeType:d.challengeType,condition:d.condition,stake:d.stake,expiry:d.expiry,createdAt:d.createdAt}));
  navigator.clipboard.writeText(code).then(function(){toast('Duel code copied!','success');});
}

// ── RENDER: HISTORY ───────────────────────────────────
function renderHistory() {
  var my=DUELS.filter(isMyDuel);
  var won=my.filter(function(d){return d.status==='settled'&&U.addr&&(d.winner||'').toLowerCase()===U.addr.toLowerCase();});
  var lost=my.filter(function(d){return d.status==='settled'&&(!U.addr||(d.winner||'').toLowerCase()!==U.addr.toLowerCase());});
  var earned=won.reduce(function(a,d){return a+Math.floor(d.totalPot*(1-PLATFORM_FEE));},0);
  document.getElementById('h-total').textContent  = my.length;
  document.getElementById('h-won').textContent    = won.length;
  document.getElementById('h-lost').textContent   = lost.length;
  document.getElementById('h-earned').textContent = earned.toLocaleString();

  var sorted=my.slice().sort(function(a,b){return (b.createdAt||0)-(a.createdAt||0);});
  var tbody=document.getElementById('hist-body');
  if(!sorted.length){
    tbody.innerHTML='<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--txt3)">No history yet</td></tr>';
    return;
  }
  tbody.innerHTML=sorted.map(function(d){
    var g=GAMES.find(function(x){return x.id===d.game;})||{name:d.game};
    var iWon=d.status==='settled'&&U.addr&&(d.winner||'').toLowerCase()===U.addr.toLowerCase();
    var isCancelled = d.status === 'cancelled' || d.status === 'refunded';
    var resCls=d.status==='settled'?(iWon?'won':'lost'):(d.status==='disputed'?'disputed':(isCancelled?'settled':'pending'));
    var resLbl=d.status==='settled'?(iWon?'Won':'Lost'):(d.status==='disputed'?'Disputed':statusLabel(d.status));
    var netAmt=d.status==='settled'?(iWon?'+'+Math.floor(d.totalPot*(1-PLATFORM_FEE)):'-'+d.stake):(isCancelled?('+0'):'—');
    var netLabel=d.status==='settled'?(iWon?netAmt+' CLU':'-'+d.stake+' CLU'):(isCancelled?'Refunded':(d.status==='disputed'?'Pending review':''));
    return '<tr>'
      +'<td style="color:'+g.color+';font-weight:700">'+g.name+'</td>'
      +'<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+condLabel(d)+'</td>'
      +'<td style="font-family:monospace;font-size:12px">'+shortAddr(d.opponent||'—')+'</td>'
      +'<td style="font-weight:700">'+d.stake.toLocaleString()+' CLU</td>'
      +'<td><span class="outcome-badge '+resCls+'">'+resLbl+'</span>'+(netLabel?' <span style="font-size:11px;color:'+(iWon||isCancelled?'var(--acc)':(d.status==='disputed'?'var(--gold)':'var(--red)'))+'">'+netLabel+'</span>':'')+'</td>'
      +'<td style="color:var(--txt3)">'+timeAgo(d.createdAt)+'</td>'
      +'</tr>';
  }).join('');
}

// ── RENDER: LEADERBOARD ───────────────────────────────
function renderMiniLB() {
  var el=document.getElementById('dash-lb-list');
  if(!el) return;
  var rows=buildLBData().slice(0,5);
  if(!rows.length){el.innerHTML='<div style="text-align:center;padding:20px;color:var(--txt3);font-size:12px">Complete duels to appear here</div>';return;}
  el.innerHTML=rows.map(function(p){
    var av=p.addr[0].toUpperCase();
    var isMe=U.addr&&p.addr.toLowerCase()===U.addr.toLowerCase();
    return '<div class="lb-item">'
      +'<div class="lb-av" style="background:'+randomColor(p.addr)+'22;color:'+randomColor(p.addr)+'">'+av+'</div>'
      +'<div class="lb-name">'+(isMe?'<span style="color:var(--acc)">You</span>':shortAddr(p.addr))+'</div>'
      +'<div class="lb-wins">'+p.games+' games</div>'
      +'<div class="lb-eth">'+p.earned.toLocaleString()+'</div>'
      +'</div>';
  }).join('');
}

function renderLeaderboard() {
  var el=document.getElementById('lb-full-list');
  var rows=buildLBData();
  if(!rows.length){el.innerHTML='<div class="empty"><h3>No data yet</h3><p>Complete duels to appear on the leaderboard.</p></div>';return;}
  // Activity list, not a skill ladder: no medal styling, sorted by games played.
  el.innerHTML=rows.map(function(p){
    var av=p.addr[0].toUpperCase();
    var isMe=U.addr&&p.addr.toLowerCase()===U.addr.toLowerCase();
    return '<div class="lb-item" style="'+(isMe?'background:var(--acc-lo);border-radius:var(--r);padding:0 10px;':'')+'">'
      +'<div class="lb-av" style="background:'+randomColor(p.addr)+'22;color:'+randomColor(p.addr)+'">'+av+'</div>'
      +'<div class="lb-name">'+(isMe?'<span style="color:var(--acc)">You — '+U.name+'</span>':shortAddr(p.addr))+'</div>'
      +'<div style="margin-left:auto;display:flex;gap:20px;align-items:center">'
      +'<div style="font-size:13px">'+p.games+' duels played</div>'
      +'<div class="lb-wins" style="font-size:11px;color:var(--txt3)">'+p.wins+' wins</div>'
      +'</div></div>';
  }).join('');
}

function buildLBData() {
  var map = {};
  DUELS.filter(function(d){ return d.status==='settled'; }).forEach(function(d) {
    var winner = d.winner ? d.winner.toLowerCase() : null;
    [d.creator, d.opponent].forEach(function(addr) {
      if (!addr) return;
      var k = addr.toLowerCase();
      if (!map[k]) map[k] = { addr: addr, name: addr.slice(0,6)+'…', wins: 0, earned: 0, games: 0 };
      map[k].games++;
      if (winner && k === winner) {
        map[k].wins++;
        map[k].earned += Math.floor((d.stake||0) * 2 * (1 - PLATFORM_FEE));
      }
    });
  });
  // Inject real name for known user
  if (U.addr && map[U.addr.toLowerCase()]) {
    map[U.addr.toLowerCase()].name = U.name || 'You';
  }
  // Sorted by activity (games played), NOT wins/earnings — this list is
  // "who's active", not a skill ranking. See Compare for skill comparison.
  return Object.values(map).sort(function(a,b){ return b.games - a.games || b.wins - a.wins; });
}

// ── SAVED CHALLENGE PRESETS ──────────────────────────────────────────────────
function saveWizPreset() {
  var stake = parseInt((document.getElementById('stake-input')||{}).value)||0;
  if (!CREATE.game || !stake) return;
  var g = GAMES.find(function(x){ return x.id===CREATE.game; })||{name:'?',color:'#fff'};
  var typeLabel = {outcome:'Match Outcome',target:'Performance Target',custom:'Custom'}[CREATE.challengeType]||'Match Outcome';
  var condEl = document.getElementById('c-out')||document.getElementById('c-tval')||document.getElementById('c-cust');
  var cond = condEl ? condEl.value : '';
  var expSel = document.getElementById('expiry-sel');
  var expiry = expSel ? expSel.value : '24h';
  var preset = {
    game: CREATE.game, gameName: g.name, gameColor: g.color,
    stake: stake, challengeType: CREATE.challengeType||'outcome',
    condition: cond, expiry: expiry,
    label: g.name + ' · ' + stake.toLocaleString() + ' CLU · ' + typeLabel,
    savedAt: Date.now()
  };
  var presets = JSON.parse(localStorage.getItem('wiz_presets')||'[]');
  // Remove duplicate same game+stake
  presets = presets.filter(function(p){ return !(p.game===preset.game && p.stake===preset.stake && p.challengeType===preset.challengeType); });
  presets.unshift(preset);
  if (presets.length > 3) presets = presets.slice(0,3);
  localStorage.setItem('wiz_presets', JSON.stringify(presets));
}

function renderWizPresets() {
  var presets = JSON.parse(localStorage.getItem('wiz_presets')||'[]');
  var wrap = document.getElementById('wiz-quickstart');
  var list = document.getElementById('wiz-preset-list');
  if (!wrap||!list) return;
  if (!presets.length) { wrap.style.display='none'; return; }
  wrap.style.display='block';
  list.innerHTML = presets.map(function(p,i){
    var g = GAMES.find(function(x){ return x.id===p.game; })||{color:'#888'};
    return '<div class="wiz-preset">'
      +'<div class="wiz-preset-icon" style="background:'+p.gameColor+'18">'+gIconSVG(p.game,p.gameColor)+'</div>'
      +'<div class="wiz-preset-info">'
        +'<div class="wiz-preset-label">'+p.label+'</div>'
        +'<div class="wiz-preset-sub">'+(p.condition?'"'+p.condition+'"':'No condition set')+'</div>'
      +'</div>'
      +'<button class="wiz-preset-del" onclick="deletePreset('+i+')">✕</button>'
      +'<button class="wiz-preset-go" onclick="applyPreset('+i+')">Use →</button>'
      +'</div>';
  }).join('');
}

function applyPreset(idx) {
  var presets = JSON.parse(localStorage.getItem('wiz_presets')||'[]');
  var p = presets[idx];
  if (!p) return;
  CREATE.game = p.game; CREATE.stake = p.stake; CREATE.challengeType = p.challengeType;
  buildGameGrids();
  setTimeout(function(){
    document.querySelectorAll('.wiz-gc').forEach(function(el){ el.classList.toggle('sel', el.dataset.game===p.game); });
  },20);
  var si = document.getElementById('stake-input'); if(si) si.value = p.stake;
  wizUpdatePotCalc(p.stake); setSt(p.stake); buildCondFields();
  setTimeout(function(){
    var condEl=document.getElementById('c-out')||document.getElementById('c-tval')||document.getElementById('c-cust');
    if(condEl&&p.condition) condEl.value=p.condition;
    var expSel=document.getElementById('expiry-sel'); if(expSel&&p.expiry) expSel.value=p.expiry;
  },40);
  setTimeout(function(){ wizPopulateReview(); wizGoTo(5); toast('Settings loaded — review and lock in!','success'); },80);
}

function deletePreset(idx) {
  var presets=JSON.parse(localStorage.getItem('wiz_presets')||'[]');
  presets.splice(idx,1); localStorage.setItem('wiz_presets',JSON.stringify(presets));
  renderWizPresets();
}

// ─── WIZARD JS ───────────────────────────────────────────────────────────────
var _wizStep = 1;
function wizGoTo(step) {
  _wizStep = step;
  for(var i=1;i<=5;i++){
    var s=document.getElementById('wiz-s'+i); if(s) s.classList.remove('active');
    var dot=document.getElementById('wpd-'+i);
    if(dot){ dot.classList.remove('done','cur'); if(i<step) dot.classList.add('done'); else if(i===step) dot.classList.add('cur'); }
    var line=document.getElementById('wpl-'+i); if(line) line.classList.toggle('done',i<step);
  }
  var target=document.getElementById('wiz-s'+step);
  if(target){ target.classList.add('active'); target.scrollIntoView({behavior:'smooth',block:'start'}); }
  if(step===5) { wizPopulateReview(); var cb=document.getElementById('tos-check'); if(cb){cb.checked=false;} var lb=document.getElementById('wiz-lock-btn'); if(lb){lb.disabled=true;} }
}

/* ====== PAID/FREE + PIN HELPERS (POST-INJECT) ====== */
function tryCreateDuelWithPin(){
  var mode = (typeof _wizMode !== "undefined") ? _wizMode : 'paid';
  var isFree = mode === 'free';
  var proceed = function(){
    // Free mode: patch createDuel stake check + set pot to bragging rights
    var origCreate = window.createDuel;
    var tempStake = parseInt((document.getElementById('stake-input')||{}).value)||0;
    if (isFree) {
      var inp = document.getElementById('stake-input');
      if (inp) { inp.value = 0; inp.disabled = false; }
    }
    try {
      if (isFree) {
        // bypass auth for free friendly games on guest
        return createDuelFree();
      }
      createDuel();
    } finally {
      // restore
      if (isFree) {
        var inp2 = document.getElementById('stake-input');
        if (inp2) { inp2.disabled = (mode==='free'); }
      }
    }
  };
  if (!_hasPinSet() && !isFree) {
    if (confirm('Set a 6-digit CLUTCH Passcode first. It protects your wallet, stakes and duels. Set now?')) { openPinSetup(true); return; }
    toast('Passcode required for paid actions','info'); return;
  }
  if (!isFree && !_isPinUnlocked()) {
    openPinVerify({ title:'Lock Stake · Passcode Required', sub: 'Confirm your 6-digit code to escrow this CLU stake.', onSuccess: proceed });
    return;
  }
  proceed();
}
function createDuelFree(){
  if (!U.addr) { toast('Sign in first (even guest works for free)','info'); return; }
  if (!CREATE.game) { toast('Pick a game first','error'); return; }
  var cond = gatherCond(); if (!cond) return;
  var exp = parseInt(document.getElementById('expiry-sel').value);
  var expHours = Math.round(exp/3600000) || 24;
  var duel = { id:'D'+Date.now(), creator:U.addr, opponent:null, game:CREATE.game, challengeType:CREATE.challengeType||'outcome',
    condition:cond, stake:0, free:true, totalPot:0, expiry:Date.now()+exp, createdAt:Date.now(),
    status:'pending', creatorResult:null, opponentResult:null, winner:null, mode:'free' };
  DUELS.push(duel); saveDuels();
  var code = btoa(JSON.stringify({id:duel.id,creator:duel.creator,game:duel.game,challengeType:duel.challengeType,condition:duel.condition,stake:0,free:true,expiry:duel.expiry,createdAt:duel.createdAt}));
  refreshAll();
  showQRModal(duel, code);
  toast('Free duel created · no stake, verified result.','success');
}
function tryWithdrawWithPin(){
  var cb = function(){ openWithdrawModal(); };
  if (!_hasPinSet()) {
    if (confirm('Protect your wallet with a 6-digit passcode first. Set now?')) { openPinSetup(true); return; }
    toast('Passcode required for wallet access','info'); return;
  }
  if (!_isPinUnlocked()) { openPinVerify({ title:'Unlock Wallet', sub:'Required before any withdrawal or sensitive access.', onSuccess: cb }); return; }
  cb();
}

/* ====== WIZARD: minimum stake check free mode bypass ====== */
var _origWizNextBeforeInjectPINFREE = window.wizNext;
window.wizNext = function(from){
  if (from === 2) {
    var mode = (typeof _wizMode !== "undefined") ? _wizMode : 'paid';
    if (mode === 'free') { wizGoTo(3); return; }
    var sv = parseInt((document.getElementById('stake-input')||{}).value)||0;
    if (sv < 10) { toast('Minimum 10 CLU stake for paid duels (or pick FREE mode)','error'); return; }
    wizGoTo(3); return;
  }
  return _origWizNextBeforeInjectPINFREE.apply(this, arguments);
};

/* ====== REVIEW SCREEN (step 5) populate FREE hero ====== */
var _origWizPopReviewBeforePin = window.wizPopulateReview;
window.wizPopulateReview = function(){
  var mode = (typeof _wizMode !== "undefined") ? _wizMode : 'paid';
  var isFree = mode === 'free';
  var hero = document.querySelector('.wiz-pot-hero');
  var lock = document.getElementById('wiz-lock-btn');
  if (hero) hero.classList.toggle('free', isFree);
  if (lock) lock.classList.toggle('free', isFree);
  if (isFree) {
    function s(id,v){ var el=document.getElementById(id); if(el) el.textContent=v; }
    s('rev-pot','Bragging Rights');
    s('rev-stake','FREE · No CLU');
    var sub = document.getElementById('rev-pot-sub'); if(sub) sub.textContent = 'No escrow · verified result · recorded in profile';
    var lbl = document.querySelector('.wiz-pot-hero-lbl'); if(lbl) lbl.textContent = 'PRIZE';
    return;
  } else {
    var lbl2 = document.querySelector('.wiz-pot-hero-lbl'); if(lbl2) lbl2.textContent = 'Winner takes';
  }
  return _origWizPopReviewBeforePin.apply(this, arguments);
};

/* ====== board accept confirmWithPin too ====== */
var _origConfirmAcceptBeforePin = window.confirmAccept;
window.confirmAccept = function(){
  var d = window.PENDING_ACCEPT;
  var isPaid = d && (d.stake||0) > 0;
  var proceed = function(){ return _origConfirmAcceptBeforePin(); };
  if (!_hasPinSet()) {
    if (confirm('Create a 6-digit CLUTCH Passcode first to confirm this duel.')) { openPinSetup(true); return; }
    toast('Passcode required to accept duels','info'); return;
  }
  if (isPaid && !_isPinUnlocked()) {
    openPinVerify({ title:'Accept Duel · Passcode', sub:'Your matching stake will escrow after unlock.', onSuccess: proceed });
    return;
  }
  proceed();
};

/* ====== ensure PIN-setup modal shows after onboarding for non-guest ====== */
var _origEA_beforePINfree = window.enterApp;
window.enterApp = function(){
  var r = _origEA_beforePINfree ? _origEA_beforePINfree.apply(this, arguments) : undefined;
  if (window.U && window.U.via && window.U.via !== 'guest' && !_hasPinSet()) {
    setTimeout(function(){ openPinSetup(false); }, 900);
  }
  return r;
};

function wizNext(from) {
  if(from===1&&!CREATE.game){ toast('Pick a game first','error'); return; }
  if(from===2){ var sv=parseInt((document.getElementById('stake-input')||{}).value)||0; if(sv<1){ toast('Set your entry amount','error'); return; } }
  wizGoTo(from+1);
}
function wizBack(from){ wizGoTo(from-1); }
function wizSetStake(val,el){
  document.querySelectorAll('.wiz-sk').forEach(function(b){ b.classList.remove('sel'); }); el.classList.add('sel');
  var inp=document.getElementById('stake-input'); if(inp) inp.value=val;
  wizUpdatePotCalc(val); setSt(val);
  var nb=document.getElementById('wiz-next-2'); if(nb) nb.disabled=false;
}
function wizCustomStake(val){
  document.querySelectorAll('.wiz-sk').forEach(function(b){ b.classList.remove('sel'); });
  var v=parseInt(val)||0; wizUpdatePotCalc(v); setSt(v);
  var nb=document.getElementById('wiz-next-2'); if(nb) nb.disabled=(v<1);
}
function wizUpdatePotCalc(stake){
  var pot=stake*2; var win=Math.floor(pot*(1-PLATFORM_FEE)); var usd=CLU_USD||1;
  var y=document.getElementById('wiz-pot-you'); var f=document.getElementById('wiz-pot-friend'); var w=document.getElementById('wiz-pot-win');
  if(y) y.textContent=stake?stake+' CLU (≈$'+(stake*usd).toFixed(0)+')'  :'—';
  if(f) f.textContent=stake?stake+' CLU (≈$'+(stake*usd).toFixed(0)+')' :'—';
  if(w) w.textContent=stake?win  +' CLU (≈$'+(win  *usd).toFixed(0)+')' :'—';
}
function wizSelType(el,t){ selBT(el,t); }
function wizPopulateReview(){
  var stake=parseInt((document.getElementById('stake-input')||{}).value)||CREATE.stake||0;
  var win=Math.floor(stake*2*(1-PLATFORM_FEE));
  var g=GAMES.find(function(x){ return x.id===CREATE.game; })||{name:'—'};
  var typeMap={outcome:'Match Outcome',target:'Performance Target',custom:'Custom Condition'};
  var expSel=document.getElementById('expiry-sel');
  var expLabel=expSel?expSel.options[expSel.selectedIndex].text:'24 hours';
  var condEl=document.getElementById('c-out')||document.getElementById('c-tval')||document.getElementById('c-cust');
  var condText=condEl?condEl.value:'';
  if(!condText){ if(CREATE.challengeType==='outcome') condText='Win the match'; else if(CREATE.challengeType==='target') condText='Hit performance target'; else condText='Custom condition'; }
  function s(id,v){ var el=document.getElementById(id); if(el) el.textContent=v; }
  s('rev-game',g.name); s('rev-stake',stake.toLocaleString()+' CLU'); s('rev-type',typeMap[CREATE.challengeType]||'—');
  s('rev-pot',win.toLocaleString()+' CLU'); s('rev-expiry',expLabel); s('rev-cond',condText);
}

// ─── PERFORMANCE PANEL ───────────────────────────────────────────────────────
var RANK_TIERS=[{tier:'Iron',min:0,color:'#8a8a8a'},{tier:'Bronze',min:1,color:'#cd7f32'},{tier:'Silver',min:3,color:'#c0c0c0'},{tier:'Gold',min:6,color:'#e8a020'},{tier:'Platinum',min:10,color:'#00b4d8'},{tier:'Diamond',min:15,color:'#9b72cf'},{tier:'Master',min:25,color:'#ff6b35'},{tier:'CLUTCH',min:40,color:'var(--acc)'}];
function getMyRankTier(wins){ var t=RANK_TIERS[0]; RANK_TIERS.forEach(function(r){ if(wins>=r.min) t=r; }); return t; }
function calcH2H(){
  var res={}; var myAddr=(U.addr||'').toLowerCase();
  DUELS.filter(function(d){ return d.status==='settled'&&isMyDuel(d); }).forEach(function(d){
    var opp=(d.creator||'').toLowerCase()===myAddr?d.opponent:d.creator; if(!opp) return;
    var k=opp.toLowerCase();
    if(!res[k]) res[k]={addr:opp,name:opp.slice(0,8)+'…',wins:0,losses:0};
    if((d.winner||'').toLowerCase()===myAddr) res[k].wins++; else res[k].losses++;
  });
  return Object.values(res).sort(function(a,b){ return (b.wins+b.losses)-(a.wins+a.losses); }).slice(0,5);
}
function renderPerformancePanel(){
  var myAddr=(U.addr||'').toLowerCase();
  var settled=DUELS.filter(function(d){ return d.status==='settled'&&isMyDuel(d); });
  var wins=settled.filter(function(d){ return (d.winner||'').toLowerCase()===myAddr; }).length;
  var earned=0; settled.filter(function(d){ return (d.winner||'').toLowerCase()===myAddr; }).forEach(function(d){ earned+=Math.floor((d.stake||0)*2*(1-PLATFORM_FEE)); });
  var total=settled.length; var winRate=total?Math.round(wins/total*100):0;
  function s(id,v){ var el=document.getElementById(id); if(el) el.textContent=v; }
  s('perf-winrate',winRate+'%'); s('perf-streak',(U.streak||0));
  s('perf-earned',earned.toLocaleString()+' CLU');
  var avgPot=total?Math.round(DUELS.filter(isMyDuel).reduce(function(a,d){ return a+(d.stake||0)*2; },0)/DUELS.filter(isMyDuel).length):0;
  s('perf-avgpot',avgPot.toLocaleString()+' CLU');
  renderRankLadder(wins); renderGameRanks(); renderH2H();
}
function renderRankLadder(wins){
  var el=document.getElementById('rank-ladder'); if(!el) return;
  var current=getMyRankTier(wins);
  el.innerHTML=RANK_TIERS.map(function(t){
    var isA=t.tier===current.tier; var isP=RANK_TIERS.indexOf(t)<RANK_TIERS.indexOf(current);
    return '<div class="rank-tier'+(isA?' active':'')+(isP?' past':'')+'">'
      +'<div class="rank-pip" style="background:'+t.color+';opacity:'+(isP||isA?1:0.25)+'"></div>'
      +'<span style="font-size:12px;font-weight:'+(isA?700:400)+';color:'+(isA?t.color:'var(--txt3)')+'">'+t.tier+'</span>'
      +(isA?'<span style="margin-left:auto;font-size:10px;color:var(--acc)">← YOU</span>':'')
      +'</div>';
  }).join('');
}
function renderGameRanks(){
  var el=document.getElementById('game-ranks-list'); if(!el) return;
  var ranks=U.gameRanks||{};
  el.innerHTML=GAMES.slice(0,6).map(function(g){
    var rank=ranks[g.id]||'Unranked';
    return '<div class="h2h-row" style="gap:10px">'
      +'<div style="width:28px;height:28px;border-radius:8px;background:'+g.color+'18;display:flex;align-items:center;justify-content:center">'+gIconSVG(g.id,g.color)+'</div>'
      +'<span style="flex:1;font-size:13px">'+g.name+'</span>'
      +'<span style="font-size:12px;color:var(--txt3);cursor:pointer" onclick="editGameRank(\''+g.id+'\')">'+rank+'</span>'
      +'</div>';
  }).join('');
}
function editGameRank(gameId){
  var g=GAMES.find(function(x){ return x.id===gameId; });
  var current=(U.gameRanks||{})[gameId]||'';
  var val=prompt('Your '+(g?g.name:gameId)+' rank (e.g. Gold II, Plat 1):',current);
  if(val!==null){ if(!U.gameRanks) U.gameRanks={}; U.gameRanks[gameId]=val||'Unranked'; saveU(); renderGameRanks(); }
}
function renderH2H(){
  var el=document.getElementById('h2h-list'); if(!el) return;
  var rows=calcH2H();
  if(!rows.length){ el.innerHTML='<div style="text-align:center;padding:16px;color:var(--txt3);font-size:12px">Complete duels to see H2H records</div>'; return; }
  el.innerHTML=rows.map(function(r){
    var total=r.wins+r.losses; var wpct=total?Math.round(r.wins/total*100):0;
    return '<div class="h2h-row">'
      +'<div class="h2h-av">'+r.addr.slice(0,2).toUpperCase()+'</div>'
      +'<div style="flex:1"><div style="font-size:13px;font-weight:600">'+r.name+'</div><div style="font-size:11px;color:var(--txt3)">'+total+' duels</div></div>'
      +'<div style="text-align:right"><div style="font-size:13px;font-weight:700;color:'+(r.wins>r.losses?'var(--green)':r.losses>r.wins?'var(--red)':'var(--txt2)')+'">'+r.wins+'W – '+r.losses+'L</div>'
      +'<div style="font-size:11px;color:var(--txt3)">'+wpct+'% win rate</div></div>'
      +'</div>';
  }).join('');
}
function shareStatsCard(){
  var myAddr=(U.addr||'').toLowerCase();
  var settled=DUELS.filter(function(d){ return d.status==='settled'&&isMyDuel(d); });
  var wins=settled.filter(function(d){ return (d.winner||'').toLowerCase()===myAddr; }).length;
  var losses = settled.length - wins;
  var winRate = settled.length ? Math.round(wins/settled.length*100) : 0;
  var tier=getMyRankTier(wins);
  var integrity = getIntegrity();
  var totalEarned = DUELS.filter(function(d){ return d.status==='settled'&&(d.winner||'').toLowerCase()===myAddr; })
    .reduce(function(sum,d){ return sum + Math.floor(d.totalPot*(1-PLATFORM_FEE)); },0);

  var text = 'CLUTCH Player Card\n'
    + '━━━━━━━━━━━━━━━━━━\n'
    + (U.name||'Player') + '\n'
    + 'Rank: ' + tier.tier + '\n'
    + 'Record: ' + wins + 'W - ' + losses + 'L (' + winRate + '% WR)\n'
    + 'Streak: ' + (U.streak||0) + '\n'
    + 'Integrity: ' + integrity.score + '/100\n'
    + 'Total earned: ' + totalEarned.toLocaleString() + ' CLU\n'
    + '━━━━━━━━━━━━━━━━━━\n'
    + 'Duel me on CLUTCH!';

  if(navigator.share) {
    navigator.share({title:'CLUTCH Player Card — '+(U.name||'Player'),text:text}).catch(function(){});
  } else if(navigator.clipboard) {
    navigator.clipboard.writeText(text).then(function(){ toast('Player card copied to clipboard!','success'); });
  } else {
    toast(wins+'W - '+losses+'L · '+winRate+'% WR','success');
  }
}

// ─── TRENDING HUB ────────────────────────────────────────────────────────────
var HT_SEEDS={ht1:{a:621,d:283},ht2:{a:198,d:441},ht3:{a:874,d:312},ht4:{a:507,d:489}};
function initHotTakeVotes(){
  var votes=JSON.parse(localStorage.getItem('ht_votes')||'{}');
  Object.keys(HT_SEEDS).forEach(function(id){
    var seeds=HT_SEEDS[id]; var myVote=votes[id];
    if(myVote){
      var total=seeds.a+seeds.d+1; var agree=seeds.a+(myVote==='a'?1:0);
      var ap=Math.round(agree/total*100);
      var aBar=document.getElementById(id+'-abar'); var dBar=document.getElementById(id+'-dbar');
      var aPct=document.getElementById(id+'-apct'); var dPct=document.getElementById(id+'-dpct');
      if(aBar) aBar.style.width=ap+'%'; if(dBar) dBar.style.width=(100-ap)+'%';
      if(aPct) aPct.textContent=ap+'%'; if(dPct) dPct.textContent=(100-ap)+'%';
      var aBtn=document.querySelector('[data-ht="'+id+'"][data-side="a"]');
      var dBtn=document.querySelector('[data-ht="'+id+'"][data-side="d"]');
      if(aBtn) aBtn.disabled=true; if(dBtn) dBtn.disabled=true;
    }
  });
}
function voteHotTake(id,side){
  var votes=JSON.parse(localStorage.getItem('ht_votes')||'{}');
  if(votes[id]){ toast('Already voted!','error'); return; }
  votes[id]=side; localStorage.setItem('ht_votes',JSON.stringify(votes));
  var seeds=HT_SEEDS[id]; var total=seeds.a+seeds.d+1; var agree=seeds.a+(side==='a'?1:0);
  var ap=Math.round(agree/total*100);
  var aBar=document.getElementById(id+'-abar'); var dBar=document.getElementById(id+'-dbar');
  var aPct=document.getElementById(id+'-apct'); var dPct=document.getElementById(id+'-dpct');
  if(aBar) aBar.style.width=ap+'%'; if(dBar) dBar.style.width=(100-ap)+'%';
  if(aPct) aPct.textContent=ap+'%'; if(dPct) dPct.textContent=(100-ap)+'%';
  var aBtn=document.querySelector('[data-ht="'+id+'"][data-side="a"]');
  var dBtn=document.querySelector('[data-ht="'+id+'"][data-side="d"]');
  if(aBtn) aBtn.disabled=true; if(dBtn) dBtn.disabled=true;
  toast(side==='a'?'Agreed!':'Cap!','success');
}
function setHubTab(tab,el){
  var validTabs = document.querySelectorAll('.hub-tab[data-tab]');
  var allTabs = document.querySelectorAll('.hub-tab');
  allTabs.forEach(function(t){ t.classList.remove('active'); });
  if (el && el.classList) { el.classList.add('active'); }
  else {
    validTabs.forEach(function(t){
      if (t.getAttribute('data-tab') === tab) t.classList.add('active');
    });
  }
  var clipsCol = document.getElementById('hub-clips');
  var newsCol = document.getElementById('hub-news');
  var takesCol = document.getElementById('hub-takes');
  var filterCols = document.getElementById('hub-trending-grid');
  if (filterCols) {
    if (clipsCol) clipsCol.style.display = (tab === 'all' || tab === 'clips') ? '' : 'none';
    if (newsCol)  newsCol.style.display  = (tab === 'all' || tab === 'news')  ? '' : 'none';
    if (takesCol) takesCol.style.display = (tab === 'all' || tab === 'takes') ? '' : 'none';
  } else {
    document.querySelectorAll('.clip-card,.news-card,.hot-take-card').forEach(function(c){
      if (tab==='all') c.style.display='';
      else if (tab==='clips') c.style.display = c.classList.contains('clip-card') ? '' : 'none';
      else if (tab==='news')  c.style.display = c.classList.contains('news-card')  ? '' : 'none';
      else if (tab==='takes') c.style.display = c.classList.contains('hot-take-card') ? '' : 'none';
    });
  }
  if (typeof window._hubActiveTab !== 'undefined') window._hubActiveTab = tab;
}
(function ensureHubTabsWired(){
  function wireTabs() {
    document.querySelectorAll('.hub-tab[data-tab]').forEach(function(t){
      if (t.getAttribute('data-wired') === '1') return;
      t.setAttribute('data-wired', '1');
      t.addEventListener('click', function(e){
        var tab = this.getAttribute('data-tab');
        if (tab) setHubTab(tab, this);
      });
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ wireTabs(); setTimeout(wireTabs, 800); });
  } else {
    wireTabs(); setTimeout(wireTabs, 500); setTimeout(wireTabs, 1500);
  }
})();
function initTrendingHub(){ initHotTakeVotes(); }

// ─── SAVE PRESET HOOK ────────────────────────────────────────────────────────
function saveWizPreset(){
  var stake=parseInt((document.getElementById('stake-input')||{}).value)||0;
  if(!CREATE.game||!stake) return;
  var g=GAMES.find(function(x){ return x.id===CREATE.game; })||{name:'?',color:'#fff'};
  var typeLabel={outcome:'Match Outcome',target:'Performance Target',custom:'Custom'}[CREATE.challengeType]||'Match Outcome';
  var condEl=document.getElementById('c-out')||document.getElementById('c-tval')||document.getElementById('c-cust');
  var cond=condEl?condEl.value:'';
  var expSel=document.getElementById('expiry-sel'); var expiry=expSel?expSel.value:'24h';
  var preset={game:CREATE.game,gameName:g.name,gameColor:g.color,stake:stake,challengeType:CREATE.challengeType||'outcome',condition:cond,expiry:expiry,label:g.name+' · '+stake.toLocaleString()+' CLU · '+typeLabel,savedAt:Date.now()};
  var presets=JSON.parse(localStorage.getItem('wiz_presets')||'[]');
  presets=presets.filter(function(p){ return !(p.game===preset.game&&p.stake===preset.stake&&p.challengeType===preset.challengeType); });
  presets.unshift(preset); if(presets.length>3) presets=presets.slice(0,3);
  localStorage.setItem('wiz_presets',JSON.stringify(presets));
}

// Init
initTrendingHub();

/* ═══ GLOBAL ACCESSIBILITY ENHANCER — keyboard + labels across every view ═══
   Clutch drives most actions from onclick <div>/<span> elements and re-renders
   views dynamically. This makes them keyboard-operable (Tab + Enter/Space) and
   gives icon-only controls an accessible name, then keeps doing so for any
   markup the app injects later. */
(function(){
  var NATIVE = {A:1,BUTTON:1,INPUT:1,SELECT:1,TEXTAREA:1};
  function enhance(root){
    if(!root || root.nodeType!==1) return;
    var list = [];
    if(root.matches && root.matches('[onclick]')) list.push(root);
    if(root.querySelectorAll) list = list.concat([].slice.call(root.querySelectorAll('[onclick]')));
    list.forEach(function(el){
      if(NATIVE[el.tagName]){
        // Icon-only native control: promote its title to an accessible name.
        if(!el.getAttribute('aria-label') && !(el.textContent||'').trim() && el.getAttribute('title'))
          el.setAttribute('aria-label', el.getAttribute('title'));
        return;
      }
      if(el.dataset._a11y) return; el.dataset._a11y = '1';
      if(!el.hasAttribute('tabindex')) el.setAttribute('tabindex','0');
      if(!el.getAttribute('role')) el.setAttribute('role','button');
    });
    // Icon-only passcode delete keys use event delegation (no onclick attr).
    if(root.querySelectorAll) [].slice.call(root.querySelectorAll('[data-pin-action="delete"]')).forEach(function(b){
      if(!b.getAttribute('aria-label')) b.setAttribute('aria-label','Delete last digit');
    });
  }
  document.addEventListener('keydown', function(e){
    if(e.key!=='Enter' && e.key!==' ' && e.key!=='Spacebar') return;
    var t = e.target;
    if(!t || NATIVE[t.tagName]) return;
    if(t.getAttribute && t.getAttribute('role')==='button' && t.hasAttribute('onclick')){
      e.preventDefault(); t.click();
    }
  });
  function init(){
    enhance(document.body);
    new MutationObserver(function(muts){
      muts.forEach(function(m){ [].slice.call(m.addedNodes).forEach(enhance); });
    }).observe(document.body,{childList:true,subtree:true});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
