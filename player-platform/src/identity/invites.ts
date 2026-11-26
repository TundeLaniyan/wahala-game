import { timingSafeEqual, createHash } from 'node:crypto';

/**
 * Invite gate for the private beta: while it is on, a guest account can only be created with one of the operator's codes.
 * Codes are compared in constant time (as SHA-256 digests, so lengths never leak). The gate guards account CREATION only: a session
 * that already exists keeps working, and offline play never touches the platform. Brute force is bounded by the per-address
 * `guestCreate` limit (and the edge's), against codes that are at least 10 random characters.
 */
export interface InviteGate {
  readonly required: boolean;
  /** True when no code is needed, or `code` is one of the valid ones. */
  allows(code: string | undefined): boolean;
}

const digest = (s: string): Buffer => createHash('sha256').update(s).digest();

export function createInviteGate(required: boolean, codes: readonly string[]): InviteGate {
  const hashes = codes.map(digest);
  return {
    required,
    allows(code) {
      if (!required) return true;
      if (typeof code !== 'string' || code.length === 0 || code.length > 128) return false;
      const d = digest(code);
      let ok = false;
      for (const h of hashes) if (timingSafeEqual(d, h)) ok = true; // no early exit: the time does not say which code matched
      return ok;
    },
  };
}
