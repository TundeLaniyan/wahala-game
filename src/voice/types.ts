/**
 * Voice chat contracts (docs/VOICE_CHAT_DESIGN.md). INTERFACES ONLY: no provider with real audio exists. The
 * only implementations in this repository are `NullVoiceProvider` (always disabled; the one the game ships) and
 * `MockVoiceProvider` (in-memory, for tests and UI states). Nothing here may touch a microphone or a peer
 * connection; a real provider would be a separate, reviewed module that is not part of the static build.
 */
import type { GameKind } from '../sim';

export type VoiceResult<T> = { ok: true; value: T } | { ok: false; error: VoiceError };

export type VoiceError =
  | { code: 'disabled'; message: string }
  | { code: 'notInSession'; message: string }
  | { code: 'forbidden'; message: string }
  | { code: 'notFound'; message: string }
  | { code: 'permissionDenied'; message: string }
  | { code: 'unsupported'; message: string };

/** The provider as a whole: 'disabled' = nothing is available (the shipped state). */
export type VoiceProviderStatus = 'disabled' | 'ready';
export type VoiceSessionStatus = 'idle' | 'connecting' | 'connected' | 'ended';

/** Microphone permission as the page sees it. A real provider asks only after an explicit user action. */
export type MicPermission = 'unknown' | 'granted' | 'denied' | 'unavailable';

export type VoiceChannel = 'none' | 'team' | 'matchWide';

/** Where the match is (voice stops when it ends). */
export type VoiceMatchPhase = 'lobby' | 'countdown' | 'playing' | 'ended' | 'resultsPosted';

export interface VoiceParticipant {
  id: string;
  displayName: string;
  /** Team index, or null in free-for-all. */
  team: number | null;
}

/** Server-side switches (never client-controlled). */
export interface VoiceServerFlags {
  voiceEnabled: boolean;
  /** Free-for-all matches may use match-wide voice (off by default: team-only voice is the safe default). */
  matchWideInFreeForAll: boolean;
}

export interface VoicePolicyInput {
  game: GameKind;
  phase: VoiceMatchPhase;
  flags: VoiceServerFlags;
}

/** What the SERVER computes for one participant; the client only displays it. */
export interface VoicePermissions {
  channel: VoiceChannel;
  canSpeak: boolean;
  /** Participant ids this participant may hear right now. */
  canHear: readonly string[];
  /** Why the channel is closed, for the UI ('' when open). */
  reason: string;
}

export interface VoiceSessionRequest {
  matchId: string;
  self: VoiceParticipant;
  participants: readonly VoiceParticipant[];
  game: GameKind;
  phase: VoiceMatchPhase;
}

export interface VoiceSession {
  readonly status: VoiceSessionStatus;
  /** DEFAULT TRUE: a participant is muted until they explicitly unmute. */
  readonly selfMuted: boolean;
  readonly deafened: boolean;
  readonly permissions: VoicePermissions;
  readonly micPermission: MicPermission;
  join(): Promise<VoiceResult<void>>;
  leave(): Promise<VoiceResult<void>>;
  setSelfMuted(muted: boolean): VoiceResult<void>;
  setDeafened(deafened: boolean): VoiceResult<void>;
  setParticipantMuted(participantId: string, muted: boolean): VoiceResult<void>;
  isParticipantMuted(participantId: string): boolean;
  report(participantId: string, reason: string): Promise<VoiceResult<void>>;
  /** Explicit, user-initiated microphone request. NEVER called automatically. */
  requestMicrophone(): Promise<VoiceResult<MicPermission>>;
  /** The match phase changed (voice ends with the match). */
  setPhase(phase: VoiceMatchPhase): void;
  disconnect(): void;
}

export interface VoiceProvider {
  readonly name: string;
  readonly status: VoiceProviderStatus;
  createSession(request: VoiceSessionRequest): Promise<VoiceResult<VoiceSession>>;
}
