/**
 * Non-ranked match participation history, written ONLY from the match server's signed calls (`/internal/v1/matches/*`).
 * There is no endpoint a player can call to say they won: results are facts the server itself produced
 * (`RumbleMatch.results()`), and this module refuses anything it cannot tie back to a ticket it issued.
 *
 * What is stored are facts (placement, kills, deaths, assists, and the bot-vs-human split of rule ON7). What is NOT stored or
 * computed: XP, rating, rank, rewards, leaderboards. Ranked play and persistent competitive rewards are deferred (PIS7); when
 * the founder decides the policy it will be a new module reading these rows, not a change to them.
 */
import { ApiError } from '../errors';
import { audit } from '../audit';
import type { Db, Queryable } from '../db/types';
import { HOST_ROOM } from '../handoff/verify';
import type { PartyService } from '../parties/service';
import type { PresenceStore } from '../social/presence';
import type { Clock } from '../util/clock';
import { isUuid } from '../util/validate';

export type GameKind = 'survival' | 'deathmatch' | 'team';
export const GAME_KINDS: readonly GameKind[] = ['survival', 'deathmatch', 'team'];

export interface ParticipantInput {
  seat: number;
  /** The platform player id (from a ticket), or null for a bot or an anonymous guest. */
  playerId: string | null;
  name: string;
  isBot: boolean;
  team: number | null;
}

export interface ResultInput {
  seat: number;
  placement: number | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  botKills: number | null;
  botDeaths: number | null;
  botAssists: number | null;
  controlledByBotAtEnd: boolean | null;
}

export interface StartedInput {
  matchId: string;
  game: GameKind;
  arenaId: string;
  roomCode: string | null;
  seats: number;
  startedAt: Date;
  participants: ParticipantInput[];
}

export interface FinishedInput {
  matchId: string;
  game: GameKind;
  arenaId: string;
  roomCode: string | null;
  seats: number;
  startedAt: Date | null;
  endedAt: Date;
  durationSec: number;
  participants: ParticipantInput[];
  results: ResultInput[];
}

export interface HistoryEntry {
  matchId: string;
  game: GameKind;
  arenaId: string;
  endedAt: string | null;
  durationSec: number | null;
  you: {
    placement: number | null;
    kills: number | null;
    deaths: number | null;
    assists: number | null;
    botKills: number | null;
    botDeaths: number | null;
    botAssists: number | null;
    controlledByBotAtEnd: boolean | null;
    team: number | null;
  };
  /** How many humans of this match had a platform account: a fact about the match, never a ranking. */
  humans: number;
}

export class MatchService {
  constructor(private readonly d: { db: Db; clock: Clock; presence: PresenceStore; parties: PartyService }) {}

  /** Every named player must hold a ticket the platform issued for THIS room. A bot or anonymous seat has no player id. */
  private async checkParticipants(
    q: Queryable,
    roomCode: string | null,
    ps: ParticipantInput[],
  ): Promise<void> {
    const seats = new Set<number>();
    for (const p of ps) {
      if (seats.has(p.seat)) throw new ApiError('bad_request', 'duplicate seat');
      seats.add(p.seat);
      if (p.isBot && p.playerId !== null)
        throw new ApiError('bad_request', 'a bot cannot be a platform player');
      if (p.playerId === null) continue;
      if (!isUuid(p.playerId)) throw new ApiError('bad_request', 'participant id is not a player id');
      if (roomCode === null)
        throw new ApiError(
          'bad_request',
          'participants with player ids need the room code they were ticketed for',
        );
      // a ticket for THIS room, or the party leader's HOST ticket for a party whose reported room is this one
      const t = await q.query(
        `SELECT 1 FROM handoff_tickets t WHERE t.player_id = $1 AND (t.room_code = $2 OR (t.room_code = $3 AND EXISTS (
           SELECT 1 FROM parties p WHERE p.id = t.party_id AND p.leader_id = t.player_id AND p.match_room_code = $2))) LIMIT 1`,
        [p.playerId, roomCode, HOST_ROOM],
      );
      if (t.rowCount === 0) throw new ApiError('bad_request', 'a participant holds no ticket for this room');
      // The leader's HOST ticket was accepted because their party still reports this room. Once the match ends the party is
      // released (code cleared), but the room lingers for a rematch and the leader is still in it: bind that ticket to THIS room
      // now, so a rematch in the same room keeps being recorded. Same condition as above, nothing wider (decision MP-PLAT).
      await q.query(
        `UPDATE handoff_tickets t SET room_code = $2
          WHERE t.player_id = $1 AND t.room_code = $3
            AND EXISTS (SELECT 1 FROM parties p WHERE p.id = t.party_id AND p.leader_id = t.player_id AND p.match_room_code = $2)`,
        [p.playerId, roomCode, HOST_ROOM],
      );
    }
  }

