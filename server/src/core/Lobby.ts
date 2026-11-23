/**
 * The pre-match lobby state machine of one room (no Colyseus import: unit-testable with an injected clock).
 *
 *   lobby --start / auto-start / room full--> countdown --3 s--> playing --match ended--> results --rematch--> lobby
 *
 * Members are the connected humans in join order; the first is the host. The host leaving (or dropping while a match
 * runs) promotes the next connected member. Seats are decided at the end of the countdown: humans in join order, then
 * bots up to 32. Nothing here knows about sockets, ticks or the simulation.
 */
import { CHARACTER_IDS } from '../../../src/sim';
import type { CharacterId, Difficulty } from '../../../src/sim';
import type { LobbyMemberView, LobbyMsg, LobbyPhase, RoomSettings } from '../../../src/net/protocol';
import type { SeatSpec } from './RumbleMatch';

export interface LobbyConfig {
  /** Humans a room holds (32). */
  maxHumans: number;
  /** Seats in a match (32): humans first, bots fill the rest. */
  seats: number;
  isPrivate: boolean;
  /** Public lobbies start this long after the first human joined (ignored for private rooms). */
  autoStartMs: number;
  countdownMs: number;
  settings: RoomSettings;
}

export interface LobbyMember {
  sessionId: string;
  name: string;
  characterId: CharacterId;
  ready: boolean;
  isHost: boolean;
  /** Connected right now (false only while a playing member's connection is down). */
  connected: boolean;
  /** Seat in the current / last match; null before a match starts. */
  seat: number | null;
}

export type LobbyResult = { ok: true } | { ok: false; code: string; message: string };

const OK: LobbyResult = { ok: true };
const no = (code: string, message: string): LobbyResult => ({ ok: false, code, message });

/** Fixed bot roster (Nigerian first names); bots are always shown as `BOT <name>`. */
export const BOT_NAMES: readonly string[] = [
  'Emeka',
  'Tunde',
  'Chidi',
  'Bola',
  'Ngozi',
  'Ade',
  'Femi',
  'Kemi',
  'Obinna',
  'Zainab',
  'Ifeanyi',
  'Sade',
  'Musa',
  'Amaka',
  'Segun',
  'Halima',
  'Chika',
  'Yemi',
  'Uche',
  'Folake',
  'Ibrahim',
  'Nneka',
  'Dayo',
  'Aisha',
  'Kunle',
  'Ebere',
  'Tobi',
  'Hauwa',
  'Nkem',
  'Wale',
  'Titi',
  'Bayo',
];

export function botName(index: number): string {
  const base = BOT_NAMES[index % BOT_NAMES.length]!;
  const round = Math.floor(index / BOT_NAMES.length);
  return `BOT ${round === 0 ? base : `${base} ${round + 1}`}`;
}

export interface LobbyTick {
  /** The visible lobby state changed (phase, countdown): the room should broadcast. */
  changed: boolean;
  /** The countdown ended: the room must build the match and call `begin()`. */
  begin: boolean;
}

export class Lobby {
  phase: LobbyPhase = 'lobby';
  settings: RoomSettings;
  private readonly cfg: LobbyConfig;
  private readonly now: () => number;
  private readonly list: LobbyMember[] = [];
  private autoStartAt: number | null = null;
  private countdownEndsAt: number | null = null;

  constructor(cfg: LobbyConfig, now: () => number) {
    this.cfg = cfg;
    this.now = now;
    this.settings = { ...cfg.settings };
  }

  get members(): readonly LobbyMember[] {
    return this.list;
  }

  get humanCount(): number {
    return this.list.length;
  }

  get botsToFill(): number {
    return Math.max(0, this.cfg.seats - this.list.length);
  }

  get isPrivate(): boolean {
    return this.cfg.isPrivate;
  }

  get host(): LobbyMember | undefined {
    return this.list.find((m) => m.isHost);
  }

