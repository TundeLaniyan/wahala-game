/**
 * The player-platform's wire shapes as this client reads them (docs/PLATFORM_CLIENT.md). COPIED from the platform's own
 * views (`player-platform/src/identity/types.ts`, `social/service.ts`, `parties/service.ts`, `comms/*`): the game never
 * imports the platform package. Only the fields this client uses are listed; the platform may send more. Online chunk only.
 */

export type PlayerKind = 'guest' | 'registered';
export type PresenceStatus = 'online' | 'away' | 'in_match' | 'offline';

/** What this account may use. The platform computes it (guest / age band); the client only greys features out. */
export interface Capabilities {
  textChat: boolean;
  voice: boolean;
  purchases: boolean;
  friendCodeOnly: boolean;
}

/** `GET /v1/me` -> `{ profile }`: the owner's own view of the account. */
export interface MyProfile {
  id: string;
  displayName: string;
  kind: PlayerKind;
  friendCode: string;
  selectedCharacter: string;
  capabilities: Capabilities;
}

/** The session tokens (`POST /v1/auth/guest` -> `{ profile, tokens }`, `POST /v1/auth/refresh` -> `{ tokens }`). */
export interface Tokens {
  sessionId: string;
  accessToken: string;
  accessExpiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
}

export interface FriendView {
  playerId: string;
  displayName: string;
  selectedCharacter: string;
  presence: PresenceStatus;
  since: string;
}

export interface RequestView {
  id: string;
  playerId: string;
  displayName: string;
  createdAt: string;
}

export interface BlockView {
  playerId: string;
  displayName: string;
  since: string;
}

export interface MuteView {
  playerId: string;
  displayName: string;
  since: string;
}

export type PartyMode = 'ffa' | 'team';

export interface PartyMemberView {
  playerId: string;
  displayName: string;
  selectedCharacter: string;
  ready: boolean;
  isLeader: boolean;
  joinedAt: string;
  presence: PresenceStatus;
}

export interface PartyView {
  id: string;
  code: string;
  codeExpiresAt: string;
  status: 'open' | 'in_match';
  mode: PartyMode;
  maxSize: number;
  leaderId: string;
  members: PartyMemberView[];
  match: { roomCode: string; openedAt: string } | null;
  /** What the CALLER may do (the platform enforces it regardless). */
  you: {
    isLeader: boolean;
    canInvite: boolean;
    canKick: boolean;
    canPromote: boolean;
    canOpenMatch: boolean;
    canLeave: boolean;
  };
}

export interface InviteView {
  id: string;
  partyId: string;
  fromId: string;
  fromName: string;
  expiresAt: string;
  members: number;
  maxSize: number;
}

/** `POST /v1/parties/{id}/match/ticket`: a signed, single-use, two-minute match ticket. */
export interface TicketView {
  ticket: string;
  /** null for a HOST ticket (the leader creates the room; its code does not exist yet). */
  roomCode: string | null;
  host: boolean;
  expiresAt: string;
  audience: string;
}

/** `POST /v1/reports`: the categories and contexts the platform accepts (`player-platform/src/comms/reports.ts`). */
export const REPORT_CATEGORIES = [
  'abusive_name',
  'harassment',
  'cheating',
  'spam',
  'inappropriate_content',
  'impersonation',
  'other',
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];
export const REPORT_CONTEXTS = ['profile', 'party', 'match', 'friend_request', 'chat'] as const;
export type ReportContext = (typeof REPORT_CONTEXTS)[number];
/** The platform refuses a longer note (after its own clean-up); the form never lets one through. */
export const REPORT_NOTE_MAX = 200;

export interface ReportInput {
  reportedId: string;
  category: ReportCategory;
  context: ReportContext;
  contextRef: string | null;
  note: string | null;
}
