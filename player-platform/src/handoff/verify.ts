/**
 * Verification of a MATCH TICKET, written to be imported by the match server (it depends only on `jose`; the Architecture
 * handoff in docs/PLATFORM_MATCH_HANDOFF.md shows the 15 lines that call it from `RumbleRoom.onAuth`).
 *
 * A ticket says: "the platform vouches that player `sub`, called `name`, may take a seat in private room `room`, for the next two
 * minutes". Signed EdDSA (Ed25519) by the platform; the match server only needs the PUBLIC key (`/.well-known/jwks.json`), so a
 * compromised match server cannot mint tickets. The ticket is OPTIONAL: no ticket = an anonymous guest, as today.
 */
import { jwtVerify } from 'jose';
import type { JWTVerifyGetKey } from 'jose';

export const TICKET_ISSUER = 'wahala-platform';
export const TICKET_TTL_SECONDS = 120;
/**
 * `room` of a HOST ticket: "this player may create a private room for the party". The room code does not exist yet when the
 * leader creates the room, so the ticket cannot name it; the server checks it on `create` (`roomCode: null`), then the leader
 * reports the code to the platform. Every other ticket names the room it is valid for.
 */
export const HOST_ROOM = '*';

export interface TicketClaims {
  /** The platform player id. */
  sub: string;
  /** The nickname to SHOW in the room (the server should use this instead of the client's claim). */
  name: string;
  /** Selected fighter id. */
  char: string;
  /** The match server's room code this ticket is for, or `HOST_ROOM` for a ticket that lets the party leader CREATE the room. */
  room: string;
  party: string | null;
  /** Minor / unspecified age band: the match server must not enable unrestricted text or voice for this seat. */
  restricted: boolean;
  jti: string;
}

export type TicketResult =
  { ok: true; claims: TicketClaims } | { ok: false; reason: 'invalid' | 'wrong_room' };

export async function verifyHandoffTicket(
  token: unknown,
  opts: {
    keys: JWTVerifyGetKey;
    audience: string;
    /** The room being JOINED, or `null` when the server is checking a room CREATION (then only a host ticket is valid). */
    roomCode: string | null;
    now?: Date;
  },
): Promise<TicketResult> {
  if (typeof token !== 'string' || token.length < 20 || token.length > 2048)
    return { ok: false, reason: 'invalid' };
  try {
    const { payload } = await jwtVerify(token, opts.keys, {
      issuer: TICKET_ISSUER,
      audience: opts.audience,
      algorithms: ['EdDSA'],
      currentDate: opts.now,
      clockTolerance: 5,
      requiredClaims: ['sub', 'exp', 'jti', 'room', 'name'],
    });
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.name !== 'string' ||
      typeof payload.room !== 'string' ||
      typeof payload.jti !== 'string'
    )
      return { ok: false, reason: 'invalid' };
    if (payload.room !== (opts.roomCode ?? HOST_ROOM)) return { ok: false, reason: 'wrong_room' };
    return {
      ok: true,
      claims: {
        sub: payload.sub,
        name: payload.name,
        char: typeof payload.char === 'string' ? payload.char : '',
        room: payload.room,
        party: typeof payload.party === 'string' ? payload.party : null,
        restricted: payload.restricted !== false,
        jti: payload.jti,
      },
    };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
}
