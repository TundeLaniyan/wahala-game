/**
 * Pure view models of the online City Rumble screens (docs/ONLINE_INTEGRATION.md, decision ON10): what each screen shows
 * and which control is allowed, derived from the server's own messages (`LobbyMsg`, `ResultsMsg`, `RemoteStatus`).
 * No React, no DOM, no network: unit-tested in tests/ui/rumble-online-models.test.ts. Names are only ever DATA here;
 * the views render them as React text (never HTML).
 */
import { MATCH_SEATS, PUBLIC_WAIT_SECONDS, ROOM_CODE_LENGTH } from '../../../net/protocol';
import { codeView, nameCheck } from '../../../app/rumbleEntryInput';
import type { CodeView, FailReason, NameCheck } from '../../../app/rumbleEntryInput';
import type { LobbyMemberView, LobbyMsg, LobbyPhase, ResultsMsg, RoomSettings } from '../../../net/protocol';
import type { ConnStatus } from '../../../net/client/types';
import type { RemoteStatus } from '../../../app/remoteMatch';
import { RUMBLE_ARENA_IDS, TEAM_NAMES, getArena } from '../../../sim';
import { RUMBLE_MODE_INFO } from '../../../app/setupSummary';
import { LEVEL_LABEL } from '../../difficultyPicker';

// ---------------------------------------------------------------- entry: name, code, link

export {
  DEFAULT_PLAYER_NAME,
  NAME_STORAGE_KEY,
  codeView,
  initialName,
  nameCheck,
  roomCodeFromSearch,
} from '../../../app/rumbleEntryInput';
export type { CodeView, FailReason, NameCheck } from '../../../app/rumbleEntryInput';

/** The invite link of a room: this page's own address plus `?online&room=CODE` (the runtime switch that shows the entry). */
export function inviteLink(code: string, loc: { origin: string; pathname: string }): string {
  return `${loc.origin}${loc.pathname}?online&room=${code}`;
}

export interface EntryView {
  name: NameCheck;
  code: CodeView;
  /** Online is configured in this build (an endpoint exists); without it nothing can be tried. */
  configured: boolean;
  canCreate: boolean;
  canQuick: boolean;
  canJoin: boolean;
  /** Why JOIN is disabled, null when it is allowed. */
  joinReason: string | null;
}

/** What the entry screen allows for the typed name and code. */
export function entryModel(name: string, codeInput: string, configured: boolean): EntryView {
  const check = nameCheck(name);
  const code = codeView(codeInput);
  const base = configured && check.ok;
  return {
    name: check,
    code,
    configured,
    canCreate: base,
    canQuick: base,
    canJoin: base && code.code !== null,
    joinReason: !configured
      ? 'Online is not configured in this build.'
      : !check.ok
        ? check.reason
        : code.code === null
          ? `Enter the ${ROOM_CODE_LENGTH}-character room code.`
          : null,
  };
}

/** What QUICK PLAY does, in plain words: the wait is the server's rule (`PUBLIC_WAIT_SECONDS`), then bots fill the seats. */
export const quickPlayNote = (): string =>
  `A public room: it waits up to ${PUBLIC_WAIT_SECONDS} seconds for other players (it starts sooner when ${MATCH_SEATS} are in), then bots, clearly marked BOT, fill the empty seats.`;

// ---------------------------------------------------------------- failures

export interface ErrorView {
  title: string;
  text: string;
  /** Another try can help (connection, a full room later); a wrong code or a protocol mismatch needs a change first. */
  canRetry: boolean;
  /** Extra detail from the server or the browser, shown small, null when none. */
  detail: string | null;
}

