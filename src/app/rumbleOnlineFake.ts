/**
 * FAKE online session: an in-memory, scripted implementation of `RumbleSession` (src/net/client/types.ts) so the online
 * screens can be developed, tested and photographed without a server. It is NOT the real client and never opens a socket
 * or a fetch. It exists only inside the online chunk (imported by src/app/rumbleOnlineSession.ts, which the release owner
 * repoints at the real `createRumbleSession`), so a default build contains none of it.
 *
 * Dev query (read here, nowhere else): `?online&fakeonline[=scenario]` with scenario one of
 *   happy (default)  create / join / quick all succeed and the match runs and ends
 *   hold             `open` never answers (the "connecting" screen stays up)
 *   unreachable | notfound | full | busy | limited | refused | protocol   `open` fails with that reason
 * and, whenever `fakeonline` is present, `window.__WAHALA_FAKE_ONLINE__` exposes the event emitters and a few shortcuts so a
 * browser script can put every screen into any state (the screenshot tool does exactly that).
 */
import type { ConnStatus, OpenRequest, RumbleSession, RumbleSessionEvents } from '../net/client/types';
import type {
  LobbyMemberView,
  LobbyMsg,
  LobbyPhase,
  ResultsMsg,
  RoomSettings,
  SettingsMsg,
} from '../net/protocol';
import { quickModeGame } from '../net/protocol';
import type { RemoteMatchDriver, RemoteStatus } from './remoteMatch';

type Scenario =
  'happy' | 'hold' | 'unreachable' | 'notfound' | 'full' | 'busy' | 'limited' | 'refused' | 'protocol';

const FAIL: Record<Exclude<Scenario, 'happy' | 'hold'>, Parameters<RumbleSessionEvents['failed']>[0]> = {
  unreachable: 'unreachable',
  notfound: 'room-not-found',
  full: 'room-full',
  busy: 'server-busy',
  limited: 'rate-limited',
  refused: 'refused',
  protocol: 'protocol',
};

const GUESTS: [string, string, boolean][] = [
  ['Tunde', 'streetBaller', true],
  ['Ngozi', 'streetBaller', false],
  ['Chidi_77', 'streetBaller', true],
  ['Emeka', 'streetBaller', false],
];

/** A driver with no match behind it: enough for the flow and the HUD chip (the real one is built by the release owner). */
export class FakeDriver implements RemoteMatchDriver {
  readonly localId = 0;
  current: RemoteStatus = { connection: 'connected', rttMs: 48, bufferedTicks: 3, detail: null };
  private done = false;
  state() {
    return null;
  }
  advance() {
    return { events: [], alpha: 0 };
  }
  sendIntent(): void {}
  status(): RemoteStatus {
    return this.current;
  }
  ended(): boolean {
    return this.done;
  }
  dispose(): void {}
}

export interface FakeControl {
  events: RumbleSessionEvents;
  driver: FakeDriver;
  lobby(patch?: Partial<LobbyMsg>): void;
  results(patch?: Partial<ResultsMsg>): void;
  status(status: ConnStatus, detail?: string, rttMs?: number | null): void;
}

declare global {
  interface Window {
    __WAHALA_FAKE_ONLINE__?: FakeControl;
  }
}

/** A 32-fighter result: you (seat 0) second behind Tunde, three more humans, the rest bots. */
export function fakeResults(you = 'Player'): ResultsMsg {
  const names = [you, ...['Tunde', 'Ngozi', 'Chidi_77', 'Emeka'].filter((n) => n !== you)].slice(0, 4);
  const placementOf = (seat: number): number => (seat === 0 ? 2 : seat === 1 ? 1 : seat + 1);
  const players = Array.from({ length: 32 }, (_, seat) => ({
    seat,
    name: seat < 4 ? names[seat]! : `Bot ${String(seat - 3).padStart(2, '0')}`,
    isBot: seat >= 4,
    team: null,
    placement: placementOf(seat),
    kills: Math.max(0, 12 - placementOf(seat)),
    deaths: placementOf(seat) % 5,
    assists: placementOf(seat) % 3,
    // the optional bot-time fields the server may add (docs/ONLINE_INTEGRATION.md section 6)
    ...(seat === 2 ? { autopilotSeconds: 14, botKills: 2, botDeaths: 0, botAssists: 1, drops: 1 } : {}),
  }));
  return {
    matchId: 'fake',
    tick: 18000,
    winnerSeat: 1,
    winnerTeam: null,
    draw: false,
    stateHash: 0,
    players,
  };
}

