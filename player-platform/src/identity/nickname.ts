/**
 * Nicknames. The rule is the MATCH SERVER'S rule (`checkPlayerName`: 2-24 letters / digits / space / `_ . ' -`, NFKC, no
 * invisible or mixed-script look-alikes, nothing that reads as a bot or as staff), so a name accepted here is accepted
 * there. This module adds what only a persistent platform can enforce: UNIQUENESS by comparison skeleton
 * ("Ada", "ADA", "Аda" with a Cyrillic А are the same name), so nobody can pose as an existing player.
 */
import { randomInt } from 'node:crypto';
import { checkPlayerName, nameSkeleton } from '../../../src/net/protocol';
import type { NameProblem } from '../../../src/net/protocol';
import { CODE_ALPHABET } from '../util/secrets';

export type NicknameResult =
  { ok: true; name: string; skeleton: string } | { ok: false; problem: NameProblem | 'blocked' };

/** Extra skeleton fragments an operator wants refused (slurs, brands). Data, supplied by moderation; empty by default. */
export type NameDenylist = readonly string[];

export function checkNickname(raw: unknown, denylist: NameDenylist = []): NicknameResult {
  const r = checkPlayerName(raw);
  if (r.name === null) return { ok: false, problem: r.problem };
  const skeleton = nameSkeleton(r.name);
  if (denylist.some((d) => d !== '' && skeleton.includes(d))) return { ok: false, problem: 'blocked' };
  return { ok: true, name: r.name, skeleton };
}

const PROBLEM_TEXT: Record<NameProblem | 'blocked', string> = {
  type: 'Name must be text.',
  short: 'Name is too short (2-24 characters).',
  long: 'Name is too long (2-24 characters).',
  chars: "Use letters, digits, spaces and _ . ' - only.",
  letters: 'Name needs at least one letter or digit.',
  marks: 'Too many stacked accent marks.',
  'mixed-script': 'Do not mix look-alike alphabets in one name.',
  'bot-like': 'That name is reserved for bots.',
  reserved: 'That name is reserved.',
  blocked: 'That name is not allowed.',
};
export const nicknameProblemText = (p: NameProblem | 'blocked'): string => PROBLEM_TEXT[p];

/** `Guest-7QK2`: readable, always valid, and 31^4 (~920k) combinations before the unique-skeleton retry loop matters. */
export function generateGuestName(): string {
  let tag = '';
  for (let i = 0; i < 4; i++) tag += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]!;
  return `Guest-${tag}`;
}