  find(sessionId: string): LobbyMember | undefined {
    return this.list.find((m) => m.sessionId === sessionId);
  }

  /** Whether a new human can still be added (only before the match starts, and while there is room). */
  get joinable(): boolean {
    return (this.phase === 'lobby' || this.phase === 'countdown') && this.list.length < this.cfg.maxHumans;
  }

  // ---------------------------------------------------------------- membership

  join(sessionId: string, who: { name: string; characterId: CharacterId }): LobbyResult {
    if (this.find(sessionId)) return no('already_joined', 'already in this room');
    if (this.phase !== 'lobby' && this.phase !== 'countdown')
      return no('in_progress', 'the match has started');
    if (this.list.length >= this.cfg.maxHumans) return no('full', 'the room is full');
    this.list.push({
      sessionId,
      name: who.name,
      characterId: who.characterId,
      ready: false,
      isHost: this.list.length === 0,
      connected: true,
      seat: null,
    });
    if (this.phase === 'lobby') {
      if (!this.cfg.isPrivate && this.autoStartAt === null)
        this.autoStartAt = this.now() + this.cfg.autoStartMs;
      if (this.list.length >= this.cfg.maxHumans) this.beginCountdown();
    }
    return OK;
  }

  /** Removes a member for good. Returns whether they were in the lobby. */
  leave(sessionId: string): boolean {
    const i = this.list.findIndex((m) => m.sessionId === sessionId);
    if (i < 0) return false;
    const [gone] = this.list.splice(i, 1);
    if (gone!.isHost) this.promoteHost();
    if (this.list.length === 0) {
      this.autoStartAt = null;
      if (this.phase === 'countdown') {
        this.phase = 'lobby';
        this.countdownEndsAt = null;
      }
    }
    return true;
  }

  /** A playing member's connection dropped / came back. A dropped host hands the host role to a connected member. */
  setConnected(sessionId: string, connected: boolean): void {
    const m = this.find(sessionId);
    if (!m) return;
    m.connected = connected;
    if (!connected && m.isHost) this.promoteHost();
  }

  /** Keeps the host role on a connected member: used when the host leaves or their connection drops. */
  private promoteHost(): void {
    const current = this.list.find((m) => m.isHost);
    if (current?.connected) return;
    const next = this.list.find((m) => m.connected && m !== current) ?? (current ? undefined : this.list[0]);
    if (!next) return;
    if (current) current.isHost = false;
    next.isHost = true;
  }

  // ---------------------------------------------------------------- player / host actions

  setReady(sessionId: string, ready: boolean): LobbyResult {
    const m = this.find(sessionId);
    if (!m) return no('not_member', 'not in this room');
    if (this.phase !== 'lobby') return no('bad_phase', 'ready can only change in the lobby');
    m.ready = ready;
    return OK;
  }

  private requireHost(sessionId: string): LobbyResult {
    const m = this.find(sessionId);
    if (!m) return no('not_member', 'not in this room');
    if (!m.isHost) return no('not_host', 'only the host can do that');
    return OK;
  }

  /** Host starts the countdown (private rooms; public rooms start by themselves). */
  start(sessionId: string): LobbyResult {
    const host = this.requireHost(sessionId);
    if (!host.ok) return host;
    if (!this.cfg.isPrivate) return no('public_room', 'public rooms start automatically');
    if (this.phase !== 'lobby') return no('bad_phase', 'the match is already starting');
    if (this.list.length < 1) return no('empty', 'need at least one player');
    this.beginCountdown();
    return OK;
  }

  /** Host changes settings (lobby phase only). `patch` must already be validated by the room. */
  updateSettings(sessionId: string, patch: Partial<RoomSettings>): LobbyResult {
    const host = this.requireHost(sessionId);
    if (!host.ok) return host;
    if (this.phase !== 'lobby') return no('bad_phase', 'settings can only change in the lobby');
    this.settings = { ...this.settings, ...patch };
    return OK;
  }

