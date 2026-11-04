/**
 * Mock lobby, team and matchmaking services. Rooms follow the pure state machine in `lifecycle.ts`; scripted
 * players ready up and the countdown runs on the injected clock when `pump` is called.
 */
import { CHARACTER_IDS, pick, shuffle } from '../../sim';
import type { LobbyService, MatchmakingService, TeamService } from '../contracts';
import { E } from '../errors';
import {
  balanceTeams,
  canBalanceTeams,
  canChangeSettings,
  canSetReady,
  canStartReadyCheck,
  canSwitchTeam,
  checkPartyAction,
  everyoneReady,
  isRoomEditable,
  nextRoomState,
} from '../lifecycle';
import { err, ok } from '../result';
import type { Result } from '../result';
import type { LobbySettings, QueueStatus, Room, RoomMember } from '../types';
import { publishParty, publishRoom } from './context';
import type { MockCtx, TicketRec } from './context';
import { beginCountdown, beginPlaying, createMatchRec } from './match';
import { MOCK_BOT_NAMES } from './names';
import { checkLobby, roomSize, teamCountFor } from './rules';

// ---------------------------------------------------------------- room building

function fillers(ctx: MockCtx, count: number, taken: Set<string>): RoomMember[] {
  const names = shuffle(ctx.rng, MOCK_BOT_NAMES).filter((n) => !taken.has(n));
  const out: RoomMember[] = [];
  for (let i = 0; i < count; i++) {
    const displayName = names[i] ?? `Bot_${i + 1}`;
    out.push({
      accountId: ctx.id('bot'),
      displayName,
      isBot: true,
      ready: false,
      team: null,
      characterId: pick(ctx.rng, CHARACTER_IDS),
      connected: true,
    });
  }
  return out;
}

function assignTeams(room: Room): void {
  if (room.game !== 'team') {
    for (const m of room.members) m.team = null;
    return;
  }
  const map = balanceTeams(
    room.members.map((m) => m.accountId),
    room.teamCount,
  );
  for (const m of room.members) m.team = map.get(m.accountId) ?? 0;
}

function buildRoom(ctx: MockCtx, source: Room['source'], humans: RoomMember[], hostId: string, s: LobbySettings): Room {
  const maxPlayers = roomSize(s);
  const members = [...humans, ...fillers(ctx, Math.max(0, maxPlayers - humans.length), new Set(humans.map((h) => h.displayName)))];
  const room: Room = {
    id: ctx.id('room'),
    state: 'created',
    hostId,
    game: s.game,
    arenaId: s.arenaId,
    maxPlayers,
    teamCount: teamCountFor(s.game),
    members: members.slice(0, maxPlayers),
    matchId: null,
    source,
    createdAt: ctx.now(),
  };
  assignTeams(room);
  room.state = nextRoomState(room.state, 'open')!;
  ctx.state.rooms.set(room.id, room);
  ctx.state.roomTimers.set(room.id, { readyAt: {}, startAt: null, lastCountdownShown: -1 });
  return room;
}

function humanMember(ctx: MockCtx, id: string, name: string, mock: boolean): RoomMember {
  return {
    accountId: id,
    displayName: name,
    isBot: mock,
    ready: false,
    team: null,
    characterId: mock ? pick(ctx.rng, CHARACTER_IDS) : CHARACTER_IDS[0]!,
    connected: true,
  };
}

function beginReadyCheck(ctx: MockCtx, room: Room): void {
  room.state = nextRoomState(room.state, 'startReadyCheck')!;
  const timers = ctx.state.roomTimers.get(room.id)!;
  let n = 1;
  for (const m of room.members) {
    if (m.isBot) timers.readyAt[m.accountId] = ctx.now() + ctx.opts.botReadyMs * n++;
  }
  publishRoom(ctx, room);
}

/** All ready: the ready check passes, the authoritative match is created and the start countdown begins. */
function advanceIfReady(ctx: MockCtx, room: Room): void {
  if (room.state !== 'readyCheck' || !everyoneReady(room)) return;
  room.state = nextRoomState(room.state, 'allReady')!;
  const rec = createMatchRec(ctx, room);
  beginCountdown(rec);
  room.matchId = rec.id;
  const timers = ctx.state.roomTimers.get(room.id)!;
  timers.startAt = ctx.now() + ctx.opts.startCountdownMs;
  timers.lastCountdownShown = -1;
  publishRoom(ctx, room);
}

const myRoom = (ctx: MockCtx, id: string): Room | null =>
  [...ctx.state.rooms.values()].find(
    (r) => r.state !== 'finished' && r.state !== 'aborted' && r.members.some((m) => m.accountId === id && !m.isBot),
  ) ?? null;

// ---------------------------------------------------------------- services

