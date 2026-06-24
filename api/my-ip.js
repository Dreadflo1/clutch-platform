export default async function handler(req, res) {
  try {
    const r = await fetch('https://api.ipify.org?format=json');
    const data = await r.json();
    return res.status(200).json({ ip: data.ip, region: process.env.VERCEL_REGION || 'unknown' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
