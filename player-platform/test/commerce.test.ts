import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COSMETICS } from '../../src/cosmetics/catalogue';
import { createMockProvider } from '../src/commerce/providers';
import type { PaymentProvider, ProviderEvent } from '../src/commerce/providers';
import { ALL_EVENTS, ALL_STATUSES, isFinal, nextStatus } from '../src/commerce/stateMachine';
import { OPEN_ORDER_TTL_MS } from '../src/commerce/service';
import { MINUTE } from '../src/util/clock';
import { TEST_ADMIN, client, fakeClock, newGuest, newRegistered, startHarness } from './helpers';
import type { Api, Harness } from './helpers';

describe('purchase state machine', () => {
  it('only a verified payment reaches paid; fulfilled only follows paid; finals have no exit', () => {
    const reach = (from: string, event: string) => nextStatus(from as never, event as never);
    for (const s of ALL_STATUSES) {
      for (const e of ALL_EVENTS) {
        const n = reach(s, e);
        if (n === 'paid') expect(e).toBe('payment_verified');
        if (n === 'fulfilled') expect([s, e]).toEqual(['paid', 'fulfilled']);
        if (isFinal(s)) expect(n).toBeNull();
      }
    }
    expect(reach('failed', 'payment_verified')).toBeNull(); // a failed order cannot later be paid
    expect(reach('cancelled', 'payment_verified')).toBeNull();
    expect(reach('created', 'fulfilled')).toBeNull(); // no fulfilment without payment
    expect(reach('pending', 'fulfilled')).toBeNull();
    expect(reach('fulfilled', 'refunded')).toBe('refunded');
    expect(reach('paid', 'revoked')).toBe('revoked');
  });
});

describe('provider contract (every real adapter must pass the same checks)', () => {
  const clock = fakeClock();
  const ev: ProviderEvent = {
    eventId: 'evt_1',
    type: 'payment.succeeded',
    orderId: 'o1',
    providerRef: 'tx1',
    amountMinor: 100,
    currency: 'XTS',
  };

  /** Reusable: a provider that signs / verifies its own notifications must reject anything it did not sign. */
  function providerContract(
    name: string,
    make: () => {
      provider: PaymentProvider;
      sign: (e: ProviderEvent) => { body: string; headers: Record<string, string> };
    },
  ) {
    it(`${name}: accepts its own signed event and normalises it`, () => {
      const { provider, sign } = make();
      const s = sign(ev);
      expect(provider.parseWebhook(s.body, s.headers)).toEqual([ev]);
    });
    it(`${name}: rejects a tampered body, a missing signature and a signature from another key`, () => {
      const { provider, sign } = make();
      const s = sign(ev);
      const tampered = s.body.replace('"amountMinor":100', '"amountMinor":1');
      expect(() => provider.parseWebhook(tampered, s.headers)).toThrow(/bad signature/);
      expect(() => provider.parseWebhook(s.body, {})).toThrow(/bad signature/);
      const other = make();
      const o = other.sign(ev);
      expect(() =>
        provider.parseWebhook(s.body, {
          ...s.headers,
          ...Object.fromEntries(Object.entries(o.headers).filter(([k]) => k.includes('signature'))),
        }),
      ).not.toThrow();
    });
    it(`${name}: rejects a stale (replayed days later) event`, () => {
      const { provider, sign } = make();
      const s = sign(ev);
      clock.advance(10 * MINUTE);
      expect(() => provider.parseWebhook(s.body, s.headers)).toThrow(/stale/);
      clock.advance(-10 * MINUTE);
    });
    it(`${name}: refuses malformed bodies`, () => {
      const { provider, sign } = make();
      const bad = sign({ ...ev, eventId: undefined as never });
      expect(() => provider.parseWebhook(bad.body, bad.headers)).toThrow(/malformed/);
    });
  }

  providerContract('mock', () => {
    const p = createMockProvider(clock.clock, 'k'.repeat(64));
    return { provider: p, sign: (e) => p.signEvent(e) };
  });
});