/** The plain-words message of a failed connection (docs/CITY_RUMBLE_ONLINE.md section 8: what the player is told). */
export function errorMessage(reason: FailReason | 'not-configured', detail?: string | null): ErrorView {
  const d = detail && detail.trim() !== '' ? detail.trim().slice(0, 200) : null;
  switch (reason) {
    case 'not-configured':
      return {
        title: 'Online is not available',
        text: 'Online is not configured in this build.',
        canRetry: false,
        detail: null,
      };
    case 'unreachable':
      return {
        title: "Can't connect",
        text: "Can't reach the online server. Check your connection and that the server address is right.",
        canRetry: true,
        detail: d,
      };
    case 'room-not-found':
      return {
        title: 'Room not found',
        text: 'There is no room with that code. Check the code with the host, or the room may have closed.',
        canRetry: false,
        detail: d,
      };
    case 'room-full':
      return {
        title: 'Room is full',
        text: 'That room has no free seat. Ask the host, or try QUICK PLAY for another room.',
        canRetry: true,
        detail: d,
      };
    case 'match-started':
      return {
        title: 'Match already started',
        text: 'That match is already under way, and nobody new can join a running match. Ask the host for a new room, or try QUICK PLAY.',
        canRetry: false,
        detail: d,
      };
    case 'refused':
      return {
        title: 'The server said no',
        text: 'The server did not accept you into the room. Check your name and try again.',
        canRetry: true,
        detail: d,
      };
    case 'protocol':
      return {
        title: 'Version mismatch',
        text: "This version of the game and the server don't match. Reload the page to get the latest version.",
        canRetry: false,
        detail: d,
      };
    default:
      return {
        title: 'Something went wrong',
        text: 'The online connection failed. Try again in a moment.',
        canRetry: true,
        detail: d,
      };
  }
}

// ---------------------------------------------------------------- room

const PHASE_LABEL: Record<LobbyPhase, string> = {
  lobby: 'Waiting in the lobby',
  countdown: 'Match starting',
  playing: 'Match in progress',
  results: 'Match finished',
};
export const phaseLabel = (p: LobbyPhase): string => PHASE_LABEL[p];

export type SeatKind = 'human' | 'bot' | 'open';

/** The 32-seat bar: humans first, then the bots the server will fill with, then free seats. */
export function seatBar(humans: number, bots: number, total: number = MATCH_SEATS): SeatKind[] {
  const h = Math.max(0, Math.min(total, Math.floor(humans)));
  const b = Math.max(0, Math.min(total - h, Math.floor(bots)));
  return Array.from({ length: total }, (_, i): SeatKind => (i < h ? 'human' : i < h + b ? 'bot' : 'open'));
}

export function botsLine(bots: number): string {
  if (bots <= 0) return 'No bots: every seat is a human.';
  return bots === 1 ? '1 bot will fill the remaining seat.' : `${bots} bots will fill the remaining seats.`;
}

export type MemberTag = 'HUMAN' | 'HOST' | 'READY' | 'YOU' | 'BOT';

export interface MemberRow {
  key: string;
  name: string;
  characterId: string;
  you: boolean;
  host: boolean;
  ready: boolean;
  /** False while the member's connection is down. */
  connected: boolean;
  /** Always-visible tags, in display order. Every member is a person; fillers are the separate bot row. */
  tags: MemberTag[];
  /** "reconnecting" while the connection is down, else null. */
  stateNote: string | null;
}

export interface LobbyView {
  code: string;
  phase: LobbyPhase;
  phaseLabel: string;
  isPrivate: boolean;
  rows: MemberRow[];
  humans: number;
  bots: number;
  botsLine: string;
  seats: SeatKind[];
  seatsLine: string;
  readyCount: number;
  readyLine: string;
}

export function lobbyModel(lobby: LobbyMsg): LobbyView {
  const rows = lobby.members.map((m: LobbyMemberView, i): MemberRow => {
    const you = lobby.you === i;
    const tags: MemberTag[] = ['HUMAN'];
    if (m.isHost) tags.push('HOST');
    if (m.ready) tags.push('READY');
    if (you) tags.push('YOU');
    return {
      key: `${i}:${m.name}`,
      name: m.name,
      characterId: m.characterId,
      you,
      host: m.isHost,
      ready: m.ready,
      connected: m.connected,
      tags,
      stateNote: m.connected ? null : 'reconnecting',
    };
  });
  const humans = rows.length;
  const bots = Math.max(0, lobby.botsToFill);
  const readyCount = rows.filter((r) => r.ready).length;
  return {
    code: lobby.code,
    phase: lobby.phase,
    phaseLabel: phaseLabel(lobby.phase),
    isPrivate: lobby.private,
    rows,
    humans,
    bots,
    botsLine: botsLine(bots),
    seats: seatBar(humans, bots),
    seatsLine: `${humans} ${humans === 1 ? 'human' : 'humans'} · ${bots} ${bots === 1 ? 'bot' : 'bots'} · ${MATCH_SEATS} fighters`,
    readyCount,
    readyLine: `${readyCount} of ${humans} ready`,
  };
}

