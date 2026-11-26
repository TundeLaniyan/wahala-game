/**
 * Where the platform session lives on this device: ONE localStorage key, `wahala.platform.v1`, holding the opaque access and
 * refresh tokens the platform issued (docs/PLATFORM_CLIENT.md). Every storage access is wrapped: a private window, blocked
 * site data or a full quota keep the session in memory for this page instead (the guest then lasts until the tab closes).
 * Nothing else is stored, and nothing here runs until the player opens the Online screen of a platform build.
 */
import type { Tokens } from './types';

export const PLATFORM_STORAGE_KEY = 'wahala.platform.v1';

export interface StoredSession {
  v: 1;
  accessToken: string;
  accessExpiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
}

/** The minimal storage this module needs (`localStorage` has it). */
export interface KeyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface TokenStore {
  /** The current session, read fresh each time (another tab of this site may have rotated it). */
  get(): StoredSession | null;
  set(tokens: Tokens | StoredSession): void;
  clear(): void;
  /** True while the session lives only in memory (storage unavailable). */
  readonly memoryOnly: boolean;
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 400;

/** Parses what the key holds; anything malformed reads as "no session". */
export function parseSession(raw: string | null): StoredSession | null {
  if (raw === null) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (
      o?.v === 1 &&
      isStr(o.accessToken) &&
      isStr(o.refreshToken) &&
      typeof o.accessExpiresAt === 'string' &&
      typeof o.refreshExpiresAt === 'string'
    )
      return {
        v: 1,
        accessToken: o.accessToken,
        accessExpiresAt: o.accessExpiresAt,
        refreshToken: o.refreshToken,
        refreshExpiresAt: o.refreshExpiresAt,
      };
  } catch {
    /* not JSON */
  }
  return null;
}

const toStored = (t: Tokens | StoredSession): StoredSession => ({
  v: 1,
  accessToken: t.accessToken,
  accessExpiresAt: t.accessExpiresAt,
  refreshToken: t.refreshToken,
  refreshExpiresAt: t.refreshExpiresAt,
});

/**
 * A token store over `storage` (a getter, so a page whose storage throws on access is handled the same way). While the last
 * write to storage succeeded, storage is the truth (so a rotation by another tab is seen); once a write fails, the session is
 * kept in memory for the rest of the page.
 */
export function createTokenStore(storage: () => KeyStorage | null): TokenStore {
  let memory: StoredSession | null = null;
  let storageOk = true;
  const st = (): KeyStorage | null => {
    try {
      return storage();
    } catch {
      return null;
    }
  };
  return {
    get memoryOnly() {
      return !storageOk;
    },
    get(): StoredSession | null {
      if (!storageOk) return memory;
      try {
        const s = st();
        if (!s) {
          storageOk = false;
          return memory;
        }
        return parseSession(s.getItem(PLATFORM_STORAGE_KEY));
      } catch {
        storageOk = false;
        return memory;
      }
    },
    set(tokens) {
      memory = toStored(tokens);
      try {
        const s = st();
        if (!s) throw new Error('no storage');
        s.setItem(PLATFORM_STORAGE_KEY, JSON.stringify(memory));
        storageOk = true;
      } catch {
        storageOk = false;
      }
    },
    clear() {
      memory = null;
      try {
        st()?.removeItem(PLATFORM_STORAGE_KEY);
      } catch {
        /* nothing stored, nothing to remove */
      }
    },
  };
}

/** The browser's localStorage, or null when the page may not use it (reading the property itself can throw). */
export function browserStorage(): KeyStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
