/**
 * Local dev server — serves the static site and runs api/ handlers the way
 * Vercel does (req.query incl. dynamic segments, parsed JSON body, res.status/
 * json/send/redirect). No KV env vars → the API uses its in-memory store, so the
 * whole duel flow can be clicked through offline.
 *
 *   node scripts/dev-server.mjs            # http://localhost:3000
 *   PORT=4000 node scripts/dev-server.mjs
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PORT = Number(process.env.PORT) || 3000;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.txt': 'text/plain', '.xml': 'application/xml',
};

/** Map /api/a/b to a handler file, honouring [param] and [[...catchall]] names. */
function resolveApi(parts) {
  let dir = path.join(ROOT, 'api');
  const params = {};
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    const last = i === parts.length - 1;
    if (last && fs.existsSync(path.join(dir, seg + '.js'))) return { file: path.join(dir, seg + '.js'), params };
    if (fs.existsSync(path.join(dir, seg)) && fs.statSync(path.join(dir, seg)).isDirectory()) {
      dir = path.join(dir, seg);
      if (last && fs.existsSync(path.join(dir, 'index.js'))) return { file: path.join(dir, 'index.js'), params };
      continue;
    }
    const entries = fs.readdirSync(dir);
    const catchAll = entries.find(e => /^\[\[?\.\.\.(\w+)\]\]?\.js$/.test(e));
    if (catchAll) {
      params[catchAll.match(/\.\.\.(\w+)/)[1]] = parts.slice(i);
      return { file: path.join(dir, catchAll), params };
    }
    const dyn = entries.find(e => /^\[(\w+)\]\.js$/.test(e));
    if (dyn && last) { params[dyn.slice(1, -4)] = seg; return { file: path.join(dir, dyn), params }; }
    return null;
  }
  const idx = path.join(dir, 'index.js');
  if (fs.existsSync(idx)) return { file: idx, params };
  const catchAll = fs.readdirSync(dir).find(e => /^\[\[\.\.\.(\w+)\]\]\.js$/.test(e));
  if (catchAll) return { file: path.join(dir, catchAll), params: {} };
  return null;
}

function wrapRes(res) {
  res.status = code => { res.statusCode = code; return res; };
  res.json = obj => { if (!res.getHeader('content-type')) res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)); return res; };
  res.send = body => { if (typeof body === 'object' && !Buffer.isBuffer(body)) return res.json(body); res.end(body); return res; };
  res.redirect = (a, b) => { const [code, url] = typeof a === 'number' ? [a, b] : [307, a]; res.statusCode = code; res.setHeader('location', url); res.end(); return res; };
  return res;
}

async function handleApi(req, res, url) {
  const found = resolveApi(url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean));
  if (!found) return res.status(404).json({ error: 'No such API route' });
  let mod;
  try {
    mod = await import(pathToFileURL(found.file).href);
  } catch (e) {
    console.error('[api] cannot load', found.file, e.message);
    return res.status(500).json({ error: 'Handler failed to load (restart the dev server after edits)' });
  }
  const query = Object.fromEntries(url.searchParams);
  Object.assign(query, found.params);
  req.query = query;
  req.cookies = Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(c => c.trim().split('=').map(decodeURIComponent)));
  const rawBody = mod.config?.api?.bodyParser === false;
  if (!rawBody && req.method !== 'GET' && req.method !== 'HEAD') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const text = Buffer.concat(chunks).toString();
    try { req.body = text && /json/.test(req.headers['content-type'] || '') ? JSON.parse(text) : text; } catch { req.body = text; }
  }
  try {
    await mod.default(req, res);
  } catch (e) {
    console.error('[api]', url.pathname, e);
    if (!res.headersSent) res.status(500).json({ error: 'Internal error' });
  }
}

function handleStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, path.normalize(p));
  if (!file.startsWith(ROOT)) return res.status(403).end();
  const candidates = [file, file + '.html'];
  const hit = candidates.find(f => fs.existsSync(f) && fs.statSync(f).isFile());
  if (!hit) return res.status(404).end('Not found');
  res.setHeader('content-type', TYPES[path.extname(hit)] || 'application/octet-stream');
  fs.createReadStream(hit).pipe(res);
}

http.createServer((req, res) => {
  wrapRes(res);
  const url = new URL(req.url, `http://${req.headers.host}`);
  // Same rewrite as vercel.json: /r/<id> is the shareable result page.
  if (/^\/r\/[^/]+$/.test(url.pathname)) url.pathname = '/api' + url.pathname;
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
  return handleStatic(req, res, url);
}).listen(PORT, () => console.log(`CLUTCH dev server on http://localhost:${PORT}`));
