/**
 * The online City Rumble flow store (src/app/rumbleOnlineFlow.ts): what each session event does to the screen the player
 * sees, with a scripted session and injected navigation (no socket, no DOM, no game session).
 */
import { describe, expect, it, vi } from 'vitest';
import { createRumbleOnlineFlow } from '../../src/app/rumbleOnlineFlow';
import type { FlowDeps } from '../../src/app/rumbleOnlineFlow';
import type { RemoteMatchDriver } from '../../src/app/remoteMatch';
import type { ConnStatus, OpenRequest, RumbleSession, RumbleSessionEvents } from '../../src/net/client/types';
import type { LobbyMsg, ResultsMsg, SettingsMsg } from '../../src/net/protocol';
import { NAME_STORAGE_KEY } from '../../src/ui/online/rumble/models';

class TestSession implements RumbleSession {
  driver: RemoteMatchDriver | null = null;
  status: ConnStatus = 'idle';
  opened: OpenRequest[] = [];
  calls: string[] = [];
  left = 0;
  constructor(readonly events: RumbleSessionEvents) {}
  async open(req: OpenRequest) {
    this.opened.push(req);
  }
  ready(on: boolean) {
    this.calls.push(`ready:${on}`);
  }
  start() {
    this.calls.push('start');
  }
  rematch() {
    this.calls.push('rematch');
  }
  settings(p: SettingsMsg) {
    this.calls.push(`settings:${JSON.stringify(p)}`);
  }
  async leave() {
    this.left++;
  }
}

const lobbyMsg = (over: Partial<LobbyMsg> = {}): LobbyMsg => ({
  code: 'K7M3QX',
  phase: 'lobby',
  private: true,
  members: [
    { name: 'Ada', characterId: 'streetBaller', ready: false, isHost: true, seat: null, connected: true },
  ],
  settings: { arenaId: 'rumbleOshodi', game: 'deathmatch', durationSec: 300, botDifficulty: 'standard' },
  countdownMs: null,
  autoStartMs: null,
  botsToFill: 31,
  you: 0,
  ...over,
});

const results: ResultsMsg = {
  matchId: 'm',
  tick: 1,
  winnerSeat: 0,
  winnerTeam: null,
  draw: false,
  stateHash: 0,
  players: [
    { seat: 0, name: 'Ada', isBot: false, team: null, placement: 1, kills: 3, deaths: 0, assists: 0 },
  ],
};

const driver = (): RemoteMatchDriver => ({
  localId: 4,
  state: () => null,
  advance: () => ({ events: [], alpha: 0 }),
  sendIntent: () => undefined,
  status: () => ({ connection: 'connected', rttMs: 40, bufferedTicks: 2, detail: null }),
  ended: () => false,
  dispose: () => undefined,
});

function setup(over: Partial<FlowDeps> = {}, store: Record<string, string> = {}, search = '') {
  const sessions: TestSession[] = [];
  const log: string[] = [];
  const deps: FlowDeps = {
    createSession: (events) => {
      const s = new TestSession(events);
      sessions.push(s);
      return s;
    },
    startRemote: vi.fn(),
    endpoint: () => 'ws://example.test:2567',
    character: () => 'streetBaller',
    storage: { get: (k) => store[k] ?? null, set: (k, v) => void (store[k] = v) },
    search: () => search,
    now: () => 1000,
    fake: false,
    nav: {
      show: () => log.push('show'),
      home: () => log.push('home'),
      toRoom: () => log.push('toRoom'),
      toTitle: () => log.push('toTitle'),
      chooseFighter: () => log.push('fighter'),
      overlay: (a) => log.push(`overlay:${a}`),
    },
    ...over,
  };
  const flow = createRumbleOnlineFlow(deps);
  return { ...flow, deps, sessions, log, store, get: flow.useFlow.getState };
}

