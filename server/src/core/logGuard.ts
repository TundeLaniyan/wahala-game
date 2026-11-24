/**
 * Log-volume guard (decision FU2S-C3, Ops finding "an oversized frame logs a full stack trace per frame"): the transport and
 * Colyseus print some per-client errors straight to the console (a 4 KB frame limit hit by a hostile client, a refused
 * reconnect ...). A hostile client could make those lines as frequent as it can send frames. The limiter lets each distinct
 * message (keyed by its first line) through `burst` times per window and then counts the rest, printing one "N more like it"
 * line when the window ends. Pure: time and sink are injected. `installConsoleLimiter` applies it to `console.error` /
 * `console.warn` of the server process (main.ts only: library and tests keep the plain console).
 */
export interface LogLimiter {
  /** Returns the line to print, or null when it is suppressed. */
  admit(key: string): { print: true; suppressedBefore: number } | { print: false };
}

export function createLogLimiter(
  burst: number,
  windowMs: number,
  now: () => number,
  maxKeys = 200,
): LogLimiter {
  const seen = new Map<string, { at: number; n: number; suppressed: number }>();
  return {
    admit(key) {
      const t = now();
      let e = seen.get(key);
      if (!e || t - e.at >= windowMs) {
        const suppressedBefore = e?.suppressed ?? 0;
        if (!e && seen.size >= maxKeys) seen.delete(seen.keys().next().value as string);
        seen.set(key, (e = { at: t, n: 0, suppressed: 0 }));
        e.n = 1;
        return { print: true, suppressedBefore };
      }
      if (e.n < burst) {
        e.n++;
        return { print: true, suppressedBefore: 0 };
      }
      e.suppressed++;
      return { print: false };
    },
  };
}

type Writer = (...args: unknown[]) => void;

export function installConsoleLimiter(burst = 5, windowMs = 10_000): () => void {
  const limiter = createLogLimiter(burst, windowMs, () => Date.now());
  const originals = { error: console.error, warn: console.warn };
  const wrap =
    (name: 'error' | 'warn'): Writer =>
    (...args) => {
      const first = String(args[0] ?? '')
        .split('\n')[0]!
        .slice(0, 120);
      const r = limiter.admit(`${name}:${first}`);
      if (r.print) {
        if (r.suppressedBefore > 0)
          originals[name](`[rumble] ${r.suppressedBefore} more like "${first}" were suppressed`);
        originals[name](...args);
      }
    };
  console.error = wrap('error');
  console.warn = wrap('warn');
  return () => {
    console.error = originals.error;
    console.warn = originals.warn;
  };
}
