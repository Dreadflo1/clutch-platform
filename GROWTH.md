# Clutch — Growth: unit economics, retention, playbook, tracking

_Set 2026-10-06 · companion to [STRATEGY.md](STRATEGY.md) · rules: organic only, GDPR-compliant, fun bold tone_

## 1. Cost to acquire a player (CAC)

Two costs, tracked per week and per channel, always divided by **qualified** players (see STRATEGY.md), never by sign-ups.

| Metric | Formula | Target (starting hypothesis) |
|---|---|---|
| **CLU cost per player** | CLU granted to all new accounts that week (500 each, incl. ones that never qualify) + CLU referral rewards ÷ new qualified players | ≤ 750 CLU (means ≥ 2 of 3 sign-ups qualify) |
| **Cash cost per player** | ad spend + ambassador cash rewards + paid tools ÷ new qualified players | €0 in weeks 0 to 2; ≤ €5 in the first ad test, stop any channel above €10 |
| **Qualify rate** | new qualified ÷ new accounts | ≥ 66% |

Why CLU counts as a cost even though it is free: the 500 CLU is never cashable (withdrawals are capped at net deposits), so it costs no cash today, but every farmed or abandoned account inflates it. A rising CLU cost per player is the first sign of fraud or a leaky onboarding.

Once real money opens (Stage 3), add **payback**: fee revenue per player over their lifetime (LTV) ÷ cash CAC, target **≥ 3**.

## 2. How long players stay (retention)

Measured by cohort (week of first duel) and by channel.

| Metric | Definition | Target |
|---|---|---|
| **D7 return** | played another duel in the 7 days after their first | ≥ 40% |
| **D30 active** | played a duel between day 23 and day 30 | ≥ 20% |
| **Player lifetime** | days between first and last duel (median) | grows every month |
| **Duels per active player per week** | settled duels ÷ weekly active players | ≥ 2 |

A channel that brings players who don't come back is cut, even if its CAC is low.

## 3. Growth playbook (proven techniques, applied ethically)

Each item names the principle it uses. None of them may use fake data, fake urgency, or gambling-style hooks.

1. **Every duel is a referral** (viral loop, the Dropbox/PayPal model). A duel needs two people, so "Challenge a friend" is the core action, not an extra. Reward both players with a **badge** when the invited friend qualifies; badges already exist (`api/_badges.js`). No CLU rewards for invites, which would invite farming.
2. **Founders' 50** (scarcity, reciprocity): the first 50 qualified players get a permanent Founder badge. True scarcity, stated honestly.
3. **First duel in 10 minutes** (commitment and consistency, activation): sign up, pick a game, link the Riot ID, challenge a friend, in one guided flow. Measure time from sign-up to first duel.
4. **Rivalry and status** (competence, social identity): rematch button, head-to-head record, Clutch Score and cohorts (already built). People come back to beat a specific person, not a platform.
5. **Peak-end share card** (peak-end rule, social proof): after a win, a bold auto-generated card ("Took down @rival 2-0 on CLUTCH") to post. Only real results.
6. **Real social proof only**: live counters ("142 duels settled this week") switched on only when numbers are real and decent. Never seeded.
7. **Rituals** (habit loop): a weekly Duel Night per partner community, same day and time.
8. **Opt-in reminders** (re-engagement): "your rival wants a rematch" via email or Telegram, only for people who opted in.

Never: near-miss effects, loss-chasing prompts, streak pressure tied to spending, countdowns that aren't real, targeting anyone under 18 with ads.

## 4. Tracking and data (what is allowed under GDPR)

| Allowed without consent | Needs opt-in consent first | Not allowed |
|---|---|---|
| Our own product events stored server-side: sign-up, game ID linked, duel created, duel settled (this is the service itself) | Meta / TikTok / Google ad pixels and retargeting | Hidden pixels in images or emails without consent |
| Cookieless audience measurement (Vercel Web Analytics, or self-hosted Plausible/Umami) | Email open-tracking pixels | Device fingerprinting for marketing |
| Campaign links (`?utm_source=`, `?ref=`) saved on the account at sign-up for attribution | Server-side conversions API (only for consenting users) | Pinpointing a person's location, buying or scraping data |
| Hashed IP for fraud detection only, short retention, documented | | Profiling or ad targeting of 16–17 year olds |

To build: a consent banner (accept and reject equally visible), the CSP updated for any third party, a privacy policy listing every tool, and a retention rule per data type.

## 5. Weekly growth numbers (reported in the Monday review)

New qualified players vs 20 · qualify rate · CLU and cash cost per player, by channel · D7 return of last week's cohort · D30 of the cohort a month ago · best and worst channel, and what to change.
