/**
 * Badge catalog — the single source of truth for achievements. Badges are
 * DERIVED from stats:user:<id> (never stored), so they can never drift out of
 * sync and cost no extra writes. Each badge is transparent: the player can read
 * exactly what unlocks it. This is skill/activity progression — NOT a ranking,
 * NOT tiers, NOT anything resembling gambling.
 *
 * Each entry:
 *   id     — stable slug
 *   label  — short name
 *   desc   — how to earn it (shown to the player)
 *   icon   — emoji (rendered in the UI)
 *   tier   — 'bronze' | 'silver' | 'gold' (visual weight only)
 *   goal   — numeric target for progress bars
 *   value  — (stats) => current progress toward goal
 */
export const BADGES = [
  { id: 'first_win',   label: 'First Blood',      desc: 'Win your first duel.',                          icon: '🩸', tier: 'bronze', goal: 1,   value: s => s.wins },
  { id: 'streak_3',    label: 'Hat-trick',        desc: 'Win 3 duels in a row.',                         icon: '🔥', tier: 'silver', goal: 3,   value: s => s.bestStreak },
  { id: 'streak_5',    label: 'Unstoppable',      desc: 'Win 5 duels in a row.',                         icon: '⚡', tier: 'gold',   goal: 5,   value: s => s.bestStreak },
  { id: 'played_10',   label: 'Contender',        desc: 'Play 10 duels.',                                icon: '🎯', tier: 'bronze', goal: 10,  value: s => s.played },
  { id: 'played_50',   label: 'Veteran',          desc: 'Play 50 duels.',                                icon: '🛡️', tier: 'silver', goal: 50,  value: s => s.played },
  { id: 'wins_10',     label: 'Sharpshooter',     desc: 'Win 10 duels.',                                 icon: '🎖️', tier: 'silver', goal: 10,  value: s => s.wins },
  { id: 'wins_25',     label: 'Champion',         desc: 'Win 25 duels.',                                 icon: '🏆', tier: 'gold',   goal: 25,  value: s => s.wins },
  { id: 'verified_10', label: 'Verified Grinder', desc: 'Win 10 auto-verified matches (trustless).',     icon: '✅', tier: 'gold',   goal: 10,  value: s => s.verifiedWins },
];

function pct(v, goal) {
  if (goal <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((v / goal) * 100)));
}

/**
 * Evaluate the full catalog against a stats object.
 * @returns {{earned:Array, next:Array, earnedCount:number, total:number}}
 *   earned — unlocked badges (value >= goal), highest tier first
 *   next   — locked badges with current progress, closest-to-done first
 */
export function evaluateBadges(stats) {
  const s = stats || {};
  const earned = [];
  const next = [];
  for (const b of BADGES) {
    const v = Math.max(0, Number(b.value(s)) || 0);
    const done = v >= b.goal;
    const entry = {
      id: b.id, label: b.label, desc: b.desc, icon: b.icon, tier: b.tier,
      goal: b.goal, progress: Math.min(v, b.goal), pct: pct(v, b.goal), earned: done,
    };
    (done ? earned : next).push(entry);
  }
  const tierRank = { gold: 0, silver: 1, bronze: 2 };
  earned.sort((a, b) => tierRank[a.tier] - tierRank[b.tier]);
  next.sort((a, b) => b.pct - a.pct);
  return { earned, next, earnedCount: earned.length, total: BADGES.length };
}
