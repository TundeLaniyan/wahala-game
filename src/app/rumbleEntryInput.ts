/**
 * What the online entry accepts from the player: the display name and the room code, with the server's own rules
 * (`validatePlayerName`, `normalizeRoomCode`) and plain-words reasons. Pure and import-light (it only reads the protocol), so
 * both the flow store (src/app/rumbleOnlineFlow.ts) and the views (src/ui/online/rumble/models.ts, which re-exports it)
 * share one implementation.
 */
import {
  PLAYER_NAME_MAX,
  PLAYER_NAME_MIN,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  checkPlayerName,
  normalizeRoomCode,
  validatePlayerName,
} from '../net/protocol';

export const NAME_STORAGE_KEY = 'wahala.online.name';
export const DEFAULT_PLAYER_NAME = 'Player';

export type NameCheck = { ok: true; name: string } | { ok: false; reason: string };

/** Validates a typed display name with the server's own rule and says, in plain words, why it fails. */
export function nameCheck(raw: string): NameCheck {
  const checked = checkPlayerName(raw);
  if (checked.name !== null) return { ok: true, name: checked.name };
  switch (checked.problem) {
    case 'short':
      return { ok: false, reason: `Use at least ${PLAYER_NAME_MIN} characters.` };
    case 'long':
      return { ok: false, reason: `Use at most ${PLAYER_NAME_MAX} characters.` };
    case 'letters':
      return { ok: false, reason: 'Use at least one letter or number.' };
    case 'mixed-script':
      return { ok: false, reason: "Don't mix Latin letters with Cyrillic or Greek ones." };
    case 'bot-like':
      return { ok: false, reason: 'Names starting with BOT are kept for the server bots.' };
    default:
      return { ok: false, reason: "Use letters, numbers, spaces and _ . ' - only." };
  }
}

/** The name the entry screen starts with: the last valid one used on this device, else "Player". */
export function initialName(stored: string | null | undefined): string {
  if (typeof stored === 'string') {
    const ok = validatePlayerName(stored);
    if (ok !== null) return ok;
  }
  return DEFAULT_PLAYER_NAME;
}

export interface CodeView {
  /** What the field shows: upper case, no spaces, at most one code long. */
  text: string;
  /** The code the server understands, or null while it is incomplete or wrong. */
  code: string | null;
  /** A plain-words hint under the field, null when there is nothing to say. */
  hint: string | null;
}

const ALPHABET_SET = new Set(ROOM_CODE_ALPHABET);

/** Cleans what a player typed or pasted into the code field (also accepts a pasted invite link). */
export function codeView(raw: string): CodeView {
  let source = raw;
  const fromLink = /[?&]room=([^&#\s]+)/i.exec(raw);
  if (fromLink) source = decodeURIComponentSafe(fromLink[1]!);
  const text = [...source.toUpperCase()]
    .filter((c) => /[A-Z0-9]/.test(c))
    .slice(0, ROOM_CODE_LENGTH)
    .join('');
  const code = normalizeRoomCode(text);
  let hint: string | null = null;
  if (text.length > 0 && [...text].some((c) => !ALPHABET_SET.has(c)))
    hint = 'Room codes never use 0, O, 1, I or L. Check the code with the host.';
  else if (text.length > 0 && text.length < ROOM_CODE_LENGTH)
    hint = `${ROOM_CODE_LENGTH - text.length} more ${ROOM_CODE_LENGTH - text.length === 1 ? 'character' : 'characters'}.`;
  return { text, code, hint };
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** `?room=CODE` of the page URL (a valid code only), used to prefill the join field; joining still needs a tap. */
export function roomCodeFromSearch(search: string): string | null {
  return normalizeRoomCode(new URLSearchParams(search).get('room'));
}

/** Why a room could not be opened (the session's `failed` reasons). */
export type FailReason =
  'unreachable' | 'room-not-found' | 'room-full' | 'match-started' | 'refused' | 'protocol' | 'unknown';
