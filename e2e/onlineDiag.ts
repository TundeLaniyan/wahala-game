/**
 * Browser-side diagnostics for the online e2e (docs/CITY_RUMBLE_ONLINE.md section 7.9, decision FU2S-C5): what a
 * starved browser or a closing socket looked like from the PAGE. Installed with `context.addInitScript` before any page
 * script runs. It records, in `window.__diag`:
 *   - every WebSocket (query string removed: it carries the session id and the reconnection token): opened / closed
 *     times, close code and reason, whether the close was clean;
 *   - main-thread long tasks (PerformanceObserver `longtask`, >= 200 ms) and animation-frame gaps >= 1 s, i.e. how long
 *     the page itself was unable to run (software WebGL on a busy machine).
 * Nothing here changes behaviour: it only observes.
 */
import type { Page } from '@playwright/test';

export const DIAG_SCRIPT = `(() => {
  const d = (window.__diag = { t0: Date.now(), ws: [], long: [], gaps: [] });
  const at = () => Date.now() - d.t0;
  const Orig = window.WebSocket;
  window.WebSocket = new Proxy(Orig, {
    construct(target, args) {
      const ws = new target(...args);
      const rec = { url: String(args[0]).replace(/\\?.*$/, ''), reconnect: /reconnectionToken/.test(String(args[0])), open: null, close: null, code: null, reason: '', clean: null };
      d.ws.push(rec);
      ws.addEventListener('open', () => { rec.open = at(); });
      ws.addEventListener('close', (e) => { rec.close = at(); rec.code = e.code; rec.reason = e.reason; rec.clean = e.wasClean; });
      return ws;
    },
  });
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (e.duration >= 200 && d.long.length < 400) d.long.push({ at: Math.round(e.startTime), ms: Math.round(e.duration) });
    }).observe({ entryTypes: ['longtask'] });
  } catch { /* longtask unsupported */ }
  let last = performance.now();
  const frame = (now) => {
    if (now - last >= 1000 && d.gaps.length < 400) d.gaps.push({ at: Math.round(last), ms: Math.round(now - last) });
    last = now;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
})();`;

export interface PageDiag {
  t0: number;
  ws: {
    url: string;
    reconnect: boolean;
    open: number | null;
    close: number | null;
    code: number | null;
    reason: string;
    clean: boolean | null;
  }[];
  long: { at: number; ms: number }[];
  gaps: { at: number; ms: number }[];
}

/** The page's diagnostics (null if the page has none or is gone). */
export async function readDiag(page: Page): Promise<PageDiag | null> {
  return page
    .evaluate(() => (window as unknown as { __diag?: unknown }).__diag ?? null)
    .then((d) => d as PageDiag | null)
    .catch(() => null);
}

/** One readable block: sockets with close codes, the worst long tasks and frame gaps. */
export function summariseDiag(name: string, d: PageDiag | null): string {
  if (!d) return `${name}: no diagnostics`;
  const sec = (ms: number | null): string => (ms === null ? '-' : `${(ms / 1000).toFixed(1)}s`);
  const ws = d.ws.map(
    (w, i) =>
      `  ws#${i}${w.reconnect ? ' (reconnect)' : ''} open ${sec(w.open)} close ${sec(w.close)} code ${w.code ?? '-'} "${w.reason}" clean ${w.clean ?? '-'}`,
  );
  const worst = (xs: { at: number; ms: number }[]): string =>
    xs
      .slice()
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 5)
      .map((x) => `${x.ms} ms at ${sec(x.at)}`)
      .join(', ') || 'none';
  return [
    `${name}: ${d.ws.length} socket(s), ${d.long.length} long tasks, ${d.gaps.length} frame gaps >= 1 s`,
    ...ws,
    `  worst long tasks: ${worst(d.long)}`,
    `  worst frame gaps: ${worst(d.gaps)}`,
  ].join('\n');
}

/** Largest main-thread block and frame gap seen by the page, in ms (the starvation figure). */
export function worstStall(d: PageDiag | null): { longTaskMs: number; frameGapMs: number } {
  return {
    longTaskMs: Math.max(0, ...(d?.long.map((x) => x.ms) ?? [])),
    frameGapMs: Math.max(0, ...(d?.gaps.map((x) => x.ms) ?? [])),
  };
}
