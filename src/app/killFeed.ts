/**
 * The kill feed (decision HC1): every elimination and assist notice, in one list in the HUD rail beside the board
 * (ui/KillFeed.tsx), never as a toast and never over the board. Pure functions of the sim state (read-only) and
 * of the clock the caller passes in; nothing here changes a rule.
 *
 *  - Lines read "YOU ELIMINATED <name>", "<name> ELIMINATED YOU", "<a> ELIMINATED <b>", "<name> WAS ELIMINATED"
 *    (nobody is credited) and "ASSIST ON <name>", each with a cause word (BLAST, VEHICLE, CRUSH, HAZARD, CROWD,
 *    SUDDEN DEATH, OWN BLAST, FRIENDLY FIRE, SIDELINE).
 *  - The local player's kills, deaths and assists always show and live a little longer (`KILL_FEED_TTL_MS`).
 *  - With many competitors (City Rumble) everybody else's kills are LOW PRIORITY: at most one per
 *    `KILL_FEED_OTHER_GAP_MS`, they expire sooner and always give way to the local player's lines.
 *  - Newest first, at most `KILL_FEED_MAX` lines.
 */
import type { EliminationCause, GameState, Player } from '../sim';

export const KILL_FEED_MAX = 4;
/** How long a line about the local player stays (ms). */
export const KILL_FEED_TTL_MS = 4000;
/** How long a line about two other fighters stays (ms). */
export const KILL_FEED_OTHER_TTL_MS = 2600;
/** With many competitors, other fighters' lines are let in at most this often (ms). */
export const KILL_FEED_OTHER_GAP_MS = 1200;
/** More competitors than this: the feed is "crowded" and other fighters' lines are throttled. */
export const KILL_FEED_CROWDED_ABOVE = 4;
/** An elimination older than this (ticks) is never added (a match loaded mid-way, a long pause). */
export const KILL_FEED_FRESH_TICKS = 4 * 60;

export type KillCause =
  | 'blast'
  | 'vehicle'
  | 'crush'
  | 'hazard'
  | 'crowd'
  | 'suddenDeath'
  | 'self'
  | 'friendly'
  | 'sideline'
  | 'melee';

export const KILL_CAUSE_WORD: Readonly<Record<KillCause, string>> = {
  blast: 'BLAST',
  vehicle: 'VEHICLE',
  crush: 'CRUSH',
  hazard: 'HAZARD',
  crowd: 'CROWD',
  suddenDeath: 'SUDDEN DEATH',
  self: 'OWN BLAST',
  friendly: 'FRIENDLY FIRE',
  sideline: 'SIDELINE',
  melee: 'HIT',
};

export interface KillFeedLine {
  /** Stable key: `<victim>@<tick>` for an elimination, `assist:<victim>@<tick>` for an assist. */
  key: string;
  kind: 'kill' | 'death' | 'assist' | 'other';
  /** The whole sentence, upper case ("YOU ELIMINATED P3"). */
  text: string;
  /** Null for an assist (it names no cause). */
  cause: KillCause | null;
  causeWord: string | null;
  /** Concerns the local player (kill, death or assist): always shown, longer, never throttled. */
  mine: boolean;
  /** Wall-clock ms the line was added / expires at (the caller's clock). */
  at: number;
  expires: number;
}

/** The newest-first list the store holds. */
export type KillFeed = readonly KillFeedLine[];

const up = (name: string): string => name.toUpperCase();

/** What took the fighter out, as a KillCause (team and credit decide "friendly fire" and "own blast"). */
export function killCause(state: Pick<GameState, 'players'>, victim: Readonly<Player>): KillCause {
  const c: EliminationCause | null = victim.elimination;
  if (!c) return 'hazard';
  const owner = 'ownerId' in c && c.ownerId !== null ? state.players[c.ownerId] : undefined;
  switch (c.kind) {
    case 'flame':
      if (owner?.id === victim.id) return 'self';
      if (owner && victim.eliminatedBy === null && owner.team >= 0 && owner.team === victim.team)
        return 'friendly';
      return 'blast';
    case 'vehicle':
      return 'vehicle';
    case 'spectator':
      return 'sideline';
    case 'campaign': // decision CC1: campaign health ran out (see systems/campaignDamage.ts)
      if (owner?.id === victim.id) return 'self';
      if (c.source === 'blast') return 'blast';
      if (c.source === 'vehicle') return 'vehicle';
      return c.source === 'hazard' || c.source === 'trap' ? 'hazard' : 'melee';
    default:
      return c.kind;
  }
}