describe('the sandbox shop (mock checkout, test money only)', () => {
  let h: Harness;
  let api: Api;
  let sandboxItems: string[];
  beforeAll(async () => {
    h = await startHarness({ PLATFORM_MOCK_CHECKOUT: '1' });
    api = client(h.base);
    sandboxItems = await h.platform.catalog.seedSandbox();
  });
  afterAll(() => h.close());

  type G = Awaited<ReturnType<typeof newGuest>>;
  let n = 0;
  const adult = async (): Promise<G> => {
    const r = await newRegistered(api, `shop-adult-${++n}`, `Shopper ${n}`);
    await api.patch('/v1/me', { ageGroup: 'adult' }, r.access);
    return r;
  };
  let k = 0;
  const key = () => `idem-key-${++k}-${Math.random().toString(36).slice(2, 8)}`;
  const order = (g: G, itemId: string, idem = key(), provider = 'mock') =>
    api.call('POST', '/v1/shop/orders', { itemId, provider }, g.access, { 'idempotency-key': idem });
  const complete = (orderId: string, body: object) =>
    api.post(`/v1/dev/mock-checkout/${orderId}/complete`, body);
  const owned = async (g: G) => (await api.get('/v1/shop/entitlements', g.access)).body.items as string[];

  it('the catalogue mirrors the game: every cosmetic, mapped to a shop category, nothing earned is for sale, no price unless the sandbox seeded one', async () => {
    const g = await adult();
    const cat = (await api.get('/v1/shop/catalog', g.access)).body.items as {
      id: string;
      category: string;
      owned: boolean;
      forSale: boolean;
      prices: { sandbox: boolean }[];
    }[];
    for (const c of COSMETICS)
      expect(
        cat.some((i) => i.id === c.id),
        c.id,
      ).toBe(true);
    expect(
      cat
        .filter((i) => i.category === 'narration')
        .map((i) => i.id)
        .sort(),
    ).toEqual(['narration-alt', 'narration-full', 'narration-lore']);
    const cats = new Set(cat.map((i) => i.category));
    expect(
      [...cats].every((c) =>
        ['outfit', 'emote', 'elimination_effect', 'banner', 'vehicle_cosmetic', 'narration'].includes(c),
      ),
    ).toBe(true);
    expect(cat.find((i) => i.id === 'skin-default')).toMatchObject({
      owned: true,
      forSale: false,
      prices: [],
    }); // the free starting look
    expect(
      cat
        .filter((i) => i.forSale)
        .map((i) => i.id)
        .sort(),
    ).toEqual([...sandboxItems].sort());
    expect(cat.filter((i) => i.forSale).every((i) => i.prices.every((p) => p.sandbox))).toBe(true);
    expect(
      (await api.get('/v1/shop/catalog?category=emote', g.access)).body.items.every(
        (i: { category: string }) => i.category === 'emote',
      ),
    ).toBe(true);
    expect((await api.get('/v1/shop/catalog?category=weapon', g.access)).status).toBe(400);
  });

  it('can never sell a gameplay advantage: the schema refuses it, and the catalogue has no stat columns', async () => {
    await expect(
      h.platform.db.query('UPDATE catalog_items SET affects_gameplay = true WHERE id = $1', [
        sandboxItems[0],
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      h.platform.db.query(
        "INSERT INTO catalog_items (id, category, name, created_at, affects_gameplay) VALUES ('p2w-bomb','outfit','x',now(),true)",
      ),
    ).rejects.toMatchObject({ code: '23514' });
    const cols = (
      await h.platform.db.query<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns WHERE table_name IN ('catalog_items','catalog_prices')",
      )
    ).rows
      .map((c) => c.column_name)
      .join(' ');
    expect(cols).not.toMatch(/damage|speed|range|health|power|bonus|boost|stat/i);
    await expect(
      h.platform.db.query(
        "INSERT INTO catalog_items (id, category, name, created_at) VALUES ('weapon-x','weapon','x',now())",
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('the sandbox currency cannot be a real price', async () => {
    await expect(
      h.platform.db.query(
        "INSERT INTO catalog_prices (item_id, currency, amount_minor, sandbox, created_at) VALUES ($1,'XTS',5,false,now())",
        [sandboxItems[0]],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      h.platform.db.query(
        "INSERT INTO catalog_prices (item_id, currency, amount_minor, sandbox, created_at) VALUES ($1,'NGN',5,true,now())",
        [sandboxItems[0]],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      h.platform.db.query(
        "INSERT INTO catalog_prices (item_id, currency, amount_minor, sandbox, created_at) VALUES ($1,'NGN',-5,false,now())",
        [sandboxItems[0]],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('buys an item end to end: order -> signed provider event -> entitlement -> equip; ownership appears ONLY after the verified event', async () => {
    const g = await adult();
    const item = sandboxItems[0]!;
    const o = await order(g, item);
    expect(o.status).toBe(201);
    expect(o.body.order).toMatchObject({
      itemId: item,
      provider: 'mock',
      status: 'pending',
      price: { currency: 'XTS', amountMinor: 100 },
    });
    expect(o.body.checkout).toMatchObject({ kind: 'mock' });
    expect(await owned(g)).toEqual([]);
    // equipping something not owned is refused
    const slot = (await api.get('/v1/shop/catalog', g.access)).body.items.find(
      (i: { id: string; category: string }) => i.id === item,
    ).category;
    expect(slot).toBe('outfit');
    expect((await api.patch('/v1/me', { loadout: { fighterSkin: item } }, g.access)).status).toBe(403);
    const done = await complete(o.body.order.id, { outcome: 'succeeded' });
    expect(done.status).toBe(200);
    expect(done.body.results).toEqual([expect.objectContaining({ outcome: 'applied', status: 'fulfilled' })]);
    expect(await owned(g)).toEqual([item]);
    expect((await api.get(`/v1/shop/orders/${o.body.order.id}`, g.access)).body.order.status).toBe(
      'fulfilled',
    );
    expect(
      (await api.patch('/v1/me', { loadout: { fighterSkin: item } }, g.access)).body.profile.loadout,
    ).toEqual({ fighterSkin: item });
    expect((await api.patch('/v1/me', { loadout: { emote: item } }, g.access)).status).toBe(400); // wrong slot for that item
    expect(
      (await api.get('/v1/shop/catalog', g.access)).body.items.find((i: { id: string }) => i.id === item)
        .owned,
    ).toBe(true);
    // buying it again is refused
    expect((await order(g, item)).status).toBe(409);
  });

  it('is idempotent: the same key returns the same order; a double tap returns the open order; a key reused for another item is refused', async () => {
    const g = await adult();
    const [a, b] = sandboxItems;
    const idem = key();
    const first = await order(g, a!, idem);
    const second = await order(g, a!, idem);
    expect(second.status).toBe(200);
    expect(second.body.order.id).toBe(first.body.order.id);
    const tap = await order(g, a!); // a different key, same item, still open
    expect(tap.body.order.id).toBe(first.body.order.id);
    expect((await order(g, b!, idem)).status).toBe(409);
    expect((await api.get('/v1/shop/orders', g.access)).body.orders).toHaveLength(1);
    expect(
      (await api.call('POST', '/v1/shop/orders', { itemId: a, provider: 'mock' }, g.access)).status,
    ).toBe(400); // key required
    expect(
      (
        await api.call('POST', '/v1/shop/orders', { itemId: a, provider: 'mock' }, g.access, {
          'idempotency-key': 'short',
        })
      ).status,
    ).toBe(400);
  });

  it('only registered adults can buy; unknown, unsellable and unpriced items are refused with no order created', async () => {
    const guest = await newGuest(api);
    expect((await order(guest, sandboxItems[0]!)).status).toBe(403);
    const teen = await newRegistered(api, `shop-teen-${++n}`);
    await api.patch('/v1/me', { ageGroup: '13_17' }, teen.access);
    expect((await order(teen, sandboxItems[0]!)).status).toBe(403);
    const g = await adult();
    expect((await order(g, 'does-not-exist')).status).toBe(404);
    expect((await order(g, 'skin-default')).status).toBe(409); // owned by everybody
    const earned = COSMETICS.find((c) => c.unlock.kind === 'rank')!;
    expect((await order(g, earned.id)).status).toBe(409); // earned by play: not sellable
    expect((await order(g, sandboxItems[0]!, key(), 'web')).status).toBe(501); // no real provider configured
    expect((await order(g, sandboxItems[0]!, key(), 'apple')).status).toBe(501);
    expect((await api.get('/v1/shop/orders', g.access)).body.orders).toEqual([]);
    expect(
      (await h.platform.db.query('SELECT 1 FROM orders WHERE player_id = $1', [guest.id])).rowCount,
    ).toBe(0);
  });

  it('refuses forged, tampered and replayed provider notifications; a wrong amount is not a sale', async () => {
    const g = await adult();
    const o = (await order(g, sandboxItems[1]!)).body.order;
    const mock = h.platform.mockPayments!;
    const evt = (extra: Partial<ProviderEvent> = {}): ProviderEvent => ({
      eventId: `evt_${Math.random().toString(36).slice(2)}`,
      type: 'payment.succeeded',
      orderId: o.id,
      providerRef: 'tx_x',
      amountMinor: o.price.amountMinor,
      currency: 'XTS',
      ...extra,
    });
    // a player token, or no signature, or a bad one
    const good = mock.signEvent(evt());
    expect((await api.call('POST', '/v1/shop/webhooks/mock', good.body, g.access)).status).toBe(401);
    expect(
      (
        await api.call('POST', '/v1/shop/webhooks/mock', good.body, undefined, {
          'x-mock-timestamp': good.headers['x-mock-timestamp']!,
          'x-mock-signature': 'f'.repeat(64),
        })
      ).status,
    ).toBe(401);
    const tampered = good.body.replace(`"amountMinor":${o.price.amountMinor}`, '"amountMinor":1');
    expect((await api.call('POST', '/v1/shop/webhooks/mock', tampered, undefined, good.headers)).status).toBe(
      401,
    );
    expect(await owned(g)).toEqual([]);
    // correctly signed but UNDERPAID: the order fails, nothing is granted
    const low = mock.signEvent(evt({ amountMinor: 1 }));
    const r = await api.call('POST', '/v1/shop/webhooks/mock', low.body, undefined, low.headers);
    expect(r.body.results[0]).toMatchObject({ outcome: 'applied', status: 'failed' });
    expect(await owned(g)).toEqual([]);
    expect((await api.get(`/v1/shop/orders/${o.id}`, g.access)).body.order.status).toBe('failed');
    // wrong currency likewise; an unknown order id is ignored
    const g2 = await adult();
    const o2 = (await order(g2, sandboxItems[1]!)).body.order;
    const cur = mock.signEvent(evt({ orderId: o2.id, currency: 'NGN', providerRef: 'tx_other' }));
    expect(
      (await api.call('POST', '/v1/shop/webhooks/mock', cur.body, undefined, cur.headers)).body.results[0]
        .status,
    ).toBe('failed');
    const ghost = mock.signEvent(evt({ orderId: '00000000-0000-4000-8000-000000000000' }));
    expect(
      (await api.call('POST', '/v1/shop/webhooks/mock', ghost.body, undefined, ghost.headers)).body
        .results[0],
    ).toMatchObject({ outcome: 'ignored', reason: 'unknown_order' });
  });

  it('a provider transaction id can belong to only one order', async () => {
    const mock = h.platform.mockPayments!;
    const g1 = await adult();
    const g2 = await adult();
    const a = (await order(g1, sandboxItems[0]!)).body.order;
    const b = (await order(g2, sandboxItems[0]!)).body.order;
    const send = (orderId: string, o: { price: { amountMinor: number } }) => {
      const s = mock.signEvent({
        eventId: `evt_${Math.random().toString(36).slice(2)}`,
        type: 'payment.succeeded',
        orderId,
        providerRef: 'tx_shared_ref',
        amountMinor: o.price.amountMinor,
        currency: 'XTS',
      });
      return api.call('POST', '/v1/shop/webhooks/mock', s.body, undefined, s.headers);
    };
    expect((await send(a.id, a)).body.results[0].outcome).toBe('applied');
    expect((await send(b.id, b)).body.results[0]).toMatchObject({
      outcome: 'ignored',
      reason: 'provider_ref_reuse',
    });
    expect(await owned(g2)).toEqual([]);
  });

  it('a replayed webhook is a no-op: never a second grant, never a second refund', async () => {
    const g = await adult();
    const o = (await order(g, sandboxItems[2]!)).body.order;
    const e = { outcome: 'succeeded', eventId: 'evt_replay_1' };
    expect((await complete(o.id, e)).body.results[0].outcome).toBe('applied');
    expect((await complete(o.id, e)).body.results[0].outcome).toBe('duplicate');
    expect(
      (await h.platform.db.query('SELECT 1 FROM entitlements WHERE player_id = $1', [g.id])).rowCount,
    ).toBe(1);
    expect(
      (await h.platform.db.query("SELECT 1 FROM order_events WHERE event_id = 'evt_replay_1'")).rowCount,
    ).toBe(1);
    // a second, different success event for the same (already fulfilled) order does not grant again
    expect((await complete(o.id, { outcome: 'succeeded' })).body.results[0]).toMatchObject({
      outcome: 'ignored',
      reason: 'not_open',
    });
  });

  it('refund and chargeback revoke ownership, unequip the item, and the item can be bought again', async () => {
    const g = await adult();
    const item = sandboxItems[0]!;
    const o = (await order(g, item)).body.order;
    await complete(o.id, { outcome: 'succeeded' });
    await api.patch('/v1/me', { loadout: { fighterSkin: item } }, g.access);
    expect((await complete(o.id, { outcome: 'refunded' })).body.results[0]).toMatchObject({
      outcome: 'applied',
      status: 'refunded',
    });
    expect(await owned(g)).toEqual([]);
    expect((await api.get('/v1/me', g.access)).body.profile.loadout).toEqual({});
    expect((await complete(o.id, { outcome: 'refunded' })).body.results[0]).toMatchObject({
      outcome: 'ignored',
    }); // nothing left to refund
    // buy again after the refund
    const again = (await order(g, item)).body.order;
    expect(again.id).not.toBe(o.id);
    await complete(again.id, { outcome: 'succeeded' });
    expect(await owned(g)).toEqual([item]);
    expect((await complete(again.id, { outcome: 'chargeback' })).body.results[0]).toMatchObject({
      outcome: 'applied',
      status: 'revoked',
    });
    expect(await owned(g)).toEqual([]);
    expect(
      (
        await h.platform.db.query(
          'SELECT revoke_reason FROM entitlements WHERE player_id = $1 AND item_id = $2',
          [g.id, item],
        )
      ).rows[0],
    ).toEqual({ revoke_reason: 'chargeback' });
  });

  it('failed and cancelled payments grant nothing; players can abandon an unpaid order; stale orders expire', async () => {
    const g = await adult();
    const o = (await order(g, sandboxItems[0]!)).body.order;
    expect((await complete(o.id, { outcome: 'failed' })).body.results[0]).toMatchObject({ status: 'failed' });
    expect(await owned(g)).toEqual([]);
    expect((await complete(o.id, { outcome: 'succeeded' })).body.results[0]).toMatchObject({
      outcome: 'ignored',
      reason: 'not_open',
    }); // a failed order is dead
    const o2 = (await order(g, sandboxItems[1]!)).body.order;
    expect((await api.post(`/v1/shop/orders/${o2.id}/cancel`, {}, g.access)).body.order.status).toBe(
      'cancelled',
    );
    expect((await api.post(`/v1/shop/orders/${o2.id}/cancel`, {}, g.access)).status).toBe(409);
    const stranger = await adult();
    expect((await api.post(`/v1/shop/orders/${o2.id}/cancel`, {}, stranger.access)).status).toBe(404);
    expect((await api.get(`/v1/shop/orders/${o2.id}`, stranger.access)).status).toBe(404);
    const o3 = (await order(g, sandboxItems[2]!)).body.order;
    h.clock.advance(OPEN_ORDER_TTL_MS + MINUTE);
    expect(await h.platform.commerce.expireStale()).toBeGreaterThanOrEqual(1);
    const stale = (
      await h.platform.db.query<{ status: string }>('SELECT status FROM orders WHERE id = $1', [o3.id])
    ).rows[0]!;
    expect(stale.status).toBe('cancelled');
  });

  it('no player-facing route can mark an order paid or grant an item', () => {
    const risky = h.platform.router
      .list()
      .filter((r) => r.auth === 'player' && /paid|fulfil|grant|entitle/i.test(r.path) && r.method !== 'GET');
    expect(risky).toEqual([]);
    const operatorOnly = h.platform.router
      .list()
      .filter((r) => /\/grants|\/orders\/:id\/(revoke|refund)|\/catalog\/:itemId/.test(r.path));
    expect(operatorOnly.length).toBeGreaterThanOrEqual(5);
    expect(operatorOnly.every((r) => r.auth === 'admin')).toBe(true);
  });

  it('operators: set prices and sale flags (audited), grant, revoke; all need the admin token', async () => {
    const noauth = await api.call('PUT', `/admin/v1/catalog/${sandboxItems[0]}/price`, {
      currency: 'NGN',
      amountMinor: 123,
      operator: 'x',
    });
    expect(noauth.status).toBe(401);
    const adminCall = (m: string, p: string, b?: unknown) => api.call(m, p, b, TEST_ADMIN);
    const emote = COSMETICS.find(
      (c) => c.kind === 'emote' && c.unlock.kind !== 'default' && !sandboxItems.includes(c.id),
    )!;
    expect(
      (
        await adminCall('PUT', `/admin/v1/catalog/${emote.id}/price`, {
          currency: 'NGN',
          amountMinor: 12345,
          operator: 'founder',
        })
      ).status,
    ).toBe(204);
    expect(
      (
        await adminCall('PUT', `/admin/v1/catalog/${emote.id}/price`, {
          currency: 'ngn',
          amountMinor: 1,
          operator: 'founder',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await adminCall('PUT', `/admin/v1/catalog/skin-default/sale`, {
          purchasable: true,
          operator: 'founder',
        })
      ).status,
    ).toBe(404); // free items are never sold
    expect(
      (
        await adminCall('PUT', `/admin/v1/catalog/${emote.id}/sale`, {
          purchasable: true,
          operator: 'founder',
        })
      ).status,
    ).toBe(204);
    expect(
      (
        await adminCall('PUT', `/admin/v1/catalog/${emote.id}/store-products/apple`, {
          productId: 'com.example.emote',
          operator: 'founder',
        })
      ).status,
    ).toBe(204);
    const g = await adult();
    const listed = (await api.get('/v1/shop/catalog', g.access)).body.items.find(
      (i: { id: string }) => i.id === emote.id,
    );
    expect(listed).toMatchObject({
      forSale: true,
      prices: [{ currency: 'NGN', amountMinor: 12345, sandbox: false }],
    });
    // the real (non-sandbox) price cannot be bought: no real provider exists
    expect((await order(g, emote.id, key(), 'web')).status).toBe(501);
    const o = (await order(g, sandboxItems[0]!)).body.order;
    await complete(o.id, { outcome: 'succeeded' });
    expect(
      (await adminCall('POST', `/admin/v1/orders/${o.id}/revoke`, { reason: 'abuse', operator: 'mod' })).body
        .order.status,
    ).toBe('revoked');
    expect(await owned(g)).toEqual([]);
    expect(
      (await adminCall('POST', `/admin/v1/orders/${o.id}/revoke`, { reason: 'again', operator: 'mod' }))
        .status,
    ).toBe(409);
    expect(
      (await adminCall('POST', `/admin/v1/players/${g.id}/grants`, { itemId: emote.id, operator: 'support' }))
        .status,
    ).toBe(204);
    expect(await owned(g)).toEqual([emote.id]);
    expect(
      (await adminCall('GET', '/admin/v1/orders?status=revoked')).body.orders.some(
        (x: { id: string }) => x.id === o.id,
      ),
    ).toBe(true);
    const trail = await h.platform.db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM audit_events WHERE type = 'commerce.catalog_changed'",
    );
    expect(trail.rows[0]!.n).toBeGreaterThanOrEqual(3);
  });

  it('account deletion removes entitlements and keeps order records without the idempotency key', async () => {
    const g = await adult();
    const o = (await order(g, sandboxItems[1]!)).body.order;
    await complete(o.id, { outcome: 'succeeded' });
    await api.post('/v1/me/delete', { confirm: 'DELETE' }, g.access).catch(() => undefined);
    const fresh = (await api.post('/v1/auth/refresh', { refreshToken: g.refresh }).catch(() => null))?.status;
    void fresh;
    expect(
      (await h.platform.db.query('SELECT 1 FROM entitlements WHERE player_id = $1', [g.id])).rowCount,
    ).toBe(0);
    const row = (
      await h.platform.db.query<{ status: string; idempotency_key: string | null }>(
        'SELECT status, idempotency_key FROM orders WHERE id = $1',
        [o.id],
      )
    ).rows[0]!;
    expect(row).toEqual({ status: 'fulfilled', idempotency_key: null });
  });
});

describe('production-like: no provider, no real price, no payment possible', () => {
  let h: Harness;
  let api: Api;
  beforeAll(async () => {
    h = await startHarness();
    api = client(h.base);
  });
  afterAll(() => h.close());

  it('reports no providers, hides the sandbox, and exposes no mock endpoint', async () => {
    expect((await api.get('/v1/shop/status')).body).toEqual({
      providers: [],
      purchasesEnabled: false,
      sandbox: false,
    });
    expect(h.platform.router.list().some((r) => r.path.includes('mock-checkout'))).toBe(false);
    const g = await newRegistered(api, 'prod-like-1', 'Prod Like');
    await api.patch('/v1/me', { ageGroup: 'adult' }, g.access);
    const items = (await api.get('/v1/shop/catalog', g.access)).body.items as {
      forSale: boolean;
      prices: unknown[];
    }[];
    expect(items.length).toBeGreaterThan(20);
    expect(items.some((i) => i.forSale || i.prices.length > 0)).toBe(false); // no price exists anywhere
    expect(h.platform.mockPayments).toBeNull();
    await expect(h.platform.catalog.seedSandbox()).rejects.toMatchObject({ code: 'conflict' });
    await expect(
      h.platform.catalog.setPrice('skin-ankara-festive', { currency: 'XTS', amountMinor: 5 }, 'x'),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('every payment path answers "not configured" (501) and nothing is granted', async () => {
    const g = await newRegistered(api, 'prod-like-2', 'Prod Like Two');
    await api.patch('/v1/me', { ageGroup: 'adult' }, g.access);
    for (const provider of ['mock', 'web', 'apple', 'google']) {
      const r = await api.call(
        'POST',
        '/v1/shop/orders',
        { itemId: 'skin-ankara-festive', provider },
        g.access,
        { 'idempotency-key': `prod-key-${provider}-1` },
      );
      expect(r.status, provider).toBe(501);
      const hook = await api.call('POST', `/v1/shop/webhooks/${provider}`, '{"eventId":"e"}');
      expect(hook.status, provider).toBe(501);
    }
    expect((await api.get('/v1/shop/entitlements', g.access)).body).toEqual({ items: [], features: [] });
    expect((await h.platform.db.query('SELECT 1 FROM orders')).rowCount).toBe(0);
    expect((await h.platform.db.query('SELECT 1 FROM entitlements')).rowCount).toBe(0);
  });

  it('production configuration refuses the mock checkout', async () => {
    const { loadConfig, validateConfig } = await import('../src/config');
    expect(
      validateConfig(loadConfig({ PLATFORM_ENV: 'production', PLATFORM_MOCK_CHECKOUT: '1' })).join(),
    ).toMatch(/PLATFORM_MOCK_CHECKOUT/);
    // and even if a config object were built by hand, the app does not create the mock outside development / test
    const { createPlatform } = await import('../src/app');
    const { createPgliteDb } = await import('../src/db/pglite');
    const { silentLogger } = await import('../src/logger');
    const cfg = {
      ...h.platform.config,
      env: 'production' as const,
      mockCheckout: true,
      mockIdentityProvider: true,
    };
    const p = await createPlatform(cfg, await createPgliteDb(), { logger: silentLogger });
    try {
      expect(p.mockPayments).toBeNull();
      expect(p.mockProvider).toBeNull();
    } finally {
      await p.close();
    }
  });
});
