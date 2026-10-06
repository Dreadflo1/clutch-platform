# Clutch — Security and SOC 2 readiness

_Set 2026-10-06 · companion to [STRATEGY.md](STRATEGY.md)_

## What SOC 2 actually is

SOC 2 is not something code can "be". It is an **audit report** by an independent accredited auditor (a CPA firm) on whether our controls work: **Type I** checks them at one date, **Type II** checks they worked over a period (usually 3 to 12 months). So the path is: put the controls in place now, keep evidence automatically, and book the audit when a partner, payment provider or investor asks for it (expected around Stage 3).

Until then we say "built to SOC 2 controls", never "SOC 2 compliant" or "certified" (that would be a red flag).

## Already in place (from the code)

- Secrets only in environment variables; prod fails loudly if the database or secrets are missing.
- HTTPS everywhere, HSTS, strict CSP, no framing, security headers (`vercel.json`).
- Rate limiting shared across instances on auth, money and duel endpoints (`api/_ratelimit.js`).
- Structured audit logs for auth failures, bans, withdrawals and dispute rulings, never logging secrets (`api/_log.js`).
- Atomic, idempotent balance changes; free CLU never cashable.
- Admin endpoints and cron refuse to run in prod without their secret.
- Vendors that publish SOC 2 reports: Vercel, Stripe, Upstash. NOWPayments: to check.

## Gaps, in priority order

| # | Control (SOC 2 area) | Today | To do | Stage |
|---|---|---|---|---|
| 1 | **Individual admin access + MFA** (access control) | one shared `ADMIN_SECRET` for everyone | named admin accounts, MFA, roles (referee vs payouts), every admin action logged with who did it | 1 |
| 2 | **Change management** (change control) | pushes straight to main, no tests in repo, no CI | branch protection, PR required, CI runs tests on every PR | 1 |
| 3 | **Dependency and secret scanning** (vulnerability management) | none | Dependabot + GitHub secret scanning | 1 |
| 4 | **Backups and restore test** (availability) | none for KV | daily KV export, one restore drill per quarter | 2 |
| 5 | **Monitoring and alerts** (monitoring) | logs only | alerts on negative balances, escrow drift, auth-failure spikes, dispute spikes | 2 |
| 6 | **Incident response plan** (incident management) | none | one-page plan: who, how to contain, GDPR 72-hour breach notice | 2 |
| 7 | **Data inventory and retention** (privacy, confidentiality) | not written | list of personal data, where stored, how long, who can see it | 2 |
| 8 | **Vendor register** (vendor management) | not written | vendors, their SOC 2 / DPA, what data they hold | 2 |
| 9 | **Policies** (governance) | none | security, access, change, incident policies (short, real) | 3 |
| 10 | **Access reviews + evidence collection** | none | quarterly access review; evidence collected by a compliance tool before the audit | 3 |

Each item ticked here gets a date, like ROADMAP.md.