export interface RoomRules {
  isHost: boolean;
  /** Ready marks and settings only change while the room is in the lobby phase. */
  inLobby: boolean;
  canReady: boolean;
  youReady: boolean;
  /** The host's START exists in private rooms (public rooms start by themselves). */
  showStart: boolean;
  canStart: boolean;
  /** Why START is disabled (null when it is allowed or not shown). */
  startReason: string | null;
  canChangeSettings: boolean;
  settingsReason: string | null;
}

/** Who may do what in the room, mirroring the server's checks (`server/src/core/Lobby.ts`); the server still decides. */
export function roomRules(lobby: LobbyMsg, conn: ConnStatus): RoomRules {
  const me = lobby.you !== null ? lobby.members[lobby.you] : undefined;
  const isHost = !!me?.isHost;
  const inLobby = lobby.phase === 'lobby';
  const live = conn === 'connected';
  const offline = conn === 'reconnecting' ? 'Reconnecting...' : 'Not connected.';
  const showStart = lobby.private;
  let startReason: string | null = null;
  if (!showStart) startReason = 'Public rooms start by themselves.';
  else if (!live) startReason = offline;
  else if (!isHost) startReason = 'Only the host can start the match.';
  else if (!inLobby) startReason = 'The match is already starting.';
  let settingsReason: string | null = null;
  if (!isHost) settingsReason = 'Only the host can change the match.';
  else if (!live) settingsReason = offline;
  else if (!inLobby) settingsReason = 'Settings are locked once the match is starting.';
  return {
    isHost,
    inLobby,
    canReady: me !== undefined && inLobby && live,
    youReady: !!me?.ready,
    showStart,
    canStart: startReason === null,
    startReason: showStart ? startReason : null,
    canChangeSettings: settingsReason === null,
    settingsReason,
  };
}

/** The line the room shows when the connection is not up (in the lobby nobody's fighter is on autopilot yet). */
export function roomConnectionNote(conn: ConnStatus): { text: string; canRetry: boolean } | null {
  if (conn === 'reconnecting') return { text: 'Connection lost. Trying to get you back.', canRetry: false };
  if (conn === 'closed') return { text: 'You were disconnected from the room.', canRetry: true };
  return null;
}

export const DURATION_OPTIONS: readonly { sec: number; label: string }[] = [
  { sec: 180, label: '3 min' },
  { sec: 300, label: '5 min' },
];

/** The stages offered: the sim's own City Rumble registry, with the stage names. */
export const stageOptions = (): { id: string; name: string }[] =>
  RUMBLE_ARENA_IDS.map((id) => ({ id, name: stageName(id) }));

export function stageName(id: string): string {
  try {
    return getArena(id).name;
  } catch {
    return id;
  }
}

export const modeOptions = (): { id: RoomSettings['game']; name: string; rule: string }[] =>
  RUMBLE_MODE_INFO.map((m) => ({ id: m.id, name: m.name, rule: m.rule }));

/** Survival has no clock (last survivor wins): the duration only applies to the timed modes. */
export const gameIsTimed = (game: RoomSettings['game']): boolean => game !== 'survival';

export interface SettingsView {
  stage: string;
  mode: string;
  rule: string;
  /** Null for the untimed mode. */
  duration: string | null;
  difficulty: string;
  /** Team Rumble only: "Off" / "On", else null. */
  friendlyFire: string | null;
  /** Team Rumble only: how the sides are made, else null. */
  teams: string | null;
}

/** Teams are the simulation's own balanced split (no picking sides): the room says so in one sentence. */
export const TEAMS_NOTE = `Two teams of ${MATCH_SEATS / 2}, picked for you and kept even: players and bots are spread across both sides.`;

/** The room settings in words, for guests (read-only) and the Ready summary. */
export function settingsView(s: RoomSettings): SettingsView {
  const mode = RUMBLE_MODE_INFO.find((m) => m.id === s.game);
  const dur = DURATION_OPTIONS.find((d) => d.sec === s.durationSec);
  const level = (LEVEL_LABEL as Record<string, string>)[s.botDifficulty];
  return {
    stage: stageName(s.arenaId),
    mode: mode?.name ?? s.game,
    rule: mode?.rule ?? '',
    duration: gameIsTimed(s.game) ? (dur?.label ?? `${Math.round(s.durationSec / 60)} min`) : null,
    difficulty: level ?? s.botDifficulty,
    friendlyFire: s.game === 'team' ? (s.friendlyFire === true ? 'On' : 'Off') : null,
    teams: s.game === 'team' ? TEAMS_NOTE : null,
  };
}

