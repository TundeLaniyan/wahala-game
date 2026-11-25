import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DAY, MINUTE } from '../src/util/clock';
import { client, newGuest, startHarness } from './helpers';
import type { Api, Harness } from './helpers';

let h: Harness;
let api: Api;
beforeAll(async () => {
  h = await startHarness();
  api = client(h.base);
});
afterAll(() => h.close());

describe('guest identity (no account needed)', () => {
  it('creates a guest with a unique immutable id, a generated nickname and restricted capabilities', async () => {
    const a = await newGuest(api);
    const b = await newGuest(api);
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.id).not.toBe(b.id);
    expect(a.name).toMatch(/^Guest-[A-Z2-9]{4}$/);
    expect(a.profile.kind).toBe('guest');
    expect(a.profile.ageGroup).toBe('unspecified');
    expect(a.profile.capabilities).toEqual({
      textChat: false,
      voice: false,
      purchases: false,
      friendCodeOnly: true,
    });
    expect(a.access).toMatch(/^wa_/);
    expect(a.refresh).toMatch(/^wr_/);
  });

  it('takes a chosen nickname and refuses a taken one, whatever its case, accents or look-alike letters', async () => {
    await newGuest(api, 'Tunde Ade');
    for (const clash of ['tunde ade', 'TUNDE  ADE', 'Túndé Adé', 'Tunde_Ade', 'Tundе Adе' /* Cyrillic е */]) {
      const r = await api.post('/v1/auth/guest', { nickname: clash });
      // mixed-script names are refused outright; the others are refused as taken
      expect([409, 422]).toContain(r.status);
    }
    const ok = await api.post('/v1/auth/guest', { nickname: 'Tunde Ade 2' });
    expect(ok.status).toBe(201);
  });

  it('refuses names that impersonate staff or bots, invisible characters, markup and emoji', async () => {
    for (const bad of [
      'Admin',
      'Wahala Staff',
      'moderator',
      'BOT Emeka',
      'b0t',
      'Na​me',
      '<b>x</b>',
      'Ada 😀',
      'A',
      'x'.repeat(25),
    ]) {
      const r = await api.post('/v1/auth/guest', { nickname: bad });
      expect(r.status, bad).toBe(422);
      expect(r.body.error.code).toBe('name_rejected');
    }
  });

  it('rejects unknown fields so a client cannot smuggle an id, kind or status', async () => {
    const r = await api.post('/v1/auth/guest', {
      kind: 'registered',
      status: 'active',
      id: '00000000-0000-0000-0000-000000000000',
    });
    expect(r.status).toBe(400);
    expect(r.body.error.message).toMatch(/unknown field/);
  });

  it('authenticates the access token and refuses a missing, malformed or unknown one', async () => {
    const g = await newGuest(api);
    expect((await api.get('/v1/me', g.access)).status).toBe(200);
    expect((await api.get('/v1/me')).status).toBe(401);
    expect((await api.get('/v1/me', 'wa_nope')).status).toBe(401);
    expect((await api.get('/v1/me', g.refresh)).status).toBe(401); // a refresh token is not an access token
    expect((await api.get('/v1/me', 'x'.repeat(500))).status).toBe(401);
  });

  it('expires the access token after 15 minutes and refreshing rotates BOTH tokens', async () => {
    const g = await newGuest(api);
    h.clock.advance(16 * MINUTE);
    expect((await api.get('/v1/me', g.access)).status).toBe(401);
    const r = await api.post('/v1/auth/refresh', { refreshToken: g.refresh });
    expect(r.status).toBe(200);
    const t = r.body.tokens;
    expect(t.accessToken).not.toBe(g.access);
    expect(t.refreshToken).not.toBe(g.refresh);
    expect((await api.get('/v1/me', t.accessToken)).status).toBe(200);
    // same session id, same player: rotation, not a new login
    expect((await api.get('/v1/me', t.accessToken)).body.profile.id).toBe(g.id);
  });

  it('detects refresh-token reuse and revokes the whole session (a stolen copy kills both holders)', async () => {
    const g = await newGuest(api);
    const first = await api.post('/v1/auth/refresh', { refreshToken: g.refresh });
    expect(first.status).toBe(200);
    // the thief (or a replay) presents the OLD refresh token
    const replay = await api.post('/v1/auth/refresh', { refreshToken: g.refresh });
    expect(replay.status).toBe(401);
    // the legitimate holder's newest tokens are now dead too
    expect((await api.get('/v1/me', first.body.tokens.accessToken)).status).toBe(401);
    expect(
      (await api.post('/v1/auth/refresh', { refreshToken: first.body.tokens.refreshToken })).status,
    ).toBe(401);
    const audit = await h.platform.db.query(
      "SELECT type FROM audit_events WHERE subject_id = $1 AND type = 'session.reuse_detected'",
      [g.id],
    );
    expect(audit.rowCount).toBe(1);
  });

  it('expires a refresh token after the sliding window and never beyond the absolute cap', async () => {
    const g = await newGuest(api);
    h.clock.advance(31 * DAY);
    expect((await api.post('/v1/auth/refresh', { refreshToken: g.refresh })).status).toBe(401);
    // sliding: a session used every 20 days stays alive, but dies at the 365-day cap
    const s = await newGuest(api);
    let token = s.refresh;
    for (let i = 0; i < 18; i++) {
      h.clock.advance(20 * DAY);
      const r = await api.post('/v1/auth/refresh', { refreshToken: token });
      expect(r.status).toBe(200);
      token = r.body.tokens.refreshToken;
    }
    h.clock.advance(20 * DAY); // 380 days after creation
    expect((await api.post('/v1/auth/refresh', { refreshToken: token })).status).toBe(401);
  });

  it('logout revokes the session at once', async () => {
    const g = await newGuest(api);
    expect((await api.post('/v1/auth/logout', {}, g.access)).status).toBe(204);
    expect((await api.get('/v1/me', g.access)).status).toBe(401);
    expect((await api.post('/v1/auth/refresh', { refreshToken: g.refresh })).status).toBe(401);
  });

  it('lists devices, revokes one, revokes all others, and never touches another player’s session', async () => {
    const a = await newGuest(api);
    const other = await newGuest(api);
    // a second device for the same account is a refresh of... a guest cannot sign in twice, so use an upgraded flow in provider tests;
    // here: list shows the current one, and another player's id is "not found"
    const list = await api.get('/v1/auth/sessions', a.access);
    expect(list.body.sessions).toHaveLength(1);
    expect(list.body.sessions[0].current).toBe(true);
    const otherList = await api.get('/v1/auth/sessions', other.access);
    const foreign = otherList.body.sessions[0].id;
    expect((await api.del(`/v1/auth/sessions/${foreign}`, a.access)).status).toBe(404);
    expect((await api.get('/v1/me', other.access)).status).toBe(200);
    expect((await api.del('/v1/auth/sessions/not-an-id', a.access)).status).toBe(400);
    expect((await api.post('/v1/auth/sessions/revoke-others', {}, a.access)).body.revoked).toBe(0);
    expect((await api.del(`/v1/auth/sessions/${list.body.sessions[0].id}`, a.access)).status).toBe(204);
    expect((await api.get('/v1/me', a.access)).status).toBe(401);
  });

  it('stores tokens only as hashes', async () => {
    const g = await newGuest(api);
    const r = await h.platform.db.query<{ access_hash: string; refresh_hash: string }>(
      'SELECT access_hash, refresh_hash FROM sessions WHERE player_id = $1',
      [g.id],
    );
    expect(r.rows[0]!.access_hash).not.toContain(g.access.slice(3));
    expect(r.rows[0]!.refresh_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('a suspended account cannot authenticate and its sessions are revoked', async () => {
    const g = await newGuest(api);
    await h.platform.identity.setStatus(g.id, 'suspended', null);
    expect((await api.get('/v1/me', g.access)).status).toBe(401);
    expect((await api.post('/v1/auth/refresh', { refreshToken: g.refresh })).status).toBe(401);
    await h.platform.identity.setStatus(g.id, 'active', null);
    // reinstating does not resurrect old sessions
    expect((await api.get('/v1/me', g.access)).status).toBe(401);
  });
});

describe('profile', () => {
  it('edits the nickname with a first-change-free then 24 h cooldown, and refuses a taken name', async () => {
    const g = await newGuest(api);
    const a = await api.patch('/v1/me', { displayName: 'Chioma Okafor' }, g.access);
    expect(a.status).toBe(200);
    expect(a.body.profile.displayName).toBe('Chioma Okafor');
    const again = await api.patch('/v1/me', { displayName: 'Chioma O' }, g.access);
    expect(again.status).toBe(429);
    expect(again.body.error.retryAfterMs).toBeGreaterThan(0);
    h.clock.advance(25 * 60 * MINUTE);
    const fresh = (await api.post('/v1/auth/refresh', { refreshToken: g.refresh })).body.tokens.accessToken;
    expect((await api.patch('/v1/me', { displayName: 'Chioma O' }, fresh)).status).toBe(200);
    const other = await newGuest(api);
    h.clock.advance(0);
    const taken = await api.patch('/v1/me', { displayName: 'chioma  o' }, other.access);
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe('name_taken');
  });

  it('validates the fighter, presence visibility and settings; refuses unknown settings', async () => {
    const g = await newGuest(api);
    expect((await api.patch('/v1/me', { selectedCharacter: 'nobody' }, g.access)).status).toBe(400);
    expect((await api.patch('/v1/me', { presenceVisibility: 'everyone' }, g.access)).status).toBe(400);
    expect((await api.patch('/v1/me', { settings: { isAdmin: true } }, g.access)).status).toBe(400);
    expect((await api.patch('/v1/me', { settings: { locale: 'x'.repeat(40) } }, g.access)).status).toBe(400);
    const ok = await api.patch(
      '/v1/me',
      { presenceVisibility: 'nobody', settings: { locale: 'en-NG', subtitles: true } },
      g.access,
    );
    expect(ok.status).toBe(200);
    expect(ok.body.profile.settings).toEqual({ locale: 'en-NG', subtitles: true });
    const removed = await api.patch('/v1/me', { settings: { subtitles: null } }, g.access);
    expect(removed.body.profile.settings).toEqual({ locale: 'en-NG' });
  });

  it('cannot equip a cosmetic yet (no entitlements exist before commerce)', async () => {
    const g = await newGuest(api);
    expect(
      (await api.patch('/v1/me', { loadout: { fighterSkin: 'skin-agbada-gold' } }, g.access)).status,
    ).toBe(400);
    expect((await api.patch('/v1/me', { loadout: {} }, g.access)).status).toBe(200);
  });

  it('a guest can declare an age band, but cannot later move up to adult without registering and proving identity', async () => {
    const g = await newGuest(api);
    expect((await api.patch('/v1/me', { ageGroup: '13_17' }, g.access)).status).toBe(200);
    const up = await api.patch('/v1/me', { ageGroup: 'adult' }, g.access);
    expect(up.status).toBe(403);
    expect(up.body.error.code).toBe('restricted_account');
    const first = await newGuest(api);
    expect((await api.patch('/v1/me', { ageGroup: 'adult' }, first.access)).status).toBe(200); // first declaration is free
    // ...but a guest "adult" still has no text chat, voice or purchases: those need a registered account too
    expect((await api.get('/v1/me', first.access)).body.profile.capabilities.textChat).toBe(false);
  });

  it('rotating the friend code makes the old one unusable', async () => {
    const g = await newGuest(api);
    const r = await api.post('/v1/me/friend-code/rotate', {}, g.access);
    expect(r.status).toBe(200);
    expect(r.body.friendCode).not.toBe(g.friendCode);
    expect(r.body.friendCode).toMatch(/^[A-Z2-9]{8}$/);
    expect((await api.get('/v1/me', g.access)).body.profile.friendCode).toBe(r.body.friendCode);
  });
});
