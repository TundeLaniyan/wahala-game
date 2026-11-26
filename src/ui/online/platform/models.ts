/**
 * Pure view helpers of the player-platform panels (docs/PLATFORM_CLIENT.md): plain-words lines from the platform's own
 * views. Nothing here invents a stat, rank or feature the platform does not provide. Online chunk only.
 */
import type { LobbyMemberView } from '../../../net/protocol';
import type { PlatformState } from '../../../online/platform/controller';
import type { FriendView, PartyView, PresenceStatus, ReportCategory } from '../../../online/platform/types';

export const PRESENCE_LABEL: Record<PresenceStatus, string> = {
  online: 'Online',
  away: 'Away',
  in_match: 'In a match',
  offline: 'Offline',
};

export const REPORT_LABELS: Record<ReportCategory, string> = {
  abusive_name: 'Abusive name',
  harassment: 'Harassment',
  cheating: 'Cheating',
  spam: 'Spam',
  inappropriate_content: 'Inappropriate content',
  impersonation: 'Impersonation',
  other: 'Something else',
};

export const PARTY_MODE_OPTIONS = [
  { id: 'ffa', name: 'Free-for-All' },
  { id: 'team', name: 'Team Rumble' },
] as const;

/** The friend code shown in two groups of four (easier to read aloud), e.g. "K7M3 QXAB". */
export const groupedCode = (code: string): string =>
  code.length === 8 ? `${code.slice(0, 4)} ${code.slice(4)}` : code;

/** Friends who could be invited now: not already in the party. */
export function invitableFriends(friends: readonly FriendView[], party: PartyView | null): FriendView[] {
  if (!party) return [];
  const inParty = new Set(party.members.map((m) => m.playerId));
  return friends.filter((f) => !inParty.has(f.playerId));
}

export interface PartyLine {
  /** One short line about where the party is. */
  text: string;
  /** "Join match" is offered (the party's room is open and this client is not in it). */
  canJoin: boolean;
  /** The leader may start a private match. */
  canStart: boolean;
  /** The leader, outside the room, may turn the party back into a lobby. */
  canEnd: boolean;
}

/** What the party panel says and offers, from the party view and the room this client is in. */
export function partyLine(
  party: PartyView,
  inRoom: string | null,
  handoff: PlatformState['handoff'],
): PartyLine {
  const leader = party.you.isLeader;
  const code = party.match?.roomCode ?? null;
  const ready = party.members.filter((m) => m.ready).length;
  if (handoff === 'opening')
    return { text: 'Opening a private room...', canJoin: false, canStart: false, canEnd: false };
  if (handoff === 'joining')
    return { text: 'Joining the party room...', canJoin: false, canStart: false, canEnd: false };
  if (handoff === 'reporting')
    return { text: 'Telling your party the room code...', canJoin: false, canStart: false, canEnd: false };
  if (party.status === 'in_match' && code) {
    if (inRoom === code)
      return { text: `You are in the party room ${code}.`, canJoin: false, canStart: false, canEnd: false };
    return {
      text: `Your party is in room ${code}.`,
      canJoin: true,
      canStart: false,
      canEnd: leader && inRoom === null,
    };
  }
  return {
    text: leader
      ? `${ready} of ${party.members.length} ready. Start when your party is here.`
      : `${ready} of ${party.members.length} ready. The leader starts the match.`,
    canJoin: false,
    canStart: leader && inRoom === null,
    canEnd: false,
  };
}

/** The room member as the member menu sees it: verified (a platform id) or a guest (local mute only). */
export interface MemberTarget {
  name: string;
  playerId: string | null;
  verified: boolean;
}

export const memberTarget = (m: LobbyMemberView): MemberTarget => ({
  name: m.name,
  playerId: m.verified === true && typeof m.playerId === 'string' && m.playerId !== '' ? m.playerId : null,
  verified: m.verified === true && typeof m.playerId === 'string' && m.playerId !== '',
});

/** "Guest" for a guest account, nothing for a registered one (the platform's `kind`). */
export const kindLabel = (kind: 'guest' | 'registered'): string | null => (kind === 'guest' ? 'Guest' : null);
