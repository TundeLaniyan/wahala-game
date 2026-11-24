/**
 * The online City Rumble flow (docs/ONLINE_INTEGRATION.md, decision ON10): one Zustand store plus the actions that drive a
 * `RumbleSession` and turn its events into the screen the player sees (entry -> connecting -> room -> loading -> match ->
 * results, or error). Everything the outside world offers (the session, the match hand-over, navigation, storage, the
 * endpoint, the clock) is injected, so the whole flow is unit-tested without a socket, a DOM or the game session. The
 * production wiring is `src/app/rumbleOnline.ts`. Online chunk only.
 *
 * The server is the only authority: this layer shows what the session reports and sends the player's requests
 * (create / join / ready / start / settings / rematch / leave); it never decides a lobby fact or a match result.
 */
import { create } from 'zustand';
import type {
  ConnStatus,
  JoinInfo,
  OpenRequest,
  RumbleSession,
  RumbleSessionEvents,
} from '../net/client/types';
import type { LobbyMsg, ResultsMsg, SettingsMsg } from '../net/protocol';
import type { RemoteMatchDriver, RemoteStatus } from './remoteMatch';
import { NAME_STORAGE_KEY, codeView, initialName, nameCheck, roomCodeFromSearch } from './rumbleEntryInput';
import type { FailReason } from './rumbleEntryInput';

export type FlowStep = 'entry' | 'connecting' | 'room' | 'loading' | 'match' | 'results' | 'error';

export interface FlowError {
  reason: FailReason | 'not-configured';
  detail: string | null;
}

export interface FlowNotice {
  /** Increases with every notice, so a view can dismiss exactly the one it showed. */
  id: number;
  code: string;
  message: string;
}

export interface RumbleOnlineState {
  step: FlowStep;
  /** The entry form. */
  name: string;
  codeInput: string;
  /** Latest lobby message and the clock reading when it arrived (countdowns tick locally between messages). */
  lobby: LobbyMsg | null;
  lobbyAt: number;
  /** The seat the server gave this client (welcome), null in the lobby. */
  seat: number | null;
  /** The room code as soon as the server told it (welcome), before the first lobby message. */
  roomCode: string | null;
  notice: FlowNotice | null;
  results: ResultsMsg | null;
  status: ConnStatus;
  statusDetail: string;
  error: FlowError | null;
  /** An online match (or its results / failure) is on the game screen: the overlay shows. */
  inMatch: boolean;
  /** The room screen is asking "leave this room?" (Back / Esc). */
  confirmLeave: boolean;
  /** The session is the in-memory fake (no server): views say so. */
  fake: boolean;
}

export interface FlowDeps {
  createSession(events: RumbleSessionEvents): RumbleSession;
  /** Hands the match over to the game (`commands.startRemote`). */
  startRemote(driver: RemoteMatchDriver): void;
  /** The build's endpoint, or null when online is not configured. */
  endpoint(): string | null;
  /** The fighter chosen in the game (GameSettings.character). */
  character(): string;
  storage: { get(key: string): string | null; set(key: string, value: string): void };
  search(): string;
  now(): number;
  fake: boolean;
  nav: {
    /** Shows the online flow over the menu (opens the menu screen). */
    show(): void;
    /** Hides it and shows Home. */
    home(): void;
    /** Leaves a match for the room screen of the menu. */
    toRoom(): void;
    /** Leaves a match for Home. */
    toTitle(): void;
    /** The existing Fighter screen. */
    chooseFighter(): void;
    /** Whether the online overlay (chip, banner, results) is wanted on the game screen. */
    overlay(active: boolean): void;
  };
}

const INITIAL: RumbleOnlineState = {
  step: 'entry',
  name: 'Player',
  codeInput: '',
  lobby: null,
  lobbyAt: 0,
  seat: null,
  roomCode: null,
  notice: null,
  results: null,
  status: 'idle',
  statusDetail: '',
  error: null,
  inMatch: false,
  confirmLeave: false,
  fake: false,
};

