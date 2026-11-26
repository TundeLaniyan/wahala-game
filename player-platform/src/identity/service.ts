/**
 * The identity service: guest accounts, sign-in with a verified provider, guest -> registered upgrade (same player id,
 * same profile), linking, sessions, profile editing, deletion. Everything a client says about WHO it is is ignored: the
 * player id comes from the access token, provider identity from server-side verification.
 */
import { randomBytes } from 'node:crypto';
import { CHARACTER_IDS } from '../../../src/sim/data/characters';
import { ApiError, badRequest, conflict, forbidden, notFound } from '../errors';
import { audit } from '../audit';
import type { Db, Queryable } from '../db/types';
import type { Logger } from '../logger';
import { DAY, HOUR, MINUTE, addMs } from '../util/clock';
import type { Clock } from '../util/clock';
import { hashToken, newCode } from '../util/secrets';
import { capabilitiesFor } from './capabilities';
import { checkNickname, generateGuestName, nicknameProblemText } from './nickname';
import type { NameDenylist } from './nickname';
import type { ProviderId, ProviderRegistry, VerifiedIdentity } from './providers';
import {
  authenticate,
  createSession,
  isRecentlyAuthenticated,
  refreshSession,
  revokeAllSessions,
  revokeSession,
} from './sessions';
import type { SessionPolicy } from './sessions';
import type {
  AgeGroup,
  AuthMethod,
  ClientPlatform,
  ErasureHook,
  LinkView,
  MyProfile,
  PlayerKind,
  Principal,
  PublicCard,
  SessionView,
  Tokens,
} from './types';

export const FRIEND_CODE_LENGTH = 8;
export const NAME_CHANGE_COOLDOWN_MS = 24 * HOUR;
export const NONCE_TTL_MS = 10 * MINUTE;
export const DELETED_NAME = 'Deleted player';
export const AUDIT_RETENTION_DAYS = 400;
export const DEFAULT_CHARACTER = CHARACTER_IDS[0]!;

/** Cross-device settings a client may store (everything else is refused): small, typed, non-identifying. */
export const SETTING_KEYS: Record<string, (v: unknown) => boolean> = {
  locale: (v) => typeof v === 'string' && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(v),
  subtitles: (v) => typeof v === 'boolean',
  reducedMotion: (v) => typeof v === 'boolean',
  colorBlindMode: (v) =>
    typeof v === 'string' && ['off', 'protanopia', 'deuteranopia', 'tritanopia'].includes(v),
  voiceEnabled: (v) => typeof v === 'boolean',
};

export interface IdentityDeps {
  db: Db;
  clock: Clock;
  providers: ProviderRegistry;
  policy: SessionPolicy;
  logger: Logger;
  denylist?: NameDenylist;
  guestIdleDeleteDays: number;
}

export interface ProfilePatch {
  displayName?: string;
  selectedCharacter?: string;
  ageGroup?: AgeGroup;
  presenceVisibility?: 'friends' | 'nobody';
  settings?: Record<string, unknown>;
  loadout?: Record<string, string>;
}

interface ProfileRow {
  id: string;
  kind: PlayerKind;
  status: string;
  friend_code: string;
  age_group: AgeGroup;
  created_at: Date;
  display_name: string;
  selected_character: string;
  loadout: Record<string, string>;
  presence_visibility: 'friends' | 'nobody';
  settings: Record<string, unknown>;
  name_changed_at: Date | null;
}

type LoadoutValidator = (q: Queryable, playerId: string, loadout: Record<string, string>) => Promise<void>;

export class IdentityService {
  private readonly erasures: ErasureHook[] = [];
  private loadoutValidator: LoadoutValidator = async (_q, _p, loadout) => {
    if (Object.keys(loadout).length > 0) throw badRequest('nothing can be equipped yet');
  };

  constructor(private readonly d: IdentityDeps) {}

  /** Later modules (friends, parties, commerce ...) register the tables they own so deletion is complete. */
  registerErasure(hook: ErasureHook): void {
    this.erasures.push(hook);
  }

  /** Commerce registers the check that every equipped cosmetic is owned. */
  setLoadoutValidator(v: LoadoutValidator): void {
    this.loadoutValidator = v;
  }

  // ---------------------------------------------------------------- creation and sign-in