export function createFakeSession(events: RumbleSessionEvents): RumbleSession {
  const search = typeof location !== 'undefined' ? location.search : '';
  const q = new URLSearchParams(search);
  const raw = q.get('fakeonline');
  const scenario: Scenario =
    raw === 'hold' ? 'hold' : raw && Object.hasOwn(FAIL, raw) ? (raw as Scenario) : 'happy';
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let status: ConnStatus = 'idle';
  let driver: FakeDriver | null = null;
  let left = false;

  const later = (ms: number, fn: () => void): void => {
    const t = setTimeout(() => {
      timers.delete(t);
      if (!left) fn();
    }, ms);
    timers.add(t);
  };

  let you = 0;
  let myName = 'Player';
  let lobby: LobbyMsg = {
    code: 'K7M3QX',
    phase: 'lobby',
    private: true,
    members: [],
    settings: { arenaId: 'rumbleOshodi', game: 'deathmatch', durationSec: 300, botDifficulty: 'standard' },
    countdownMs: null,
    autoStartMs: null,
    botsToFill: 31,
    you: 0,
  };

  const setStatus = (s: ConnStatus, detail = ''): void => {
    status = s;
    events.status(s, detail);
  };
  const sendLobby = (patch: Partial<LobbyMsg> = {}): void => {
    const members = patch.members ?? lobby.members;
    lobby = { ...lobby, ...patch, members, botsToFill: patch.botsToFill ?? 32 - members.length, you };
    events.lobby(lobby);
  };
  const phase = (p: LobbyPhase, extra: Partial<LobbyMsg> = {}): void => sendLobby({ phase: p, ...extra });

  function guests(n: number, ready: boolean): LobbyMemberView[] {
    return GUESTS.filter(([name]) => name !== myName)
      .slice(0, n)
      .map(([name, characterId, r]) => ({
        name,
        characterId,
        ready: ready && r,
        isHost: false,
        seat: null,
        connected: true,
      }));
  }

  function playMatch(): void {
    phase('countdown', { countdownMs: 3000 });
    later(3000, () => {
      phase('playing', { countdownMs: null });
      later(1200, () => {
        driver = new FakeDriver();
        events.matchReady(driver);
        later(5000, () => {
          events.results(fakeResults(myName));
          phase('results');
        });
      });
    });
  }

  const self: RumbleSession = {
    get driver() {
      return driver;
    },
    get status() {
      return status;
    },
    async open(req: OpenRequest): Promise<void> {
      left = false;
      setStatus('connecting');
      if (scenario === 'hold') return;
      if (scenario !== 'happy') {
        later(350, () => {
          setStatus('closed', 'fake failure');
          events.failed(FAIL[scenario as keyof typeof FAIL], `fake scenario "${scenario}"`, 20);
        });
        return;
      }
      later(350, () => {
        setStatus('connected');
        const create = req.kind === 'create';
        const me: LobbyMemberView = {
          name: req.who.name,
          characterId: req.who.characterId,
          ready: false,
          isHost: create,
          seat: null,
          connected: true,
        };
        const host: LobbyMemberView = {
          name: 'Adaeze',
          characterId: 'streetBaller',
          ready: true,
          isHost: true,
          seat: null,
          connected: true,
        };
        const code = req.kind === 'join' ? req.code : lobby.code;
        myName = req.who.name;
        you = create ? 0 : 1;
        events.welcome({ descriptor: null, seat: null, roomCode: code });
        sendLobby({
          code,
          private: req.kind !== 'quick',
          members: create ? [me] : [host, me, ...guests(req.kind === 'quick' ? 3 : 2, true)],
          autoStartMs: req.kind === 'quick' ? 20000 : null,
          ...(req.kind === 'quick'
            ? { settings: { ...lobby.settings, game: quickModeGame(req.mode), friendlyFire: false } }
            : {}),
        });
        if (create) later(900, () => sendLobby({ members: [me, ...guests(2, true)] }));
      });
    },
    ready(on) {
      const members = lobby.members.map((m, i) => (i === you ? { ...m, ready: on } : m));
      sendLobby({ members });
    },
    start() {
      if (lobby.members[you]?.isHost) playMatch();
    },
    rematch() {
      driver = null;
      const members = lobby.members.map((m) => ({ ...m, ready: false, seat: null }));
      phase('lobby', { members });
    },
    settings(patch: SettingsMsg) {
      if (!lobby.members[you]?.isHost) return;
      sendLobby({ settings: { ...lobby.settings, ...patch } as RoomSettings });
    },
    async leave(): Promise<void> {
      left = true;
      for (const t of timers) clearTimeout(t);
      timers.clear();
      driver = null;
      if (status !== 'idle') status = 'closed';
    },
  };

  if (typeof window !== 'undefined' && q.has('fakeonline')) {
    window.__WAHALA_FAKE_ONLINE__ = {
      events,
      get driver() {
        return (driver ??= new FakeDriver());
      },
      lobby: (p) => sendLobby(p),
      results: (p) => events.results({ ...fakeResults(myName), ...p }),
      status: (s, detail = '', rttMs = 48) => {
        const d = (driver ??= new FakeDriver());
        d.current = {
          connection: s === 'idle' ? 'connecting' : s,
          rttMs,
          bufferedTicks: 3,
          detail: detail || null,
        };
        setStatus(s, detail);
      },
    };
  }
  return self;
}
