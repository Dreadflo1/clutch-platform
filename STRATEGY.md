# Clutch — Strategy & Goals

_Set 2026-10-05 · review every Monday · owner: Flavien_
_Companions: [ROADMAP.md](ROADMAP.md) (engineering backlog), [GROWTH.md](GROWTH.md) (cost per player, retention, playbook, tracking), [SECURITY.md](SECURITY.md) (SOC 2 controls). This file says **why** and **what number we are chasing**; the roadmap says **how**._

## Positioning (non-negotiable)

CLUTCH is a **peer-to-peer, skill-based competition platform**: two players duel on a
real match, both lock CLU in escrow, the better player wins the pot, the platform takes
a disclosed 2.5% fee. **It is not gambling**: no house, no betting lines, no randomness
decides the outcome. Every word, screen and line of code must read that way.

## North-star metric

**Settled duels per week (SDW)** — duels that reached a final, undisputed result.
It only moves when sign-in, matchmaking, escrow, settlement and trust all work, so it is
the single number that proves the product is real.

Guardrails that must hold while SDW grows:

| Guardrail | Target |
|---|---|
| Dispute rate (disputed ÷ settled) | < 5% (beta), < 3% (real money) |
| Money-integrity incidents (lost, duplicated or frozen CLU) | **0, always** |
| Escrow invariant (available + escrow = deposits − withdrawals + free grants − fees) | checked daily, 0 drift |
| Median time from accept to settle | < 2 h |

## Goals by stage

### Stage 1 — Production-ready free beta · target **2026-11-02**
Goal: friends and first community can sign in and duel with the free 500 CLU, reliably.