  async createGuest(input: {
    nickname?: string;
    platform: ClientPlatform;
    deviceLabel?: string;
    ageGroup?: AgeGroup;
  }): Promise<{ profile: MyProfile; tokens: Tokens }> {
    const now = this.d.clock();
    const chosen = this.checkChosen(input.nickname);
    return this.d.db.tx(async (q) => {
      const playerId = await this.insertPlayer(q, now, 'guest', input.ageGroup ?? 'unspecified', chosen);
      const tokens = await createSession(q, now, this.d.policy, {
        playerId,
        authMethod: 'guest',
        platform: input.platform,
        deviceLabel: input.deviceLabel,
        reauth: false,
      });
      await audit(q, now, {
        type: 'guest.created',
        actor: playerId,
        subject: playerId,
        detail: { platform: input.platform },
      });
      return { profile: await this.profileOf(q, playerId), tokens };
    });
  }

  private checkChosen(nickname: string | undefined): { name: string; skeleton: string } | null {
    if (nickname === undefined) return null;
    const c = checkNickname(nickname, this.d.denylist);
    if (!c.ok) throw new ApiError('name_rejected', nicknameProblemText(c.problem));
    return { name: c.name, skeleton: c.skeleton };
  }

  /** Inserts the player and profile rows. A CHOSEN name that is taken is `name_taken`; a generated one is retried. */
  private async insertPlayer(
    q: Queryable,
    now: Date,
    kind: PlayerKind,
    ageGroup: AgeGroup,
    chosen: { name: string; skeleton: string } | null,
  ): Promise<string> {
    let playerId: string | null = null;
    for (let i = 0; i < 8 && playerId === null; i++) {
      const r = await q.query<{ id: string }>(
        `INSERT INTO players (kind, friend_code, age_group, created_at, last_seen_at, upgraded_at)
         VALUES ($1, $2, $3, $4, $4, $5) ON CONFLICT (friend_code) DO NOTHING RETURNING id`,
        [kind, newCode(FRIEND_CODE_LENGTH), ageGroup, now, kind === 'registered' ? now : null],
      );
      playerId = r.rows[0]?.id ?? null;
    }
    if (playerId === null) throw new ApiError('unavailable', 'could not allocate an account, try again');
    for (let i = 0; i < 16; i++) {
      let name: string;
      let skeleton: string;
      if (chosen) ({ name, skeleton } = chosen);
      else {
        name = generateGuestName();
        const c = checkNickname(name);
        if (!c.ok) continue;
        skeleton = c.skeleton;
      }
      const r = await q.query(
        `INSERT INTO profiles (player_id, display_name, name_skeleton, selected_character, updated_at)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (name_skeleton) DO NOTHING`,
        [playerId, name, skeleton, DEFAULT_CHARACTER, now],
      );
      if (r.rowCount > 0) return playerId;
      if (chosen) throw new ApiError('name_taken', 'That name is already taken.');
    }
    throw new ApiError('unavailable', 'could not allocate a name, try again');
  }

  /** A single-use nonce the client hands to the provider's sign-in; the provider echoes it inside the id token. */
  async issueNonce(): Promise<{ nonce: string; expiresAt: string }> {
    const now = this.d.clock();
    const nonce = randomBytes(18).toString('base64url');
    const expires = addMs(now, NONCE_TTL_MS);
    await this.d.db.query('INSERT INTO auth_nonces (digest, expires_at) VALUES ($1, $2)', [
      hashToken(nonce),
      expires,
    ]);
    return { nonce, expiresAt: expires.toISOString() };
  }

  private async verify(provider: ProviderId, credential: string): Promise<VerifiedIdentity> {
    return this.d.providers.get(provider).verify(credential);
  }

  private async consumeNonce(q: Queryable, now: Date, nonce: string): Promise<void> {
    const r = await q.query('DELETE FROM auth_nonces WHERE digest = $1 AND expires_at > $2', [
      hashToken(nonce),
      now,
    ]);
    if (r.rowCount === 0) throw new ApiError('provider_rejected', 'credential rejected');
  }

