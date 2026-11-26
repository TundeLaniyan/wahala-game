/**
 * The player-platform side of Online City Rumble (docs/PLATFORM_CLIENT.md): one Zustand store and the actions the platform
 * screens call (guest identity, nickname, friends, blocks, mutes, reports, parties and the party's private-match handoff).
 * Everything outside is injected (the HTTP client, the room bridge to the online flow, the timers), so the whole controller
 * is unit-tested with a fake platform and no DOM. Online chunk only; nothing runs until `open()` (the Online screen opened).
 *
 * Rules kept here:
 *  - the platform is OPTIONAL: when it does not answer, the panels say "unavailable" and online play stays guest-only; a
 *    platform failure never touches the room or a running match (the room bridge is only called on the player's request or
 *    to join the party's room from the entry screen);
 *  - the party is polled (about every 2 s) only while a platform panel is on screen; invitations and friend requests less
 *    often; a presence heartbeat every 30 s while the Online screen is open (the platform forgets presence after 90 s);
 *  - a match ticket is fetched right before it is used (single use, 120 s) and never kept: a retry fetches a new one.
 */
import { create } from 'zustand';
import { ROOM_CODE_ALPHABET } from '../../net/protocol';
import { isOutage } from './client';
import type { PlatformClient, PlatformError, Result } from './client';
import type {
  BlockView,
  FriendView,
  InviteView,
  MuteView,
  MyProfile,
  PartyMode,
  PartyView,
  ReportCategory,
  ReportContext,
  RequestView,
} from './types';
import { REPORT_NOTE_MAX } from './types';

export type PlatformPhase = 'idle' | 'connecting' | 'ready' | 'unavailable';
export type PlatformTab = 'you' | 'friends' | 'party';
/** Where the party's match handoff is: fetching a ticket / opening the room / telling the party the code. */
export type HandoffState = 'idle' | 'opening' | 'reporting' | 'joining';

export interface PlatformMessage {
  /** Increases with every message, so a view can dismiss exactly the one it showed. */
  id: number;
  tone: 'good' | 'bad' | 'info';
  text: string;
}

export interface PlatformState {
  phase: PlatformPhase;
  me: MyProfile | null;
  friends: FriendView[];
  incoming: RequestView[];
  outgoing: RequestView[];
  blocks: BlockView[];
  mutes: MuteView[];
  invites: InviteView[];
  party: PartyView | null;
  tab: PlatformTab;
  /** The action in flight (its key), so its button shows busy and is not pressed twice. */
  busy: string | null;
  message: PlatformMessage | null;
  /** Why the last nickname change was refused (shown under the field), else null. */
  nameError: string | null;
  /** The last poll got no answer: the panel says the player service is unreachable (and keeps retrying). */
  stale: boolean;
  handoff: HandoffState;
}

/** What the controller may ask of the online flow (src/app/rumbleOnlineFlow.ts implements it). */
export interface RoomBridge {
  /** The code of the room this client is in or joining, null at the entry. */
  currentRoom(): string | null;
  /** True while the player is on the entry screen (not in, or joining, a room). */
  atEntry(): boolean;
  /**
   * Opens a private room with a ticket: `create` with the leader's HOST ticket, `join` with a member ticket. `refetch` gives a
   * NEW ticket (or null) for the one retry after a ticket refusal and for "Try again".
   */
  open(
    req: { kind: 'create' } | { kind: 'join'; code: string },
    ticket: string,
    refetch: () => Promise<string | null>,
  ): void;
  /** The name typed on the entry screen (offered as the first nickname). */
  name(): string;
  /** Shows the platform nickname on the entry screen too (unticketed rooms use that field). */
  setName(name: string): void;
}

export interface Timers {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
}

export interface ControllerDeps {
  client: PlatformClient;
  room: RoomBridge;
  timers?: Timers;
  /** Party poll period while a panel is visible (default 2000 ms). */
  pollMs?: number;
  /** Presence heartbeat period while the Online screen is open (default 30 000 ms). */
  heartbeatMs?: number;
}