- [ ] Tier 1 env live on Vercel and confirmed: KV provisioned, `JWT_SECRET`, `CHALLENGE_SECRET` (ROADMAP Phase 0)
- [ ] Atomic Lua balance scripts re-tested against real Upstash (today: in-memory only)
- [ ] Escrow idempotency keys + daily reconciliation check (ROADMAP Phase 1 leftovers)
- [ ] `RIOT_API_KEY` + `STEAM_API_KEY` set → LoL, Valorant, Dota 2 auto-verified live
- [x] Demo/fake content out of prod (no fabricated feed, polls or stats) _(2026-10-10, PR #7 + #8: removed outright rather than flagged; fake board challenges, hot-take %, news/clips, player counts and countdowns gone. Leftover: `p2p.js` still holds the demo pool/timer but no page loads it, delete it)_
- [ ] Commit the offline test suites (escrow, settle, integrity, payments — today run ad hoc, none in the repo) + GitHub Actions CI on every push _(started: `tests/` has registry 2026-10-06, recent feed and Telegram 2026-10-10; escrow/settle/payments suites and CI still missing)_
- **Exit numbers:** 50 **qualified players** (see Player acquisition below) · 100 settled duels · dispute rate < 5% · 0 integrity incidents

### Stage 2 — Community traction · target **2026-12-31**
Goal: duels happen without Flavien personally recruiting each player.

- [ ] Ambassador program live (HQ deployed, apply flow → Discord/Telegram intake)
- [ ] Acquisition kit in use: ad pages (Instagram, Telegram, WhatsApp, teaser), share-link / QR deep links _(progress: Telegram bot answers /start and opens shared duels in Telegram 2026-10-10, PR #10; Canva creatives in brand palette + 5 content formats ready, `creatives/content-plan-oct.md`; nothing published yet)_
- [ ] Game-account ownership proof (close the self-declared handle gap, ROADMAP Phase 2)
- [ ] Basic funnel analytics: visit → sign-up → first duel → second duel
- **Exit numbers:** **500 qualified players minimum** (Flavien, 2026-10-06): about 80 by Nov 2, then **+50 per week** from Nov 3 · 150 weekly active players · **SDW ≥ 250** · 40% of new players duel twice within 7 days · 20 active ambassadors

### Stage 3 — Real-money launch · target **2027-Q1**
Goal: deposits and withdrawals open in cleared jurisdictions only.

- [ ] Incorporation jurisdiction decided (Bulgaria / Estonia / Malta) and entity registered
- [ ] Terms v0.4 → v1.0 reviewed by counsel; every bracketed placeholder filled; draft ribbon removed
- [ ] Skill-contest legal opinion per target market; geo-block for excluded regions
- [ ] KYC/AML at withdrawal (proportional to thresholds); 18+ gate already enforced
- [ ] Live tests: Stripe webhook, NOWPayments IPN, payouts admin flow, end to end
- **Exit numbers:** first €1,000 deposited · 100% of withdrawals processed < 48 h · dispute rate < 3% · 0 integrity incidents

### Always-on quality bar
- Split the `index.html` / `app.js` monoliths progressively (no big-bang rewrite).
- Every release: zero emoji in UI, SVG icon set only, consistent terminology, WCAG AA contrast, SEO meta honest.

## Player acquisition: 20 qualified players per week

Pace set by Flavien 2026-10-06: **+20 new qualified players every week** through Nov 2, then **+50 per week** to reach the 500 minimum by Dec 31, fraud and bots excluded. Telegram ping to Flavien every 3 new qualified players.
At that pace the 50 is reached in week 3 (around 2026-10-22), ahead of the Stage 1 date.

### What counts as one player

A **qualified player** is a distinct CLUTCH account that:
1. has a game handle (Riot ID or Steam ID) bound to it and to no other account (handle binding already exists in `settle.js`),
2. finished at least one settled duel against a *different* qualified account,
3. is not banned and not flagged as a multi-account (below).

Sign-ups alone never count: one person can open an email, a wallet, a Telegram and a Discord account today.

### Fraud and bot exclusion

Already in the repo: per-IP sign-up rate limit, free CLU never cashable (no money reason to farm accounts), one game handle per account, dispute strikes and auto-ban.
Still missing, to build in week 0:
- [x] **Player registry** _(built 2026-10-06, live once merged)_: every sign-up path (email, wallet, Telegram, Discord) writes the account to one index with method, date, a hashed IP and the campaign it came from (`ref` / `utm_source`), so cost per player and retention can be split by channel. Today there is no list of accounts at all, so nothing can be counted.
- [x] **Multi-account flags** _(2026-10-06)_: more than 3 accounts from one IP hash in a week; two accounts that only ever duel each other; an account with no game handle after 7 days.
- [x] **Qualified-player counter** in the admin console _(2026-10-06, admin.html "Real players")_: new qualified this week, total, flagged (excluded).

### Acquisition rules (Flavien, 2026-10-06)

**Organic only.** Allowed: word of mouth, SEO, smart targeted social ads, GDPR-compliant email. No bought lists, no scraped contacts, no cold DM blasts, no fake reviews or bot traffic.
- **Email**: opt-in only (double opt-in), clear purpose, one-click unsubscribe, no list ever bought or scraped.
- **Social ads**: small budgets, tightly targeted (age 18+ only for ads, EU, LoL/Valorant interests), creative from the existing ad pages; every claim true; never betting vocabulary.
- **Communities**: follow each server's rules, post where promotion is allowed, partner with admins rather than spam.
- **Tone**: fun, bold, direct. Challenge people ("Think you're better than your duo? Prove it."), never casino hype.

### Week by week

| Week | Dates | Channel | New qualified | Total | Actual (review) |
|---|---|---|---|---|---|
| 0 | Oct 6 to 12 | **First checkpoint: 3 real players by Tue 2026-10-07 08:00** (Flavien). **Word of mouth, founders**: Flavien personally challenges 20 LoL/Valorant players he knows, in pairs. Meanwhile build the registry, flags and counter. | 20 | 20 | **0 known** (0 seen on Oct 10, 11, 12; Oct 6 to 9 not readable). Checkpoint of 3 by Oct 7 missed. Founders' 20 not run. Registry, flags, counter built. |
| 1 | Oct 13 to 19 | **Bring a rival**: every player gets a bold "call out your rival" duel link (the `?join=` QR share exists). Start an opt-in waitlist/newsletter on the landing (double opt-in). | 20 | 40 | **0** (0 accounts on every daily read, Oct 13 to 19). Nothing published, no rival links sent, waitlist not built (no visitors to collect). Daily registry summary and ledger check built in PR #12, not merged. |
| 2 | Oct 20 to 26 | **Communities + SEO**: duel nights with 3 EU gaming Discords and 2 student esports clubs (partnered with admins). Ship SEO pages per game ("LoL 1v1 duel", "défi Valorant 1v1") and fix meta/sitemap. | 20 | 60 | SEO pages shipped early: LoL + Valorant EN/FR (Oct 6 to 9), Dota 2 EN/FR + IndexNow in PR #11 |
| 3 | Oct 27 to Nov 2 | **Smart social ads + ambassadors**: first small targeted test (Instagram/TikTok, 18+, EU, LoL/Valorant) measured per qualified player; first 5 ambassadors with tracked invite links. | 20 | 80 | |

Focus games: LoL and Valorant first, because they are auto-verified, so results are trusted and disputes stay low.

## Decisions already made (do not re-open)

- CLU = internal credits (`CLU_USD_RATE` 0.10). Rails: NOWPayments (crypto) + Stripe (fiat). No hot wallet on the server.
- Settlement: API auto-verify for LoL / Valorant / Dota 2; score consensus (both report, match = pay, mismatch = dispute) for everything else. AI screenshot verification was tried and **dropped**.
- Fair-ban model: provisional disputes count against both (ban at 3); admin ruling gives the loser a confirmed fault (ban at 2) and exonerates the honest player.
- Free 500 CLU is playable, never cashable: withdrawals capped at net deposits.
- Ages: 16+ to play, 18+ for real money.
- Fee 2.5%, charged on any accepted duel that resolves (win, draw, dispute or no-show); a never-accepted duel cancels fully refunded.
- Terminology: **Challenge** = the open offer, **Duel** = the match. Never "bet", "wager", "odds", "stakes", "winner takes all", "casino".
- Main domain: clutch.best.
- Launch market: **Europe first**, free beta before real money (confirmed by Flavien 2026-10-05).

## Open questions only Flavien can answer

1. Incorporation country (Bulgaria / Estonia / Malta).
2. Publishing (2026-10-12): who posts the ready content (`creatives/content-plan-oct.md`) on which accounts, and from which date. Claude has no social accounts; nothing has been published, so acquisition has had no channel running.
3. Turn on Vercel Web Analytics (cookieless, allowed without consent per GROWTH.md section 4)? Today there is no visitor count at all.
4. Pace after two weeks at 0 qualified players (2026-10-19): keep +20/week (now 40 behind) or re-baseline the table from the first week a channel actually runs.

## Weekly review (every Monday)

1. Read the numbers: **new qualified players this week vs 20**, cost per player (CLU and cash) by channel, D7/D30 retention by cohort (GROWTH.md), flagged accounts excluded, weekly active, SDW, dispute rate, integrity check.
2. Tick what shipped in this file and in ROADMAP.md.
3. Pick the **3 highest-leverage tasks** for the current stage (bugs and money integrity first).
4. Write them under "This week" below.

## Review 2026-10-12 (week 0, Oct 6 to 12)

- **Qualified players: 0 known vs 20 target.** Registry logs (`registry.account` / `registry.qualified`) showed 0 new accounts in the 23 h before each read on Oct 10, 11 and 12; Oct 6 to 9 were not read (prod logs keep about 1 day), so those days are unknown. Flagged/excluded: 0 seen. Running total: **0 known**. Total API traffic on Oct 12 was about 20 log lines: the site has close to no visitors.
- **Stage metrics:** weekly active, settled duels/week and dispute rate: 0 seen on the days read, otherwise not measurable from here (admin `?view=players` not reachable from Claude's sandbox, no analytics). **Escrow invariant: not measurable yet**, the daily reconciliation check does not exist.
- **Shipped:** PR #7 (Oct 10, fake board challenges, hot-take %, news/clips removed; LoL mode copy fixed), PR #8 (Oct 10, honest landing: fact ticker, real stat cards, empty leaderboard invite, first-duel checklist, betting words replaced by Entry / duel total), PR #9 (Oct 10, Highlights: public feed of settled duels + Why Clutch cards), PR #10 (Oct 10, Telegram bot /start and shared duels in Telegram). Open: PR #11 (Dota 2 SEO pages EN+FR, IndexNow). Creatives recolored to brand palette, 5 content formats designed.
- **Off track:** week 0 at 0 of 20 (cumulative now 20 behind; table expects 40 by Oct 19); the 3-player checkpoint of Oct 7 was missed; Founders' 20 was not run. Stage 1 (Nov 2, 3 weeks left): no money-integrity item moved this week (Tier 1 env unconfirmed, Lua not tested on real Upstash, no idempotency keys, no reconciliation), no CI. 50 qualified by Nov 2 now needs about 17 per week from zero. On track or ahead: fabricated content removed, SEO pages (week 2 item) shipped early.
- **Blocker:** no social post published since the content was ready (Oct 10). Organic only, no spend, so cash cost per player is €0 and CLU cost is undefined (0 accounts, 0 qualified).

## Review 2026-10-19 (week 1, Oct 13 to 19)

- **Qualified players: 0 vs 20 target.** Registry log lines (`registry.account` / `registry.qualified`) read every morning Oct 13 to 19, 23 h each: 0 new accounts, 0 qualified, 0 flagged. Running total: **0 known** after two weeks, 40 behind the table.
- **Stage metrics:** weekly active, settled duels/week, dispute rate: 0 seen. **Escrow invariant: check built, not running** (PR #12, open and green since Oct 14).
- **Shipped:** PR #11 merged Oct 12 (Dota 2 SEO pages EN/FR, IndexNow key and script, week 0 review). PR #12 open: daily registry summary (log line, 90-day KV history, Telegram to founders) and daily ledger reconciliation; it also fixes a live bug where Upstash Lua error replies made the double-settle, refund and cancel guards throw instead of doing nothing. One Instagram post ready since Oct 11 (`creatives/posts-2026-10-11.md`).
- **Off track:** both weeks at 0. Stage 1 (Nov 2, 2 weeks left): 80 qualified by Nov 2 is out of reach from 0; Lua still not run on real Upstash, no idempotency keys, no CI. IndexNow ping not run (Claude's sandbox cannot reach the endpoint).
- **Root cause, unchanged:** no channel has run. Every channel in the table needs an account or a send from Flavien, and none happened. SEO is the only channel that runs without him, and it brings no measurable traffic yet. Cost per player: €0 cash, CLU undefined.

## This week (Oct 20 to 26)

1. **Money integrity: turn the invariant check on.** Flavien merges PR #12 and confirms on Vercel that `CRON_SECRET`, `TELEGRAM_BOT_TOKEN`, `ADMIN_TELEGRAM_CHAT_ID`, KV, `RIOT_API_KEY` and `STEAM_API_KEY` are set. Claude reads the first `audit.ledger.reconcile` line (target drift 0) and then handles Stripe refunds and chargebacks, which the ledger does not reverse yet.
2. **Acquisition, week 2 channel "Communities + SEO": one post and three admin messages.** Flavien publishes the ready Instagram post (`ref=ig-hottake`) and sends Claude's prepared message to the admins of 3 EU LoL/Valorant Discords, offering a free duel night. Flavien adds clutch.best to Google Search Console once and submits `/sitemap.xml`. Claude writes the Discord message and ships the next SEO page. Target: first qualified players; any number above 0 changes the plan.
3. **Change control: CI on every PR.** Claude adds a GitHub Actions workflow that runs every `tests/*.test.mjs` on pull requests (SECURITY.md #2). Flavien turns on branch protection for `main` (one setting).

Next: run `node tools/indexnow.mjs`; named admin accounts with MFA (SECURITY.md #1); idempotency keys on escrow; delete the unused `p2p.js`.