  /** Sign in with a provider. An unknown identity creates a new REGISTERED account (a guest who wants to keep their progress uses `upgrade`). */
  async signIn(input: {
    provider: ProviderId;
    credential: string;
    platform: ClientPlatform;
    deviceLabel?: string;
    nickname?: string;
  }): Promise<{ profile: MyProfile; tokens: Tokens; created: boolean }> {
    const identity = await this.verify(input.provider, input.credential);
    const now = this.d.clock();
    const chosen = this.checkChosen(input.nickname);
    return this.d.db.tx(async (q) => {
      await this.consumeNonce(q, now, identity.nonce);
      const found = await q.query<{ player_id: string; status: string }>(
        `SELECT l.player_id, p.status FROM identity_links l JOIN players p ON p.id = l.player_id
          WHERE l.provider = $1 AND l.subject = $2`,
        [identity.provider, identity.subject],
      );
      let playerId = found.rows[0]?.player_id ?? null;
      let created = false;
      if (playerId !== null) {
        const status = found.rows[0]!.status;
        if (status === 'suspended') throw forbidden('this account is suspended');
        if (status === 'deleted') throw new ApiError('provider_rejected', 'credential rejected');
        await q.query('UPDATE identity_links SET last_used_at = $3 WHERE provider = $1 AND subject = $2', [
          identity.provider,
          identity.subject,
          now,
        ]);
      } else {
        playerId = await this.insertPlayer(q, now, 'registered', 'unspecified', chosen);
        await this.addLink(q, now, playerId, identity);
        created = true;
      }
      const tokens = await createSession(q, now, this.d.policy, {
        playerId,
        authMethod: identity.provider,
        platform: input.platform,
        deviceLabel: input.deviceLabel,
        reauth: true,
      });
      await audit(q, now, {
        type: 'auth.signin',
        actor: playerId,
        subject: playerId,
        detail: { provider: identity.provider, created },
      });
      return { profile: await this.profileOf(q, playerId), tokens, created };
    });
  }

  private async addLink(q: Queryable, now: Date, playerId: string, id: VerifiedIdentity): Promise<void> {
    const r = await q.query(
      `INSERT INTO identity_links (player_id, provider, subject, email_hint, linked_at, last_used_at)
       VALUES ($1,$2,$3,$4,$5,$5) ON CONFLICT DO NOTHING`,
      [playerId, id.provider, id.subject, id.emailHint, now],
    );
    if (r.rowCount === 0)
      throw conflict('That sign-in is already linked (to this or another WAHALA account).');
  }

  /**
   * Guest -> registered: attaches a verified provider identity to the SAME player (id, profile, friends, history kept).
   * Safeguards: the identity must not belong to another account (no silent merge); every OTHER session of the account is
   * revoked (a stolen guest token stops working at the moment the real owner secures the account).
   */
  async upgrade(
    principal: Principal,
    input: { provider: ProviderId; credential: string },
  ): Promise<{ profile: MyProfile; tokens: Tokens }> {
    if (principal.kind !== 'guest') throw conflict('This account is already registered.');
    const identity = await this.verify(input.provider, input.credential);
    const now = this.d.clock();
    return this.d.db.tx(async (q) => {
      await this.consumeNonce(q, now, identity.nonce);
      const taken = await q.query('SELECT 1 FROM identity_links WHERE provider = $1 AND subject = $2', [
        identity.provider,
        identity.subject,
      ]);
      if (taken.rowCount > 0)
        throw conflict(
          'That sign-in already belongs to a WAHALA account. Sign in with it instead (this guest progress is not merged).',
        );
      await this.addLink(q, now, principal.playerId, identity);
      await q.query(
        "UPDATE players SET kind = 'registered', upgraded_at = $2 WHERE id = $1 AND kind = 'guest'",
        [principal.playerId, now],
      );
      await revokeAllSessions(q, now, principal.playerId, 'upgrade');
      const tokens = await createSession(q, now, this.d.policy, {
        playerId: principal.playerId,
        authMethod: identity.provider,
        platform: await this.platformOf(q, principal.sessionId),
        reauth: true,
      });
      await audit(q, now, {
        type: 'account.upgraded',
        actor: principal.playerId,
        subject: principal.playerId,
        detail: { provider: identity.provider },
      });
      return { profile: await this.profileOf(q, principal.playerId), tokens };
    });
  }

  private async platformOf(q: Queryable, sessionId: string): Promise<ClientPlatform> {
    const r = await q.query<{ client_platform: ClientPlatform }>(
      'SELECT client_platform FROM sessions WHERE id = $1',
      [sessionId],
    );
    return r.rows[0]?.client_platform ?? 'web';
  }

