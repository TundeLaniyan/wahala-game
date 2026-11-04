/**
 * Who may hear whom: the pure policy a server enforces (and the client mirrors only to draw the UI).
 *  - nothing unless the server turned voice on;
 *  - no voice once the match has ended, and never in a campaign mission (single player);
 *  - team games: TEAM-ONLY voice, before and during the match, never across teams;
 *  - free-for-all: silent unless `matchWideInFreeForAll` is on, then match-wide;
 *  - a deafened listener hears nobody; a muted speaker is heard by nobody (mute is applied by the caller).
 */
import { isTeamMode } from '../sim';
import type {
  VoiceChannel,
  VoiceMatchPhase,
  VoiceParticipant,
  VoicePermissions,
  VoicePolicyInput,
} from './types';

const ENDED: readonly VoiceMatchPhase[] = ['ended', 'resultsPosted'];

/** The channel kind a match uses, ignoring who is who. */
export function channelFor(input: VoicePolicyInput): { channel: VoiceChannel; reason: string } {
  if (!input.flags.voiceEnabled) return { channel: 'none', reason: 'Voice chat is switched off.' };
  if (ENDED.includes(input.phase)) return { channel: 'none', reason: 'Voice ends when the match ends.' };
  if (input.game === 'mission') return { channel: 'none', reason: 'No voice in campaign missions.' };
  if (isTeamMode(input.game)) return { channel: 'team', reason: '' };
  if (input.flags.matchWideInFreeForAll) return { channel: 'matchWide', reason: '' };
  return { channel: 'none', reason: 'Free-for-all matches have no voice chat.' };
}

/** May `listener` hear `speaker` under this policy? (A participant never hears themself.) */
export function mayHear(
  input: VoicePolicyInput,
  speaker: VoiceParticipant,
  listener: VoiceParticipant,
): boolean {
  if (speaker.id === listener.id) return false;
  const { channel } = channelFor(input);
  if (channel === 'matchWide') return true;
  if (channel === 'team') return speaker.team !== null && speaker.team >= 0 && speaker.team === listener.team;
  return false;
}

/** Everything one participant is allowed to do, computed from the roster (server-side). */
export function permissionsFor(
  input: VoicePolicyInput,
  self: VoiceParticipant,
  participants: readonly VoiceParticipant[],
  opts: { deafened?: boolean } = {},
): VoicePermissions {
  const { channel, reason } = channelFor(input);
  const canHear = opts.deafened ? [] : participants.filter((p) => mayHear(input, p, self)).map((p) => p.id);
  const inTeamGame = channel === 'team';
  const canSpeak = channel !== 'none' && (!inTeamGame || (self.team !== null && self.team >= 0));
  return {
    channel,
    canSpeak,
    canHear,
    reason: reason || (inTeamGame && !canSpeak ? 'You are not on a team.' : ''),
  };
}

/** The ids that would hear `speaker` (the audience the server routes audio to). */
export function audienceOf(
  input: VoicePolicyInput,
  speaker: VoiceParticipant,
  participants: readonly VoiceParticipant[],
): string[] {
  return participants.filter((p) => mayHear(input, speaker, p)).map((p) => p.id);
}
