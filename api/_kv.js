/**
 * Vercel KV wrapper — shared across all API endpoints
 * Falls back to in-memory store when KV env vars are missing (dev mode)
 */

const memStore = new Map();

export async function kvGet(key) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    const val = memStore.get(key);
    return val ? JSON.parse(val) : null;
  }
  try {
    const res = await fetch(`${url}/get/${key}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch {
    return null;
  }
}

export async function kvSet(key, value, exSeconds) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const json = JSON.stringify(value);
  if (!url || !token) {
    memStore.set(key, json);
    if (exSeconds) setTimeout(() => memStore.delete(key), exSeconds * 1000);
    return true;
  }
  try {
    const args = exSeconds ? `/EX/${exSeconds}` : '';
    const res = await fetch(`${url}/set/${key}/${encodeURIComponent(json)}${args}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function kvDel(key) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    memStore.delete(key);
    return true;
  }
  try {
    const res = await fetch(`${url}/del/${key}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}
