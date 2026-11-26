/**
 * The optional link between the match server and the player platform (decision MP-PLAT; docs/PLATFORM_MATCH_HANDOFF.md,
 * docs/PLATFORM_INTEGRATION_PLAN.md). Everything here is OFF unless configured, and the match server never waits for it:
 *
 *   tickets   a join / create may carry a signed ticket from the platform (Ed25519 JWT, 120 s). A ticket that is present must
 *             verify (signature, audience, expiry, the room it is bound to, and single use) or the request is refused: it is never
 *             quietly downgraded to a guest. No ticket = a guest, exactly as before.
 *   results   the server (never a client) reports a match to the platform: `started` with the ticketed player ids, `finished` with
 *             the facts of its own simulation. HMAC-signed, fire and forget (2 s timeout, a few retries in memory), idempotent on the
 *             platform side. A platform that is down or slow never delays a tick, a start or a result message.
 *   filter    which of a sender's room mates may receive a preset signal (platform mutes, blocks, restrictions). Cached; an outage
 *             delivers presets (harmless by construction), never free text or voice (there is none).
 *
 * No Colyseus import: unit-testable with injected fetch and clock.
 */
import { createHmac } from 'node:crypto';
import { HOST_ROOM, verifyHandoffTicket } from '../../../player-platform/src/handoff/verify';
import type { TicketClaims } from '../../../player-platform/src/handoff/verify';
import { remoteHandoffKeys } from '../../../player-platform/src/handoff/remote';

export interface PlatformConfig {
  /** `PLATFORM_JWKS_URL`: the platform's public keys. Unset = tickets are not accepted at all. */
  jwksUrl: string | null;
  /** `PLATFORM_HANDOFF_AUDIENCE`, default `wahala-rumble`. */
  audience: string;
  /** `PLATFORM_INTERNAL_URL` (origin of the platform API) + `PLATFORM_MATCH_SERVER_SECRET`: both needed to report and filter. */
  internalUrl: string | null;
  secret: string | null;
}

export function loadPlatformConfig(env: Record<string, string | undefined> = process.env): PlatformConfig {
  const v = (k: string): string | null => {
    const x = env[k]?.trim();
    return x ? x : null;
  };
  return {
    jwksUrl: v('PLATFORM_JWKS_URL'),
    audience: v('PLATFORM_HANDOFF_AUDIENCE') ?? 'wahala-rumble',
    internalUrl: v('PLATFORM_INTERNAL_URL')?.replace(/\/+$/, '') ?? null,
    secret: v('PLATFORM_MATCH_SERVER_SECRET'),
  };
}

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface PlatformDeps {
  fetch?: FetchLike;
  now?: () => number;
  log?: (message: string) => void;
  /** Test hook: a key source instead of the remote JWKS. */
  keys?: Parameters<typeof verifyHandoffTicket>[1]['keys'];
}

/** What the room stamps on a verified seat (server-side only; a client cannot send these: option keys starting `_` are stripped). */
export interface Verified {
  sub: string;
  name: string;
  restricted: boolean;
  party: string | null;
}

export type TicketRefusal = 'invalid' | 'wrong_room' | 'replayed' | 'unavailable';

export class PlatformLink {
  readonly tickets: boolean;
  readonly reporting: boolean;
  private readonly keys: Parameters<typeof verifyHandoffTicket>[1]['keys'] | null;
  private readonly fetchFn: FetchLike;
  private readonly now: () => number;
  private readonly log: (m: string) => void;
  /** jti -> expiry (ms): a ticket verifies once. Entries are dropped when their ticket would be expired anyway. */
  private readonly used = new Map<string, number>();
  private readonly pending = new Set<Promise<void>>();
  stats = { reported: 0, reportFailed: 0, ticketsAccepted: 0, ticketsRefused: 0, filterFailed: 0 };

  constructor(
    readonly cfg: PlatformConfig,
    deps: PlatformDeps = {},
  ) {
    this.keys = deps.keys ?? (cfg.jwksUrl ? remoteHandoffKeys(cfg.jwksUrl) : null);
    this.tickets = this.keys !== null;
    this.reporting = cfg.internalUrl !== null && cfg.secret !== null;
    this.fetchFn = deps.fetch ?? ((url, init) => fetch(url, init));
    this.now = deps.now ?? (() => Date.now());
    this.log = deps.log ?? (() => undefined);
  }

  // ------------------------------------------------------------------ tickets

