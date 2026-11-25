import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** Opaque random token with a readable prefix (so a leaked one is recognisable in a scanner): 256 bits, base64url. */
export function newToken(prefix: string): string {
  return `${prefix}_${randomBytes(32).toString('base64url')}`;
}

/** Tokens are stored as SHA-256 only: a database leak does not leak usable sessions. (High-entropy input: no salt needed.) */
export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Crockford-like alphabet without look-alikes (the same one the match server's room codes use). */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newCode(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]!;
  return out;
}

export function normaliseCode(raw: unknown, length: number): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase().replace(/[\s-]/g, '');
  return code.length === length && [...code].every((c) => CODE_ALPHABET.includes(c)) ? code : null;
}