  /** Proof that the caller can still use one of the account's own sign-ins (sensitive actions need it within 10 minutes). */
  async reauth(principal: Principal, input: { provider: ProviderId; credential: string }): Promise<void> {
    const identity = await this.verify(input.provider, input.credential);
    const now = this.d.clock();
    await this.d.db.tx(async (q) => {
      await this.consumeNonce(q, now, identity.nonce);
      const own = await q.query(
        'SELECT 1 FROM identity_links WHERE player_id = $1 AND provider = $2 AND subject = $3',
        [principal.playerId, identity.provider, identity.subject],
      );
      // one answer whether the identity is unknown or someone else's
      if (own.rowCount === 0) throw new ApiError('provider_rejected', 'credential rejected');
      await q.query('UPDATE sessions SET reauth_at = $2 WHERE id = $1', [principal.sessionId, now]);
      await audit(q, now, {
        type: 'auth.reauth',
        actor: principal.playerId,
        subject: principal.playerId,
        detail: { provider: identity.provider },
      });
    });
  }

  private requireRecent(p: Principal): void {
    if (!isRecentlyAuthenticated(p, this.d.clock()))
      throw new ApiError('reauth_required', 'confirm it is you: sign in again with your provider');
  }

  async linkProvider(
    principal: Principal,
    input: { provider: ProviderId; credential: string },
  ): Promise<MyProfile> {
    if (principal.kind !== 'registered') throw conflict('Upgrade this guest account first.');
    this.requireRecent(principal);
    const identity = await this.verify(input.provider, input.credential);
    const now = this.d.clock();
    return this.d.db.tx(async (q) => {
      await this.consumeNonce(q, now, identity.nonce);
      const mine = await q.query('SELECT 1 FROM identity_links WHERE player_id = $1 AND provider = $2', [
        principal.playerId,
        identity.provider,
      ]);
      if (mine.rowCount > 0) throw conflict('You already linked a sign-in of that type. Unlink it first.');
      await this.addLink(q, now, principal.playerId, identity);
      await audit(q, now, {
        type: 'account.link_added',
        actor: principal.playerId,
        subject: principal.playerId,
        detail: { provider: identity.provider },
      });
      return this.profileOf(q, principal.playerId);
    });
  }

  /** Removes a sign-in. The LAST one cannot be removed (the account would become unrecoverable): delete the account instead. */
  async unlinkProvider(principal: Principal, provider: ProviderId): Promise<MyProfile> {
    this.requireRecent(principal);
    const now = this.d.clock();
    return this.d.db.tx(async (q) => {
      const links = await q.query<{ provider: ProviderId }>(
        'SELECT provider FROM identity_links WHERE player_id = $1 FOR UPDATE',
        [principal.playerId],
      );
      if (!links.rows.some((l) => l.provider === provider)) throw notFound('no such sign-in is linked');
      if (links.rows.length <= 1)
        throw conflict('That is your only sign-in. Link another first, or delete the account.');
      await q.query('DELETE FROM identity_links WHERE player_id = $1 AND provider = $2', [
        principal.playerId,
        provider,
      ]);
      await audit(q, now, {
        type: 'account.link_removed',
        actor: principal.playerId,
        subject: principal.playerId,
        detail: { provider },
      });
      return this.profileOf(q, principal.playerId);
    });
  }

  // ---------------------------------------------------------------- sessions

  authenticate(accessToken: string): Promise<Principal> {
    return this.d.db.tx((q) => authenticate(q, this.d.clock(), accessToken));
  }

  async refresh(refreshToken: string): Promise<Tokens> {
    const now = this.d.clock();
    const out = await this.d.db.tx(async (q) => {
      const r = await refreshSession(q, now, this.d.policy, refreshToken);
      if ('reuse' in r) {
        await revokeSession(q, now, r.reuse.sessionId, 'refresh_reuse');
        await audit(q, now, {
          type: 'session.reuse_detected',
          actor: r.reuse.playerId,
          subject: r.reuse.playerId,
        });
        return null; // committed: the session is dead before the error below is raised
      }
      return r.tokens;
    });
    if (out === null) {
      this.d.logger.warn('refresh token reuse: session revoked');
      throw new ApiError('unauthenticated', 'sign in again');
    }
    return out;
  }

  async logout(principal: Principal): Promise<void> {
    const now = this.d.clock();
    await this.d.db.tx(async (q) => {
      await revokeSession(q, now, principal.sessionId, 'logout');
      await audit(q, now, {
        type: 'session.revoked',
        actor: principal.playerId,
        subject: principal.playerId,
        detail: { reason: 'logout' },
      });
    });
  }

