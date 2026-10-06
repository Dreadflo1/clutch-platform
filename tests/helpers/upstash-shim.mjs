/**
 * Test helper: speaks the Upstash REST protocol (POST ["CMD", ...args] →
 * {result} | {error}) in front of a real local redis-server, so the Lua money
 * scripts run on real Redis instead of the in-memory fallback.
 *
 *   const shim = await startShim();   // spawns redis-server on a free port
 *   process.env.KV_REST_API_URL = shim.url; process.env.KV_REST_API_TOKEN = 't';
 *   ...
 *   await shim.stop();
 *
 * Zero dependencies: a minimal RESP client over a TCP socket.
 */
import http from 'http';
import net from 'net';
import { spawn } from 'child_process';

function encode(args) {
  let out = `*${args.length}\r\n`;
  for (const a of args) {
    const s = Buffer.from(String(a));
    out += `$${s.length}\r\n${s}\r\n`;
  }
  return out;
}

// Parse one RESP value from buf at offset; returns [value, nextOffset] or null if incomplete.
function parse(buf, i = 0) {
  if (i >= buf.length) return null;
  const type = String.fromCharCode(buf[i]);
  const end = buf.indexOf('\r\n', i);
  if (end === -1) return null;
  const line = buf.slice(i + 1, end).toString();
  if (type === '+') return [line, end + 2];
  if (type === '-') return [{ error: line }, end + 2];
  if (type === ':') return [Number(line), end + 2];
  if (type === '$') {
    const n = Number(line);
    if (n === -1) return [null, end + 2];
    if (buf.length < end + 2 + n + 2) return null;
    return [buf.slice(end + 2, end + 2 + n).toString(), end + 2 + n + 2];
  }
  if (type === '*') {
    const n = Number(line);
    if (n === -1) return [null, end + 2];
    const arr = [];
    let j = end + 2;
    for (let k = 0; k < n; k++) {
      const r = parse(buf, j);
      if (!r) return null;
      arr.push(r[0]);
      j = r[1];
    }
    return [arr, j];
  }
  throw new Error('bad RESP type ' + type);
}

function client(port) {
  const sock = net.createConnection({ port });
  const queue = [];
  let buf = Buffer.alloc(0);
  sock.on('data', d => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      const r = parse(buf);
      if (!r) break;
      buf = buf.slice(r[1]);
      queue.shift()(r[0]);
    }
  });
  return {
    send: args => new Promise(res => { queue.push(res); sock.write(encode(args)); }),
    ready: new Promise((res, rej) => { sock.once('connect', res); sock.once('error', rej); }),
    close: () => sock.end(),
  };
}

async function freePort() {
  return new Promise(res => {
    const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => res(p)); });
  });
}

export async function startShim() {
  const redisPort = await freePort();
  const redis = spawn('redis-server', ['--port', String(redisPort), '--save', '', '--appendonly', 'no'], { stdio: 'ignore' });
  let c;
  for (let tries = 0; tries < 50; tries++) {
    try { c = client(redisPort); await c.ready; break; } catch { await new Promise(r => setTimeout(r, 100)); }
  }
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const ch of req) chunks.push(ch);
    const cmd = JSON.parse(Buffer.concat(chunks).toString());
    const out = await c.send(cmd);
    const isErr = out && typeof out === 'object' && !Array.isArray(out) && 'error' in out;
    res.writeHead(isErr ? 400 : 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(isErr ? { error: out.error } : { result: out }));
  });
  await new Promise(r => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    url,
    redis: args => c.send(args),
    flush: () => c.send(['FLUSHALL']),
    stop: async () => { c.close(); server.close(); redis.kill(); },
  };
}
