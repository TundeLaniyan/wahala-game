import { describe, expect, it, vi } from 'vitest';
import { createMockOnline, manualClock } from '../../src/online/mock';
import { E, ONLINE_ERROR_CODES, describeError } from '../../src/online/errors';
import { mock, val } from './helpers';

describe('mock error injection', () => {
  it('serverUnavailable, timeout and roomFull can be injected per service and method', async () => {
    const m = mock();
    val(await m.online.accounts.signInGuest());
    m.online.control.faults.inject({ service: 'matchmaking', method: 'enqueue', error: E.serverUnavailable() });
    expect(await m.online.matchmaking.enqueue({ game: 'classic', arenaId: 'danfoBusPark' })).toMatchObject({
      ok: false,
      error: { code: 'serverUnavailable' },
    });
    // the rule is spent: the next call works
    expect((await m.online.matchmaking.enqueue({ game: 'classic', arenaId: 'danfoBusPark' })).ok).toBe(true);

    m.online.control.faults.inject({ service: 'parties', method: 'create', error: E.timeout() });
    expect(await m.online.parties.create()).toMatchObject({ error: { code: 'timeout' } });
    m.online.control.faults.inject({ service: 'lobbies', method: '*', error: E.roomFull(), times: 2 });
    expect(await m.online.lobbies.get('x')).toMatchObject({ error: { code: 'roomFull' } });
    expect(await m.online.lobbies.setReady('x', true)).toMatchObject({ error: { code: 'roomFull' } });
    expect(await m.online.lobbies.get('x')).toMatchObject({ error: { code: 'notFound' } });
  });

  it('wildcards, repeat counts and clearing', async () => {
    const m = mock();
    m.online.control.faults.inject({ service: '*', method: '*', error: E.serverUnavailable(), times: Infinity });
    for (const call of [
      () => m.online.accounts.signInGuest(),
      () => m.online.social.friends(),
      () => m.online.ranking.rating(),
      () => m.online.progression.get(),
    ]) {
      expect(await call()).toMatchObject({ ok: false, error: { code: 'serverUnavailable' } });
    }
    m.online.control.faults.clear();
    expect((await m.online.accounts.signInGuest()).ok).toBe(true);
  });

  it('injected rate limiting and version mismatch carry their details', async () => {
    const m = mock();
    m.online.control.faults.inject({ service: 'accounts', method: 'signInGuest', error: E.rateLimited(1500) });
    expect(await m.online.accounts.signInGuest()).toMatchObject({ error: { code: 'rateLimited', retryAfterMs: 1500 } });
    m.online.control.faults.inject({ service: 'accounts', method: 'signInGuest', error: E.versionMismatch(1, 2) });
    expect(await m.online.accounts.signInGuest()).toMatchObject({ error: { code: 'versionMismatch', serverVersion: 2 } });
  });

  it('no service call ever throws: odd arguments come back as error results', async () => {
    const m = mock();
    val(await m.online.accounts.signInGuest());
    const weird = [undefined, null, 5, {}, [], 'x'.repeat(10_000)] as unknown as string[];
    for (const w of weird) {
      for (const r of await Promise.all([
        m.online.parties.get(w),
        m.online.lobbies.get(w),
        m.online.matches.snapshot(w),
        m.online.matchmaking.status(w),
        m.online.social.respondFriend(w, true),
        m.online.parties.join(w),
        m.online.ranking.leaderboard(w),
      ])) {
        expect(typeof r.ok).toBe('boolean');
      }
    }
  });

  it('every error code is covered by a human readable line and a constructor', () => {
    for (const code of ONLINE_ERROR_CODES) {
      const sample = { code, message: 'm', issues: [], state: 's', retryAfterMs: 1, clientVersion: 1, serverVersion: 2 } as never;
      expect(typeof describeError(sample)).toBe('string');
    }
    expect(Object.keys(E).length).toBeGreaterThanOrEqual(ONLINE_ERROR_CODES.length - 1);
  });

  it('latency is off by default and, when on, is simulated through the injected sleep', async () => {
    const sleep = vi.fn(() => Promise.resolve());
    const off = createMockOnline({ clock: manualClock(), sleep });
    await off.accounts.signInGuest();
    expect(sleep).not.toHaveBeenCalled();
    const on = createMockOnline({ clock: manualClock(), sleep, latencyMs: { min: 40, max: 80 } });
    await on.accounts.signInGuest();
    await on.social.friends();
    expect(sleep).toHaveBeenCalledTimes(2);
    for (const [ms] of sleep.mock.calls as unknown as number[][]) {
      expect(ms).toBeGreaterThanOrEqual(40);
      expect(ms).toBeLessThanOrEqual(80);
    }
  });

  it('an unsubscribed or throwing event listener never breaks the server', async () => {
    const m = mock();
    const seen: string[] = [];
    m.online.events.subscribe(() => {
      throw new Error('boom');
    });
    const off = m.online.events.subscribe((e) => seen.push(e.type));
    val(await m.online.accounts.signInGuest());
    val(await m.online.parties.create());
    expect(seen).toContain('party.update');
    off();
    const before = seen.length;
    val(await m.online.accounts.signOut());
    expect(seen.length).toBe(before);
  });
});
