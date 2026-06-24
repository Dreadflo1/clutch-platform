/**
 * Esports RSS News Proxy
 *
 * GET /api/news?limit=20
 *
 * Fetches from multiple RSS feeds server-side (no CORS issues),
 * parses XML, returns sorted JSON articles.
 * Cached in-memory for 8 hours (3 refreshes/day).
 */

let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 8 * 3600 * 1000; // 8 hours

const FEEDS = [
  { name: 'Dot Esports',  url: 'https://dotesports.com/feed',               accent: '#e8344a' },
  { name: 'Dexerto',      url: 'https://www.dexerto.com/feed/',             accent: '#00d46e' },
  { name: 'PC Gamer',     url: 'https://www.pcgamer.com/rss/',              accent: '#ff6b35' },
  { name: 'GameSpot',     url: 'https://www.gamespot.com/feeds/mashup/',    accent: '#f59e0b' },
  { name: 'Kotaku',       url: 'https://kotaku.com/rss',                    accent: '#9b5cf6' },
];

function parseRSS(xml, feedMeta) {
  const articles = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && articles.length < 8) {
    const item = match[1];
    const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]>|<title>(.*?)<\/title>/) || [])[1] || (item.match(/<title>(.*?)<\/title>/) || [])[1] || '';
    const link = (item.match(/<link>(.*?)<\/link>/) || [])[1] || '';
    const pubDate = (item.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || '';
    const desc = (item.match(/<description><!\[CDATA\[(.*?)\]\]>|<description>(.*?)<\/description>/) || [])[1] || '';
    const category = (item.match(/<category><!\[CDATA\[(.*?)\]\]>|<category>(.*?)<\/category>/) || [])[1] || 'NEWS';

    if (title) {
      articles.push({
        title: title.replace(/<[^>]*>/g, '').trim(),
        link: link.trim(),
        date: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        timestamp: pubDate ? new Date(pubDate).getTime() : Date.now(),
        description: desc.replace(/<[^>]*>/g, '').slice(0, 150).trim(),
        category: category.replace(/<[^>]*>/g, '').toUpperCase().slice(0, 20).trim(),
        source: feedMeta.name,
        accent: feedMeta.accent,
      });
    }
  }
  return articles;
}

async function fetchFeed(feed) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(feed.url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'CLUTCH-Platform/1.0 (esports news aggregator)' },
    });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRSS(xml, feed);
  } catch (e) {
    return [];
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const limit = Math.min(parseInt(req.query.limit) || 20, 40);

  // Return cache if fresh
  if (_cache && Date.now() - _cacheTime < CACHE_TTL) {
    return res.status(200).json({
      articles: _cache.slice(0, limit),
      count: Math.min(_cache.length, limit),
      cached: true,
      nextRefresh: new Date(_cacheTime + CACHE_TTL).toISOString(),
    });
  }

  // Fetch all feeds in parallel
  const results = await Promise.all(FEEDS.map(fetchFeed));
  let allArticles = results.flat();

  // Sort by date descending
  allArticles.sort((a, b) => b.timestamp - a.timestamp);

  // Dedupe by similar titles
  const seen = new Set();
  allArticles = allArticles.filter(a => {
    const key = a.title.toLowerCase().slice(0, 40);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Cache
  _cache = allArticles;
  _cacheTime = Date.now();

  return res.status(200).json({
    articles: allArticles.slice(0, limit),
    count: Math.min(allArticles.length, limit),
    cached: false,
    sources: FEEDS.map(f => f.name),
    nextRefresh: new Date(_cacheTime + CACHE_TTL).toISOString(),
  });
}
