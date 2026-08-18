/**
 * GET  /api/oauth/:platform  →  redirect to provider authorize URL (frontend: window.open popup)
 *      query: ?mode=authorize
 * GET  /api/oauth/callback?platform=...&code=...&state=...  → exchange code → username → redirect /authed.html
 *
 * Environments (Vercel vars):
 *   TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET
 *   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET  (YouTube auth)
 *   STEAM_OPENID  (any non-empty string enables Steam OpenID endpoint; verification is signature-only on Steam's server)
 *   DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET
 *   BATTLE_NET_CLIENT_ID / BATTLE_NET_CLIENT_SECRET
 *   XBOX_CLIENT_ID / XBOX_CLIENT_SECRET
 *   PSN_CLIENT_ID / PSN_CLIENT_SECRET
 *   EPIC_CLIENT_ID / EPIC_CLIENT_SECRET
 *   OAUTH_REDIRECT_URI — override autoredirect (defaults: request origin + /authed.html)
 */
import crypto from 'crypto';

const PLATFORMS = {
  twitch: {
    authHost: 'https://id.twitch.tv',
    authPath: '/oauth2/authorize',
    tokenPath: '/oauth2/token',
    scopes: ['openid', 'user:read:email'],
    idKey: () => [process.env.TWITCH_CLIENT_ID, process.env.TWITCH_CLIENT_SECRET],
    userinfoUrl: (t) => ({ url: 'https://api.twitch.tv/helix/users',
      headers: { Authorization: `Bearer ${t}`, 'Client-Id': process.env.TWITCH_CLIENT_ID } }),
    extractUser: (d) => ({ name: d.data[0].login, displayName: d.data[0].display_name })
  },
  youtube: {
    authHost: 'https://accounts.google.com',
    authPath: '/o/oauth2/v2/auth',
    tokenPath: 'https://oauth2.googleapis.com/token',
    scopes: ['https://www.googleapis.com/auth/youtube.readonly', 'openid', 'profile'],
    idKey: () => [process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET],
    userinfoUrl: (t) => ({ url: 'https://www.googleapis.com/oauth2/v2/userinfo', headers: { Authorization: `Bearer ${t}` } }),
    extractUser: (d) => ({ name: d.name || d.email, displayName: d.name || d.email })
  },
  discord: {
    authHost: 'https://discord.com',
    authPath: '/oauth2/authorize',
    tokenPath: 'https://discord.com/api/oauth2/token',
    scopes: ['identify'],
    idKey: () => [process.env.DISCORD_CLIENT_ID, process.env.DISCORD_CLIENT_SECRET],
    userinfoUrl: (t) => ({ url: 'https://discord.com/api/users/@me', headers: { Authorization: `Bearer ${t}` } }),
    extractUser: (d) => ({ name: d.username, displayName: d.global_name || d.username })
  },
  battlenet: {
    authHost: 'https://oauth.battle.net',
    authPath: '/authorize',
    tokenPath: 'https://oauth.battle.net/token',
    scopes: ['openid'],
    idKey: () => [process.env.BATTLE_NET_CLIENT_ID, process.env.BATTLE_NET_CLIENT_SECRET],
    userinfoUrl: (t) => ({ url: 'https://oauth.battle.net/userinfo', headers: { Authorization: `Bearer ${t}` } }),
    extractUser: (d) => ({ name: d.battletag || d.sub, displayName: d.battletag || d.preferred_username })
  },
  xbox: {
    authHost: 'https://login.live.com',
    authPath: '/oauth20_authorize.srf',
    tokenPath: 'https://login.live.com/oauth20_token.srf',
    scopes: ['XboxLive.signin', 'offline_access'],
    idKey: () => [process.env.XBOX_CLIENT_ID, process.env.XBOX_CLIENT_SECRET],
    userinfoUrl: (t) => ({ url: 'https://user.auth.xboxlive.com/user/authenticate',
      method: 'POST', body: JSON.stringify({ Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: `d=${t}` }, RelyingParty: 'http://auth.xboxlive.com', TokenType: 'JWT' }),
      headers: { 'Content-Type': 'application/json' } }),
    extractUser: (d) => {
      const gamertag = d?.DisplayClaims?.xui?.[0]?.gt;
      return { name: gamertag || d.Token || d.Gamertag || 'XboxUser', displayName: gamertag };
    }
  },
  psn: {
    authHost: 'https://ca.account.sony.com',
    authPath: '/oauth/v2/authorize',
    tokenPath: 'https://ca.account.sony.com/api/authz/v3/oauth/token',
    scopes: ['psn:clientapp'],
    idKey: () => [process.env.PSN_CLIENT_ID, process.env.PSN_CLIENT_SECRET],
    extractUser: () => ({ name: 'PSN User', displayName: 'PSN User' })
  },
  epic: {
    authHost: 'https://www.epicgames.com',
    authPath: '/idp/authorize',
    tokenPath: 'https://account-public-service-prod.ol.epicgames.com/account/api/oauth/token',
    scopes: ['basic_profile'],
    idKey: () => [process.env.EPIC_CLIENT_ID, process.env.EPIC_CLIENT_SECRET],
    extractUser: (d) => ({ name: d.displayName || d.accountName || 'EpicUser', displayName: d.displayName })
  }
};