  async started(input: StartedInput): Promise<{ duplicate: boolean }> {
    const now = this.d.clock();
    const out = await this.d.db.tx(async (q) => {
      await this.checkParticipants(q, input.roomCode, input.participants);
      const ins = await q.query(
        `INSERT INTO matches (id, game, arena_id, room_code, state, seats, started_at, recorded_at)
         VALUES ($1,$2,$3,$4,'started',$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
        [input.matchId, input.game, input.arenaId, input.roomCode, input.seats, input.startedAt, now],
      );
      if (ins.rowCount === 0) return { duplicate: true };
      await this.writeParticipants(q, input.matchId, input.participants);
      await audit(q, now, {
        type: 'match.recorded',
        detail: {
          matchId: input.matchId,
          state: 'started',
          humans: input.participants.filter((p) => p.playerId).length,
        },
      });
      return { duplicate: false };
    });
    if (!out.duplicate)
      for (const p of input.participants)
        if (p.playerId) this.d.presence.setInMatch(p.playerId, input.matchId);
    return out;
  }

  private async writeParticipants(q: Queryable, matchId: string, ps: ParticipantInput[]): Promise<void> {
    for (const p of ps) {
      await q.query(
        `INSERT INTO match_participants (match_id, seat, player_id, display_name, is_bot, team) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (match_id, seat) DO NOTHING`,
        [matchId, p.seat, p.playerId, p.name.slice(0, 60), p.isBot, p.team],
      );
    }
  }

  /** First finish wins: a second call for the same match changes nothing (idempotent, never overwritten). */
  async finished(input: FinishedInput): Promise<{ duplicate: boolean }> {
    const now = this.d.clock();
    const out = await this.d.db.tx(async (q) => {
      const cur = await q.query<{ state: string }>('SELECT state FROM matches WHERE id = $1 FOR UPDATE', [
        input.matchId,
      ]);
      if (cur.rows[0]?.state === 'finished') return { duplicate: true, roomCode: input.roomCode };
      await this.checkParticipants(q, input.roomCode, input.participants);
      const seatSet = new Set(input.participants.map((p) => p.seat));
      for (const r of input.results)
        if (!seatSet.has(r.seat))
          throw new ApiError('bad_request', 'a result names a seat that did not play');
      if (cur.rows.length === 0) {
        await q.query(
          `INSERT INTO matches (id, game, arena_id, room_code, state, seats, started_at, ended_at, duration_sec, recorded_at)
           VALUES ($1,$2,$3,$4,'finished',$5,$6,$7,$8,$9)`,
          [
            input.matchId,
            input.game,
            input.arenaId,
            input.roomCode,
            input.seats,
            input.startedAt,
            input.endedAt,
            input.durationSec,
            now,
          ],
        );
      } else {
        await q.query(
          "UPDATE matches SET state = 'finished', ended_at = $2, duration_sec = $3 WHERE id = $1",
          [input.matchId, input.endedAt, input.durationSec],
        );
      }
      await this.writeParticipants(q, input.matchId, input.participants);
      for (const r of input.results) {
        await q.query(
          `UPDATE match_participants SET placement=$3, kills=$4, deaths=$5, assists=$6, bot_kills=$7, bot_deaths=$8, bot_assists=$9, controlled_by_bot_at_end=$10
            WHERE match_id = $1 AND seat = $2`,
          [
            input.matchId,
            r.seat,
            r.placement,
            r.kills,
            r.deaths,
            r.assists,
            r.botKills,
            r.botDeaths,
            r.botAssists,
            r.controlledByBotAtEnd,
          ],
        );
      }
      if (input.roomCode) await this.d.parties.matchEnded(q, input.roomCode, now);
      await audit(q, now, {
        type: 'match.recorded',
        detail: {
          matchId: input.matchId,
          state: 'finished',
          humans: input.participants.filter((p) => p.playerId).length,
        },
      });
      return { duplicate: false, roomCode: input.roomCode };
    });
    for (const p of input.participants) if (p.playerId) this.d.presence.clearMatch(p.playerId, input.matchId);
    return { duplicate: out.duplicate };
  }

  /** The caller's own recent matches (newest first). Nobody else's history is reachable. */
  async history(playerId: string, limit = 30): Promise<HistoryEntry[]> {
    const r = await this.d.db.query<{
      id: string;
      game: GameKind;
      arena_id: string;
      ended_at: Date | null;
      duration_sec: number | null;
      placement: number | null;
      kills: number | null;
      deaths: number | null;
      assists: number | null;
      bot_kills: number | null;
      bot_deaths: number | null;
      bot_assists: number | null;
      controlled_by_bot_at_end: boolean | null;
      team: number | null;
      humans: number;
    }>(
      `SELECT m.id, m.game, m.arena_id, m.ended_at, m.duration_sec, mp.placement, mp.kills, mp.deaths, mp.assists, mp.bot_kills, mp.bot_deaths,
              mp.bot_assists, mp.controlled_by_bot_at_end, mp.team,
              (SELECT count(*)::int FROM match_participants x WHERE x.match_id = m.id AND x.player_id IS NOT NULL) AS humans
         FROM match_participants mp JOIN matches m ON m.id = mp.match_id
        WHERE mp.player_id = $1 AND m.state = 'finished' ORDER BY m.ended_at DESC LIMIT $2`,
      [playerId, Math.min(Math.max(limit, 1), 100)],
    );
    return r.rows.map((x) => ({
      matchId: x.id,
      game: x.game,
      arenaId: x.arena_id,
      endedAt: x.ended_at ? x.ended_at.toISOString() : null,
      durationSec: x.duration_sec,
      you: {
        placement: x.placement,
        kills: x.kills,
        deaths: x.deaths,
        assists: x.assists,
        botKills: x.bot_kills,
        botDeaths: x.bot_deaths,
        botAssists: x.bot_assists,
        controlledByBotAtEnd: x.controlled_by_bot_at_end,
        team: x.team,
      },
      humans: x.humans,
    }));
  }

  /** Erasure hook: the history stays (it is also other players' history) but no longer names this player. */
  async erase(q: Queryable, playerId: string): Promise<void> {
    await q.query(
      "UPDATE match_participants SET player_id = NULL, display_name = 'Deleted player' WHERE player_id = $1",
      [playerId],
    );
  }
}