  /**
   * Verifies a ticket for a room creation (`roomCode` null: only a host ticket passes) or a join of `roomCode`. Consumes the ticket
   * on success (single use). Never throws.
   */
  async verifyTicket(
    token: unknown,
    roomCode: string | null,
  ): Promise<{ ok: true; who: Verified } | { ok: false; reason: TicketRefusal }> {
    if (!this.keys) return this.refuse('unavailable');
    this.sweep();
    const r = await verifyHandoffTicket(token, {
      keys: this.keys,
      audience: this.cfg.audience,
      roomCode,
      now: new Date(this.now()),
    });
    if (!r.ok) return this.refuse(r.reason);
    const claims: TicketClaims = r.claims;
    if (this.used.has(claims.jti)) return this.refuse('replayed');
    // remembered until the ticket could not verify any more (TTL + clock tolerance), then forgotten
    this.used.set(claims.jti, this.now() + 130_000);
    this.stats.ticketsAccepted++;
    return {
      ok: true,
      who: { sub: claims.sub, name: claims.name, restricted: claims.restricted, party: claims.party },
    };
  }

  private refuse(reason: TicketRefusal): { ok: false; reason: TicketRefusal } {
    this.stats.ticketsRefused++;
    return { ok: false, reason };
  }

  private sweep(): void {
    const t = this.now();
    for (const [jti, until] of this.used) if (until < t) this.used.delete(jti);
  }

  // ------------------------------------------------------------------ signed calls to the platform

  private async post(path: string, body: unknown, timeoutMs: number): Promise<unknown> {
    const { internalUrl, secret } = this.cfg;
    if (!internalUrl || !secret) throw new Error('platform reporting is not configured');
    const raw = JSON.stringify(body);
    const ts = this.now();
    const sig = createHmac('sha256', secret).update(`${ts}.POST.${path}.${raw}`).digest('hex');
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await this.fetchFn(`${internalUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-wahala-timestamp': String(ts),
          'x-wahala-signature': sig,
        },
        body: raw,
        signal: ctl.signal,
      });
      if (!res.ok) throw new Error(`platform answered ${res.status}`);
      return await res.json().catch(() => null);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Reports one match fact (`started` / `finished`): fire and forget. Retries a few times in memory with backoff (2 s, 5 s, 15 s,
   * 45 s) on a network error or a 5xx; a 4xx is the platform refusing the content (logged, not retried). Never rejects.
   */
  report(kind: 'started' | 'finished', body: unknown): void {
    if (!this.reporting) return;
    const path = `/internal/v1/matches/${kind}`;
    const run = (async (): Promise<void> => {
      const delays = [0, 2000, 5000, 15_000, 45_000];
      for (let i = 0; i < delays.length; i++) {
        if (delays[i]) await new Promise((r) => setTimeout(r, delays[i]));
        try {
          await this.post(path, body, 2000);
          this.stats.reported++;
          return;
        } catch (e) {
          const m = e instanceof Error ? e.message : String(e);
          const client = /answered 4\d\d/.test(m);
          this.log(`platform ${kind} report failed (attempt ${i + 1}): ${m}`);
          if (client || i === delays.length - 1) {
            this.stats.reportFailed++;
            return;
          }
        }
      }
    })();
    this.pending.add(run);
    void run.finally(() => this.pending.delete(run));
  }

  /** Test hook: resolves when every report in flight has finished. */
  async idle(): Promise<void> {
    while (this.pending.size > 0) await Promise.allSettled([...this.pending]);
  }

  /**
   * The ids among `recipientIds` that may receive `senderId`'s signals, or null when the platform cannot say (down, slow, not
   * configured): the caller then falls back to "deliver presets". `senderAllowed: false` means the sender is restricted.
   */
  async filter(
    senderId: string,
    recipientIds: readonly string[],
  ): Promise<{ senderAllowed: boolean; recipients: Set<string> } | null> {
    if (!this.reporting) return null;
    try {
      const r = (await this.post(
        '/internal/v1/comms/filter',
        { senderId, recipientIds: recipientIds.slice(0, 64), kind: 'signal' },
        800,
      )) as { senderAllowed?: unknown; recipients?: unknown } | null;
      if (!r || typeof r.senderAllowed !== 'boolean' || !Array.isArray(r.recipients)) return null;
      return {
        senderAllowed: r.senderAllowed,
        recipients: new Set(r.recipients.filter((x): x is string => typeof x === 'string')),
      };
    } catch {
      this.stats.filterFailed++;
      return null;
    }
  }
}

export { HOST_ROOM };
