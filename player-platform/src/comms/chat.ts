/**
 * DEVELOPMENT-ONLY party text chat (`PLATFORM_DEV_TEXT_CHAT=1`; `validateConfig` refuses the flag in production and the routes are
 * not even registered without it). It exists so the moderation seams can be exercised end to end; it is NOT a feature.
 * Unrestricted text in production needs the moderation, retention and legal decisions in docs/PLATFORM_TEXT_CHAT_DESIGN.md first.
 *
 * Safeguards in this dev version: adult REGISTERED accounts only, on both ends (a minor, a guest or an undeclared age neither sends
 * nor receives); party members only; blocks and mutes hide a sender; 200 characters; control / zero-width / bidi characters stripped;
 * links, e-mail addresses, phone-number-like digit runs and long repeated characters refused; an operator deny-list (compared on the
 * look-alike-folded skeleton, so "l33t" spellings do not slip through); 2 s between lines; per-sender restriction (`text`);
 * lines are deleted after 24 hours and when the party closes; a report snapshots the reporter's view of the last lines.
 * Message text is never written to a log or the audit trail.
 */
import { ApiError, badRequest, notFound } from '../errors';
import type { Db } from '../db/types';
import { nameSkeleton } from '../../../src/net/protocol';
import { capabilitiesFor } from '../identity/capabilities';
import type { AgeGroup, PlayerKind } from '../identity/types';
import { SECOND } from '../util/clock';
import type { Clock } from '../util/clock';
import type { CommsService } from './service';

export const CHAT_MAX = 200;
export const CHAT_REPEAT_MS = 2 * SECOND;
export const CHAT_PAGE = 50;

export type ModerationResult = { ok: true; text: string } | { ok: false; reason: string };

/** The seam for a real moderation provider (a classifier, a human queue): same interface, async. */
export interface TextModerator {
  check(raw: string): ModerationResult | Promise<ModerationResult>;
}

const URL_RE = /(https?:\/\/|www\.|\b[a-z0-9-]{2,}\.(com|net|org|io|ng|me|ly|co|app|gg|tv|xyz|info|biz)\b)/i;
const DIGITS_RE = /(?:\d[\s().-]*){7,}/;

/** Digits and symbols people swap for letters ("b4dw0rd", "h3ck"), folded on top of the look-alike-letter skeleton. */
const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  '9': 'g',
  $: 's',
  '!': 'i',
  '|': 'i',
  '+': 't',
};
export const foldForMatching = (text: string): string =>
  [...nameSkeleton(text.replace(/[@$!|+]/g, (c) => (c === '@' ? 'a' : c)))].map((c) => LEET[c] ?? c).join('');

export function createDevModerator(denylist: readonly string[]): TextModerator {
  const deny = denylist.map((w) => foldForMatching(w)).filter((w) => w.length >= 3);
  return {
    check(raw) {
      const text = raw
        .normalize('NFKC')
        .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text.length === 0) return { ok: false, reason: 'empty' };
      if ([...text].length > CHAT_MAX) return { ok: false, reason: 'too_long' };
      if (text.includes('@')) return { ok: false, reason: 'contact_details_not_allowed' };
      if (URL_RE.test(text)) return { ok: false, reason: 'links_not_allowed' };
      if (DIGITS_RE.test(text)) return { ok: false, reason: 'contact_details_not_allowed' };
      if (/(.)\1{8,}/u.test(text)) return { ok: false, reason: 'repeated_characters' };
      const skeleton = foldForMatching(text);
      if (deny.some((w) => skeleton.includes(w))) return { ok: false, reason: 'not_allowed' };
      return { ok: true, text };
    },
  };
}

export interface ChatLine {
  id: number;
  from: { playerId: string; displayName: string };
  text: string;
  at: string;
}

export class DevTextChat {
  constructor(private readonly d: { db: Db; clock: Clock; comms: CommsService; moderator: TextModerator }) {}