/** The elimination line for `victim` (already eliminated): who did it to whom, and how. */
export function eliminationLine(
  state: Pick<GameState, 'players'>,
  victim: Readonly<Player>,
  localId: number,
): Omit<KillFeedLine, 'at' | 'expires'> {
  const killer = victim.eliminatedBy !== null ? (state.players[victim.eliminatedBy] ?? null) : null;
  const cause = killCause(state, victim);
  const iDied = victim.id === localId;
  const iKilled = killer?.id === localId;
  let text: string;
  if (iDied) text = killer ? `${up(killer.name)} ELIMINATED YOU` : 'YOU WERE ELIMINATED';
  else if (iKilled) text = `YOU ELIMINATED ${up(victim.name)}`;
  else if (killer) text = `${up(killer.name)} ELIMINATED ${up(victim.name)}`;
  else text = `${up(victim.name)} WAS ELIMINATED`;
  return {
    key: `${victim.id}@${victim.eliminatedTick}`,
    kind: iDied ? 'death' : iKilled ? 'kill' : 'other',
    text,
    cause,
    causeWord: KILL_CAUSE_WORD[cause],
    mine: iDied || iKilled,
  };
}

/** "ASSIST ON <name>": the local player was credited an assist on `victim`'s elimination. */
export function assistLine(victim: Readonly<Player>): Omit<KillFeedLine, 'at' | 'expires'> {
  return {
    key: `assist:${victim.id}@${victim.eliminatedTick}`,
    kind: 'assist',
    text: `ASSIST ON ${up(victim.name)}`,
    cause: null,
    causeWord: null,
    mine: true,
  };
}

/**
 * Lines for the eliminations that happened in the last `KILL_FEED_FRESH_TICKS` and whose key is not in `seen`
 * (oldest first, so pushing them in order leaves the newest on top). `assistsOn` are the ids of players the local
 * player was credited an assist on this frame (from the `playerEliminated` events' `assistIds`).
 */
export function newKillLines(
  state: Pick<GameState, 'players' | 'tick'>,
  localId: number,
  seen: ReadonlySet<string>,
  assistsOn: readonly number[] = [],
): Omit<KillFeedLine, 'at' | 'expires'>[] {
  const fresh = state.players
    .filter(
      (p) =>
        p.eliminatedTick !== null &&
        p.elimination !== null &&
        state.tick - p.eliminatedTick <= KILL_FEED_FRESH_TICKS &&
        !seen.has(`${p.id}@${p.eliminatedTick}`),
    )
    .sort((a, b) => a.eliminatedTick! - b.eliminatedTick! || a.id - b.id);
  const out: Omit<KillFeedLine, 'at' | 'expires'>[] = [];
  for (const p of fresh) {
    out.push(eliminationLine(state, p, localId));
    if (assistsOn.includes(p.id) && p.id !== localId && !seen.has(assistLine(p).key)) out.push(assistLine(p));
  }
  return out;
}

/** Drops the lines whose time is up. Returns the same array when nothing expired. */
export function expireKillLines(feed: KillFeed, nowMs: number): KillFeed {
  return feed.some((l) => l.expires <= nowMs) ? feed.filter((l) => l.expires > nowMs) : feed;
}

/**
 * Adds `lines` (oldest first) to the feed: newest on top, expired lines dropped, at most `KILL_FEED_MAX`. The local
 * player's lines are never throttled and push out other fighters' lines first; when `crowded`, another fighter's
 * line is let in only `KILL_FEED_OTHER_GAP_MS` after the previous one (the rest are dropped), and is dropped when
 * the feed is full of the local player's own lines.
 */
export function pushKillLines(
  feed: KillFeed,
  lines: readonly Omit<KillFeedLine, 'at' | 'expires'>[],
  nowMs: number,
  crowded: boolean,
): KillFeed {
  const next = [...expireKillLines(feed, nowMs)];
  for (const line of lines) {
    if (next.some((l) => l.key === line.key)) continue;
    if (!line.mine && crowded) {
      const lastOther = next.find((l) => !l.mine);
      if (lastOther && nowMs - lastOther.at < KILL_FEED_OTHER_GAP_MS) continue;
    }
    if (next.length >= KILL_FEED_MAX) {
      // full: the oldest line of another fighter makes room; only local lines left, then the oldest of them
      // (for a local line) or nothing is added (for another fighter's line)
      let drop = -1;
      for (let i = next.length - 1; i >= 0; i--) {
        if (!next[i]!.mine) {
          drop = i;
          break;
        }
      }
      if (drop < 0 && !line.mine) continue;
      next.splice(drop < 0 ? next.length - 1 : drop, 1);
    }
    next.unshift({
      ...line,
      at: nowMs,
      expires: nowMs + (line.mine ? KILL_FEED_TTL_MS : KILL_FEED_OTHER_TTL_MS),
    });
  }
  return next;
}

/** More competitors than a standard match has: other fighters' kills are throttled. */
export const isCrowded = (state: Pick<GameState, 'players'>): boolean =>
  state.players.length > KILL_FEED_CROWDED_ABOVE;
