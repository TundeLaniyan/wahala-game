/**
 * Small React hooks of the online screens. Every timer they start is cleared when the screen goes away.
 */
import { useEffect, useRef, useState } from 'react';

/** The current clock reading, refreshed every `everyMs` while `active` (no timer at all when it is not). */
export function useNow(active: boolean, everyMs = 250): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!active) return;
    setNow(performance.now());
    const id = setInterval(() => setNow(performance.now()), everyMs);
    return () => clearInterval(id);
  }, [active, everyMs]);
  return now;
}

/** Calls `fn` once after `ms` while `key` is set (a notice that dismisses itself); cleared on change and on unmount. */
export function useTimeout(key: unknown, ms: number, fn: () => void): void {
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => {
    if (key === null || key === undefined || key === false) return;
    const id = setTimeout(() => latest.current(), ms);
    return () => clearTimeout(id);
  }, [key, ms]);
}

/** A short-lived "Copied" mark: `flash(id)` sets it, it clears itself, and unmounting clears the timer. */
export function useFlash(ms = 1800): [string | null, (id: string) => void] {
  const [id, setId] = useState<string | null>(null);
  useTimeout(id, ms, () => setId(null));
  return [id, setId];
}
