window.GAMING_ACCOUNTS_META = {
  twitch:    { name:'Twitch',       color:'#9147FF', bg:'#9147FF15', ver:'OAuth', hint:'Enter your Twitch username (e.g. shroud)' },
  youtube:   { name:'YouTube',      color:'#FF0000', bg:'#FF000015', ver:'OAuth', hint:'YouTube channel handle (e.g. @Ninja)' },
  steam:     { name:'Steam',        color:'#1b2838', bg:'#1b283822', ver:'Auto',  hint:'Steam64 ID (76561198...) or profile URL' },
  riot:      { name:'Riot (LoL/Valorant)', color:'#D13639', bg:'#D1363915', ver:'Auto', hint:'Riot ID: GameName#TAG (e.g. Faker#KR1)' },
  xbox:      { name:'Xbox Live',    color:'#107C10', bg:'#107C1022', ver:'OAuth', hint:'Xbox Gamertag (e.g. Major Nelson)' },
  psn:       { name:'PlayStation',  color:'#003087', bg:'#00308722', ver:'OAuth', hint:'PSN Online ID' },
  battlenet: { name:'Battle.net',   color:'#0074e4', bg:'#0074e422', ver:'OAuth', hint:'BattleTag (e.g. Player#1234)' },
  discord:   { name:'Discord',      color:'#5865F2', bg:'#5865F222', ver:'OAuth', hint:'Discord username (e.g. gamer123)' },
  epic:      { name:'Epic Games',   color:'#2b2b2b', bg:'#2b2b2b33', ver:'OAuth', hint:'Epic Games display name' }
};
window._accountLogos = {
  twitch: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M4.269 2L1 5.269v12.462h4.885V22h2.615l2.308-2.308h3.923L23 14.846V2H4.269zm17.077 11.308l-3.154 3.154h-4.615l-2.385 2.385v-2.385H7.077V4h14.269v9.308z"/></svg>',
  youtube: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 00.5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 002.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 002.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.6 15.6V8.4L15.8 12 9.6 15.6z"/></svg>',
  steam: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 00-9.98 9.3L6 14.4a3 3 0 012.7-2.1L11 8.7a4.5 4.5 0 114.4 4.4L11.5 19c-1.4.1-2.7-1-2.7-2.4a2.4 2.4 0 01.6-1.6L7.4 13a6 6 0 109.6 5.2 7.5 7.5 0 01-5-10 10 10 0 00-10 8.2V12zm3.5 3.7a2.8 2.8 0 100 5.6 2.8 2.8 0 000-5.6zm-1 4a1.3 1.3 0 11.6-2.4 1.3 1.3 0 01-.6 2.4z"/></svg>',
  riot: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L1 15l3 4h4l1-3h4l-1 3h5l3-4z"/></svg>',
  xbox: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M4.7 7.9c-2.3 3.2-3.4 7.7-2.4 10.5 4.5 3.2 12.1 3.4 17.7.3-1.2 1.9-4 3.3-5.5 3.8C12.2 24 6.8 22.2 4.7 7.9zM12 4.6c2 1.3 4.5 3.7 5.8 6.9-1.2 2.8-3.4 5-5.8 6.6C9.7 16.6 7.4 14.3 6.2 11.5 7.5 8.3 10 5.9 12 4.6zM12 0C6 0 1 4.2 1 9.4v1.5c0 .4 0 .8.1 1.1.7-3 3.2-6.4 5.5-8.4C8 1 10 0 12 0s4 1 5.4 3.6c2.3 2 4.8 5.4 5.5 8.4.1-.3.1-.7.1-1.1V9.4C23 4.2 18 0 12 0z"/></svg>',
  psn: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10.3 13.2c0 2.4.3 3.8.6 4.3.1.4.3.6.7.8.1.1.4.3.8.4 1.7.5 4.2.1 6.2-1.4 2.2-1.6 3-3.9 2.9-5.3 0-.1 0-.3 0-.4h-6.1c-.2-.8-.6-1.1-.9-1.1-1.8-.1-2.1.7-2.1 1.4-3.6.8-4.5 2.8-5.3 5.5-.3 1.3-.5 2.6-.6 3.8-.6 3.8 3.3 5.5 6.6 4.6.1 0 .2 0 .3-.1-.4 0-.6-.1-.9-.2l.5-1.9c.6.1 1 .2 1.3.2 1.2 0 1.9-.8 2.1-2l2.2-.6c-.2-3.1-1.8-5.8-4.8-6.3zM10.5 13v1H21v-.9l-10.5-.1zm-.6-9.3l.8-2 7.4 1.7-.5 2.1-7.7-1.8zM4.3 10L5.8 4l2.1.5-1.5 6.1L4.3 10z"/></svg>',
  battlenet: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.2 6.5L9 2a6.7 6.7 0 00-6.9 4.3L2.1 11.7 8.4 10l.6-1.6L5.1 7.3l6.2-1.6 10.1 2.3L22 9a6.7 6.7 0 00-1.8-2.5zM4.2 17.4A6.7 6.7 0 0011 21l11.2-4.6v-.1L15.6 14l-.7 1.7 3.9 1L9.7 18.1l-5.1-2.1L2.1 14a6.7 6.7 0 002.1 3.4zM7.4 12L3 13.2h.1L2.1 12c0-.2.4-1.2 5.3-1.2z"/></svg>',
  discord: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.3 4.4A19.8 19.8 0 0015.6 3l-.3.6a18.2 18.2 0 00-6.6 0L8.4 3a19.8 19.8 0 00-4.7 1.4C.5 8.8-.3 13 0 17.2a20 20 0 006 3l.5-.7a13.1 13.1 0 01-2-1l.5-.4a13.6 13.6 0 0021.8 0l.5.4c-.6.4-1.3.8-2 1l.5.7a20 20 0 006-3c.4-4.9-.7-9-3.6-12.8zM8.5 14.5c-1.2 0-2.2-1.1-2.2-2.5 0-1.4 1-2.5 2.2-2.5 1.2 0 2.2 1.1 2.2 2.5 0 1.4-1 2.5-2.2 2.5zm7 0c-1.2 0-2.2-1.1-2.2-2.5 0-1.4 1-2.5 2.2-2.5 1.2 0 2.2 1.1 2.2 2.5 0 1.4-1 2.5-2.2 2.5z"/></svg>',
  epic: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0L2.4 5.6v12.8L12 24l9.6-5.6V5.6L12 0zm0 2.3l7.6 4.5v10.4L12 21.7 4.4 17.2V6.8L12 2.3zM8 12l2-3 4 6 2-3"/>'
};
// Escape user-controlled strings before they touch innerHTML (prevents stored XSS
// from a typed username/handle).
window._escAcc = function(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
};
window._accountUrl = function(platform, name) {
  if (!name) return '#';
  try {
    switch(platform){
      case 'twitch': return 'https://twitch.tv/'+encodeURIComponent(name);
      case 'youtube':
        if (/^https?:\/\//i.test(name)) return name;
        return (/^@/.test(name)?'https://youtube.com/':'https://youtube.com/@')+encodeURIComponent(name);
      case 'steam':
        if (/^https?:\/\//i.test(name)) return name;
        if (/^76561198\d{10}$/.test(name)) return 'https://steamcommunity.com/profiles/'+name;
        return 'https://steamcommunity.com/id/'+encodeURIComponent(name);
      case 'riot':
        return 'https://tracker.gg/valorant/profile/riot/'+encodeURIComponent(String(name).replace('#','%23'));
      case 'xbox': return 'https://www.xbox.com/play/user/'+encodeURIComponent(name);
      case 'psn':  return 'https://psnprofiles.com/'+encodeURIComponent(name);
      case 'battlenet':
        if (/^https?:\/\//i.test(name)) return name;
        return 'https://overwatch.blizzard.com/en-us/search/'+encodeURIComponent(String(name).replace('#','-'))+'/';
      case 'discord': return 'https://discord.com/users/'+encodeURIComponent(name);
      case 'epic':    return 'https://tracker.gg/fortnite/profile/epic/'+encodeURIComponent(name);
      default: return '#';
    }
  } catch(e){ return '#'; }
};
window.loadConnectedAccounts = function() {
  try { return JSON.parse(localStorage.getItem('clutch_gaming_accounts')||'{}'); }
  catch(e) { return {}; }
};
window.saveConnectedAccounts = function(data) {
  try { localStorage.setItem('clutch_gaming_accounts', JSON.stringify(data)); } catch(e) {}
  renderConnectedAccounts();
};
window.toggleAccountOverlay = function(platform, force) {
  var row = document.querySelector('[data-account-platform="' + platform + '"]');
  if (!row) return;
  var ovl = row.querySelector('.account-edit-overlay');
  if (!ovl) return;
  var show = (typeof force === 'boolean') ? force : (ovl.style.display === 'none' || !ovl.style.display);
  ovl.style.display = show ? 'flex' : 'none';
};
window.saveAccountFromOverlay = function(platform) {
  var row = document.querySelector('[data-account-platform="' + platform + '"]');
  if (!row) return;
  var input = row.querySelector('.account-input');
  if (!input) return;
  var val = input.value.trim();
  if (!val) { disconnectAccount(platform); return; }
  var obj = loadConnectedAccounts();
  // Manual entry is self-reported, NOT ownership-verified — never claim "verified".
  obj[platform] = { name: val, url: _accountUrl(platform, val), status: 'linked', connectedAt: Date.now() };
  saveConnectedAccounts(obj);
  toast(GAMING_ACCOUNTS_META[platform].name + ' linked!', 'success');
};
window.disconnectAccount = function(platform) {
  var obj = loadConnectedAccounts();
  delete obj[platform];
  saveConnectedAccounts(obj);
  if (GAMING_ACCOUNTS_META[platform]) toast(GAMING_ACCOUNTS_META[platform].name + ' disconnected', 'info');
};
window.openAccountUrl = function(platform) {
  var obj = loadConnectedAccounts();
  if (obj[platform] && obj[platform].url && obj[platform].url !== '#') {
    window.open(obj[platform].url, '_blank', 'noopener,noreferrer');
  } else {
    toast('Connect this account first', 'info');
  }
};
window.renderConnectedAccounts = function() {
  var wrap = document.getElementById('prof-connections');
  if (!wrap) return;
  var data = loadConnectedAccounts();
  var html = '';
  var order = ['twitch','youtube','steam','riot','xbox','psn','battlenet','discord','epic'];
  order.forEach(function(platform){
    var meta = GAMING_ACCOUNTS_META[platform];
    if (!meta) return;
    var con = data[platform];
    var connected = !!con;
    var statusColor = connected ? 'var(--acc,#00FF87)' : 'var(--txt3,#8692ad)';
    var statusText = !connected ? 'NOT LINKED' : (con.status === 'verified' ? 'VERIFIED' : 'LINKED');
    var txtCol = (meta.color==='#FF0000' || meta.color==='#ffffff') ? '#fff' : '#000';
    html += '<div class="account-row" data-account-platform="' + platform + '">' +
      '<div class="account-left">' +
        '<div class="account-logo" style="background:' + meta.bg + ';color:' + meta.color + '">' + (_accountLogos[platform]||'') + '</div>' +
        '<div class="account-info">' +
          '<div class="account-name">' + meta.name + '</div>' +
          '<div class="account-sub"><span class="account-status" style="color:' + statusColor + '">● ' + statusText + '</span>';
    if (connected) html += ' <span class="account-val">' + _escAcc(con.name) + '</span>';
    else html += ' <span class="account-val" style="color:var(--txt3)">'+meta.hint+'</span>';
    html += '</div></div></div><div class="account-right">';
    if (connected) {
      html += '<button class="btn btn-sm btn-s" onclick="openAccountUrl(\''+platform+'\')" title="Visit profile">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></button>' +
              '<button class="btn btn-sm btn-s" onclick="toggleAccountOverlay(\''+platform+'\')" title="Edit">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>' +
              '<button class="btn btn-sm btn-d" onclick="disconnectAccount(\''+platform+'\')" title="Unlink">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6m5 0V4a2 2 0 012-2h0a2 2 0 012 2v2"/></svg></button>';
    } else {
      html += '<button class="btn btn-sm btn-p" onclick="toggleAccountOverlay(\''+platform+'\')" style="background:' + meta.color + ';border-color:' + meta.color + ';color:' + txtCol + '">Connect</button>';
    }
    html += '</div>' +
      '<div class="account-edit-overlay" style="display:none">' +
        '<div class="aov-left"><div class="aov-label">' + meta.name + ' ' + (connected ? 'username' : 'ID') + '</div>' +
          '<input class="account-input fi" type="text" value="' + (connected ? _escAcc(con.name) : '') + '" placeholder="' + _escAcc(meta.hint) + '" onkeydown="if(event.key===String.fromCharCode(13))saveAccountFromOverlay(\''+platform+'\')"/>' +
          '<div class="aov-ver" style="color:var(--txt3)">Self-reported — not ownership-verified</div>' +
        '</div>' +
        '<div class="aov-right">' +
          '<button class="btn btn-sm btn-s" onclick="toggleAccountOverlay(\''+platform+'\',false)">Cancel</button>' +
          '<button class="btn btn-sm btn-p" onclick="saveAccountFromOverlay(\''+platform+'\')" style="background:'+meta.color+';border-color:'+meta.color+';color:' + txtCol + '">Save</button>' +
        '</div>' +
      '</div></div>';
  });
  var total = Object.keys(data).length;
  html += '<div class="account-footer" style="margin-top:10px;display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-top:1px dashed var(--b,#262a36);border-radius:8px;background:var(--l2,#131624);font-size:11px;color:var(--txt3,#8692ad)">' +
    '<span>' + total + ' / ' + order.length + ' platforms linked</span>' +
    '<span>Self-reported · OAuth verification coming soon</span></div>';
  wrap.innerHTML = html;
};
(function ensureAccountsWired(){
  function run() {
    try {
      renderConnectedAccounts();
      if (typeof renderProfile === 'function' && !renderProfile.__accountsPatched) {
        var orig = renderProfile;
        window.renderProfile = function(){
          try { orig(); } catch(e){}
          try { renderConnectedAccounts(); } catch(e){}
        };
        renderProfile.__accountsPatched = true;
      }
    } catch(e) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ run(); setTimeout(run, 800); });
  } else {
    run(); setTimeout(run, 500); setTimeout(run, 1500);
  }
})();
