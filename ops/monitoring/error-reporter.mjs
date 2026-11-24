/**
 * Crash / error reporter loaded with `node --import ./error-reporter.mjs rumble-server.mjs` (Docker:
 * NODE_OPTIONS=--import=/app/error-reporter.mjs). It adds error reporting WITHOUT touching the server's code:
 *   - an uncaught exception or unhandled rejection is written as one JSON line to stderr, posted to ERROR_WEBHOOK_URL
 *     (if set; a secret, environment only), and the process exits 1 so the supervisor restarts it. Exiting is
 *     deliberate: after an uncaught exception the state is unknown, and one restart is cheaper than a corrupt match.
 *   - reports are rate-limited and carry no player data (no names, no room codes, no tokens): message, stack, versions.
 * A hosted tool (Sentry, free tier) can replace it later by wiring its SDK in server/src/main.ts (Architecture's file).
 */
const url = process.env.ERROR_WEBHOOK_URL ?? '';
let lastSent = 0;

async function report(kind, err) {
  const e = err instanceof Error ? err : new Error(String(err));
  // room codes (6 chars of the code alphabet) and long hex / base64-ish tokens are scrubbed from anything we ship
  const scrub = (s) => String(s ?? '').replace(/\b[A-HJ-NP-Z2-9]{6}\b/g, '<code>').replace(/[A-Za-z0-9_-]{20,}/g, '<token>');
  const payload = { at: new Date().toISOString(), kind, name: e.name, message: scrub(e.message), stack: scrub(e.stack).split('\n').slice(0, 8), node: process.version, uptimeSec: Math.round(process.uptime()) };
  console.error(JSON.stringify({ level: 'fatal', ...payload }));
  if (url && Date.now() - lastSent > 10_000) {
    lastSent = Date.now();
    try {
      await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: `[FATAL] wahala-rumble ${kind}: ${payload.name}: ${payload.message}` }), signal: AbortSignal.timeout(3000) });
    } catch {
      /* the log line above is the fallback */
    }
  }
}

for (const kind of ['uncaughtException', 'unhandledRejection']) {
  process.on(kind, async (err) => {
    await report(kind, err);
    process.exit(1);
  });
}
