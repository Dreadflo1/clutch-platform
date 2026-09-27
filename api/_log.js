/**
 * Structured security/audit logging.
 *
 * Serverless has no long-lived process to host an APM agent, but Vercel captures
 * stdout per invocation. Emitting one-line JSON events makes them greppable and
 * alertable in the Vercel dashboard (and any log drain) without extra infra.
 *
 * Log security-relevant events (auth failures, rate-limit breaches, money
 * movements, admin actions, disputes/bans) — never secrets, tokens, passwords,
 * card numbers, or full request bodies.
 */

function emit(level, event, fields) {
  const line = Object.assign({ t: new Date().toISOString(), lvl: level, evt: event }, fields || {});
  try {
    const s = JSON.stringify(line);
    if (level === 'warn' || level === 'error') console.warn(s); else console.log(s);
  } catch {
    // Never let logging throw into a request path.
  }
}

/** Security event (auth failure, rate limit, ban, admin action). Level: warn. */
export function securityLog(event, fields) { emit('warn', 'sec.' + event, fields); }

/** Audit event (money moved, dispute resolved). Level: info. */
export function auditLog(event, fields) { emit('info', 'audit.' + event, fields); }