  async listSessions(principal: Principal): Promise<SessionView[]> {
    const now = this.d.clock();
    const r = await this.d.db.query<{
      id: string;
      auth_method: AuthMethod;
      client_platform: ClientPlatform;
      device_label: string | null;
      created_at: Date;
      last_used_at: Date;
    }>(
      `SELECT id, auth_method, client_platform, device_label, created_at, last_used_at FROM sessions
        WHERE player_id = $1 AND revoked_at IS NULL AND absolute_expires_at > $2 AND refresh_expires_at > $2
        ORDER BY last_used_at DESC LIMIT 50`,
      [principal.playerId, now],
    );
    return r.rows.map((s) => ({
      id: s.id,
      current: s.id === principal.sessionId,
      authMethod: s.auth_method,
      clientPlatform: s.client_platform,
      deviceLabel: s.device_label,
      createdAt: s.created_at.toISOString(),
      lastUsedAt: s.last_used_at.toISOString(),
    }));
  }

  /** Revokes one of the caller's OWN sessions (an id that is not theirs is simply "not found"). */
  async revokeOwnSession(principal: Principal, sessionId: string): Promise<void> {
    const now = this.d.clock();
    await this.d.db.tx(async (q) => {
      const own = await q.query('SELECT 1 FROM sessions WHERE id = $1 AND player_id = $2', [
        sessionId,
        principal.playerId,
      ]);
      if (own.rowCount === 0) throw notFound('no such session');
      await revokeSession(q, now, sessionId, 'user');
      await audit(q, now, {
        type: 'session.revoked',
        actor: principal.playerId,
        subject: principal.playerId,
        detail: { reason: 'user' },
      });
    });
  }

  async revokeOtherSessions(principal: Principal): Promise<number> {
    return this.d.db.tx((q) =>
      revokeAllSessions(q, this.d.clock(), principal.playerId, 'user_all', principal.sessionId),
    );
  }

  // ---------------------------------------------------------------- profile

  async profile(playerId: string): Promise<MyProfile> {
    return this.profileOf(this.d.db, playerId);
  }

  private async rowOf(q: Queryable, playerId: string): Promise<ProfileRow> {
    const r = await q.query<ProfileRow>(
      `SELECT p.id, p.kind, p.status, p.friend_code, p.age_group, p.created_at, f.display_name, f.selected_character,
              f.loadout, f.presence_visibility, f.settings, f.name_changed_at
         FROM players p JOIN profiles f ON f.player_id = p.id WHERE p.id = $1`,
      [playerId],
    );
    const row = r.rows[0];
    if (!row || row.status === 'deleted') throw notFound('no such player');
    return row;
  }

  private async profileOf(q: Queryable, playerId: string): Promise<MyProfile> {
    const row = await this.rowOf(q, playerId);
    const links = await q.query<{ provider: ProviderId; email_hint: string | null; linked_at: Date }>(
      'SELECT provider, email_hint, linked_at FROM identity_links WHERE player_id = $1 ORDER BY linked_at',
      [playerId],
    );
    const views: LinkView[] = links.rows.map((l) => ({
      provider: l.provider,
      emailHint: l.email_hint,
      linkedAt: l.linked_at.toISOString(),
    }));
    return {
      id: row.id,
      displayName: row.display_name,
      kind: row.kind,
      friendCode: row.friend_code,
      ageGroup: row.age_group,
      selectedCharacter: row.selected_character,
      loadout: row.loadout,
      presenceVisibility: row.presence_visibility,
      settings: row.settings,
      createdAt: row.created_at.toISOString(),
      links: views,
      capabilities: capabilitiesFor(row.kind, row.age_group),
    };
  }

  /** What anybody may see about a player (used by friends, parties and the match handoff). */
  async publicCard(playerId: string, q: Queryable = this.d.db): Promise<PublicCard | null> {
    const r = await q.query<{
      id: string;
      display_name: string;
      selected_character: string;
      loadout: Record<string, string>;
    }>(
      `SELECT p.id, f.display_name, f.selected_character, f.loadout FROM players p JOIN profiles f ON f.player_id = p.id
        WHERE p.id = $1 AND p.status = 'active'`,
      [playerId],
    );
    const x = r.rows[0];
    return x
      ? { id: x.id, displayName: x.display_name, selectedCharacter: x.selected_character, loadout: x.loadout }
      : null;
  }

