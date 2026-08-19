/**
 * Structured challenge modes — the single source of truth (backend validates,
 * frontend fetches /api/modes to build the picker). Each mode is tied to a real
 * game format instead of free text.
 *
 * verifiable:true = both players are in ONE head-to-head match whose result we
 * can read from the game API (settlement can be trustless). verifiable:false =
 * honor-system (self-reported result + dispute/refund flow).
 */
export const GAME_MODES = {
  lol: [
    { id: 'lol_1v1_sr',      label: "1v1 · Summoner's Rift", rule: 'First blood or first tower wins the custom 1v1.', verifiable: true },
    { id: 'lol_5v5_custom',  label: '5v5 · Custom lobby',    rule: 'The team that wins the custom game.',            verifiable: true },
    { id: 'lol_ranked_race', label: 'Ranked climb race',     rule: 'Most LP gained by the deadline.',                verifiable: false },
  ],
  valorant: [
    { id: 'val_1v1_aim',     label: '1v1 · Aim (first to 13)', rule: 'First to 13 rounds in a 1v1 custom.', verifiable: true },
    { id: 'val_5v5_custom',  label: '5v5 · Custom',            rule: 'The team that wins the match.',       verifiable: true },
  ],
  dota2: [
    { id: 'dota2_1v1_mid',   label: '1v1 · Mid (FB / 2 towers)', rule: 'First blood or 2 tower kills.', verifiable: true },
    { id: 'dota2_5v5_custom',label: '5v5 · Custom lobby',        rule: 'The team that wins the match.', verifiable: true },
  ],
  cs2: [
    { id: 'cs2_aim_1v1',     label: '1v1 · Aim map',  rule: 'First to the agreed number of frags.', verifiable: false },
    { id: 'cs2_retake',      label: 'Retake',         rule: 'Most successful retakes.',              verifiable: false },
    { id: 'cs2_wingman',     label: 'Wingman · 2v2',  rule: 'The team that wins the Wingman match.', verifiable: false },
  ],
  fortnite: [
    { id: 'fn_box_fight',    label: 'Box fight (first to X)', rule: 'First to the agreed eliminations.', verifiable: false },
    { id: 'fn_realistics',   label: 'Realistics 1v1',         rule: 'Best of the agreed rounds.',        verifiable: false },
  ],
  clashroyale: [
    { id: 'cr_friendly',     label: 'Friendly battle',   rule: 'The player with more crowns.',   verifiable: false },
  ],
};

// Always available on top of any game's list — an escape hatch for arbitrary terms.
const CUSTOM_MODE = { id: 'custom', label: 'Custom challenge', rule: 'Agree your own terms (self-reported).', verifiable: false };

export function getModes(game) {
  const list = (GAME_MODES[game] || []).slice();
  list.push(CUSTOM_MODE);
  return list;
}
export function findMode(game, modeId) {
  return getModes(game).find(m => m.id === modeId) || null;
}
export function isVerifiableMode(game, modeId) {
  const m = findMode(game, modeId);
  return !!(m && m.verifiable);
}