export function createLobbyService(ctx: MockCtx): LobbyService {
  const withRoom = <T>(method: string, roomId: string, fn: (me: string, room: Room) => Result<T>): Promise<Result<T>> =>
    ctx.call('lobbies', method, () => {
      const u = ctx.user();
      if (!u.ok) return u;
      const room = ctx.state.rooms.get(roomId);
      if (!room) return err(E.notFound('No such room.'));
      return fn(u.value.id, room);
    });
  const snap = (room: Room): Room => structuredClone(room);

  return {
    createFromParty: (partyId, settings) =>
      ctx.call('lobbies', 'createFromParty', () => {
        const u = ctx.user();
        if (!u.ok) return u;
        const party = ctx.state.parties.get(partyId);
        if (!party) return err(E.notFound('No such party.'));
        const bad = checkPartyAction(party, u.value.id, 'canStart');
        if (bad) return err(bad);
        const invalid = checkLobby(settings);
        if (invalid) return err(invalid);
        if (myRoom(ctx, u.value.id)) return err(E.conflict('You are already in a room.'));
        const humans = party.members.map((m) => humanMember(ctx, m.accountId, m.displayName, m.mock));
        const room = buildRoom(ctx, 'party', humans, u.value.id, settings);
        party.roomId = room.id;
        publishParty(ctx, party);
        publishRoom(ctx, room);
        return ok(snap(room));
      }),
    get: (roomId) =>
      withRoom('get', roomId, (me, room) =>
        room.members.some((m) => m.accountId === me) ? ok(snap(room)) : err(E.forbidden('You are not in this room.')),
      ),
    setSettings: (roomId, settings) =>
      withRoom('setSettings', roomId, (me, room) => {
        const denied = canChangeSettings(room, me);
        if (!denied.ok) return denied;
        const invalid = checkLobby(settings);
        if (invalid) return err(invalid);
        const humans = room.members.filter((m) => !m.isBot || ctx.state.profiles.has(m.accountId));
        const size = roomSize(settings);
        if (humans.length > size) return err(E.roomFull('Too many players for that arena.'));
        room.game = settings.game;
        room.arenaId = settings.arenaId;
        room.maxPlayers = size;
        room.teamCount = teamCountFor(settings.game);
        room.members = [...humans, ...fillers(ctx, size - humans.length, new Set(humans.map((h) => h.displayName)))];
        for (const m of room.members) m.ready = false;
        assignTeams(room);
        publishRoom(ctx, room);
        return ok(snap(room));
      }),
    setReady: (roomId, ready) =>
      withRoom('setReady', roomId, (me, room) => {
        const allowed = canSetReady(room, me);
        if (!allowed.ok) return allowed;
        room.members.find((m) => m.accountId === me)!.ready = ready;
        publishRoom(ctx, room);
        advanceIfReady(ctx, room);
        return ok(snap(room));
      }),
    setCharacter: (roomId, characterId) =>
      withRoom('setCharacter', roomId, (me, room) => {
        const m = room.members.find((x) => x.accountId === me);
        if (!m) return err(E.forbidden('You are not in this room.'));
        if (!isRoomEditable(room.state)) return err(E.invalidState(room.state, 'The room is locked.'));
        m.characterId = characterId;
        publishRoom(ctx, room);
        return ok(snap(room));
      }),
    startReadyCheck: (roomId) =>
      withRoom('startReadyCheck', roomId, (me, room) => {
        const allowed = canStartReadyCheck(room, me);
        if (!allowed.ok) return allowed;
        beginReadyCheck(ctx, room);
        return ok(snap(room));
      }),
    leave: (roomId) =>
      withRoom('leave', roomId, (me, room) => {
        if (!room.members.some((m) => m.accountId === me)) return err(E.forbidden('You are not in this room.'));
        if (room.state === 'inProgress') return err(E.conflict('Leave the running match with match.leave.'));
        const humansLeft = room.members.filter((m) => !m.isBot && m.accountId !== me);
        if (humansLeft.length === 0) {
          const next = nextRoomState(room.state, 'abort');
          if (next) room.state = next;
          room.members = room.members.filter((m) => m.accountId !== me);
        } else {
          room.members = room.members.filter((m) => m.accountId !== me);
          if (room.hostId === me) room.hostId = humansLeft[0]!.accountId;
          const back = nextRoomState(room.state, room.state === 'readyCheck' ? 'readyFailed' : 'cancelStart');
          if (back) {
            room.state = back;
            if (room.matchId) ctx.state.matches.delete(room.matchId);
            room.matchId = null;
          }
        }
        for (const p of ctx.state.parties.values()) if (p.roomId === room.id) p.roomId = null;
        publishRoom(ctx, room);
        return ok(undefined);
      }),
  };
}

