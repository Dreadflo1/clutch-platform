/**
 * GET /r/<challengeId>  (rewritten to /api/r/<id> in vercel.json)
 *
 * The shareable page for one settled duel. Server-rendered so link previews on
 * Discord, X, WhatsApp and Telegram show the real result in their title and
 * description. The page draws the result card and can save it as a PNG for
 * posting. Every value comes from the settled duel (see _feed.js), nothing is
 * made up; names are the players' public display names.
 */
import { getResult } from '../_feed.js';

const SITE = 'https://www.clutch.best';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function resultHeadline(r) {
  const score = r.score ? ` ${r.score[0]}-${r.score[1]}` : '';
  return `${r.winner} beat ${r.loser}${score} in ${r.gameLabel}`;
}

export function resultDescription(r) {
  const how = r.verified ? 'Result verified from the official match data.' : 'Result confirmed by both players.';
  return `${r.pot} CLU pot on a ${r.entry} CLU entry each. ${how} Think you can do better? Duel on CLUTCH.`;
}

const ICON_CHECK = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5l8-3z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>';
const ICON_TROPHY = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4zM7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3"/></svg>';
const ICON_SHARE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>';
const ICON_LINK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1"/><path d="M14 10a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1"/></svg>';
const ICON_DOWNLOAD = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>';
const LOGO = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true"><path d="M14.5 17.5L3 6V3h3l11.5 11.5" stroke="#04130a" stroke-width="2.5" stroke-linecap="round"/><path d="M9.5 6.5L21 18v3h-3L6.5 9.5" stroke="#04130a" stroke-width="2.5" stroke-linecap="round"/></svg>';

