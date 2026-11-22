/**
 * Test Lab save isolation (docs/TEST_LAB.md, decision TL2). Every persisted thing in the game (the campaign save, the
 * saved settings, the audio preferences, the Academy and onboarding flags, the learned graphics rung) reaches the browser
 * through `window.localStorage`. In the Test Lab that object is replaced, before any game module reads it, by an
 * in-memory store for this page session: every write lands in a `Map` and dies with the page. The one exception is the
 * Test Lab's own feedback key, which is passed through to the real storage.
 */
import { FEEDBACK_KEY } from './feedbackKey';

/** The slice of `Storage` the game (and the Test Lab) use. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface IsolatedStorage extends StorageLike {
  clear(): void;
  key(index: number): string | null;
  readonly length: number;
  /** The in-memory contents (tests and the debug view). */
  dump(): Record<string, string>;
}

/** An in-memory store; `passthrough` keys are read and written on `real` instead (null real = memory too). */
export function createIsolatedStorage(
  real: StorageLike | null,
  passthrough: readonly string[] = [FEEDBACK_KEY],
): IsolatedStorage {
  const map = new Map<string, string>();
  const through = (key: string): boolean => real !== null && passthrough.includes(key);
  return {
    getItem(key) {
      if (through(key)) {
        try {
          return real!.getItem(key);
        } catch {
          return null;
        }
      }
      return map.get(key) ?? null;
    },
    setItem(key, value) {
      if (through(key)) {
        real!.setItem(key, String(value)); // may throw (quota): the caller handles it like any storage failure
        return;
      }
      map.set(key, String(value));
    },
    removeItem(key) {
      if (through(key)) {
        try {
          real!.removeItem(key);
        } catch {
          /* storage unavailable */
        }
        return;
      }
      map.delete(key);
    },
    clear: () => map.clear(),
    key: (index) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
    dump: () => Object.fromEntries(map),
  };
}

export interface Isolation {
  /** True when `win.localStorage` is now the in-memory store (false: the swap failed, the Test Lab refuses to start tests). */
  ok: boolean;
  storage: IsolatedStorage;
}

let installed: Isolation | null = null;

/** The isolation installed on this page (null outside the Test Lab). */
export function currentIsolation(): Isolation | null {
  return installed;
}

function realStorageOf(win: { localStorage?: unknown }): StorageLike | null {
  try {
    return (win.localStorage as StorageLike | undefined) ?? null;
  } catch {
    return null; // blocked storage: feedback then lives in memory too
  }
}

/** Replaces `win.localStorage` with an in-memory store (once). Run before any other game module is evaluated. */
export function installIsolation(win: { localStorage?: unknown }): Isolation {
  if (installed) return installed;
  const real = realStorageOf(win);
  const storage = createIsolatedStorage(real);
  let ok: boolean;
  try {
    Object.defineProperty(win, 'localStorage', { configurable: true, enumerable: true, get: () => storage });
    ok = (win.localStorage as unknown) === storage;
  } catch {
    ok = false;
  }
  installed = { ok, storage };
  return installed;
}

/** Test seam: forget the installed isolation (unit tests only). */
export function resetIsolationForTests(): void {
  installed = null;
}