/** Milliseconds left of a server timer that read `ms` when it was received at `receivedAt` (clock `now`). */
export const remainingMs = (ms: number | null, receivedAt: number, now: number): number | null =>
  ms === null ? null : Math.max(0, ms - Math.max(0, now - receivedAt));

/** Whole seconds shown for a countdown (rounded up, so "1" stays until it really is over). */
export const countdownSeconds = (ms: number): number => Math.max(0, Math.ceil(ms / 1000));

// ---------------------------------------------------------------- connection status

export type NetTone = 'good' | 'warn' | 'bad' | 'idle';
export type PingTone = 'good' | 'ok' | 'poor' | 'unknown';

export interface NetBanner {
  kind: 'reconnecting' | 'closed';
  title: string;
  text: string;
  /** The reserved-window message, null when it does not apply. */
  reserve: string | null;
  actions: ('retry' | 'menu')[];
}

export interface NetStatusView {
  tone: NetTone;
  label: string;
  ping: string;
  pingTone: PingTone;
  banner: NetBanner | null;
  /** The text a screen reader hears when the state changes. */
  announce: string;
}

export const PING_GOOD_MS = 80;
export const PING_OK_MS = 160;

export function pingTone(rttMs: number | null): PingTone {
  if (rttMs === null || !Number.isFinite(rttMs)) return 'unknown';
  return rttMs <= PING_GOOD_MS ? 'good' : rttMs <= PING_OK_MS ? 'ok' : 'poor';
}

/**
 * The status chip and the reconnect banner (docs/ONLINE_INTEGRATION.md section 6): `reserveSeconds` is the server's
 * reserved window when the client knows it, else the message says "a short time".
 */
export function netStatusModel(
  s: Pick<RemoteStatus, 'connection' | 'rttMs'> & Partial<Pick<RemoteStatus, 'detail'>>,
  opts: { reserveSeconds?: number | null } = {},
): NetStatusView {
  const ping = s.rttMs === null || !Number.isFinite(s.rttMs) ? '-- ms' : `${Math.round(s.rttMs)} ms`;
  const base = { ping, pingTone: pingTone(s.rttMs) };
  switch (s.connection) {
    case 'connected':
      return { ...base, tone: 'good', label: 'Online', banner: null, announce: 'Connected to the server.' };
    case 'connecting':
      return {
        ...base,
        tone: 'idle',
        label: 'Connecting',
        banner: null,
        announce: 'Connecting to the server.',
      };
    case 'reconnecting': {
      const sec = opts.reserveSeconds;
      return {
        ...base,
        tone: 'warn',
        label: 'Reconnecting',
        banner: {
          kind: 'reconnecting',
          title: 'Connection lost',
          text: 'Trying to get you back. A bot is playing your fighter.',
          reserve:
            typeof sec === 'number' && sec > 0
              ? `Your fighter is reserved for ${Math.round(sec)} seconds.`
              : 'Your fighter is reserved for a short time.',
          actions: [],
        },
        announce: 'Connection lost. Trying to get you back. A bot is playing your fighter.',
      };
    }
    default:
      return {
        ...base,
        tone: 'bad',
        label: 'Disconnected',
        banner: {
          kind: 'closed',
          title: 'You were disconnected',
          text:
            s.detail && s.detail.trim() !== ''
              ? s.detail.trim().slice(0, 160)
              : 'The connection to the server ended.',
          reserve: null,
          actions: ['retry', 'menu'],
        },
        announce: 'You were disconnected.',
      };
  }
}

export interface LoadingView {
  text: string;
  /** Real progress when the loader reports it, else null (an indeterminate bar, never an invented percentage). */
  progress: { done: number; total: number; percent: number } | null;
  /** The connection dropped: offer Retry / Back instead of waiting for ever. */
  stalled: boolean;
  stalledText: string | null;
}

