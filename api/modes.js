/**
 * GET /api/modes            → full catalog { modes: { game: [modes] } }
 * GET /api/modes?game=lol   → { game, modes: [...] } for one game
 *
 * Public read — the frontend uses this to build the challenge-mode picker so the
 * catalog stays a single source of truth (validated server-side on create).
 */
import { GAME_MODES, getModes } from './_modes.js';

export default function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const game = String(req.query.game || '').toLowerCase();
  if (game) return res.status(200).json({ game, modes: getModes(game) });

  const all = {};
  Object.keys(GAME_MODES).forEach(g => { all[g] = getModes(g); });
  return res.status(200).json({ modes: all });
}
