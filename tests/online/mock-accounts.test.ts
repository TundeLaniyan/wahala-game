import { describe, expect, it } from 'vitest';
import { GUEST_KEY } from '../../src/online/mock/accounts';
import { createMockOnline, manualClock } from '../../src/online/mock';
import { memoryStore } from '../../src/platform';
import { mock, val } from './helpers';

describe('mock accounts', () => {
  it('every service refuses an unauthenticated caller', async () => {
    const { online } = mock();
    const results = await Promise.all([
      online.parties.create(),
      online.matchmaking.enqueue({ game: 'classic', arenaId: 'danfoBusPark' }),
      online.progression.get(),
      online.ranking.rating(),
      online.social.friends(),
      online.accounts.currentProfile(),
      online.matches.snapshot('m'),
      online.lobbies.get('r'),
    ]);
    for (const r of results) expect(r).toMatchObject({ ok: false, error: { code: 'unauthenticated' } });
  });

  it('a guest account is created once and remembered on this device', async () => {
    const m = mock();
    const a = val(await m.online.accounts.signInGuest());
    expect(a.profile.guest).toBe(true);
    expect(JSON.parse(m.store.getItem(GUEST_KEY)!).id).toBe(a.profile.id);
    // a new "page load" with the same store gets the same guest
    const again = createMockOnline({ clock: m.clock, seed: 99, store: m.store });
    expect(val(await again.accounts.signInGuest()).profile.id).toBe(a.profile.id);
    // a second sign-in in the same session is the same session
    expect(val(await m.online.accounts.signInGuest()).profile.id).toBe(a.profile.id);
  });

  it('is deterministic: the same seed gives the same guest id and party code', async () => {
    const make = async () => {
      const m = mock({ seed: 5 });
      const s = val(await m.online.accounts.signInGuest());
      const party = val(await m.online.parties.create());
      return [s.profile.id, s.profile.displayName, party.code];
    };
    expect(await make()).toEqual(await make());
  });

  it('works without any storage (private mode)', async () => {
    const online = createMockOnline({ clock: manualClock(), store: null, progressStore: null });
    expect(val(await online.accounts.signInGuest()).profile.guest).toBe(true);
    expect(val(await online.progression.get()).profile.level).toBe(1);
  });

  it('survives a corrupt stored guest record', async () => {
    const store = memoryStore({ [GUEST_KEY]: '{not json' });
    const online = createMockOnline({ clock: manualClock(), store });
    expect(val(await online.accounts.signInGuest()).profile.id).toMatch(/^guest-/);
  });

  it('validates display names', async () => {
    const { online } = mock();
    for (const bad of ['', 'a', 'x'.repeat(25), '<b>hi</b>', ' padded ', 'a\nb']) {
      expect(await online.accounts.signInGuest(bad), JSON.stringify(bad)).toMatchObject({
        ok: false,
        error: { code: 'invalidMessage' },
      });
    }
    expect(val(await online.accounts.signInGuest('Ada Danfo')).profile.displayName).toBe('Ada Danfo');
    expect(val(await online.accounts.setDisplayName("Bisi O'Neil")).displayName).toBe("Bisi O'Neil");
    expect(await online.accounts.setDisplayName('')).toMatchObject({ ok: false });
  });

  it('the auth token is opaque, in memory only and redacted when serialised', async () => {
    const m = mock();
    const s = val(await m.online.accounts.signInGuest());
    expect(s.token.reveal().length).toBeGreaterThan(20);
    expect(JSON.stringify(s)).not.toContain(s.token.reveal());
    expect(`${s.token}`).not.toContain(s.token.reveal());
    for (const store of [m.store, m.progressStore])
      expect(JSON.stringify(store.dump())).not.toContain(s.token.reveal());
  });

  it('the session expires with the clock, and sign-out ends it', async () => {
    const m = mock();
    val(await m.online.accounts.signInGuest());
    expect(val(await m.online.accounts.currentProfile()).guest).toBe(true);
    m.clock.advance(61 * 60 * 1000);
    expect(await m.online.accounts.currentProfile()).toMatchObject({
      ok: false,
      error: { code: 'unauthenticated' },
    });
    // signing in again after expiry issues a fresh session
    val(await m.online.accounts.signInGuest());
    expect(val(await m.online.accounts.currentProfile()).guest).toBe(true);
    const fresh = mock();
    val(await fresh.online.accounts.signInGuest());
    val(await fresh.online.accounts.signOut());
    expect(await fresh.online.accounts.currentProfile()).toMatchObject({ ok: false });
  });

  it('the placeholder sign-in makes a non-guest account', async () => {
    const { online } = mock();
    const s = val(await online.accounts.signIn({ kind: 'placeholder', handle: 'Chidi Eze' }));
    expect(s.profile).toMatchObject({ guest: false, displayName: 'Chidi Eze' });
    expect(await online.accounts.signIn({ kind: 'placeholder', handle: '!' })).toMatchObject({ ok: false });
  });
});

describe('mock social', () => {
  it('lists scripted friends with presence and finds players by code', async () => {
    const { online } = mock();
    val(await online.accounts.signInGuest());
    const friends = val(await online.social.friends());
    expect(friends.map((f) => f.presence)).toContain('offline');
    const req = val(await online.social.requestFriend('HALI05'));
    expect(req.id).toMatch(/^freq-/);
    expect(val(await online.social.friends()).some((f) => f.displayName === 'Halima_Gen')).toBe(true);
    expect(await online.social.requestFriend('HALI05')).toMatchObject({ error: { code: 'conflict' } });
    expect(await online.social.requestFriend('NOPE99')).toMatchObject({ error: { code: 'notFound' } });
    expect(await online.social.requestFriend('x')).toMatchObject({ error: { code: 'invalidMessage' } });
  });

  it('an incoming friend request can be accepted or declined once', async () => {
    const { online } = mock();
    val(await online.accounts.signInGuest());
    const friend = val(await online.social.respondFriend('freq-halima', true));
    expect(friend?.displayName).toBe('Halima_Gen');
    expect(await online.social.respondFriend('freq-halima', true)).toMatchObject({
      error: { code: 'notFound' },
    });
  });

  it('a friend invites you to a party; accepting joins it, declining does not, and invitations expire', async () => {
    const m = mock();
    val(await m.online.accounts.signInGuest());
    const party = m.online.control.seedRemoteParty('REMOTE', 'friend-ada')!;
    m.online.control.receiveInvitation(party.id, 'friend-ada');
    const [inv] = val(await m.online.social.invitations());
    expect(inv!.fromName).toBe('Ada_Danfo');
    const joined = val(await m.online.social.respondInvitation(inv!.id, true));
    expect(joined?.members.map((x) => x.displayName)).toContain('Ada_Danfo');
    expect(joined?.members).toHaveLength(2);

    m.online.control.receiveInvitation(party.id, 'friend-femi');
    const [inv2] = val(await m.online.social.invitations());
    expect(val(await m.online.social.respondInvitation(inv2!.id, false))).toBeNull();

    m.online.control.receiveInvitation(party.id, 'friend-femi');
    m.clock.advance(61_000);
    expect(val(await m.online.social.invitations())).toEqual([]);
  });
});
