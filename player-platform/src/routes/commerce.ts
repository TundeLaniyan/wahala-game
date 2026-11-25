import { randomUUID } from 'node:crypto';
import { badRequest } from '../errors';
import type { RouteDef } from '../http/router';
import type { CatalogService } from '../commerce/catalog';
import type { MockCheckoutProvider, PaymentProviders } from '../commerce/providers';
import type { CommerceService } from '../commerce/service';
import { ITEM_CATEGORIES, PROVIDER_IDS } from '../commerce/types';
import type { ItemCategory, OrderStatus } from '../commerce/types';
import { bool, int, obj, oneOf, optInt, optStr, paramUuid, str } from '../util/validate';

const IDEMPOTENCY_RE = /^[A-Za-z0-9_-]{8,80}$/;
const ITEM_ID_RE = /^[a-z0-9][a-z0-9._-]{2,63}$/;
const ORDER_STATUSES: readonly OrderStatus[] = [
  'created',
  'pending',
  'paid',
  'fulfilled',
  'failed',
  'cancelled',
  'refunded',
  'revoked',
];

const itemParam = (v: string | undefined): string => {
  if (!v || !ITEM_ID_RE.test(v)) throw badRequest('unknown item id');
  return v;
};

export function commerceRoutes(opts: {
  catalog: CatalogService;
  commerce: CommerceService;
  providers: PaymentProviders;
  mock: MockCheckoutProvider | null;
  sandbox: boolean;
}): RouteDef[] {
  const { catalog, commerce, providers, mock, sandbox } = opts;
  const routes: RouteDef[] = [
    {
      method: 'GET',
      path: '/v1/shop/status',
      auth: 'none',
      rate: 'read',
      summary: 'Which payment providers are live (none in production today) and whether the sandbox is on',
      async handler() {
        const available = providers.available();
        return { body: { providers: available, purchasesEnabled: available.length > 0, sandbox } };
      },
    },
    {
      method: 'GET',
      path: '/v1/shop/catalog',
      auth: 'player',
      rate: 'read',
      summary: 'The catalogue with your ownership; prices only where an operator has set them',
      async handler(ctx) {
        const c = ctx.query.get('category');
        const category = c === null ? undefined : (oneOf({ c }, 'c', ITEM_CATEGORIES) as ItemCategory);
        return { body: { items: await catalog.list(ctx.principal.playerId, category) } };
      },
    },
    {
      method: 'GET',
      path: '/v1/shop/entitlements',
      auth: 'player',
      rate: 'read',
      summary: 'What you own beyond the defaults, plus the narration feature keys',
      async handler(ctx) {
        return { body: await commerce.entitlements(ctx.principal.playerId) };
      },
    },
    {
      method: 'POST',
      path: '/v1/shop/orders',
      auth: 'player',
      rate: 'write',
      summary:
        'Start a purchase (header Idempotency-Key required). The PRICE is the server’s; adults on registered accounts only',
      async handler(ctx) {
        const key = ctx.header('idempotency-key');
        if (!key || !IDEMPOTENCY_RE.test(key))
          throw badRequest('Idempotency-Key header (8-80 letters, digits, - _) is required');
        const b = obj(ctx.json(), ['itemId', 'provider']);
        const itemId = str(b, 'itemId', 3, 64);
        const r = await commerce.createOrder(ctx.principal, {
          itemId,
          provider: oneOf(b, 'provider', PROVIDER_IDS),
          idempotencyKey: key,
        });
        return { status: r.reused ? 200 : 201, body: { order: r.order, checkout: r.checkout } };
      },
    },
    {
      method: 'GET',
      path: '/v1/shop/orders',
      auth: 'player',
      rate: 'read',
      summary: 'Your orders',
      async handler(ctx) {
        return { body: { orders: await commerce.orders(ctx.principal.playerId) } };
      },
    },
    {
      method: 'GET',
      path: '/v1/shop/orders/:id',
      auth: 'player',
      rate: 'read',
      summary: 'One of your orders',
      async handler(ctx) {
        return {
          body: { order: await commerce.order(ctx.principal.playerId, paramUuid(ctx.params.id, 'order id')) },
        };
      },
    },
    {
      method: 'POST',
      path: '/v1/shop/orders/:id/cancel',
      auth: 'player',
      rate: 'write',
      summary: 'Abandon an order that has not been paid',
      async handler(ctx) {
        return {
          body: {
            order: await commerce.cancel(ctx.principal.playerId, paramUuid(ctx.params.id, 'order id')),
          },
        };
      },
    },
    {
      method: 'POST',
      path: '/v1/shop/orders/:id/receipt',
      auth: 'player',
      rate: 'write',
      maxBytes: 64 * 1024,
      summary: 'Store purchases: report the receipt; the server verifies it with the store (never believed)',
      async handler(ctx) {
        const b = obj(ctx.json(), ['receipt']);
        return {
          body: {
            results: await commerce.verifyReceipt(
              ctx.principal.playerId,
              paramUuid(ctx.params.id, 'order id'),
              str(b, 'receipt', 8, 60_000),
            ),
          },
        };
      },
    },
    {
      method: 'POST',
      path: '/v1/shop/webhooks/:provider',
      auth: 'none',
      rate: null,
      maxBytes: 64 * 1024,
      summary:
        'A payment provider’s server-to-server notification (authenticated by the provider’s signature, not by a player)',
      async handler(ctx) {
        const provider = oneOf({ p: ctx.params.provider }, 'p', PROVIDER_IDS);
        const headers: Record<string, string | undefined> = {};
        for (const [k, v] of Object.entries(ctx.req.headers))
          headers[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
        return { body: { results: await commerce.ingestWebhook(provider, ctx.raw, headers) } };
      },
    },
    // ---------------------------------------------------------------- operators
    {
      method: 'GET',
      path: '/admin/v1/orders',
      auth: 'admin',
      rate: null,
      summary: 'Operator: orders by status',
      async handler(ctx) {
        const s = ctx.query.get('status');
        const status = s === null ? null : oneOf({ s }, 's', ORDER_STATUSES);
        return {
          body: { orders: await commerce.adminOrders(status, Number(ctx.query.get('limit') ?? 50) || 50) },
        };
      },
    },
    {
      method: 'POST',
      path: '/admin/v1/orders/:id/revoke',
      auth: 'admin',
      rate: null,
      summary: 'Operator: revoke a purchased entitlement without a refund (fraud, abuse)',
      async handler(ctx) {
        const b = obj(ctx.json(), ['reason', 'operator']);
        return {
          body: {
            order: await commerce.adminRevoke(
              paramUuid(ctx.params.id, 'order id'),
              str(b, 'reason', 1, 80),
              str(b, 'operator', 1, 40),
            ),
          },
        };
      },
    },
    {
      method: 'POST',
      path: '/admin/v1/players/:id/grants',
      auth: 'admin',
      rate: null,
      summary: 'Operator: grant an item without a sale (promotion, compensation)',
      async handler(ctx) {
        const b = obj(ctx.json(), ['itemId', 'operator']);
        await commerce.adminGrant(
          paramUuid(ctx.params.id, 'player id'),
          str(b, 'itemId', 3, 64),
          str(b, 'operator', 1, 40),
        );
        return { status: 204 };
      },
    },
    {
      method: 'PUT',
      path: '/admin/v1/catalog/:itemId/price',
      auth: 'admin',
      rate: null,
      summary:
        'Operator: set the active price of an item (the founder supplies every real price; none exists today)',
      async handler(ctx) {
        const b = obj(ctx.json(), ['currency', 'amountMinor', 'operator']);
        await catalog.setPrice(
          itemParam(ctx.params.itemId),
          { currency: str(b, 'currency', 3, 3), amountMinor: int(b, 'amountMinor', 1, 100_000_000) },
          str(b, 'operator', 1, 40),
        );
        return { status: 204 };
      },
    },
    {
      method: 'PUT',
      path: '/admin/v1/catalog/:itemId/sale',
      auth: 'admin',
      rate: null,
      summary:
        'Operator: mark an item sellable (or not). Earned and default items need a deliberate decision',
      async handler(ctx) {
        const b = obj(ctx.json(), ['purchasable', 'operator']);
        await catalog.setPurchasable(
          itemParam(ctx.params.itemId),
          bool(b, 'purchasable'),
          str(b, 'operator', 1, 40),
        );
        return { status: 204 };
      },
    },
    {
      method: 'PUT',
      path: '/admin/v1/catalog/:itemId/store-products/:provider',
      auth: 'admin',
      rate: null,
      summary: 'Operator: the product id this item has in a store (Apple, Google, web)',
      async handler(ctx) {
        const b = obj(ctx.json(), ['productId', 'operator']);
        const provider = oneOf({ p: ctx.params.provider }, 'p', ['apple', 'google', 'web'] as const);
        await catalog.setStoreProduct(
          itemParam(ctx.params.itemId),
          provider,
          str(b, 'productId', 3, 120),
          str(b, 'operator', 1, 40),
        );
        return { status: 204 };
      },
    },
  ];
  if (mock) {
    routes.push({
      method: 'POST',
      path: '/v1/dev/mock-checkout/:orderId/complete',
      auth: 'none',
      rate: 'auth',
      summary:
        'DEVELOPMENT ONLY: play the payment provider’s server. Builds a SIGNED test event for an order and delivers it through the real webhook path (no money moves; absent unless PLATFORM_MOCK_CHECKOUT=1)',
      async handler(ctx) {
        const b = obj(ctx.json(), ['outcome', 'amountMinor', 'currency', 'eventId']);
        const orderId = paramUuid(ctx.params.orderId, 'order id');
        const outcome = oneOf(b, 'outcome', [
          'succeeded',
          'failed',
          'cancelled',
          'refunded',
          'chargeback',
        ] as const);
        const basis = await commerce.eventBasis(orderId);
        if (basis.provider !== 'mock') throw badRequest('not a mock order');
        const type = (
          {
            succeeded: 'payment.succeeded',
            failed: 'payment.failed',
            cancelled: 'payment.cancelled',
            refunded: 'refund.succeeded',
            chargeback: 'chargeback',
          } as const
        )[outcome];
        const signed = mock.signEvent({
          eventId: optStr(b, 'eventId', 3, 100) ?? `evt_${randomUUID()}`,
          type,
          orderId,
          providerRef: basis.providerRef ?? `mock_tx_${orderId.slice(0, 8)}`,
          amountMinor: optInt(b, 'amountMinor', 1, 100_000_000) ?? basis.amountMinor,
          currency: optStr(b, 'currency', 3, 3) ?? basis.currency,
        });
        return { body: { results: await commerce.ingestWebhook('mock', signed.body, signed.headers) } };
      },
    });
  }

  return routes;
}
