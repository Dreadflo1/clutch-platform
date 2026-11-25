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
| 2 | **Change management** (change control) | most changes now go through PRs but nothing enforces it; 3 test files in `tests/` (registry 2026-10-06, recent feed + Telegram 2026-10-10), no escrow/settle/payments suites, no CI, no branch protection (checked 2026-10-12) | branch protection, PR required, CI runs tests on every PR | 1 |
| 3 | **Dependency and secret scanning** (vulnerability management) | none | Dependabot + GitHub secret scanning | 1 |
| 4 | **Backups and restore test** (availability) | none for KV | daily KV export, one restore drill per quarter | 2 |
| 5 | **Monitoring and alerts** (monitoring) | logs only | alerts on negative balances, escrow drift, auth-failure spikes, dispute spikes | 2 |
| 6 | **Incident response plan** (incident management) | none | one-page plan: who, how to contain, GDPR 72-hour breach notice | 2 |
| 7 | **Data inventory and retention** (privacy, confidentiality) | not written | list of personal data, where stored, how long, who can see it | 2 |
| 8 | **Vendor register** (vendor management) | not written | vendors, their SOC 2 / DPA, what data they hold | 2 |
| 9 | **Policies** (governance) | none | security, access, change, incident policies (short, real) | 3 |
| 10 | **Access reviews + evidence collection** | none | quarterly access review; evidence collected by a compliance tool before the audit | 3 |

Each item ticked here gets a date, like ROADMAP.md.

_Review 2026-10-12: no control closed this week. Next up: #2 (CI + branch protection), then #1 (named admins + MFA)._

## Application security audit (2026-11-25)

Checked against a 17-point checklist; fixes in the "Security hardening" PR. Tests: `npm test` (tests/security.test.mjs).

| # | Control | Result | How it holds |
|---|---|---|---|
| 1 | API keys hidden | Pass (fixed) | Keys only in Vercel env vars, used by `/api`. `config.js` no longer has key/secret slots; a test fails if one comes back. |
| 2 | No secrets in git | Pass | Full history (all branches) scanned 2026-11-25: none. The IndexNow key file is public by design. |
| 3 | Public DB key only on client | Pass | The browser never talks to Redis; only the API does, with the server token. |
| 4 | Row-level security | N/A (Redis) | Every user key is built from the verified JWT `sub`, never from request input. |
| 5 | Sensitive data encrypted | Pass (fixed) | Emails and dates of birth sealed with AES-256-GCM (`api/_crypto.js`); older plaintext upgraded on login. Passwords hashed, IPs salted-hashed. |
| 6 | Server-side auth | Pass | Every private route calls `requireAuth`; admin/cron use `authorizeBearer` (constant-time, fail-closed on previews, failures capped). Public reads are deliberate and rate limited. |
| 7 | Record access | Pass | Balance, transactions, accounts, settle and cancel only touch the caller's records. |
| 8 | Field tampering | Pass (fixed) | Writable fields whitelisted; `creatorWins` now from server stats, `challengeType` whitelisted, amounts integers, expiry clamped. |
| 9 | Session cookies | Partial | The OAuth flow cookies are HttpOnly + Secure + SameSite=Lax. The session itself is a bearer token in localStorage, not a cookie. |
| 10 | Password hashing | Pass (fixed) | scrypt N=32768 (was 16384; old hashes upgrade on login), constant-time compare. |
| 11 | Login rate limit | Pass (fixed) | 20/min per IP, 8 failed logins per account per 10 min (now atomic). |
| 12 | Bot protection | Pass (fixed, basic) | Honeypot field and 5 new accounts per IP per hour on email and wallet signup. No CAPTCHA yet. |
| 13 | Parameterized queries | Pass | Upstash REST commands are JSON arrays; Lua scripts are constants fed through KEYS/ARGV. |
| 14 | Input validation | Pass (fixed) | Safe JSON parsing (400, not a crash), shape checks on ids, handles, match ids, addresses. |
| 15 | User content escaped | Pass (fixed) | Display names cleaned server-side; board and leaderboard escape on render. CSP still allows inline scripts. |
| 16 | File upload limits | N/A | No uploads reach the server (proof images stay in the browser). |
| 17 | Trimmed API responses | Pass (fixed) | Public board no longer returns user ids or HMACs; no hashes or emails in any response. |