const INITIAL: PlatformState = {
  phase: 'idle',
  me: null,
  friends: [],
  incoming: [],
  outgoing: [],
  blocks: [],
  mutes: [],
  invites: [],
  party: null,
  tab: 'you',
  busy: null,
  message: null,
  nameError: null,
  stale: false,
  handoff: 'idle',
};

export const FRIEND_CODE_LENGTH = 8;
const CODE_SET = new Set(ROOM_CODE_ALPHABET);

/** Cleans a typed friend or party code (case, spaces, dashes); `code` is null until it can be one. */
export function cleanCode(raw: string, length = FRIEND_CODE_LENGTH): { text: string; code: string | null } {
  const text = [...raw.toUpperCase()]
    .filter((c) => /[A-Z0-9]/.test(c))
    .slice(0, length)
    .join('');
  return { text, code: text.length === length && [...text].every((c) => CODE_SET.has(c)) ? text : null };
}

const minutes = (ms: number): string => {
  const m = Math.ceil(ms / 60000);
  return m >= 90 ? `about ${Math.ceil(m / 60)} hours` : m <= 1 ? 'a minute' : `${m} minutes`;
};

/** The plain words for a platform error (its own message for refusals; a fixed line for an outage). */
export function errorText(e: PlatformError): string {
  if (isOutage(e))
    return 'The player service is not reachable right now. Online play still works without it.';
  if (e.code === 'rate_limited')
    return e.retryAfterMs && e.retryAfterMs > 60_000
      ? `${e.message.replace(/\.$/, '')}. Try again in ${minutes(e.retryAfterMs)}.`
      : `${e.message.replace(/\.$/, '')}. Wait a moment and try again.`;
  if (e.code === 'unauthenticated') return 'Your player session ended. Tap Retry to start again.';
  return e.message;
}

/** The nickname refusal in plain words (`name_taken`, `name_rejected`, the once-a-day cooldown). */
export function nameErrorText(e: PlatformError): string {
  if (e.code === 'name_taken') return 'That name is already taken. Try another one.';
  if (e.code === 'name_rejected') return e.message || 'That name is not allowed.';
  if (e.code === 'rate_limited')
    return e.retryAfterMs
      ? `You can change your name once a day. Try again in ${minutes(e.retryAfterMs)}.`
      : 'You can change your name once a day.';
  return errorText(e);
}

/**
 * Which report context fits (the platform needs a REAL interaction): the match both played (its id), else the party both
 * are in, else a friendship. null = this player cannot be reported from here.
 */
export function reportContext(
  target: string,
  where: { matchId: string | null; party: PartyView | null; friends: readonly FriendView[] },
): { context: ReportContext; contextRef: string | null } | null {
  if (where.matchId) return { context: 'match', contextRef: where.matchId };
  if (where.party?.members.some((m) => m.playerId === target))
    return { context: 'party', contextRef: where.party.id };
  if (where.friends.some((f) => f.playerId === target)) return { context: 'profile', contextRef: null };
  return null;
}

/** The note exactly as the platform will accept it: trimmed, spaces collapsed, at most 200 characters, empty = none. */
export function cleanReportNote(raw: string): string | null {
  const t = raw.replace(/\s+/g, ' ').trim();
  return t === '' ? null : [...t].slice(0, REPORT_NOTE_MAX).join('');
}

const defaultTimers: Timers = {
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
};