describe('opening the flow', () => {
  it('starts on the entry with the stored name and shows the screen', () => {
    const t = setup({}, { [NAME_STORAGE_KEY]: 'Tunde' });
    t.actions.open();
    expect(t.get().step).toBe('entry');
    expect(t.get().name).toBe('Tunde');
    expect(t.log).toEqual(['show']);
  });
  it('falls back to "Player" and prefills a valid ?room= code without joining', () => {
    const t = setup({}, { [NAME_STORAGE_KEY]: '<bad>' }, '?online&room=k7m3qx');
    t.actions.open();
    expect(t.get().name).toBe('Player');
    expect(t.get().codeInput).toBe('K7M3QX');
    expect(t.sessions).toHaveLength(0); // joining needs a tap
  });
  it('is not configured without an endpoint: an error, and no session is ever created', () => {
    const t = setup({ endpoint: () => null });
    t.actions.open();
    t.actions.createRoom();
    expect(t.get().step).toBe('error');
    expect(t.get().error?.reason).toBe('not-configured');
    t.actions.quickPlay();
    expect(t.sessions).toHaveLength(0);
  });
});

describe('asking for a room', () => {
  it('create: validates the name, remembers it and sends the fighter chosen in the game', () => {
    const t = setup({ character: () => 'streetBaller' });
    t.actions.open();
    t.actions.setName('  Ada  Obi ');
    t.actions.createRoom();
    expect(t.get().step).toBe('connecting');
    expect(t.sessions[0]!.opened).toEqual([
      { kind: 'create', who: { name: 'Ada Obi', characterId: 'streetBaller' } },
    ]);
    expect(t.store[NAME_STORAGE_KEY]).toBe('Ada Obi');
  });
  it('an invalid name sends nothing', () => {
    const t = setup();
    t.actions.open();
    t.actions.setName('A');
    t.actions.createRoom();
    t.actions.quickPlay();
    expect(t.sessions).toHaveLength(0);
    expect(t.get().step).toBe('entry');
    expect(t.store[NAME_STORAGE_KEY]).toBeUndefined();
  });
  it('join: normalises what was typed and needs a whole code', () => {
    const t = setup();
    t.actions.open();
    t.actions.setCodeInput('k7m3q');
    t.actions.joinRoom();
    expect(t.sessions).toHaveLength(0);
    t.actions.setCodeInput('k7m 3qx');
    expect(t.get().codeInput).toBe('K7M3QX');
    t.actions.joinRoom();
    expect(t.sessions[0]!.opened[0]).toMatchObject({ kind: 'join', code: 'K7M3QX' });
  });
  it('quick play asks for a public room', () => {
    const t = setup();
    t.actions.open();
    t.actions.quickPlay();
    expect(t.sessions[0]!.opened[0]).toMatchObject({ kind: 'quick' });
  });
  it('"Change" opens the existing Fighter screen', () => {
    const t = setup();
    t.actions.chooseFighter();
    expect(t.log).toEqual(['fighter']);
  });
});

