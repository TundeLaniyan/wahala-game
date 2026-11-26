/**
 * The PRESET communication vocabulary: the only things a player can "say" in production. Fixed ids, no free text, so there is
 * nothing to moderate in the content (the abuse left is spam, targeting and harassment-by-repetition, handled by limits,
 * mutes, blocks and reports). Labels are English placeholders keyed by id: the client localises by id (Nigerian Pidgin copy is the
 * founder's to write; nothing here pretends to be it).
 *
 *   chat.*   quick messages (party and match)
 *   ping.*   team pings (the match server attaches a map position to a ping; the platform never sees coordinates)
 *   emote.*  free default emotes (shop emotes arrive with commerce and use the same relay)
 */
export type SignalKind = 'chat' | 'ping' | 'emote';
export type SignalContext = 'party' | 'team' | 'match';

export interface SignalDef {
  id: string;
  kind: SignalKind;
  label: string;
  /** Where it may be used: party = platform-relayed lobby; team / match = relayed by the match server using the platform's filter. */
  contexts: readonly SignalContext[];
}

const d = (id: string, kind: SignalKind, label: string, contexts: readonly SignalContext[]): SignalDef => ({
  id,
  kind,
  label,
  contexts,
});
const ALL: readonly SignalContext[] = ['party', 'team', 'match'];
const TEAM: readonly SignalContext[] = ['team', 'match'];

export const SIGNALS: readonly SignalDef[] = [
  d('chat.ready', 'chat', 'Ready!', ALL),
  d('chat.lets_go', 'chat', "Let's go!", ALL),
  d('chat.wait', 'chat', 'Wait for me', ['party']),
  d('chat.good_luck', 'chat', 'Good luck!', ALL),
  d('chat.nice', 'chat', 'Nice one!', ALL),
  d('chat.thanks', 'chat', 'Thanks!', ALL),
  d('chat.sorry', 'chat', 'Sorry!', ALL),
  d('chat.gg', 'chat', 'Good game', ALL),
  d('chat.rematch', 'chat', 'Rematch?', ['party']),
  d('chat.help', 'chat', 'I need help', TEAM),
  d('ping.attack', 'ping', 'Attack here', TEAM),
  d('ping.defend', 'ping', 'Defend here', TEAM),
  d('ping.danger', 'ping', 'Danger!', TEAM),
  d('ping.regroup', 'ping', 'Regroup', TEAM),
  d('ping.go_here', 'ping', 'Go here', TEAM),
  d('ping.on_my_way', 'ping', 'On my way', TEAM),
  d('emote.wave', 'emote', 'Wave', ALL),
  d('emote.cheer', 'emote', 'Cheer', ALL),
  d('emote.laugh', 'emote', 'Laugh', ALL),
  d('emote.shrug', 'emote', 'Shrug', ALL),
  d('emote.salute', 'emote', 'Salute', ALL),
];

const BY_ID = new Map(SIGNALS.map((s) => [s.id, s]));
export const signalById = (id: unknown): SignalDef | undefined =>
  typeof id === 'string' ? BY_ID.get(id) : undefined;
