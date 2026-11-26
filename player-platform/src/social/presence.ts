/**
 * Presence: who is online right now. EPHEMERAL on purpose: kept in memory with a TTL and never written to the database
 * (a stored "last online" is personal data with no use). One process only: with several instances the `PresenceStore`
 * interface is the seam for Redis (docs/PLATFORM_INFRASTRUCTURE.md).
 *
 *   - a client heartbeat (`PUT /v1/presence`, every ~30 s) says `online` or `away`; it expires after 90 s
 *   - `in_match` can ONLY be set by the match server's signed `matches/started` call (a client cannot claim it) and ends with
 *     `matches/finished` or after a hard cap
 */
import type { Clock } from '../util/clock';
import { MINUTE, SECOND } from '../util/clock';

export type PresenceStatus = 'online' | 'away' | 'in_match' | 'offline';
export const HEARTBEAT_TTL_MS = 90 * SECOND;
export const MATCH_PRESENCE_CAP_MS = 3 * 60 * MINUTE;
const MAX_ENTRIES = 200_000;

interface Entry {
  status: 'online' | 'away';
  until: number;
  matchId: string | null;
  matchUntil: number;
  lastSeen: number;
}

export interface PresenceStore {
  heartbeat(playerId: string, status: 'online' | 'away'): void;
  /** Any authenticated activity: keeps `lastSeen` fresh (a party does not drop an active player) without claiming a status. */
  touch(playerId: string): void;
  setInMatch(playerId: string, matchId: string): void;
  clearMatch(playerId: string, matchId?: string): void;
  get(playerId: string): PresenceStatus;
  /** When the player was last heard from at all, even if their heartbeat has expired; null if never (since this process started). */
  lastSeen(playerId: string): number | null;
  forget(playerId: string): void;
}

export function createPresenceStore(clock: Clock): PresenceStore {
  const map = new Map<string, Entry>();
  const now = (): number => clock().getTime();
  const entry = (id: string): Entry => {
    let e = map.get(id);
    if (!e) {
      if (map.size >= MAX_ENTRIES) {
        // bounded: forget the entries that expired longest ago first (Map keeps insertion order)
        let n = 0;
        for (const [k, v] of map) {
          if (v.until < now() && v.matchUntil < now()) map.delete(k);
          if (++n > 1000) break;
        }
      }
      e = { status: 'online', until: 0, matchId: null, matchUntil: 0, lastSeen: 0 };
      map.set(id, e);
    }
    return e;
  };
  return {
    heartbeat(id, status) {
      const e = entry(id);
      e.status = status;
      e.until = now() + HEARTBEAT_TTL_MS;
      e.lastSeen = now();
    },
    touch(id) {
      entry(id).lastSeen = now();
    },
    setInMatch(id, matchId) {
      const e = entry(id);
      e.matchId = matchId;
      e.matchUntil = now() + MATCH_PRESENCE_CAP_MS;
      e.lastSeen = now();
    },
    clearMatch(id, matchId) {
      const e = map.get(id);
      if (e && (matchId === undefined || e.matchId === matchId)) {
        e.matchId = null;
        e.matchUntil = 0;
      }
    },
    get(id) {
      const e = map.get(id);
      if (!e) return 'offline';
      if (e.matchId !== null && e.matchUntil > now()) return 'in_match';
      return e.until > now() ? e.status : 'offline';
    },
    lastSeen: (id) => map.get(id)?.lastSeen || null,
    forget: (id) => void map.delete(id),
  };
}