export function createPlatformController(deps: ControllerDeps) {
  const useStore = create<PlatformState>(() => ({ ...INITIAL }));
  const set = useStore.setState;
  const get = useStore.getState;
  const client = deps.client;
  const timers = deps.timers ?? defaultTimers;
  const pollMs = deps.pollMs ?? 2000;
  const heartbeatMs = deps.heartbeatMs ?? 30_000;

  let opened = false;
  let visible = 0;
  let pollTimer: unknown = null;
  let beatTimer: unknown = null;
  let ticks = 0;
  let messageId = 0;
  let connecting: Promise<void> | null = null;
  /** The party whose room code still has to be reported (the leader created the room with a host ticket). */
  let pendingReport: string | null = null;
  /** Room codes this client already joined (or was sent to) automatically: never twice for the same code. */
  const autoJoined = new Set<string>();
  /** The player left the party themselves (no "you are no longer in the party" line). */
  let leaving = false;
  let polling = false;

  const say = (tone: PlatformMessage['tone'], text: string): void =>
    set({ message: { id: ++messageId, tone, text } });

  /** Common handling of a failed call: an outage marks the panel stale, a dead session goes back to "unavailable". */
  function failed(e: PlatformError, quiet = false): void {
    if (e.code === 'unauthenticated' && !client.hasSession()) {
      set({ phase: 'unavailable', busy: null, handoff: 'idle' });
      say('bad', errorText(e));
      return;
    }
    if (isOutage(e)) set({ stale: true });
    if (!quiet) say('bad', errorText(e));
  }

  /** Runs one user action with its busy key; returns the result (the action's own follow-up decides the message). */
  async function act<T>(key: string, run: () => Promise<Result<T>>): Promise<Result<T>> {
    set({ busy: key });
    try {
      const r = await run();
      if (r.ok) set({ stale: false });
      else failed(r.error);
      return r;
    } finally {
      if (get().busy === key) set({ busy: null });
    }
  }

  // ---------------------------------------------------------------- loading and polling

  async function loadSocial(): Promise<void> {
    const [friends, requests, blocks, mutes, invites] = await Promise.all([
      client.friends(),
      client.requests(),
      client.blocks(),
      client.mutes(),
      client.invites(),
    ]);
    const patch: Partial<PlatformState> = {};
    if (friends.ok) patch.friends = friends.value;
    if (requests.ok) {
      patch.incoming = requests.value.incoming;
      patch.outgoing = requests.value.outgoing;
    }
    if (blocks.ok) patch.blocks = blocks.value;
    if (mutes.ok) patch.mutes = mutes.value;
    if (invites.ok) patch.invites = invites.value;
    set(patch);
  }

  async function loadFriends(): Promise<void> {
    const [friends, requests] = await Promise.all([client.friends(), client.requests()]);
    const patch: Partial<PlatformState> = {};
    if (friends.ok) patch.friends = friends.value;
    if (requests.ok) {
      patch.incoming = requests.value.incoming;
      patch.outgoing = requests.value.outgoing;
    }
    set(patch);
  }

  /** A party view arrived (poll or action): note departures, and send this client to the party's room when it opens. */
  function applyParty(party: PartyView | null): void {
    const prev = get().party;
    set({ party });
    if (prev && !party && !leaving)
      say('info', 'You are no longer in a party (it closed, or the leader removed you).');
    if (!party) {
      leaving = false;
      pendingReport = null;
      return;
    }
    const code = party.match?.roomCode ?? null;
    if (
      party.status === 'in_match' &&
      code &&
      deps.room.currentRoom() !== code &&
      deps.room.atEntry() &&
      get().handoff === 'idle' &&
      !autoJoined.has(code)
    ) {
      autoJoined.add(code);
      void actions.joinMatch();
    }
  }

  async function pollParty(): Promise<void> {
    if (polling || get().phase !== 'ready') return;
    polling = true;
    try {
      const r = await client.currentParty();
      if (r.ok) {
        set({ stale: false });
        applyParty(r.value);
      } else failed(r.error, true);
      if (ticks % 3 === 0) {
        const inv = await client.invites();
        if (inv.ok) set({ invites: inv.value });
        await loadFriends();
      }
    } finally {
      polling = false;
    }
  }

  function startTimers(): void {
    if (pollTimer === null)
      pollTimer = timers.setInterval(() => {
        ticks++;
        if (visible > 0) void pollParty();
      }, pollMs);
    if (beatTimer === null)
      beatTimer = timers.setInterval(() => {
        if (get().phase === 'ready') void client.heartbeat('online');
      }, heartbeatMs);
  }

  function stopTimers(): void {
    if (pollTimer !== null) timers.clearInterval(pollTimer);
    if (beatTimer !== null) timers.clearInterval(beatTimer);
    pollTimer = null;
    beatTimer = null;
  }

  async function connect(): Promise<void> {
    set({ phase: 'connecting', message: null });
    const typed = deps.room.name().trim();
    const me = await client.ensureGuest(typed && typed !== 'Player' ? typed : undefined);
    if (!opened) {
      set({ phase: me.ok ? 'ready' : 'idle', me: me.ok ? me.value : null });
      return;
    }
    if (!me.ok) {
      set({ phase: 'unavailable', stale: isOutage(me.error) });
      return;
    }
    set({ phase: 'ready', me: me.value, stale: false });
    deps.room.setName(me.value.displayName);
    void client.heartbeat('online');
    await Promise.all([loadSocial(), pollParty()]);
  }

  async function ticketFor(partyId: string): Promise<string | null> {
    const r = await client.ticket(partyId);
    return r.ok ? r.value.ticket : null;
  }

  const actions = {
    /** The Online screen opened: sign in as a guest (first time) and start the presence heartbeat. */
    open(): Promise<void> {
      opened = true;
      startTimers();
      if (get().phase === 'ready' || connecting) return connecting ?? Promise.resolve();
      connecting = connect().finally(() => {
        connecting = null;
      });
      return connecting;
    },
    /** The Online screen closed: every timer stops (nothing polls in the background). */
    close(): void {
      opened = false;
      visible = 0;
      stopTimers();
    },
    /** "Retry" on the unavailable panel. */
    retry(): Promise<void> {
      set({ phase: 'idle' });
      return actions.open();
    },
    /** A platform panel is on screen (`show` returns the matching `hide`): the party is polled only meanwhile. */
    show(): () => void {
      visible++;
      if (visible === 1) void pollParty();
      let done = false;
      return () => {
        if (done) return;
        done = true;
        visible = Math.max(0, visible - 1);
      };
    },
    setTab(tab: PlatformTab): void {
      set({ tab });
    },
    dismissMessage(id: number): void {
      if (get().message?.id === id) set({ message: null });
    },

    // ---------------------------------------------------------------- identity
    async setNickname(raw: string): Promise<boolean> {
      const name = raw.replace(/\s+/g, ' ').trim();
      if (name === '' || name === get().me?.displayName) return false;
      set({ nameError: null });
      const r = await act('name', () => client.setNickname(name));
      if (!r.ok) {
        set({ nameError: nameErrorText(r.error), message: null });
        return false;
      }
      set({ me: r.value });
      deps.room.setName(r.value.displayName);
      say('good', 'Name changed.');
      return true;
    },

    // ---------------------------------------------------------------- friends and blocks
    async addFriend(raw: string): Promise<boolean> {
      const { code } = cleanCode(raw);
      if (!code) {
        say('bad', `A friend code is ${FRIEND_CODE_LENGTH} letters and digits.`);
        return false;
      }
      if (code === get().me?.friendCode) {
        say('bad', 'That is your own friend code.');
        return false;
      }
      const r = await act('add-friend', () => client.sendFriendRequest(code));
      if (!r.ok) return false;
      say('good', r.value.status === 'accepted' ? 'You are now friends.' : 'Friend request sent.');
      await loadFriends();
      return true;
    },
    async acceptRequest(id: string): Promise<void> {
      const r = await act(`req-${id}`, () => client.acceptRequest(id));
      if (r.ok) say('good', 'Friend added.');
      await loadFriends();
    },
    async declineRequest(id: string): Promise<void> {
      await act(`req-${id}`, () => client.declineRequest(id));
      await loadFriends();
    },
    async cancelRequest(id: string): Promise<void> {
      await act(`req-${id}`, () => client.cancelRequest(id));
      await loadFriends();
    },
    async removeFriend(playerId: string): Promise<void> {
      const r = await act(`friend-${playerId}`, () => client.removeFriend(playerId));
      if (r.ok) say('info', 'Friend removed.');
      await loadFriends();
    },
    async block(playerId: string): Promise<boolean> {
      const r = await act(`block-${playerId}`, () => client.block(playerId));
      if (!r.ok) return false;
      say('info', 'Blocked. You will not see their signals, requests or invitations.');
      await loadSocial();
      return true;
    },
    async unblock(playerId: string): Promise<void> {
      const r = await act(`block-${playerId}`, () => client.unblock(playerId));
      if (r.ok) say('info', 'Unblocked.');
      const b = await client.blocks();
      if (b.ok) set({ blocks: b.value });
    },
    async mute(playerId: string): Promise<boolean> {
      const r = await act(`mute-${playerId}`, () => client.mute(playerId));
      if (!r.ok) return false;
      say('info', 'Muted. You will not see their signals; they are not told.');
      const m = await client.mutes();
      if (m.ok) set({ mutes: m.value });
      return true;
    },
    async unmute(playerId: string): Promise<void> {
      const r = await act(`mute-${playerId}`, () => client.unmute(playerId));
      if (r.ok) say('info', 'Unmuted.');
      const m = await client.mutes();
      if (m.ok) set({ mutes: m.value });
    },
    isMuted(playerId: string): boolean {
      return get().mutes.some((m) => m.playerId === playerId);
    },
    isBlocked(playerId: string): boolean {
      return get().blocks.some((b) => b.playerId === playerId);
    },
    /**
     * Files a report about a player met here. `matchId` is the match both played (from the room), when there is one. Returns
     * false (with the reason shown) when the platform refuses or this player cannot be reported from here.
     */
    async report(
      playerId: string,
      category: ReportCategory,
      note: string,
      matchId: string | null,
    ): Promise<boolean> {
      const where = reportContext(playerId, { matchId, party: get().party, friends: get().friends });
      if (!where) {
        say('bad', 'You can report a player after a match with them, or from your party or friends list.');
        return false;
      }
      const r = await act(`report-${playerId}`, () =>
        client.report({ reportedId: playerId, category, ...where, note: cleanReportNote(note) }),
      );
      if (!r.ok) return false;
      say('good', r.value.duplicate ? 'You already reported this. Thank you.' : 'Report sent. Thank you.');
      return true;
    },

    // ---------------------------------------------------------------- parties
    async createParty(mode: PartyMode = 'ffa'): Promise<void> {
      const r = await act('party', () => client.createParty(mode));
      if (r.ok) applyParty(r.value);
    },
    async joinParty(raw: string): Promise<boolean> {
      const { code } = cleanCode(raw);
      if (!code) {
        say('bad', `A party code is ${FRIEND_CODE_LENGTH} letters and digits.`);
        return false;
      }
      const r = await act('party', () => client.joinParty(code));
      if (r.ok) applyParty(r.value);
      return r.ok;
    },
    async leaveParty(): Promise<void> {
      const p = get().party;
      if (!p) return;
      leaving = true;
      const r = await act('party', () => client.leaveParty(p.id));
      if (r.ok) {
        applyParty(null);
        say('info', 'You left the party.');
      } else leaving = false;
    },
    async setMode(mode: PartyMode): Promise<void> {
      const p = get().party;
      if (!p || p.mode === mode) return;
      const r = await act('party-mode', () => client.setPartyMode(p.id, mode));
      if (r.ok) applyParty(r.value);
    },
    async setReady(ready: boolean): Promise<void> {
      const p = get().party;
      if (!p) return;
      const r = await act('party-ready', () => client.setReady(p.id, ready));
      if (r.ok) applyParty(r.value);
    },
    async kick(playerId: string): Promise<void> {
      const p = get().party;
      if (!p) return;
      const r = await act(`member-${playerId}`, () => client.kick(p.id, playerId));
      if (r.ok) applyParty(r.value);
    },
    async promote(playerId: string): Promise<void> {
      const p = get().party;
      if (!p) return;
      const r = await act(`member-${playerId}`, () => client.promote(p.id, playerId));
      if (r.ok) applyParty(r.value);
    },
    async invite(friendId: string): Promise<void> {
      const p = get().party;
      if (!p) return;
      const r = await act(`invite-${friendId}`, () => client.invite(p.id, friendId));
      if (r.ok) say('good', 'Invitation sent (it lasts 10 minutes).');
    },
    async acceptInvite(id: string): Promise<void> {
      const r = await act(`inv-${id}`, () => client.acceptInvite(id));
      if (r.ok) {
        applyParty(r.value);
        set({ tab: 'party' });
      }
      const inv = await client.invites();
      if (inv.ok) set({ invites: inv.value });
    },
    async declineInvite(id: string): Promise<void> {
      await act(`inv-${id}`, () => client.declineInvite(id));
      const inv = await client.invites();
      if (inv.ok) set({ invites: inv.value });
    },

    // ---------------------------------------------------------------- the match handoff
    /**
     * Leader: "Start private match". Gets a HOST ticket, creates the private room with it (the online flow), and reports the
     * room code to the party as soon as the room has one (`roomChanged`).
     */
    async startMatch(): Promise<void> {
      let p = get().party;
      if (!p?.you.isLeader || get().handoff !== 'idle') return;
      set({ handoff: 'opening' });
      try {
        if (p.status === 'in_match') {
          // the old room is over or abandoned: the party is a lobby again before a new room is opened
          const closed = await act('handoff', () => client.closeMatch(p!.id));
          if (!closed.ok) return;
          p = closed.value;
          set({ party: p });
        }
        const partyId = p.id;
        const t = await act('handoff', () => client.ticket(partyId));
        if (!t.ok) return;
        if (!t.value.host && t.value.roomCode) {
          // someone reported a room in the meantime: join it instead
          deps.room.open({ kind: 'join', code: t.value.roomCode }, t.value.ticket, () => ticketFor(partyId));
          return;
        }
        pendingReport = partyId;
        deps.room.open({ kind: 'create' }, t.value.ticket, () => ticketFor(partyId));
      } finally {
        if (get().handoff === 'opening') set({ handoff: 'idle' });
      }
    },
    /** Member (or a leader who left the room): join the party's open room with a fresh member ticket. */
    async joinMatch(): Promise<void> {
      const p = get().party;
      const code = p?.match?.roomCode;
      if (!p || !code || get().handoff !== 'idle') return;
      set({ handoff: 'joining' });
      try {
        autoJoined.add(code);
        const partyId = p.id;
        const t = await act('handoff', () => client.ticket(partyId));
        if (!t.ok) return;
        deps.room.open({ kind: 'join', code: t.value.roomCode ?? code }, t.value.ticket, () =>
          ticketFor(partyId),
        );
      } finally {
        if (get().handoff === 'joining') set({ handoff: 'idle' });
      }
    },
    /**
     * The online flow's room changed (`code` null = no room). `ticketed` says whether this room was opened with a platform
     * ticket: only such a room is ever reported to the party (a Quick Play room never is).
     */
    async roomChanged(code: string | null, ticketed: boolean): Promise<void> {
      if (!code) return;
      autoJoined.add(code);
      if (!ticketed) {
        pendingReport = null;
        return;
      }
      const partyId = pendingReport;
      if (!partyId) return;
      pendingReport = null;
      set({ handoff: 'reporting' });
      try {
        const r = await act('handoff', () => client.openMatch(partyId, code));
        if (r.ok) {
          set({ party: r.value });
          say('good', 'Your party can join the room now.');
        } else say('bad', `Your party was not told the room code. Share the code ${code} with them.`);
      } finally {
        if (get().handoff === 'reporting') set({ handoff: 'idle' });
      }
    },
    /** Leader, outside the room: the party is a lobby again (the room was abandoned). */
    async endMatch(): Promise<void> {
      const p = get().party;
      if (!p?.you.isLeader || p.status !== 'in_match') return;
      const r = await act('handoff', () => client.closeMatch(p.id));
      if (r.ok) applyParty(r.value);
    },
  };

  return { useStore, actions };
}

export type PlatformController = ReturnType<typeof createPlatformController>;