describe('the room and the match', () => {
  function inRoom() {
    const t = setup();
    t.actions.open();
    t.actions.createRoom();
    const s = t.sessions[0]!;
    s.events.status('connected', '');
    s.events.welcome({ descriptor: null, seat: null, roomCode: 'K7M3QX' });
    s.events.lobby(lobbyMsg());
    return { t, s };
  }

  it('the first lobby message shows the room, with the clock reading it arrived at', () => {
    const { t } = inRoom();
    expect(t.get().step).toBe('room');
    expect(t.get().lobby?.code).toBe('K7M3QX');
    expect(t.get().lobbyAt).toBe(1000);
    expect(t.get().status).toBe('connected');
    expect(t.get().roomCode).toBe('K7M3QX');
  });
  it('prefetches the arena models when the lobby names an arena, once per change', () => {
    const prefetch = vi.fn();
    const t = setup({ prefetch });
    t.actions.open();
    t.actions.createRoom();
    const s = t.sessions[0]!;
    s.events.status('connected', '');
    s.events.lobby(lobbyMsg());
    const first = lobbyMsg().settings.arenaId;
    expect(prefetch).toHaveBeenCalledTimes(1);
    expect(prefetch).toHaveBeenLastCalledWith(first);
    s.events.lobby(lobbyMsg());
    expect(prefetch).toHaveBeenCalledTimes(1);
    s.events.lobby(lobbyMsg({ settings: { ...lobbyMsg().settings, arenaId: 'another-arena' } }));
    expect(prefetch).toHaveBeenCalledTimes(2);
    expect(prefetch).toHaveBeenLastCalledWith('another-arena');
  });
  it('lobby controls go to the session', () => {
    const { t, s } = inRoom();
    t.actions.ready(true);
    t.actions.settings({ game: 'team' });
    t.actions.start();
    expect(s.calls).toEqual(['ready:true', 'settings:{"game":"team"}', 'start']);
  });
  it('the countdown stays in the room; the playing phase is loading until the match is ready', () => {
    const { t, s } = inRoom();
    s.events.lobby(lobbyMsg({ phase: 'countdown', countdownMs: 3000 }));
    expect(t.get().step).toBe('room');
    s.events.lobby(lobbyMsg({ phase: 'playing' }));
    expect(t.get().step).toBe('loading');
    const d = driver();
    s.events.matchReady(d);
    expect(t.get().step).toBe('match');
    expect(t.get().inMatch).toBe(true);
    expect(t.deps.startRemote).toHaveBeenCalledWith(d);
    expect(t.log).toContain('overlay:true');
    expect(t.actions.driverStatus()?.rttMs).toBe(40);
    expect(t.actions.youSeat()).toBe(4); // the driver's seat when the lobby has none yet
  });
  it('a match that is ready before the playing message goes straight to the match', () => {
    const { t, s } = inRoom();
    s.events.matchReady(driver());
    s.events.lobby(lobbyMsg({ phase: 'playing' }));
    expect(t.get().step).toBe('match');
  });
  it('results show over the board; a rematch lobby brings everyone back to the room', () => {
    const { t, s } = inRoom();
    s.events.matchReady(driver());
    s.events.results(results);
    expect(t.get().step).toBe('results');
    expect(t.get().results?.winnerSeat).toBe(0);
    s.events.lobby(lobbyMsg({ phase: 'results' }));
    expect(t.get().step).toBe('results');
    t.actions.rematch();
    expect(s.calls).toContain('rematch');
    s.events.lobby(lobbyMsg({ phase: 'lobby' }));
    expect(t.get().step).toBe('room');
    expect(t.get().results).toBeNull();
    expect(t.get().inMatch).toBe(false);
    expect(t.log.slice(-2)).toEqual(['overlay:false', 'toRoom']);
  });
  it('the local seat comes from the lobby member when it has one', () => {
    const { t, s } = inRoom();
    s.events.lobby(
      lobbyMsg({
        phase: 'playing',
        members: [
          { name: 'Ada', characterId: 'streetBaller', ready: true, isHost: true, seat: 9, connected: true },
        ],
      }),
    );
    expect(t.actions.youSeat()).toBe(9);
  });
  it('notices are kept with an id and dismissed by that id only', () => {
    const { t, s } = inRoom();
    s.events.notice({ code: 'x', message: 'Only the host can do that' });
    const first = t.get().notice!;
    expect(first.message).toBe('Only the host can do that');
    t.actions.dismissNotice(first.id + 1);
    expect(t.get().notice).not.toBeNull();
    t.actions.dismissNotice(first.id);
    expect(t.get().notice).toBeNull();
  });
  it('a dropped connection is shown and the room stays', () => {
    const { t, s } = inRoom();
    s.events.status('reconnecting', 'wifi');
    expect(t.get().status).toBe('reconnecting');
    expect(t.get().step).toBe('room');
    s.events.status('closed', 'gone');
    expect(t.get().status).toBe('closed');
    expect(t.get().statusDetail).toBe('gone');
  });
});