  /** Host sends everybody back to the lobby after a match (same members, fresh ready marks). */
  rematch(sessionId: string): LobbyResult {
    const host = this.requireHost(sessionId);
    if (!host.ok) return host;
    if (this.phase !== 'results') return no('bad_phase', 'a rematch is only possible after a match');
    this.phase = 'lobby';
    for (const m of this.list) {
      m.ready = false;
      m.seat = null;
    }
    this.autoStartAt = !this.cfg.isPrivate && this.list.length > 0 ? this.now() + this.cfg.autoStartMs : null;
    return OK;
  }

  // ---------------------------------------------------------------- clock + match hand-over

  private beginCountdown(): void {
    this.phase = 'countdown';
    this.autoStartAt = null;
    this.countdownEndsAt = this.now() + this.cfg.countdownMs;
  }

  /** Advances time-driven transitions. Call every ~50 ms while the phase is `lobby` or `countdown`. */
  tick(): LobbyTick {
    const now = this.now();
    if (this.phase === 'lobby' && this.autoStartAt !== null && now >= this.autoStartAt) {
      if (this.list.length > 0) {
        this.beginCountdown();
        return { changed: true, begin: false };
      }
      this.autoStartAt = null;
    }
    if (this.phase === 'countdown' && this.countdownEndsAt !== null && now >= this.countdownEndsAt) {
      return { changed: false, begin: true };
    }
    return { changed: false, begin: false };
  }

  /** Countdown over: assigns seats (humans in join order, then bots) and enters `playing`. */
  begin(): SeatSpec[] {
    if (this.phase !== 'countdown') throw new Error(`cannot begin a match from phase ${this.phase}`);
    this.phase = 'playing';
    this.countdownEndsAt = null;
    const seats: SeatSpec[] = this.list.map((m, seat) => {
      m.seat = seat;
      return { name: m.name, characterId: m.characterId, kind: 'human' };
    });
    const difficulty = this.settings.botDifficulty as Difficulty;
    for (let b = 0; seats.length < this.cfg.seats; b++) {
      seats.push({
        name: botName(b),
        characterId: CHARACTER_IDS[b % CHARACTER_IDS.length]!,
        kind: 'bot',
        difficulty,
      });
    }
    return seats;
  }

  /** The match ended: show results; the host may start a rematch. */
  endMatch(): void {
    if (this.phase === 'playing') this.phase = 'results';
  }

  /** Building the match failed: back to the lobby. */
  abort(): void {
    this.phase = 'lobby';
    this.countdownEndsAt = null;
    for (const m of this.list) m.seat = null;
    this.autoStartAt = !this.cfg.isPrivate && this.list.length > 0 ? this.now() + this.cfg.autoStartMs : null;
  }

  // ---------------------------------------------------------------- view

  /** The broadcast payload. Never carries session ids; `you` is the receiver's index in `members`. */
  view(code: string, forSessionId: string | null = null): LobbyMsg {
    const now = this.now();
    const members: LobbyMemberView[] = this.list.map((m) => ({
      name: m.name,
      characterId: m.characterId,
      ready: m.ready,
      isHost: m.isHost,
      seat: m.seat,
      connected: m.connected,
    }));
    const you = forSessionId === null ? -1 : this.list.findIndex((m) => m.sessionId === forSessionId);
    return {
      code,
      phase: this.phase,
      private: this.cfg.isPrivate,
      members,
      settings: { ...this.settings },
      countdownMs: this.countdownEndsAt === null ? null : Math.max(0, Math.round(this.countdownEndsAt - now)),
      autoStartMs:
        this.phase === 'lobby' && this.autoStartAt !== null
          ? Math.max(0, Math.round(this.autoStartAt - now))
          : null,
      botsToFill: this.botsToFill,
      you: you >= 0 ? you : null,
    };
  }
}
