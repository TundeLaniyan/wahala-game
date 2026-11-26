/**
 * Voice: the PLATFORM's part only. Who may take part is decided here from account facts the match server does not have (adult
 * registered account, no voice restriction, in the party, the player's own `voiceEnabled` setting, blocks, mutes). What each
 * speaker may HEAR within a match (team-only voice, none in free-for-all, none after the match) stays the existing pure policy
 * `src/voice/policy.ts` run by whoever issues the media token; the audience is the INTERSECTION of both.
 *
 * No media server exists, so the only gateway is `NullVoiceGateway`: it always answers "not available yet". The interface is the
 * seam for a real SFU (docs/PLATFORM_VOICE_DESIGN.md). Nothing here opens a microphone, a socket or a peer connection.
 */
import { ApiError, notFound } from '../errors';
import type { Db } from '../db/types';
import { capabilitiesFor } from '../identity/capabilities';
import type { AgeGroup, PlayerKind } from '../identity/types';
import type { CommsService } from './service';

export interface VoiceGrant {
  /** Short-lived credential for the media server (a real gateway returns an SFU room token). */
  token: string;
  expiresAt: string;
  /** Participants this player may HEAR and who may hear THEM, after blocks / mutes / eligibility. The SFU enforces both per speaker. */
  canHear: string[];
  audience: string[];
}

export interface VoiceGateway {
  readonly available: boolean;
  grant(input: {
    playerId: string;
    roomRef: string;
    canHear: string[];
    audience: string[];
  }): Promise<VoiceGrant>;
}

export const NullVoiceGateway: VoiceGateway = {
  available: false,
  async grant() {
    throw new ApiError('unavailable', 'Voice chat is not available yet.');
  },
};

export class VoiceService {
  constructor(private readonly d: { db: Db; comms: CommsService; gateway: VoiceGateway }) {}

  async status(me: string): Promise<{ available: boolean; eligible: boolean; reason: string | null }> {
    const r = await this.d.db.query<{ kind: PlayerKind; age_group: AgeGroup }>(
      "SELECT kind, age_group FROM players WHERE id = $1 AND status = 'active'",
      [me],
    );
    const p = r.rows[0];
    const eligible = !!p && capabilitiesFor(p.kind, p.age_group).voice;
    return {
      available: this.d.gateway.available,
      eligible,
      reason: !this.d.gateway.available
        ? 'Voice chat is not available yet.'
        : !eligible
          ? 'Voice is only for registered adult accounts.'
          : null,
    };
  }

  /** Eligibility first (403 for a minor, whatever the gateway), then the gateway (503 until one exists). */
  async requestParty(me: string, partyId: string): Promise<VoiceGrant> {
    const st = await this.status(me);
    if (!st.eligible)
      throw new ApiError('restricted_account', 'Voice is only for registered adult accounts.');
    const member = await this.d.db.query(
      "SELECT 1 FROM party_members m JOIN parties p ON p.id = m.party_id AND p.status <> 'closed' WHERE m.party_id = $1 AND m.player_id = $2",
      [partyId, me],
    );
    if (member.rowCount === 0) throw notFound('That party is not available.');
    const own = await this.d.db.query<{ settings: { voiceEnabled?: boolean } }>(
      'SELECT settings FROM profiles WHERE player_id = $1',
      [me],
    );
    if (own.rows[0]?.settings.voiceEnabled !== true)
      throw new ApiError('restricted_account', 'Turn voice on in your settings first.');
    const others = await this.d.db.query<{ player_id: string }>(
      'SELECT player_id FROM party_members WHERE party_id = $1 AND player_id <> $2',
      [partyId, me],
    );
    const ids = others.rows.map((o) => o.player_id);
    const audience = await this.d.comms.filter({ senderId: me, recipientIds: ids, kind: 'voice' });
    if (!audience.senderAllowed) throw new ApiError('restricted_account', 'You cannot use voice right now.');
    // who I may hear: every other participant for whom I am an allowed recipient
    const canHear: string[] = [];
    for (const o of ids)
      if (
        (await this.d.comms.filter({ senderId: o, recipientIds: [me], kind: 'voice' })).recipients.includes(
          me,
        )
      )
        canHear.push(o);
    return this.d.gateway.grant({
      playerId: me,
      roomRef: `party:${partyId}`,
      canHear,
      audience: audience.recipients,
    });
  }
}