describe('failures and leaving', () => {
  it('a failed open is an error with its reason; Back returns to the entry', () => {
    const t = setup();
    t.actions.open();
    t.actions.createRoom();
    t.sessions[0]!.events.failed('unreachable', 'timeout');
    expect(t.get()).toMatchObject({ step: 'error', error: { reason: 'unreachable', detail: 'timeout' } });
    t.actions.dismissError();
    expect(t.get().step).toBe('entry');
    expect(t.get().error).toBeNull();
    expect(t.sessions[0]!.left).toBe(1);
  });
  it('Try again repeats the request with a fresh session', () => {
    const t = setup();
    t.actions.open();
    t.actions.quickPlay();
    t.sessions[0]!.events.failed('unreachable', '');
    t.actions.retry();
    expect(t.sessions).toHaveLength(2);
    expect(t.sessions[1]!.opened[0]).toMatchObject({ kind: 'quick' });
    expect(t.get().step).toBe('connecting');
  });
  it('Try again after losing a room rejoins that room by its code', () => {
    const t = setup();
    t.actions.open();
    t.actions.createRoom();
    const s = t.sessions[0]!;
    s.events.lobby(lobbyMsg());
    s.events.status('closed', 'lost');
    t.actions.retry();
    expect(t.sessions[1]!.opened[0]).toMatchObject({ kind: 'join', code: 'K7M3QX' });
  });
  it('a rejected open() call becomes an error instead of an unhandled rejection', async () => {
    const t = setup({
      createSession: (events) => {
        const s = new TestSession(events);
        s.open = () => Promise.reject(new Error('boom'));
        return s;
      },
    });
    t.actions.open();
    t.actions.createRoom();
    await Promise.resolve();
    await Promise.resolve();
    expect(t.get().error).toEqual({ reason: 'unknown', detail: 'boom' });
  });
  it('events of an old session are ignored once a new one started or the room was left', () => {
    const t = setup();
    t.actions.open();
    t.actions.createRoom();
    const old = t.sessions[0]!;
    t.actions.leaveRoom();
    old.events.lobby(lobbyMsg());
    old.events.failed('unreachable', '');
    expect(t.get().step).toBe('entry');
    expect(t.get().lobby).toBeNull();
    expect(old.left).toBe(1);
  });
  it('Leave room goes back to the entry keeping the typed name; Back to menu leaves for Home', () => {
    const t = setup();
    t.actions.open();
    t.actions.setName('Tunde');
    t.actions.createRoom();
    const s = t.sessions[0]!;
    s.events.lobby(lobbyMsg());
    t.actions.leaveRoom();
    expect(t.get().step).toBe('entry');
    expect(t.get().name).toBe('Tunde');
    expect(s.left).toBe(1);
    t.actions.createRoom();
    const s2 = t.sessions[1]!;
    s2.events.matchReady(driver());
    s2.events.results(results);
    t.actions.backToMenu();
    expect(s2.left).toBe(1);
    expect(t.get().step).toBe('entry');
    expect(t.get().inMatch).toBe(false);
    expect(t.log.slice(-2)).toEqual(['overlay:false', 'toTitle']);
  });
  it('close() leaves everything and shows Home', () => {
    const t = setup();
    t.actions.open();
    t.actions.createRoom();
    t.actions.close();
    expect(t.sessions[0]!.left).toBe(1);
    expect(t.log.slice(-1)).toEqual(['home']);
    expect(t.actions.hasSession()).toBe(false);
  });
  it('an error in the middle of a match leaves for the menu from the error card', () => {
    const t = setup();
    t.actions.open();
    t.actions.createRoom();
    const s = t.sessions[0]!;
    s.events.matchReady(driver());
    s.events.failed('unknown', 'lost');
    expect(t.get().step).toBe('error');
    expect(t.get().inMatch).toBe(true);
    t.actions.dismissError();
    expect(t.log.slice(-1)).toEqual(['toTitle']);
  });
});

describe('Back / Esc', () => {
  it('entry: leaves the flow; room: asks first, a second press cancels; connecting and error step back', () => {
    const t = setup();
    t.actions.open();
    expect(t.actions.back()).toBe(true);
    expect(t.log.slice(-1)).toEqual(['home']);

    t.actions.open();
    t.actions.createRoom();
    expect(t.actions.back()).toBe(true); // connecting: cancel
    expect(t.get().step).toBe('entry');

    t.actions.createRoom();
    t.sessions[1]!.events.lobby(lobbyMsg());
    expect(t.actions.back()).toBe(true);
    expect(t.get().confirmLeave).toBe(true);
    expect(t.get().step).toBe('room');
    expect(t.actions.back()).toBe(true);
    expect(t.get().confirmLeave).toBe(false);
    t.actions.requestLeave();
    t.actions.leaveRoom();
    expect(t.get().step).toBe('entry');
    expect(t.get().confirmLeave).toBe(false);

    t.actions.quickPlay();
    t.sessions[2]!.events.failed('room-full', '');
    expect(t.actions.back()).toBe(true);
    expect(t.get().step).toBe('entry');
  });
  it('during the match and results the menu does not take Esc', () => {
    const t = setup();
    t.actions.open();
    t.actions.createRoom();
    t.sessions[0]!.events.matchReady(driver());
    expect(t.actions.back()).toBe(false);
  });
});
