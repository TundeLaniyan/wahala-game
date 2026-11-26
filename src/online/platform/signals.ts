/**
 * The preset quick signals as the player sees them (docs/PLATFORM_CLIENT.md). The ids and where each may be used are the
 * protocol's (`SIGNAL_DEFS` in src/net/protocol.ts); the English labels are COPIED as data from the platform's catalogue
 * (`player-platform/src/comms/catalogue.ts`, which owns the wording: these are its placeholders, not Nigerian Pidgin copy).
 * A test keeps the three lists identical. There is no free text anywhere: a signal is one of these ids, nothing else.
 */
import { SIGNAL_DEFS } from '../../net/protocol';

export type SignalKind = 'chat' | 'ping' | 'emote';
/** Where the player is: the room waiting / showing results, a Free-for-All match, a Team match. */
export type SignalPlace = 'lobby' | 'match' | 'team';

export const SIGNAL_LABELS: Readonly<Record<string, string>> = {
  'chat.ready': 'Ready!',
  'chat.lets_go': "Let's go!",
  'chat.wait': 'Wait for me',
  'chat.good_luck': 'Good luck!',
  'chat.nice': 'Nice one!',
  'chat.thanks': 'Thanks!',
  'chat.sorry': 'Sorry!',
  'chat.gg': 'Good game',
  'chat.rematch': 'Rematch?',
  'chat.help': 'I need help',
  'ping.attack': 'Attack here',
  'ping.defend': 'Defend here',
  'ping.danger': 'Danger!',
  'ping.regroup': 'Regroup',
  'ping.go_here': 'Go here',
  'ping.on_my_way': 'On my way',
  'emote.wave': 'Wave',
  'emote.cheer': 'Cheer',
  'emote.laugh': 'Laugh',
  'emote.shrug': 'Shrug',
  'emote.salute': 'Salute',
};

export interface SignalOption {
  id: string;
  kind: SignalKind;
  label: string;
}

/** The label of an id the client knows, else null (an unknown id is never shown). */
export const signalLabel = (id: string): string | null =>
  Object.prototype.hasOwnProperty.call(SIGNAL_LABELS, id) ? SIGNAL_LABELS[id]! : null;

/**
 * The signals that may be sent here: `lobby` ids while the room waits or shows results; `match` ids during a Free-for-All
 * match; during a Team match the `team` ids (to teammates) and the `match` ids. The server still filters every one.
 */
export function signalsFor(place: SignalPlace): SignalOption[] {
  return SIGNAL_DEFS.filter((d) =>
    place === 'team' ? d.where.includes('team') || d.where.includes('match') : d.where.includes(place),
  ).map((d) => ({ id: d.id, kind: d.kind, label: SIGNAL_LABELS[d.id] ?? d.id }));
}

/** The place for a room phase and game: null where nothing may be sent (countdown). */
export function signalPlace(
  phase: 'lobby' | 'countdown' | 'playing' | 'results',
  game: string,
): SignalPlace | null {
  if (phase === 'lobby' || phase === 'results') return 'lobby';
  if (phase === 'playing') return game === 'team' ? 'team' : 'match';
  return null;
}

/** True when `id` may be sent at `place`. */
export const signalAllowed = (id: string, place: SignalPlace | null): boolean =>
  place !== null && signalsFor(place).some((s) => s.id === id);