export function loadingModel(
  conn: ConnStatus,
  progress: { done: number; total: number } | null,
): LoadingView {
  const real =
    progress && progress.total > 0
      ? {
          done: progress.done,
          total: progress.total,
          percent: Math.max(0, Math.min(100, Math.round((progress.done / progress.total) * 100))),
        }
      : null;
  const stalled = conn === 'closed' || conn === 'reconnecting';
  return {
    text: 'Loading the arena and waiting for the match',
    progress: real,
    stalled,
    stalledText: stalled
      ? conn === 'reconnecting'
        ? 'The connection dropped while loading. Trying to get you back.'
        : 'The connection dropped while loading the match.'
      : null,
  };
}

// ---------------------------------------------------------------- results

/** Optional per-player fields the server may add (agent S); read defensively, never required. */
export interface ResultExtras {
  botKills?: number;
  botDeaths?: number;
  botAssists?: number;
  autopilotSeconds?: number;
  drops?: number;
  controlledByBotAtEnd?: boolean;
}

export interface ResultRow {
  key: string;
  seat: number;
  name: string;
  isBot: boolean;
  tag: 'HUMAN' | 'BOT';
  placement: number;
  placementLabel: string;
  team: string | null;
  kills: number;
  deaths: number;
  assists: number;
  you: boolean;
  winner: boolean;
  /** "A bot played 12 s for this player" and the like; null when there is nothing to say. */
  note: string | null;
}

export interface ResultsView {
  headline: string;
  sub: string | null;
  /** True / false when the local seat is known, null for a draw or an unknown seat. */
  youWon: boolean | null;
  draw: boolean;
  rows: ResultRow[];
}

export function ordinal(n: number): string {
  const v = Math.abs(Math.round(n));
  const tens = v % 100;
  if (tens >= 11 && tens <= 13) return `${v}th`;
  return `${v}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[v % 10] ?? 'th'}`;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export const teamLabel = (team: number | null): string | null =>
  team === null ? null : (TEAM_NAMES[team] ?? `Team ${team + 1}`);

function botNote(p: ResultsMsg['players'][number] & ResultExtras): string | null {
  if (p.isBot) return null;
  const secs = Math.round(num(p.autopilotSeconds));
  const botKills = num(p.botKills);
  const parts: string[] = [];
  if (secs > 0) parts.push(`A bot played ${secs} s for this player`);
  if (botKills > 0)
    parts.push(
      `${botKills} ${botKills === 1 ? 'kill' : 'kills'} by the bot ${botKills === 1 ? 'is' : 'are'} not counted for them`,
    );
  return parts.length > 0 ? `${parts.join('. ')}.` : null;
}

/** The results table: sorted by placement (ties by seat), your row marked, bots tagged. `youSeat` is the local seat. */
export function resultsModel(r: ResultsMsg, youSeat: number | null): ResultsView {
  const sorted = [...r.players].sort((a, b) => a.placement - b.placement || a.seat - b.seat);
  const me = youSeat === null ? undefined : r.players.find((p) => p.seat === youSeat);
  const rows = sorted.map((p): ResultRow => {
    const winner = r.winnerTeam !== null ? p.team === r.winnerTeam : r.winnerSeat === p.seat;
    return {
      key: `${p.seat}`,
      seat: p.seat,
      name: p.name,
      isBot: p.isBot,
      tag: p.isBot ? 'BOT' : 'HUMAN',
      placement: p.placement,
      placementLabel: ordinal(p.placement),
      team: teamLabel(p.team),
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      you: p.seat === youSeat,
      winner: !r.draw && winner,
      note: botNote(p as ResultsMsg['players'][number] & ResultExtras),
    };
  });
  let headline: string;
  let sub: string | null = null;
  let youWon: boolean | null = null;
  if (r.draw) {
    headline = 'Draw';
    sub = 'Nobody won this match.';
  } else if (r.winnerTeam !== null) {
    const team = teamLabel(r.winnerTeam) ?? `Team ${r.winnerTeam + 1}`;
    youWon = me ? me.team === r.winnerTeam : null;
    headline = youWon ? 'Your team wins' : `${team} team wins`;
    if (youWon) sub = `${team} team`;
  } else if (r.winnerSeat !== null) {
    const winner = r.players.find((p) => p.seat === r.winnerSeat);
    youWon = youSeat === null ? null : r.winnerSeat === youSeat;
    headline = youWon ? 'You win' : `${winner?.name ?? 'A fighter'} wins`;
  } else {
    headline = 'Match over';
  }
  return { headline, sub, youWon, draw: r.draw, rows };
}
