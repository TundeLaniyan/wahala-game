import type { Queryable } from '../db/types';
import type { ProviderId } from './providers';

export type PlayerKind = 'guest' | 'registered';
export type PlayerStatus = 'active' | 'suspended' | 'deleted';
export type AgeGroup = 'unspecified' | 'under_13' | '13_17' | 'adult';
export const AGE_GROUPS: readonly AgeGroup[] = ['unspecified', 'under_13', '13_17', 'adult'];
export type ClientPlatform = 'web' | 'android' | 'ios' | 'dev';
export const CLIENT_PLATFORMS: readonly ClientPlatform[] = ['web', 'android', 'ios', 'dev'];
export type AuthMethod = 'guest' | ProviderId;

/** Who is calling, as established by the server from the access token. Handlers never read identity from a request body. */
export interface Principal {
  playerId: string;
  sessionId: string;
  kind: PlayerKind;
  ageGroup: AgeGroup;
  authMethod: AuthMethod;
  reauthAt: Date | null;
}

export interface Tokens {
  sessionId: string;
  accessToken: string;
  accessExpiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
}

export interface LinkView {
  provider: ProviderId;
  emailHint: string | null;
  linkedAt: string;
}

/** The owner's own view of their account. */
export interface MyProfile {
  id: string;
  displayName: string;
  kind: PlayerKind;
  friendCode: string;
  ageGroup: AgeGroup;
  selectedCharacter: string;
  loadout: Record<string, string>;
  presenceVisibility: 'friends' | 'nobody';
  settings: Record<string, unknown>;
  createdAt: string;
  links: LinkView[];
  /** What this account may use (guest / minor restrictions): the client greys features out; the server enforces them. */
  capabilities: Capabilities;
}

/** What other players may see: nothing that identifies a person beyond the chosen nickname. */
export interface PublicCard {
  id: string;
  displayName: string;
  selectedCharacter: string;
  loadout: Record<string, string>;
}

export interface Capabilities {
  textChat: boolean;
  voice: boolean;
  purchases: boolean;
  /** Friend requests from people who are not friends of friends: only with the code. Always true: kept explicit. */
  friendCodeOnly: boolean;
}

export interface SessionView {
  id: string;
  current: boolean;
  authMethod: AuthMethod;
  clientPlatform: ClientPlatform;
  deviceLabel: string | null;
  createdAt: string;
  lastUsedAt: string;
}

/** Tables owned by later modules register here so account deletion erases everything in one transaction. */
export type ErasureHook = (q: Queryable, playerId: string, now: Date) => Promise<void>;