  async updateProfile(principal: Principal, patch: ProfilePatch): Promise<MyProfile> {
    const now = this.d.clock();
    return this.d.db.tx(async (q) => {
      const row = await this.rowOf(q, principal.playerId);
      const sets: string[] = [];
      const vals: unknown[] = [principal.playerId];
      const set = (col: string, v: unknown, cast = ''): void => {
        vals.push(v);
        sets.push(`${col} = $${vals.length}${cast}`);
      };
      if (patch.displayName !== undefined && patch.displayName !== row.display_name) {
        const c = checkNickname(patch.displayName, this.d.denylist);
        if (!c.ok) throw new ApiError('name_rejected', nicknameProblemText(c.problem));
        if (row.name_changed_at && now.getTime() - row.name_changed_at.getTime() < NAME_CHANGE_COOLDOWN_MS)
          throw new ApiError('rate_limited', 'You can change your name once a day.', {
            retryAfterMs: row.name_changed_at.getTime() + NAME_CHANGE_COOLDOWN_MS - now.getTime(),
          });
        const clash = await q.query('SELECT 1 FROM profiles WHERE name_skeleton = $1 AND player_id <> $2', [
          c.skeleton,
          principal.playerId,
        ]);
        if (clash.rowCount > 0) throw new ApiError('name_taken', 'That name is already taken.');
        set('display_name', c.name);
        set('name_skeleton', c.skeleton);
        set('name_changed_at', now);
        await audit(q, now, {
          type: 'profile.name_changed',
          actor: principal.playerId,
          subject: principal.playerId,
        });
      }
      if (patch.selectedCharacter !== undefined) {
        if (!(CHARACTER_IDS as readonly string[]).includes(patch.selectedCharacter))
          throw badRequest('unknown fighter');
        set('selected_character', patch.selectedCharacter);
      }
      if (patch.presenceVisibility !== undefined) set('presence_visibility', patch.presenceVisibility);
      if (patch.settings !== undefined) {
        const next: Record<string, unknown> = { ...row.settings };
        for (const [k, v] of Object.entries(patch.settings)) {
          const ok = Object.hasOwn(SETTING_KEYS, k) ? SETTING_KEYS[k]! : undefined;
          if (!ok) throw badRequest(`unknown setting: ${k}`);
          if (v === null) delete next[k];
          else if (!ok(v)) throw badRequest(`invalid value for setting: ${k}`);
          else next[k] = v;
        }
        set('settings', JSON.stringify(next), '::jsonb');
      }
      if (patch.loadout !== undefined) {
        await this.loadoutValidator(q, principal.playerId, patch.loadout);
        set('loadout', JSON.stringify(patch.loadout), '::jsonb');
      }
      if (sets.length > 0) {
        vals.push(now);
        await q.query(
          `UPDATE profiles SET ${sets.join(', ')}, updated_at = $${vals.length} WHERE player_id = $1`,
          vals,
        );
      }
      if (patch.ageGroup !== undefined && patch.ageGroup !== row.age_group) {
        // the first declaration is free. Moving from a younger band UP to "adult" is the one change that unlocks features: it needs
        // a registered account that proved itself just now (a child cannot just tap "I am an adult" on a guest account)
        const unlocks = patch.ageGroup === 'adult' && row.age_group !== 'unspecified';
        if (unlocks) {
          if (principal.kind !== 'registered')
            throw new ApiError('restricted_account', 'Register the account before changing your age group.');
          this.requireRecent(principal);
        }
        await q.query('UPDATE players SET age_group = $2 WHERE id = $1', [
          principal.playerId,
          patch.ageGroup,
        ]);
        await audit(q, now, {
          type: 'profile.age_group_changed',
          actor: principal.playerId,
          subject: principal.playerId,
          detail: { from: row.age_group, to: patch.ageGroup },
        });
      }
      return this.profileOf(q, principal.playerId);
    });
  }

  /** Issues a new friend code (the old one stops working at once). Use when a code leaked to someone unwanted. */
  async rotateFriendCode(principal: Principal): Promise<string> {
    for (let i = 0; i < 8; i++) {
      const code = newCode(FRIEND_CODE_LENGTH);
      const r = await this.d.db.query(
        'UPDATE players SET friend_code = $2 WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM players WHERE friend_code = $2)',
        [principal.playerId, code],
      );
      if (r.rowCount > 0) return code;
    }
    throw new ApiError('unavailable', 'try again');
  }

  // ---------------------------------------------------------------- moderation hooks and deletion