export function createTeamService(ctx: MockCtx): TeamService {
  const withRoom = (method: string, roomId: string, fn: (me: string, room: Room) => Result<Room>): Promise<Result<Room>> =>
    ctx.call('teams', method, () => {
      const u = ctx.user();
      if (!u.ok) return u;
      const room = ctx.state.rooms.get(roomId);
      return room ? fn(u.value.id, room) : err(E.notFound('No such room.'));
    });
  return {
    requestSwitch: (roomId) =>
      withRoom('requestSwitch', roomId, (me, room) => {
        const target = canSwitchTeam(room, me);
        if (!target.ok) return target;
        room.members.find((m) => m.accountId === me)!.team = target.value;
        publishRoom(ctx, room);
        return ok(structuredClone(room));
      }),
    balance: (roomId) =>
      withRoom('balance', roomId, (me, room) => {
        const allowed = canBalanceTeams(room, me);
        if (!allowed.ok) return allowed;
        assignTeams(room);
        for (const m of room.members) m.ready = false;
        publishRoom(ctx, room);
        return ok(structuredClone(room));
      }),
  };
}

// ---------------------------------------------------------------- matchmaking

const statusOf = (ctx: MockCtx, t: TicketRec): QueueStatus => ({
  ticketId: t.id,
  state: t.state,
  game: t.request.game,
  arenaId: t.request.arenaId,
  found: t.found,
  needed: t.needed,
  waitedMs: Math.max(0, ctx.now() - t.createdAt),
  roomId: t.roomId,
});

export function createMatchmakingService(ctx: MockCtx): MatchmakingService {
  const ticket = (id: string): TicketRec | undefined => ctx.state.tickets.get(id);
  return {
    enqueue: (request) =>
      ctx.call('matchmaking', 'enqueue', () => {
        const u = ctx.user();
        if (!u.ok) return u;
        const invalid = checkLobby(request);
        if (invalid) return err(invalid);
        if ([...ctx.state.tickets.values()].some((t) => t.state === 'searching')) {
          return err(E.conflict('You are already searching.'));
        }
        if (myRoom(ctx, u.value.id)) return err(E.conflict('You are already in a room.'));
        const t: TicketRec = {
          id: ctx.id('ticket'),
          request,
          needed: roomSize(request) - 1,
          createdAt: ctx.now(),
          state: 'searching',
          found: 0,
          roomId: null,
        };
        ctx.state.tickets.set(t.id, t);
        const status = statusOf(ctx, t);
        ctx.events.emit({ type: 'queue.update', status });
        return ok(status);
      }),
    status: (id) =>
      ctx.call('matchmaking', 'status', () => {
        const u = ctx.user();
        if (!u.ok) return u;
        const t = ticket(id);
        return t ? ok(statusOf(ctx, t)) : err(E.notFound('No such ticket.'));
      }),
    cancel: (id) =>
      ctx.call('matchmaking', 'cancel', () => {
        const u = ctx.user();
        if (!u.ok) return u;
        const t = ticket(id);
        if (!t) return err(E.notFound('No such ticket.'));
        if (t.state === 'matched') return err(E.conflict('Already matched.'));
        t.state = 'cancelled';
        const status = statusOf(ctx, t);
        ctx.events.emit({ type: 'queue.update', status });
        return ok(status);
      }),
  };
}

/** Time-driven: queues fill with mock players; full queues become rooms; rooms count down and start. */
export function pumpLobbies(ctx: MockCtx): void {
  const now = ctx.now();
  const me = ctx.state.session?.profile;
  for (const t of ctx.state.tickets.values()) {
    if (t.state !== 'searching' || !me) continue;
    const found = Math.min(t.needed, Math.floor((now - t.createdAt) / ctx.opts.fillIntervalMs));
    if (found === t.found) continue;
    t.found = found;
    if (found >= t.needed) {
      const room = buildRoom(ctx, 'queue', [humanMember(ctx, me.id, me.displayName, false)], '', t.request);
      room.hostId = room.members.find((m) => m.isBot)?.accountId ?? me.id;
      t.state = 'matched';
      t.roomId = room.id;
      beginReadyCheck(ctx, room); // the server runs the ready check itself in a queue match
    }
    ctx.events.emit({ type: 'queue.update', status: statusOf(ctx, t) });
  }
  for (const room of ctx.state.rooms.values()) {
    const timers = ctx.state.roomTimers.get(room.id);
    if (!timers) continue;
    if (room.state === 'readyCheck') {
      let changed = false;
      for (const m of room.members) {
        const at = timers.readyAt[m.accountId];
        if (m.isBot && !m.ready && at !== undefined && at <= now) {
          m.ready = true;
          changed = true;
        }
      }
      if (changed) {
        publishRoom(ctx, room);
        advanceIfReady(ctx, room);
      }
    } else if (room.state === 'starting' && timers.startAt !== null) {
      const left = Math.max(0, Math.ceil((timers.startAt - now) / 1000));
      if (left !== timers.lastCountdownShown && room.matchId) {
        timers.lastCountdownShown = left;
        ctx.events.emit({ type: 'match.countdown', matchId: room.matchId, secondsLeft: left });
      }
      if (now >= timers.startAt) beginPlaying(ctx, room);
    }
  }
}

