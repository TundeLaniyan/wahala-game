import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiError } from '../src/errors';
import {
  GOOGLE_ISSUERS,
  APPLE_ISSUER,
  appleProvider,
  googleProvider,
  maskEmail,
} from '../src/identity/providers';
import { MINUTE } from '../src/util/clock';
import { client, fakeClock, mockCredential, newGuest, newRegistered, startHarness } from './helpers';
import type { Api, Harness } from './helpers';

describe('OIDC verification (the same code path Google and Apple use)', () => {
  const clock = fakeClock();
  const nowSec = () => Math.floor(clock.now.getTime() / 1000);
  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let other: Awaited<ReturnType<typeof generateKeyPair>>;
  let keys: ReturnType<typeof createLocalJWKSet>;

  beforeAll(async () => {
    keyPair = await generateKeyPair('RS256');
    other = await generateKeyPair('RS256');
    keys = createLocalJWKSet({
      keys: [{ ...(await exportJWK(keyPair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }],
    });
  });

  const mint = (
    over: {
      iss?: string;
      aud?: string;
      sub?: string;
      nonce?: string | null;
      exp?: number;
      iat?: number;
      key?: CryptoKey;
      email?: string;
      verified?: boolean | string;
    } = {},
  ) => {
    const claims: Record<string, unknown> = {};
    if (over.nonce !== null) claims.nonce = over.nonce ?? 'n-1234567890';
    if (over.email) {
      claims.email = over.email;
      claims.email_verified = over.verified ?? true;
    }
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(over.iss ?? GOOGLE_ISSUERS[0]!)
      .setAudience(over.aud ?? 'client-1')
      .setSubject(over.sub ?? 'g-sub-1')
      .setIssuedAt(over.iat ?? nowSec())
      .setExpirationTime(over.exp ?? nowSec() + 600)
      .sign(over.key ?? keyPair.privateKey);
  };
  const google = () => googleProvider(['client-1'], clock.clock, keys);

  it('accepts a correct token and returns subject, nonce and a MASKED e-mail (the address is never kept)', async () => {
    const r = await google().verify(await mint({ email: 'tunde@example.com' }));
    expect(r).toEqual({
      provider: 'google',
      subject: 'g-sub-1',
      emailHint: 't***@example.com',
      nonce: 'n-1234567890',
    });
    expect(maskEmail('a@b.c')).toBe('a***@b.c');
  });

  it('does not expose an unverified e-mail even as a hint', async () => {
    expect((await google().verify(await mint({ email: 'x@y.com', verified: false }))).emailHint).toBeNull();
  });

  it.each([
    ['wrong audience (a token minted for another app)', { aud: 'someone-elses-client' }],
    ['wrong issuer', { iss: 'https://evil.example' }],
    ['expired', { exp: 1_700_000_000, iat: 1_699_999_000 }],
    ['signed with another key', { key: undefined, other: true }],
    ['no nonce', { nonce: null }],
    ['issued in the far future', { iat: 4_000_000_000, exp: 4_000_000_600 }],
  ])('rejects %s', async (_name, over) => {
    const o = over as Record<string, unknown>;
    const token = await mint({ ...(o as object), ...(o.other ? { key: other.privateKey } : {}) });
    await expect(google().verify(token)).rejects.toMatchObject({ code: 'provider_rejected' });
  });

  it('rejects "alg: none" and a token signed with a symmetric key (algorithm confusion)', async () => {
    const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ iss: GOOGLE_ISSUERS[0], aud: 'client-1', sub: 'x', nonce: 'n', exp: nowSec() + 100, iat: nowSec() })).toString('base64url')}.`;
    await expect(google().verify(none)).rejects.toMatchObject({ code: 'provider_rejected' });
    const hs = await new SignJWT({ nonce: 'n-1234567890' })
      .setProtectedHeader({ alg: 'HS256', kid: 'k1' })
      .setIssuer(GOOGLE_ISSUERS[0]!)
      .setAudience('client-1')
      .setSubject('x')
      .setIssuedAt(nowSec())
      .setExpirationTime(nowSec() + 100)
      .sign(new TextEncoder().encode('0123456789abcdef0123456789abcdef'));
    await expect(google().verify(hs)).rejects.toMatchObject({ code: 'provider_rejected' });
  });

  it('is "not configured" (501) without client ids: it never falls back to trusting anything', async () => {
    await expect(googleProvider([], clock.clock, keys).verify(await mint())).rejects.toMatchObject({
      code: 'provider_not_configured',
    });
    await expect(
      appleProvider([], clock.clock, keys).verify(await mint({ iss: APPLE_ISSUER })),
    ).rejects.toMatchObject({ code: 'provider_not_configured' });
    expect(googleProvider([], clock.clock, keys).configured).toBe(false);
  });

  it('Apple: accepts its issuer and the string "true" for email_verified', async () => {
    const apple = appleProvider(['com.example.app'], clock.clock, keys);
    const r = await apple.verify(
      await mint({
        iss: APPLE_ISSUER,
        aud: 'com.example.app',
        sub: 'a-sub',
        email: 'p@privaterelay.example',
        verified: 'true',
      }),
    );
    expect(r.provider).toBe('apple');
    expect(r.emailHint).toBe('p***@privaterelay.example');
    await expect(
      apple.verify(await mint({ iss: GOOGLE_ISSUERS[0]!, aud: 'com.example.app' })),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('does not leak WHY a credential failed', async () => {
    const e = await google()
      .verify(await mint({ aud: 'nope' }))
      .catch((x) => x as ApiError);
    expect((e as ApiError).message).toBe('credential rejected');
  });
});

describe('sign-in, upgrade, linking, deletion over HTTP (mock identity provider)', () => {
  let h: Harness;
  let api: Api;
  beforeAll(async () => {
    h = await startHarness();
    api = client(h.base);
  });
  afterAll(() => h.close());

  it('lists only providers that are really available; real ones are 501 until configured', async () => {
    expect((await api.get('/v1/auth/providers')).body.providers).toEqual(['mock']);
    const r = await api.post('/v1/auth/signin', {
      provider: 'google',
      credential: 'x'.repeat(40),
      platform: 'web',
    });
    expect(r.status).toBe(501);
    expect(r.body.error.code).toBe('provider_not_configured');
  });

  it('a nonce is single use: a captured sign-in credential cannot be replayed', async () => {
    const cred = await mockCredential(api, 'replay-1');
    const first = await api.post('/v1/auth/signin', { provider: 'mock', credential: cred, platform: 'dev' });
    expect(first.status).toBe(201);
    const replay = await api.post('/v1/auth/signin', { provider: 'mock', credential: cred, platform: 'dev' });
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('provider_rejected');
  });

  it('a nonce expires after 10 minutes', async () => {
    const cred = await mockCredential(api, 'late-1');
    h.clock.advance(11 * MINUTE);
    expect(
      (await api.post('/v1/auth/signin', { provider: 'mock', credential: cred, platform: 'dev' })).status,
    ).toBe(401);
  });

  it('a token with a nonce the server never issued is refused', async () => {
    const t = await api.post('/v1/dev/mock-idp/token', { subject: 'forged-1', nonce: 'made-up-nonce-123' });
    expect(
      (
        await api.post('/v1/auth/signin', {
          provider: 'mock',
          credential: t.body.credential,
          platform: 'dev',
        })
      ).status,
    ).toBe(401);
  });

  it('signing in again with the same identity returns the SAME player on a second device', async () => {
    const a = await newRegistered(api, 'two-devices', 'Two Devices');
    const credential = await mockCredential(api, 'two-devices');
    const second = await api.post('/v1/auth/signin', {
      provider: 'mock',
      credential,
      platform: 'android',
      deviceLabel: 'Tecno',
    });
    expect(second.status).toBe(200);
    expect(second.body.created).toBe(false);
    expect(second.body.profile.id).toBe(a.id);
    const sessions = await api.get('/v1/auth/sessions', a.access);
    expect(sessions.body.sessions).toHaveLength(2);
    const other = sessions.body.sessions.find((s: { current: boolean }) => !s.current);
    expect(other.deviceLabel).toBe('Tecno');
    expect((await api.post('/v1/auth/sessions/revoke-others', {}, a.access)).body.revoked).toBe(1);
    expect((await api.get('/v1/me', second.body.tokens.accessToken)).status).toBe(401);
    expect((await api.get('/v1/me', a.access)).status).toBe(200);
  });

  it('upgrades a guest KEEPING the player id, nickname, fighter and settings; revokes other sessions', async () => {
    const g = await newGuest(api, 'Keep Me');
    await api.patch('/v1/me', { settings: { locale: 'en-NG' } }, g.access);
    const n = await api.post('/v1/auth/nonce');
    const t = await api.post('/v1/dev/mock-idp/token', {
      subject: 'upgrade-1',
      nonce: n.body.nonce,
      email: 'keep@me.test',
    });
    const up = await api.post(
      '/v1/auth/upgrade',
      { provider: 'mock', credential: t.body.credential },
      g.access,
    );
    expect(up.status).toBe(200);
    expect(up.body.profile.id).toBe(g.id);
    expect(up.body.profile.kind).toBe('registered');
    expect(up.body.profile.displayName).toBe('Keep Me');
    expect(up.body.profile.settings).toEqual({ locale: 'en-NG' });
    expect(up.body.profile.friendCode).toBe(g.friendCode);
    expect(up.body.profile.links).toEqual([
      expect.objectContaining({ provider: 'mock', emailHint: 'k***@me.test' }),
    ]);
    // the old guest token is dead (a stolen guest session stops working); the new one works
    expect((await api.get('/v1/me', g.access)).status).toBe(401);
    expect((await api.get('/v1/me', up.body.tokens.accessToken)).status).toBe(200);
    // the guest id is signed in again by the provider
    const again = await api.post('/v1/auth/signin', {
      provider: 'mock',
      credential: await mockCredential(api, 'upgrade-1'),
      platform: 'dev',
    });
    expect(again.body.profile.id).toBe(g.id);
    // never stores the e-mail itself
    const rows = await h.platform.db.query('SELECT * FROM identity_links WHERE player_id = $1', [g.id]);
    expect(JSON.stringify(rows.rows)).not.toContain('keep@me.test');
  });

  it('refuses to upgrade onto an identity that already owns another account (no silent merge) and a registered account cannot upgrade', async () => {
    await newRegistered(api, 'owned-elsewhere');
    const g = await newGuest(api);
    const taken = await api.post(
      '/v1/auth/upgrade',
      { provider: 'mock', credential: await mockCredential(api, 'owned-elsewhere') },
      g.access,
    );
    expect(taken.status).toBe(409);
    expect((await api.get('/v1/me', g.access)).status).toBe(200); // the guest is untouched
    const reg = await newRegistered(api, 'already-reg');
    expect(
      (
        await api.post(
          '/v1/auth/upgrade',
          { provider: 'mock', credential: await mockCredential(api, 'x2') },
          reg.access,
        )
      ).status,
    ).toBe(409);
  });

  it('an unauthenticated caller cannot upgrade, link or reauth', async () => {
    const c = await mockCredential(api, 'anon-1');
    for (const p of ['/v1/auth/upgrade', '/v1/auth/reauth', '/v1/auth/links']) {
      expect((await api.post(p, { provider: 'mock', credential: c })).status).toBe(401);
    }
  });

  it('unlinking and deleting need a recent proof; the last sign-in can never be removed', async () => {
    const r = await newRegistered(api, 'danger-zone', 'Danger Zone');
    // signed in just now: recent. After 11 minutes it is not.
    h.clock.advance(11 * MINUTE);
    const fresh = (await api.post('/v1/auth/refresh', { refreshToken: r.refresh })).body.tokens.accessToken;
    const denied = await api.del('/v1/auth/links/mock', fresh);
    expect(denied.status).toBe(401);
    expect(denied.body.error.code).toBe('reauth_required');
    expect((await api.post('/v1/me/delete', { confirm: 'DELETE' }, fresh)).body.error.code).toBe(
      'reauth_required',
    );
    // reauth with someone ELSE's identity is refused with the same answer as an unknown one
    expect(
      (
        await api.post(
          '/v1/auth/reauth',
          { provider: 'mock', credential: await mockCredential(api, 'someone-else') },
          fresh,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await api.post(
          '/v1/auth/reauth',
          { provider: 'mock', credential: await mockCredential(api, 'danger-zone') },
          fresh,
        )
      ).status,
    ).toBe(204);
    const last = await api.del('/v1/auth/links/mock', fresh);
    expect(last.status).toBe(409);
    expect(last.body.error.message).toMatch(/only sign-in/);
  });

  it('links a second provider (Google, verified with local keys), allows unlinking one, then protects the last', async () => {
    const gKeys = await generateKeyPair('RS256');
    const jwks = createLocalJWKSet({
      keys: [{ ...(await exportJWK(gKeys.publicKey)), kid: 'g1', alg: 'RS256', use: 'sig' }],
    });
    // the verifier reads the harness clock lazily (it is created before the harness exists)
    const ref: { h?: Harness } = {};
    const dual = (ref.h = await startHarness(
      {},
      { providers: [googleProvider(['gclient'], () => new Date(ref.h!.clock.now), jwks)] },
    ));
    try {
      const d = client(dual.base);
      const reg = await newRegistered(d, 'multi-link', 'Multi Link');
      const googleToken = async (sub: string) => {
        const nonce = (await d.post('/v1/auth/nonce')).body.nonce as string;
        return new SignJWT({ nonce, email: 'm@gmail.test', email_verified: true })
          .setProtectedHeader({ alg: 'RS256', kid: 'g1' })
          .setIssuer(GOOGLE_ISSUERS[0]!)
          .setAudience('gclient')
          .setSubject(sub)
          .setIssuedAt(Math.floor(dual.clock.now.getTime() / 1000))
          .setExpirationTime(Math.floor(dual.clock.now.getTime() / 1000) + 600)
          .sign(gKeys.privateKey);
      };
      expect((await d.get('/v1/auth/providers')).body.providers.sort()).toEqual(['google', 'mock']);
      // linking needs a recent proof
      dual.clock.advance(11 * MINUTE);
      const access = (await d.post('/v1/auth/refresh', { refreshToken: reg.refresh })).body.tokens
        .accessToken as string;
      expect(
        (await d.post('/v1/auth/links', { provider: 'google', credential: await googleToken('g-1') }, access))
          .body.error.code,
      ).toBe('reauth_required');
      expect(
        (
          await d.post(
            '/v1/auth/reauth',
            { provider: 'mock', credential: await mockCredential(d, 'multi-link') },
            access,
          )
        ).status,
      ).toBe(204);
      const linked = await d.post(
        '/v1/auth/links',
        { provider: 'google', credential: await googleToken('g-1') },
        access,
      );
      expect(linked.status).toBe(201);
      expect(linked.body.profile.links.map((l: { provider: string }) => l.provider).sort()).toEqual([
        'google',
        'mock',
      ]);
      // the google identity is not shareable with a second account
      const other = await newRegistered(d, 'multi-link-other');
      dual.clock.advance(0);
      expect(
        (
          await d.post(
            '/v1/auth/links',
            { provider: 'google', credential: await googleToken('g-1') },
            other.access,
          )
        ).status,
      ).toBe(409);
      // Google now signs into the same player
      const viaGoogle = await d.post('/v1/auth/signin', {
        provider: 'google',
        credential: await googleToken('g-1'),
        platform: 'android',
      });
      expect(viaGoogle.body.profile.id).toBe(reg.id);
      // unlink mock, then google is the last one and cannot go
      expect((await d.del('/v1/auth/links/mock', viaGoogle.body.tokens.accessToken)).status).toBe(200);
      expect((await d.del('/v1/auth/links/google', viaGoogle.body.tokens.accessToken)).status).toBe(409);
      expect((await d.del('/v1/auth/links/apple', viaGoogle.body.tokens.accessToken)).status).toBe(404);
      expect((await d.del('/v1/auth/links/facebook', viaGoogle.body.tokens.accessToken)).status).toBe(400);
    } finally {
      await dual.close();
    }
  });

  it('deletes an account: erases personal data, frees the name, keeps only a non-identifying tombstone', async () => {
    const r = await newRegistered(api, 'to-delete', 'Delete Me');
    const bad = await api.post('/v1/me/delete', { confirm: 'yes' }, r.access);
    expect(bad.status).toBe(400);
    expect((await api.post('/v1/me/delete', { confirm: 'DELETE' }, r.access)).status).toBe(204);
    expect((await api.get('/v1/me', r.access)).status).toBe(401);
    expect((await api.post('/v1/auth/refresh', { refreshToken: r.refresh })).status).toBe(401);
    // the same provider identity can never sign back into the dead account: it becomes a NEW account
    const again = await api.post('/v1/auth/signin', {
      provider: 'mock',
      credential: await mockCredential(api, 'to-delete'),
      platform: 'dev',
    });
    expect(again.status).toBe(201);
    expect(again.body.profile.id).not.toBe(r.id);
    const rows = await h.platform.db.query<Record<string, unknown>>(
      'SELECT p.status, p.friend_code, f.display_name, f.name_skeleton, f.settings FROM players p JOIN profiles f ON f.player_id = p.id WHERE p.id = $1',
      [r.id],
    );
    expect(rows.rows[0]).toMatchObject({
      status: 'deleted',
      display_name: 'Deleted player',
      name_skeleton: null,
      settings: {},
    });
    expect(String(rows.rows[0]!.friend_code)).toMatch(/^deleted:/);
    expect(
      (await h.platform.db.query('SELECT 1 FROM identity_links WHERE player_id = $1', [r.id])).rowCount,
    ).toBe(0);
    expect((await h.platform.db.query('SELECT 1 FROM sessions WHERE player_id = $1', [r.id])).rowCount).toBe(
      0,
    );
    // the name is free again
    expect((await api.post('/v1/auth/guest', { nickname: 'Delete Me' })).status).toBe(201);
    // the audit trail records the deletion without PII
    const a = await h.platform.db.query<{ detail: unknown }>(
      "SELECT detail FROM audit_events WHERE type = 'account.deleted' AND subject_id = $1",
      [r.id],
    );
    expect(a.rows[0]!.detail).toEqual({ kind: 'registered' });
  });

  it('a guest can delete without a provider (the session is the proof)', async () => {
    const g = await newGuest(api);
    expect((await api.post('/v1/me/delete', { confirm: 'DELETE' }, g.access)).status).toBe(204);
    expect((await api.get('/v1/me', g.access)).status).toBe(401);
  });
});