export function createRumbleOnlineFlow(deps: FlowDeps) {
  const useFlow = create<RumbleOnlineState>(() => ({ ...INITIAL, fake: deps.fake }));
  const set = useFlow.setState;
  const get = useFlow.getState;

  let session: RumbleSession | null = null;
  let driver: RemoteMatchDriver | null = null;
  /** Bumped for every new session: events of an older one are ignored. */
  let generation = 0;
  let lastRequest: OpenRequest | null = null;
  let noticeId = 0;

  const dropSession = (): void => {
    generation++;
    const old = session;
    session = null;
    driver = null;
    if (old) void old.leave().catch(() => undefined);
  };

  const fresh = (): Partial<RumbleOnlineState> => ({
    ...INITIAL,
    fake: deps.fake,
    name: initialName(deps.storage.get(NAME_STORAGE_KEY)),
    codeInput: roomCodeFromSearch(deps.search()) ?? '',
  });

  function eventsFor(mine: number): RumbleSessionEvents {
    const live = (): boolean => mine === generation;
    return {
      status(status, detail) {
        if (!live()) return;
        set({ status, statusDetail: detail });
      },
      welcome(msg) {
        if (!live()) return;
        set({ seat: msg.seat, roomCode: msg.roomCode });
      },
      lobby(msg) {
        if (!live()) return;
        const s = get();
        const patch: Partial<RumbleOnlineState> = { lobby: msg, lobbyAt: deps.now(), roomCode: msg.code };
        if (s.step === 'results' || s.step === 'match') {
          if (msg.phase === 'lobby') {
            // a rematch: back to the room, same members
            driver = null;
            deps.nav.overlay(false);
            deps.nav.toRoom();
            Object.assign(patch, {
              step: 'room',
              results: null,
              inMatch: false,
              error: null,
              confirmLeave: false,
            });
          }
        } else if (s.step === 'connecting' || s.step === 'room' || s.step === 'loading') {
          if (msg.phase === 'playing') patch.step = driver ? 'match' : 'loading';
          else if (msg.phase === 'lobby' || msg.phase === 'countdown') patch.step = 'room';
        }
        set(patch);
      },
      notice(msg) {
        if (!live()) return;
        set({ notice: { id: ++noticeId, code: msg.code, message: msg.message } });
      },
      results(msg) {
        if (!live()) return;
        deps.nav.overlay(true);
        set({ results: msg, step: 'results', inMatch: true, confirmLeave: false });
      },
      matchReady(d) {
        if (!live()) return;
        driver = d;
        deps.nav.overlay(true);
        set({ step: 'match', inMatch: true, confirmLeave: false, error: null });
        deps.startRemote(d);
      },
      failed(reason, detail) {
        if (!live()) return;
        set({ step: 'error', error: { reason, detail: detail || null }, confirmLeave: false });
      },
    };
  }

  function begin(req: OpenRequest): void {
    if (deps.endpoint() === null) {
      set({ step: 'error', error: { reason: 'not-configured', detail: null } });
      return;
    }
    dropSession();
    lastRequest = req;
    const mine = generation;
    const s = createSessionSafely(mine);
    session = s;
    set({
      step: get().inMatch ? get().step : 'connecting',
      error: null,
      notice: null,
      status: 'connecting',
      statusDetail: '',
      confirmLeave: false,
    });
    void s.open(req).catch((e: unknown) => {
      if (mine !== generation) return;
      set({
        step: 'error',
        error: { reason: 'unknown', detail: e instanceof Error ? e.message : String(e) },
      });
    });
  }

  function createSessionSafely(mine: number): RumbleSession {
    return deps.createSession(eventsFor(mine));
  }

  /** Validated join info for an entry action, or null (the form shows why). */
  function who(): JoinInfo | null {
    const check = nameCheck(get().name);
    if (!check.ok) return null;
    deps.storage.set(NAME_STORAGE_KEY, check.name);
    return { name: check.name, characterId: deps.character() };
  }

  const actions = {
    /** Shows the entry screen (fresh form unless a room is still open). */
    open(): void {
      const step = get().step;
      if (step === 'entry' || step === 'error' || step === 'connecting') {
        dropSession();
        set(fresh());
      }
      deps.nav.show();
    },
    /** Leaves any room and hides the flow (Home). */
    close(): void {
      dropSession();
      deps.nav.overlay(false);
      set(fresh());
      deps.nav.home();
    },
    setName(name: string): void {
      set({ name: name.slice(0, 64) });
    },
    setCodeInput(raw: string): void {
      set({ codeInput: codeView(raw).text });
    },
    createRoom(): void {
      const w = who();
      if (w) begin({ kind: 'create', who: w });
    },
    joinRoom(): void {
      const w = who();
      const code = codeView(get().codeInput).code;
      if (w && code) begin({ kind: 'join', who: w, code });
    },
    quickPlay(): void {
      const w = who();
      if (w) begin({ kind: 'quick', who: w });
    },
    chooseFighter(): void {
      deps.nav.chooseFighter();
    },
    ready(on: boolean): void {
      session?.ready(on);
    },
    start(): void {
      session?.start();
    },
    rematch(): void {
      session?.rematch();
    },
    settings(patch: SettingsMsg): void {
      session?.settings(patch);
    },
    /** Back / Esc in the room: ask first. */
    requestLeave(): void {
      set({ confirmLeave: true });
    },
    cancelLeave(): void {
      set({ confirmLeave: false });
    },
    /** LEAVE ROOM (confirmed): back to the entry screen. */
    leaveRoom(): void {
      dropSession();
      deps.nav.overlay(false);
      set({ ...fresh(), name: get().name, codeInput: get().codeInput });
    },
    /** Leaves the room and the match for Home (results "Back to menu"). */
    backToMenu(): void {
      dropSession();
      deps.nav.overlay(false);
      set(fresh());
      deps.nav.toTitle();
    },
    /** Try again: rejoins the current room when there is one, else repeats the last request. */
    retry(): void {
      const s = get();
      const req = lastRequest;
      if (!req) {
        actions.dismissError();
        return;
      }
      const code = s.lobby?.code ?? s.roomCode;
      begin(code && req.kind !== 'join' ? { kind: 'join', who: req.who, code } : req);
    },
    dismissError(): void {
      if (get().inMatch) {
        actions.backToMenu();
        return;
      }
      dropSession();
      set({ step: 'entry', error: null, lobby: null, status: 'idle', statusDetail: '', confirmLeave: false });
    },
    dismissNotice(id: number): void {
      if (get().notice?.id === id) set({ notice: null });
    },
    /**
     * Esc / gamepad B on the online screens. Returns true when it did something. Entry: leave the flow (Home). Room: ask
     * to leave (a second press cancels). Connecting / loading / error: back to the entry.
     */
    back(): boolean {
      const s = get();
      switch (s.step) {
        case 'entry':
          actions.close();
          return true;
        case 'room':
          if (s.confirmLeave) actions.cancelLeave();
          else actions.requestLeave();
          return true;
        case 'connecting':
        case 'loading':
          actions.leaveRoom();
          return true;
        case 'error':
          actions.dismissError();
          return true;
        default:
          return false;
      }
    },
    /** The live match connection (the HUD chip and the loading view read it); null before a driver exists. */
    driverStatus(): RemoteStatus | null {
      return driver ? driver.status() : null;
    },
    /** This client's seat in the match: the lobby's seat, else the welcome's, else the driver's. */
    youSeat(): number | null {
      const s = get();
      const m = s.lobby && s.lobby.you !== null ? s.lobby.members[s.lobby.you] : undefined;
      return m?.seat ?? s.seat ?? driver?.localId ?? null;
    },
    hasSession(): boolean {
      return session !== null;
    },
  };

  return { useFlow, actions };
}

export type RumbleOnlineFlow = ReturnType<typeof createRumbleOnlineFlow>;
