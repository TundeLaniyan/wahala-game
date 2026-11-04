/**
 * Pure presentation helpers for the Online preview screens (unit-tested; no React, no store).
 */
import type { FeatureFlags } from '../../platform';
import { TEAM_NAMES } from '../../sim';
import { canSwitchTeam, partyPermissions } from '../../online/lifecycle';
import type { OnlineGame, Party, ProgressionUpdate, QueueStatus, Room, RoomState } from '../../online';

export const PREVIEW_BANNER = 'Preview · mock server · no real players';

export const ONLINE_GAME_LABEL: Record<OnlineGame, string> = {
  classic: 'Classic Battle',
  survival: 'Last Player Standing',
  deathmatch: 'Free-for-All',
  team: 'Team Deathmatch',
};

export const ONLINE_GAME_ORDER: readonly OnlineGame[] = ['classic', 'deathmatch', 'team', 'survival'];

export const ROOM_STATE_LABEL: Record<RoomState, string> = {
  created: 'Creating',
  open: 'Open: get ready',
  readyCheck: 'Ready check',
  starting: 'Starting',
  inProgress: 'In progress',
  finished: 'Finished',
  aborted: 'Cancelled',
};

export const teamName = (team: number | null): string =>
  team === null ? '' : (TEAM_NAMES[team] ?? `Team ${team + 1}`);

export function queueText(q: QueueStatus): string {
  if (q.state === 'cancelled') return 'Search cancelled';
  if (q.state === 'matched') return 'Match found';
  return `Found ${q.found} of ${q.needed} players`;
}

export interface MemberRow {
  accountId: string;
  name: string;
  you: boolean;
  host: boolean;
  ready: boolean;
  team: string;
  ai: boolean;
}

export function memberRows(room: Room, meId: string | null): MemberRow[] {
  return room.members.map((m) => ({
    accountId: m.accountId,
    name: m.displayName,
    you: m.accountId === meId,
    host: m.accountId === room.hostId,
    ready: m.ready,
    team: room.game === 'team' ? teamName(m.team) : '',
    ai: m.isBot,
  }));
}

/** Which lobby buttons make sense for this player right now (the server still decides). */
export function lobbyActions(room: Room, meId: string | null) {
  const me = meId ? room.members.find((m) => m.accountId === meId) : undefined;
  const id = meId ?? '';
  return {
    canReady: !!me && (room.state === 'open' || room.state === 'readyCheck'),
    ready: !!me?.ready,
    // the server fills empty seats with bots first and then checks the rest, so the button only needs host + open
    canStartReadyCheck: room.state === 'open' && room.hostId === id,
    canSwitchTeam: canSwitchTeam(room, id).ok,
    showTeams: room.game === 'team',
    isHost: room.hostId === meId,
  };
}

export const partyActions = (party: Party, meId: string | null) => partyPermissions(party, meId ?? '');

const XP_LABEL: Record<string, string> = {
  participation: 'Played',
  win: 'Win',
  draw: 'Draw',
  kills: 'Eliminations',
  assists: 'Assists',
  time: 'Time survived',
  streakRewards: 'Streak rewards',
  winStreak: 'Win streak',
  missionStars: 'Mission stars',
};

export function xpRows(u: ProgressionUpdate): { label: string; xp: number }[] {
  return Object.entries(u.xpParts).map(([k, xp]) => ({ label: XP_LABEL[k] ?? k, xp }));
}

export function rankChangeText(u: ProgressionUpdate): string {
  const d = u.rankDelta;
  const sign = d > 0 ? '+' : '';
  const same = u.rankBefore.label === u.rankAfter.label;
  return same
    ? `${u.rankAfter.label} · ${sign}${d} rank points`
    : `${u.rankBefore.label} → ${u.rankAfter.label} · ${sign}${d} rank points`;
}

export interface FlagRow {
  id: 'online' | 'voice' | 'campaign';
  label: string;
  value: string;
}

/** The read-only flag states Settings shows. */
export function flagRows(f: FeatureFlags): FlagRow[] {
  return [
    { id: 'online', label: 'Online', value: f.onlineMode },
    { id: 'voice', label: 'Voice chat', value: f.voice ? 'on (not available yet)' : 'off' },
    { id: 'campaign', label: 'Campaign', value: f.campaign ? 'on' : 'off' },
  ];
}