function page(r, url) {
  const title = resultHeadline(r);
  const desc = resultDescription(r);
  const date = new Date(r.settledAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const data = JSON.stringify({ ...r, headline: title, url, date }).replace(/</g, '\\u003c');
  const text = encodeURIComponent(`${title} on CLUTCH. ${url}`);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(title)} | CLUTCH</title>
<meta name="description" content="${esc(desc)}"/>
<meta name="robots" content="noindex"/>
<meta property="og:type" content="article"/>
<meta property="og:url" content="${esc(url)}"/>
<meta property="og:title" content="${esc(title)}"/>
<meta property="og:description" content="${esc(desc)}"/>
<meta property="og:image" content="${SITE}/og-image.jpg"/>
<meta property="og:site_name" content="CLUTCH"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${esc(title)}"/>
<meta name="twitter:description" content="${esc(desc)}"/>
<meta name="twitter:image" content="${SITE}/og-image.jpg"/>
<style>
:root{--bg:#0D0E12;--l1:#15171e;--l2:#1a1d26;--b:#262a36;--acc:#00FF87;--purple:#a679ff;--gold:#E8A020;--txt:#E8ECF5;--txt2:#9AA1B4;--txt3:#868EA1}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:radial-gradient(900px 500px at 10% -10%,rgba(0,255,135,.07),transparent 60%),radial-gradient(800px 480px at 90% 0,rgba(112,0,255,.10),transparent 60%),var(--bg);color:var(--txt);font:14px/1.55 Inter,"Segoe UI",system-ui,-apple-system,sans-serif}
.wrap{max-width:760px;margin:0 auto;padding:28px 16px 64px}
.head{display:flex;align-items:center;gap:10px;margin-bottom:28px}
.mk{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:linear-gradient(150deg,var(--acc),#00c96a)}
.nm{font-weight:800;letter-spacing:.04em}
.head a{margin-left:auto;color:var(--txt2);text-decoration:none;font-weight:700;font-size:13px;border:1px solid var(--b);border-radius:10px;padding:8px 12px}
.head a:hover,.head a:focus-visible{color:var(--txt);border-color:var(--acc)}
.card{position:relative;overflow:hidden;border:1px solid var(--b);border-radius:20px;padding:28px;background:linear-gradient(160deg,rgba(0,255,135,.06),rgba(21,23,30,.9) 45%,rgba(112,0,255,.10))}
.meta{display:flex;flex-wrap:wrap;gap:8px;align-items:center;color:var(--txt2);font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.pill{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;border:1px solid var(--b);background:rgba(13,14,18,.6)}
.pill.ok{color:var(--acc);border-color:rgba(0,255,135,.35)}
.win{display:flex;align-items:center;gap:10px;margin:22px 0 4px;color:var(--gold);font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
.who{font-size:clamp(28px,7vw,46px);font-weight:900;letter-spacing:-.03em;line-height:1.05;margin:0;overflow-wrap:anywhere}
.vs{color:var(--txt2);font-size:16px;margin:8px 0 0}
.vs b{color:var(--txt)}
.score{font:900 clamp(40px,10vw,64px)/1 "JetBrains Mono",Consolas,monospace;margin:22px 0 0;letter-spacing:.02em}
.score span{color:var(--txt3)}
.row{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:24px}
.stat{border:1px solid var(--b);border-radius:14px;padding:12px 14px;background:rgba(13,14,18,.55)}
.stat .k{color:var(--txt3);font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.stat .v{font-size:20px;font-weight:800;margin-top:2px}
.stat .v.acc{color:var(--acc)}
.foot{margin-top:22px;display:flex;justify-content:space-between;color:var(--txt3);font-size:12px}
.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}
.btn{display:inline-flex;align-items:center;gap:8px;min-height:42px;padding:0 16px;border-radius:12px;border:1px solid var(--b);background:var(--l1);color:var(--txt);font-family:inherit;font-weight:700;font-size:14px;line-height:1;text-decoration:none;cursor:pointer}
.btn:hover,.btn:focus-visible{border-color:var(--acc);outline:none}
.btn.primary{background:linear-gradient(150deg,var(--acc),#00c96a);color:#04130a;border:0}
.cta{margin-top:30px;border:1px dashed rgba(0,255,135,.3);border-radius:16px;padding:18px 20px}
.cta h2{font-size:18px;margin:0 0 6px}
.cta p{color:var(--txt2);margin:0 0 14px}
.toast{min-height:20px;color:var(--acc);font-size:13px;margin-top:10px}
@media (max-width:480px){.card{padding:20px}.row{grid-template-columns:1fr}}
@media (prefers-reduced-motion:no-preference){.card{animation:in .5s ease-out}@keyframes in{from{opacity:0;transform:translateY(8px)}}}
</style>
</head>
<body>
<main class="wrap">
  <div class="head"><div class="mk">${LOGO}</div><div class="nm">CLUTCH</div><a href="/?ref=result">Open CLUTCH</a></div>
  <article class="card" aria-label="Duel result">
    <div class="meta"><span class="pill">${esc(r.gameLabel)}</span>${r.mode ? `<span class="pill">${esc(r.mode)}</span>` : ''}${r.verified ? `<span class="pill ok">${ICON_CHECK} Verified result</span>` : '<span class="pill">Confirmed by both players</span>'}</div>
    <div class="win">${ICON_TROPHY} Winner</div>
    <h1 class="who">${esc(r.winner)}</h1>
    <p class="vs">beat <b>${esc(r.loser)}</b></p>
    ${r.score ? `<div class="score" aria-label="Final score">${esc(r.score[0])}<span> - </span>${esc(r.score[1])}</div>` : ''}
    <div class="row">
      <div class="stat"><div class="k">Pot won</div><div class="v acc">${esc(r.pot)} CLU</div></div>
      <div class="stat"><div class="k">Entry each</div><div class="v">${esc(r.entry)} CLU</div></div>
    </div>
    <div class="foot"><span>${esc(date)}</span><span>clutch.best</span></div>
  </article>
  <div class="actions">
    <button class="btn primary" id="share" type="button">${ICON_SHARE} Share</button>
    <button class="btn" id="copy" type="button">${ICON_LINK} Copy link</button>
    <button class="btn" id="save" type="button">${ICON_DOWNLOAD} Save image</button>
    <a class="btn" href="https://twitter.com/intent/tweet?text=${text}" target="_blank" rel="noopener">Post on X</a>
    <a class="btn" href="https://wa.me/?text=${text}" target="_blank" rel="noopener">WhatsApp</a>
    <a class="btn" href="https://t.me/share/url?url=${encodeURIComponent(url)}&amp;text=${encodeURIComponent(title)}" target="_blank" rel="noopener">Telegram</a>
  </div>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>
  <section class="cta">
    <h2>Think you can beat ${esc(r.winner)}?</h2>
    <p>Skill-based 1v1 duels on the games you already play. Free beta: every new player starts with 500 CLU, and free CLU is never cashable.</p>
    <a class="btn primary" href="/?ref=result">Start a duel</a>
  </section>
</main>
<script>
(function () {
  var R = ${data};
  var toast = document.getElementById('toast');
  function say(t) { toast.textContent = t; }
  function copy() {
    (navigator.clipboard ? navigator.clipboard.writeText(R.url) : Promise.reject())
      .then(function () { say('Link copied.'); }, function () { say(R.url); });
  }
  document.getElementById('copy').onclick = copy;
  document.getElementById('share').onclick = function () {
    if (navigator.share) navigator.share({ title: R.headline, text: R.headline + ' on CLUTCH.', url: R.url }).catch(function () {});
    else copy();
  };
  // Draw the card at 1200x630 (the social image size) and download it.
  document.getElementById('save').onclick = function () {
    var c = document.createElement('canvas'); c.width = 1200; c.height = 630;
    var x = c.getContext('2d');
    var g = x.createLinearGradient(0, 0, 1200, 630);
    g.addColorStop(0, '#0f1a15'); g.addColorStop(0.5, '#15171e'); g.addColorStop(1, '#1a1030');
    x.fillStyle = g; x.fillRect(0, 0, 1200, 630);
    x.strokeStyle = '#262a36'; x.lineWidth = 2; x.strokeRect(24, 24, 1152, 582);
    var font = 'Inter, "Segoe UI", system-ui, sans-serif';
    x.fillStyle = '#00FF87'; x.font = '800 30px ' + font; x.fillText('CLUTCH', 72, 100);
    x.fillStyle = '#9AA1B4'; x.font = '700 24px ' + font;
    x.fillText((R.gameLabel + (R.mode ? '  ·  ' + R.mode : '')).toUpperCase(), 72, 160);
    x.fillStyle = '#E8A020'; x.font = '800 22px ' + font; x.fillText('WINNER', 72, 236);
    x.fillStyle = '#E8ECF5'; x.font = '900 88px ' + font; x.fillText(R.winner, 68, 320, 1060);
    x.fillStyle = '#9AA1B4'; x.font = '600 34px ' + font; x.fillText('beat ' + R.loser, 72, 375, 700);
    if (R.score) { x.fillStyle = '#E8ECF5'; x.font = '900 96px "JetBrains Mono", Consolas, monospace'; x.textAlign = 'right'; x.fillText(R.score[0] + '-' + R.score[1], 1128, 340); x.textAlign = 'left'; }
    x.fillStyle = '#00FF87'; x.font = '800 40px ' + font; x.fillText(R.pot + ' CLU pot', 72, 480);
    x.fillStyle = '#868EA1'; x.font = '600 24px ' + font;
    x.fillText((R.verified ? 'Verified from official match data' : 'Confirmed by both players') + '  ·  ' + R.date, 72, 540);
    x.textAlign = 'right'; x.fillText('clutch.best', 1128, 540);
    c.toBlob(function (b) {
      var a = document.createElement('a'); a.href = URL.createObjectURL(b);
      a.download = 'clutch-result-' + R.id + '.png'; a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      say('Image saved.');
    }, 'image/png');
  };
})();
</script>
</body>
</html>`;
}

function notFound() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Result not found | CLUTCH</title><meta name="robots" content="noindex"/><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0D0E12;color:#E8ECF5;font:15px/1.6 Inter,system-ui,sans-serif;padding:16px;text-align:center}a{color:#00FF87}</style></head><body><main><h1>Result not found</h1><p>This duel has not been settled yet, or the link is wrong.</p><p><a href="/">Go to CLUTCH</a></p></main></body></html>`;
}

export default async function handler(req, res) {
  const id = String(req.query.id || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 64);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data: blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const r = id ? await getResult(id) : null;
  if (!r) {
    res.setHeader('Cache-Control', 'public, s-maxage=30');
    return res.status(404).send(notFound());
  }
  // A settled result never changes: let the CDN serve it.
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  return res.status(200).send(page(r, `${SITE}/r/${id}`));
}