  async setStatus(playerId: string, status: 'active' | 'suspended', actor: string | null): Promise<void> {
    const now = this.d.clock();
    await this.d.db.tx(async (q) => {
      const r = await q.query("UPDATE players SET status = $2 WHERE id = $1 AND status <> 'deleted'", [
        playerId,
        status,
      ]);
      if (r.rowCount === 0) throw notFound('no such player');
      if (status === 'suspended') await revokeAllSessions(q, now, playerId, 'suspended');
      await audit(q, now, {
        type: status === 'suspended' ? 'account.suspended' : 'account.reinstated',
        actor,
        subject: playerId,
      });
    });
  }

  /**
   * Deletes the caller's account. Registered accounts must have proved a credential within 10 minutes; a guest has no
   * credential, the session is the proof. Irreversible: see `eraseAccount`.
   */
  async deleteAccount(principal: Principal, confirm: string): Promise<void> {
    if (confirm !== 'DELETE') throw badRequest('confirm must be "DELETE"');
    if (principal.kind === 'registered') this.requireRecent(principal);
    await this.eraseAccount(principal.playerId, principal.playerId);
  }

  /**
   * Erases a player: every module's rows (via the registered hooks), sign-ins, sessions, name, settings, loadout. What stays
   * is a TOMBSTONE: the immutable id with no name, no link, no code, kind/status/timestamps. History rows that mention the
   * id (matches, reports filed against it) keep their integrity but no longer identify anyone. The audit trail keeps the id
   * until its retention window ends (`purge`).
   */
  async eraseAccount(playerId: string, actor: string | null): Promise<void> {
    const now = this.d.clock();
    await this.d.db.tx(async (q) => {
      const cur = await q.query<{ kind: PlayerKind; status: string }>(
        'SELECT kind, status FROM players WHERE id = $1 FOR UPDATE',
        [playerId],
      );
      const p = cur.rows[0];
      if (!p || p.status === 'deleted') throw notFound('no such player');
      for (const hook of this.erasures) await hook(q, playerId, now);
      await q.query('DELETE FROM identity_links WHERE player_id = $1', [playerId]);
      await q.query('DELETE FROM sessions WHERE player_id = $1', [playerId]);
      await q.query(
        `UPDATE profiles SET display_name = $2, name_skeleton = NULL, selected_character = $3, loadout = '{}'::jsonb,
                presence_visibility = 'nobody', settings = '{}'::jsonb, updated_at = $4 WHERE player_id = $1`,
        [playerId, DELETED_NAME, DEFAULT_CHARACTER, now],
      );
      await q.query(
        `UPDATE players SET status = 'deleted', deleted_at = $2, friend_code = 'deleted:' || id::text, age_group = 'unspecified'
          WHERE id = $1`,
        [playerId, now],
      );
      await audit(q, now, { type: 'account.deleted', actor, subject: playerId, detail: { kind: p.kind } });
    });
  }

  // ---------------------------------------------------------------- retention

  /** Housekeeping (run by `npm run purge` / the server timer): expired sessions and nonces, idle guests, old audit rows. */
  async purge(): Promise<{ sessions: number; nonces: number; guests: number; audit: number }> {
    const now = this.d.clock();
    const db = this.d.db;
    const sessions = await db.query(
      `DELETE FROM sessions WHERE (revoked_at IS NOT NULL AND revoked_at < $1) OR absolute_expires_at < $1 OR refresh_expires_at < $1`,
      [addMs(now, -30 * DAY)],
    );
    const nonces = await db.query('DELETE FROM auth_nonces WHERE expires_at < $1', [now]);
    const idle = await db.query<{ id: string }>(
      `SELECT id FROM players WHERE kind = 'guest' AND status = 'active' AND last_seen_at < $1 LIMIT 500`,
      [addMs(now, -this.d.guestIdleDeleteDays * DAY)],
    );
    let guests = 0;
    for (const g of idle.rows) {
      try {
        await this.eraseAccount(g.id, null);
        guests++;
      } catch (e) {
        this.d.logger.warn('guest purge failed', {
          playerId: g.id,
          err: e instanceof Error ? e.message : 'unknown',
        });
      }
    }
    const old = await db.query('DELETE FROM audit_events WHERE at < $1', [
      addMs(now, -AUDIT_RETENTION_DAYS * DAY),
    ]);
    return { sessions: sessions.rowCount, nonces: nonces.rowCount, guests, audit: old.rowCount };
  }
}
