/**
 * The key-value storage port shared by the offline save systems (campaign, progression). It is structurally the
 * same as `localStorage`, so the browser store and a `Map`-backed test store are interchangeable. Nothing here
 * touches the network.
 */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** An in-memory store (tests, private mode fallback). */
export function memoryStore(
  initial: Record<string, string> = {},
): KeyValueStore & { dump(): Record<string, string> } {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    dump: () => Object.fromEntries(map),
  };
}

/** window.localStorage as a store, or null when it is missing or blocked (private mode, site data off). */
export function browserKeyValueStore(): KeyValueStore | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const probe = '__wahala_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}
