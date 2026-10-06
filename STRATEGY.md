# Clutch — Strategy & Goals

_Set 2026-10-05 · review every Monday · owner: Flavien_
_Companion to [ROADMAP.md](ROADMAP.md) (the engineering backlog). This file says **why** and **what number we are chasing**; the roadmap says **how**._

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
- [ ] Demo/fake content isolated behind `DEMO_MODE` (no fabricated feed, polls or stats in prod)
- [ ] Commit the offline test suites (escrow, settle, integrity, payments — today run ad hoc, none in the repo) + GitHub Actions CI on every push
- **Exit numbers:** 50 **qualified players** (see Player acquisition below) · 100 settled duels · dispute rate < 5% · 0 integrity incidents

### Stage 2 — Community traction · target **2026-12-31**
Goal: duels happen without Flavien personally recruiting each player.

- [ ] Ambassador program live (HQ deployed, apply flow → Discord/Telegram intake)
- [ ] Acquisition kit in use: ad pages (Instagram, Telegram, WhatsApp, teaser), share-link / QR deep links
- [ ] Game-account ownership proof (close the self-declared handle gap, ROADMAP Phase 2)
- [ ] Basic funnel analytics: visit → sign-up → first duel → second duel
- **Exit numbers:** _at +20/week this lands near 230 qualified by Dec 31; 500 needs about +50/week from November (decision pending)_ · 500 registered · 150 weekly active players · **SDW ≥ 250** · 40% of new players duel twice within 7 days · 20 active ambassadors

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

Pace set by Flavien 2026-10-06: **+20 new qualified players every week**, fraud and bots excluded.
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
- [ ] **Player registry**: every sign-up path (email, wallet, Telegram, Discord) writes the account to one index with method, date and a hashed IP. Today there is no list of accounts at all, so nothing can be counted.
- [ ] **Multi-account flags**: more than 3 accounts from one IP hash in a week; two accounts that only ever duel each other; an account with no game handle after 7 days.
- [ ] **Qualified-player counter** in the admin console: new qualified this week, total, flagged (excluded).

### Week by week

| Week | Dates | Channel | New qualified | Total |
|---|---|---|---|---|
| 0 | Oct 6 to 12 | Build the registry, flags and counter; Tier 1 env live. Founders' 20: Flavien invites 20 people he knows who play LoL or Valorant, paired up so each has an opponent. | 20 | 20 |
| 1 | Oct 13 to 19 | **Bring a rival**: each player sends a duel link (the `?join=` QR share already exists) to one friend. A duel needs two people, so this is the built-in loop. | 20 | 40 |
| 2 | Oct 20 to 26 | **Communities**: 3 French/EU gaming Discords and 2 student esports clubs, using the Telegram/Instagram ad pages; one hosted duel night per community. | 20 | 60 |
| 3 | Oct 27 to Nov 2 | **Ambassadors**: first 5 ambassadors open the HQ apply flow; each brings 4 players with a tracked invite link. | 20 | 80 |

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

## Weekly review (every Monday)

1. Read the numbers: **new qualified players this week vs 20**, flagged accounts excluded, weekly active, SDW, dispute rate, integrity check.
2. Tick what shipped in this file and in ROADMAP.md.
3. Pick the **3 highest-leverage tasks** for the current stage (bugs and money integrity first).
4. Write them under "This week" below.

## This week

1. Confirm Tier 1 env on Vercel + run the balance/escrow scripts against real Upstash.
2. Build the player registry, multi-account flags and the qualified-player counter (nothing can be counted without them).
3. Founders' 20: Flavien invites 20 LoL/Valorant players he knows, in pairs.

Next: commit the test suites + CI, then `DEMO_MODE`.