// Steam uses OpenID (not OAuth2) — handled separately.
const STEAM_AUTHORIZE = 'https://steamcommunity.com/openid/login';

function originOf(req) {
  if (process.env.OAUTH_REDIRECT_URI) return process.env.OAUTH_REDIRECT_URI.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] || req.headers['x-forwarded-protocol'] || (req.connection && req.connection.encrypted ? 'https' : 'http'));
  return `${proto}://${req.headers.host}`;
}

function redirectUri(req) {
  return `${originOf(req)}/authed.html`;
}

function genState() {
  return crypto.randomBytes(18).toString('base64url');
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const url = new URL(req.url, 'http://localhost');
  const mode = url.searchParams.get('mode') || '';
  // Accept /api/oauth/twitch?mode=authorize OR /api/oauth?platform=twitch&mode=authorize OR /api/oauth/callback?platform=twitch&code=...
  const tail = (url.pathname || '').replace(/^\/api\/oauth\/?/,'');
  let platform = url.searchParams.get('platform') || (tail && tail !== 'callback' ? tail.split('/')[0] : '');
  const isCallback = tail === 'callback' || url.searchParams.get('code') || url.searchParams.get('openid.ns');

  // ---- PROBE: GET /api/oauth/twitch (no mode) → return configured:true if keys present, else :false
  if (!mode && !isCallback && platform) {
    if (platform === 'steam') {
      return res.status(200).json({ configured: !!process.env.STEAM_API_KEY, authStyle: 'openid' });
    }
    if (platform === 'riot') {
      return res.status(200).json({ configured: !!process.env.RIOT_API_KEY, authStyle: 'manual_verify' });
    }
    const def = PLATFORMS[platform];
    if (!def) return res.status(400).json({ error: 'Unknown platform' });
    const [id, secret] = def.idKey ? def.idKey() : [null, null];
    return res.status(200).json({ configured: !!(id && secret), authStyle: 'oauth2' });
  }

  // ---- STEAM OpenID path ----
  if (platform === 'steam') {
    const realm = originOf(req);
    const returnTo = `${realm}/api/oauth/callback?platform=steam`;
    if (url.searchParams.get('openid.ns')) {
      // Steam called back. Validate signature by sending back to steamcommunity
      const params = new URLSearchParams();
      for (const [k, v] of url.searchParams.entries()) params.append(k, v);
      params.set('openid.mode', 'check_authentication');
      const vr = await fetch(STEAM_AUTHORIZE, { method: 'POST', body: params });
      const body = await vr.text();
      const valid = /is_valid\s*:\s*true/i.test(body);
      const claimed = url.searchParams.get('openid.claimed_id') || '';
      const idMatch = claimed.match(/\/id\/([^/]+)$|\/profiles\/(\d+)$/);
      const steamId = (idMatch && (idMatch[2] || idMatch[1])) || claimed;
      const user = valid && steamId ? { name: steamId, displayName: `Steam ${steamId.substring(0,8)}…` } : null;
      return finish(res, 'steam', user, !valid);
    }
    const nonce = crypto.randomBytes(12).toString('hex');
    const q = new URLSearchParams({
      'openid.ns': 'http://specs.openid.net/auth/2.0',
      'openid.mode': 'checkid_setup',
      'openid.return_to': returnTo,
      'openid.realm': realm,
      'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.assoc_handle': nonce
    });
    return res.redirect(`${STEAM_AUTHORIZE}?${q.toString()}`);
  }

  // ---- RIOT is manual verification (Riot ID validation by backend using RIOT_API_KEY) ----
  if (platform === 'riot') {
    const riotId = url.searchParams.get('id') || '';
    const [gameName, tagLine] = riotId.split('#');
    const key = process.env.RIOT_API_KEY;
    if (!key) return res.status(200).json({ configured: false });
    if (!gameName || !tagLine) return finish(res, 'riot', null, true, 'missing riot id (GameName#Tag)');
    try {
      const host = 'europe.api.riotgames.com';
      const rr = await fetch(`https://${host}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
        { headers: { 'X-Riot-Token': key } });
      if (!rr.ok) return finish(res, 'riot', null, true, `Riot API ${rr.status}`);
      const acc = await rr.json();
      return finish(res, 'riot', { name: `${acc.gameName}#${acc.tagLine}`, displayName: `${acc.gameName}#${acc.tagLine}` });
    } catch (e) {
      return finish(res, 'riot', null, true, e.message || 'Riot fetch failed');
    }
  }

  // ---- Generic OAuth2 path ----
  const def = PLATFORMS[platform];
  if (!def) return res.status(400).json({ error: 'Unknown platform' });
  const [clientId, clientSecret] = def.idKey ? def.idKey() : [null, null];
  if (!clientId || !clientSecret) return finish(res, platform, null, true, `${platform} OAuth keys not configured in server env`);

  // 1) AUTHORIZE — build URL, redirect
  const ruri = redirectUri(req);
  if (!isCallback) {
    const state = genState();
    try { res.setHeader('Set-Cookie', `clutch_oauth_state=${state}; Path=/; SameSite=Lax; HttpOnly; Secure; Max-Age=900`); } catch(e){}
    const qp = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: ruri,
      scope: (def.scopes || []).join(' '),
      state: `${platform}:${state}`
    });
    // OAuth2 PKCE optional (leave off — most providers fine; Twitch/Google accept state CSRF protection)
    return res.redirect(`${def.authHost}${def.authPath}?${qp.toString()}`);
  }

  // 2) CALLBACK — exchange code for username
  const code = url.searchParams.get('code');
  const err = url.searchParams.get('error');
  if (err) return finish(res, platform, null, true, err);
  if (!code) return finish(res, platform, null, true, 'no code in callback');

  let data = null;
  try {
    const tokenResp = await fetch(def.tokenPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: ruri,
        code
      }).toString()
    });
    data = await tokenResp.json();
    if (!tokenResp.ok) return finish(res, platform, null, true, `token ${tokenResp.status}: ${JSON.stringify(data).slice(0,120)}`);
  } catch(e) {
    return finish(res, platform, null, true, 'token exchange: ' + e.message);
  }
  const access = data.access_token;
  if (!access) return finish(res, platform, null, true, 'no access_token');

  try {
    const ui = def.userinfoUrl ? def.userinfoUrl(access) : null;
    let userData = {};
    if (ui) {
      const opts = { headers: ui.headers || {} };
      if (ui.method) opts.method = ui.method;
      if (ui.body) opts.body = ui.body;
      const r2 = await fetch(ui.url, opts);
      userData = await r2.json();
      if (!r2.ok) return finish(res, platform, null, true, `userinfo ${r2.status}: ${JSON.stringify(userData).slice(0,120)}`);
    }
    const user = def.extractUser(userData);
    return finish(res, platform, user);
  } catch(e) {
    return finish(res, platform, null, true, 'userinfo: ' + e.message);
  }
}

function finish(res, platform, user, isError, errorMsg) {
  const base = '/authed.html';
  const q = new URLSearchParams({ platform });
  if (isError || !user) {
    q.set('error', '1');
    q.set('error_description', errorMsg || 'Authentication failed');
    return res.redirect(`${base}?${q.toString()}`);
  }
  q.set('name', user.name);
  if (user.displayName) q.set('displayName', user.displayName);
  return res.redirect(`${base}?${q.toString()}`);
}
