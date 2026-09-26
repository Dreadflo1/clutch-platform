/**
 * AI screenshot verification for honor-system (non-API) games.
 *
 * Reads an end-of-match scoreboard screenshot with Claude vision and extracts,
 * as strict JSON: which in-game names are visible, who won, whether the image
 * looks tampered with, and a confidence score. The endpoint (verify-shot.js)
 * combines TWO players' independent screenshots + declared names to decide a
 * winner — a single screenshot never settles money on its own.
 *
 * Config (env): ANTHROPIC_API_KEY (required in prod), VISION_MODEL (default
 * claude-opus-5). Degrades to { ok:false, error:'not_configured' } with no key.
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.VISION_MODEL || 'claude-opus-5';

// Test seam: unit tests inject a verdict provider so the money/consensus logic
// can be exercised without calling the real API. Never set in production.
let _testProvider = null;
export function _setVisionTestProvider(fn) { _testProvider = fn; }

export function visionConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY) || Boolean(_testProvider);
}

function parseJson(s) {
  try { return JSON.parse(s); } catch {}
  const m = s && s.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

/**
 * @returns {Promise<{ok:boolean, error?:string, gameDetected?:string,
 *   namesVisible?:string[], winnerName?:string, loserName?:string,
 *   looksEdited?:boolean, confidence?:number, notes?:string}>}
 */
export async function readScoreboard({ imageBase64, mediaType, game, playerName, opponentName }) {
  if (_testProvider) return _testProvider({ game, playerName, opponentName });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: 'not_configured' };

  const prompt =
    `You verify results of 1v1 ${game} matches for a skill-based (non-gambling) wager platform. ` +
    `Two players agreed to duel with these in-game names: "${playerName}" and "${opponentName}". ` +
    `Study this end-of-match scoreboard screenshot and reply with STRICT JSON only:\n` +
    `{\n` +
    `  "game_detected": "<game shown, or 'unknown'>",\n` +
    `  "names_visible": ["<player names you can read>"],\n` +
    `  "winner_name": "<the exact displayed name of the winning side, or 'unknown'>",\n` +
    `  "loser_name": "<the exact displayed name of the losing side, or 'unknown'>",\n` +
    `  "looks_edited": <true if fonts/alignment/artefacts suggest tampering or a fake>,\n` +
    `  "confidence": <0 to 1, how sure you are of the winner>,\n` +
    `  "notes": "<one short sentence>"\n` +
    `}\n` +
    `Judge only what is visibly in the image. Output the JSON and nothing else.`;

  const body = {
    model: MODEL,
    max_tokens: 1024,
    output_config: { effort: 'low' },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/png', data: imageBase64 } },
        { type: 'text', text: prompt },
      ],
    }],
  };

  let res;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch { return { ok: false, error: 'network' }; }

  if (!res.ok) return { ok: false, error: `api_${res.status}` };
  const data = await res.json().catch(() => null);
  const textBlock = data && Array.isArray(data.content) && data.content.find((b) => b.type === 'text');
  if (!textBlock) return { ok: false, error: 'no_text' };
  const parsed = parseJson(textBlock.text);
  if (!parsed) return { ok: false, error: 'parse' };

  return {
    ok: true,
    gameDetected: String(parsed.game_detected || 'unknown'),
    namesVisible: Array.isArray(parsed.names_visible) ? parsed.names_visible.map(String) : [],
    winnerName: String(parsed.winner_name || 'unknown'),
    loserName: String(parsed.loser_name || 'unknown'),
    looksEdited: Boolean(parsed.looks_edited),
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
    notes: String(parsed.notes || ''),
  };
}

/** Loose name match: case/spacing/tag-insensitive. */
export function nameMatches(a, b) {
  const norm = (s) => String(s || '').toLowerCase().replace(/#.*$/, '').replace(/[^a-z0-9]/g, '');
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return false;
  return na === nb || na.startsWith(nb) || nb.startsWith(na);
}