  private async eligible(me: string): Promise<void> {
    const r = await this.d.db.query<{ kind: PlayerKind; age_group: AgeGroup }>(
      "SELECT kind, age_group FROM players WHERE id = $1 AND status = 'active'",
      [me],
    );
    const p = r.rows[0];
    if (!p || !capabilitiesFor(p.kind, p.age_group).textChat)
      throw new ApiError('restricted_account', 'Text chat is only for registered adult accounts.');
  }

  private async member(partyId: string, me: string): Promise<void> {
    const r = await this.d.db.query(
      "SELECT 1 FROM party_members m JOIN parties p ON p.id = m.party_id AND p.status <> 'closed' WHERE m.party_id = $1 AND m.player_id = $2",
      [partyId, me],
    );
    if (r.rowCount === 0) throw notFound('That party is not available.');
  }

  async send(me: string, partyId: string, text: unknown): Promise<{ id: number }> {
    if (typeof text !== 'string') throw badRequest('text must be a string');
    await this.member(partyId, me);
    await this.eligible(me);
    const now = this.d.clock();
    const until = await this.d.comms.activeRestriction(this.d.db, me, 'text', now);
    if (until)
      throw new ApiError('restricted_account', 'You cannot send messages right now.', {
        retryAfterMs: until.getTime() - now.getTime(),
      });
    const verdict = await this.d.moderator.check(text);
    if (!verdict.ok) throw new ApiError('bad_request', `That message cannot be sent (${verdict.reason}).`);
    return this.d.db.tx(async (q) => {
      const last = await q.query<{ created_at: Date }>(
        'SELECT created_at FROM dev_chat_messages WHERE party_id = $1 AND sender_id = $2 ORDER BY id DESC LIMIT 1',
        [partyId, me],
      );
      const prev = last.rows[0]?.created_at;
      if (prev && now.getTime() - prev.getTime() < CHAT_REPEAT_MS)
        throw new ApiError('rate_limited', 'Slow down.', {
          retryAfterMs: CHAT_REPEAT_MS - (now.getTime() - prev.getTime()),
        });
      const ins = await q.query<{ id: string }>(
        'INSERT INTO dev_chat_messages (party_id, sender_id, body, created_at) VALUES ($1,$2,$3,$4) RETURNING id',
        [partyId, me, verdict.text, now],
      );
      const id = Number(ins.rows[0]!.id);
      await q.query('DELETE FROM dev_chat_messages WHERE party_id = $1 AND id <= $2', [partyId, id - 200]);
      return { id };
    });
  }

  async list(me: string, partyId: string, after: number): Promise<ChatLine[]> {
    await this.member(partyId, me);
    await this.eligible(me); // a minor never RECEIVES text either
    const r = await this.d.db.query<{
      id: string;
      sender_id: string;
      display_name: string;
      body: string;
      created_at: Date;
    }>(
      `SELECT c.id, c.sender_id, f.display_name, c.body, c.created_at FROM dev_chat_messages c
         JOIN profiles f ON f.player_id = c.sender_id JOIN players s ON s.id = c.sender_id
        WHERE c.party_id = $1 AND c.id > $2
          AND (c.sender_id = $3 OR (
            NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = $3 AND b.blocked_id = c.sender_id) OR (b.blocker_id = c.sender_id AND b.blocked_id = $3))
            AND NOT EXISTS (SELECT 1 FROM mutes m WHERE m.muter_id = $3 AND m.muted_id = c.sender_id)
            AND s.kind = 'registered' AND s.age_group = 'adult'))
        ORDER BY c.id DESC LIMIT $4`,
      [partyId, after, me, CHAT_PAGE],
    );
    return r.rows
      .reverse()
      .map((x) => ({
        id: Number(x.id),
        from: { playerId: x.sender_id, displayName: x.display_name },
        text: x.body,
        at: x.created_at.toISOString(),
      }));
  }
}
