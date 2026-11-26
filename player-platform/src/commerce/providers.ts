/**
 * Payment providers, provider-independent. A provider does exactly three things and NEVER touches card data:
 *   1. `createCheckout`  - tells the client how to pay (a hosted-page URL, a store product id)
 *   2. `parseWebhook`    - turns the provider's server-to-server notification into normalised events AFTER verifying its signature
 *   3. `verifyReceipt`   - (stores) verifies a purchase the client reports, with the store's own server API
 * The platform grants nothing on a client's word: ownership follows only an event that came out of (2) or (3).
 *
 * Shipped here: `MockCheckoutProvider` (development only, signed test events through the SAME verification path) and three adapter
 * skeletons that are `configured: false` and say what each real integration must do. No provider account exists, nothing is live.
 */
import { createHmac } from 'node:crypto';
import { ApiError } from '../errors';
import { safeEqual } from '../util/secrets';
import type { Clock } from '../util/clock';
import type { ProviderId } from './types';

export type ProviderEventType =
  'payment.succeeded' | 'payment.failed' | 'payment.cancelled' | 'refund.succeeded' | 'chargeback';

export interface ProviderEvent {
  /** The provider's unique id for this notification: the idempotency key of ingestion. */
  eventId: string;
  type: ProviderEventType;
  /** Our order id, which we passed to the provider as the client reference. */
  orderId: string;
  /** The provider's own transaction id. */
  providerRef: string;
  /** What was actually charged. `null` when the store sets the price (Apple / Google): the amount check is then skipped. */
  amountMinor: number | null;
  currency: string | null;
}

export interface CheckoutStart {
  kind: 'mock' | 'redirect' | 'store_product';
  /** Hosted checkout URL (web), or the store product id the client buys with the store SDK. */
  url?: string;
  productId?: string;
  reference: string;
}

export interface PaymentProvider {
  readonly id: ProviderId;
  /** False = every call throws `provider_not_configured`. Only configured providers appear in the shop. */
  readonly configured: boolean;
  createCheckout(order: {
    orderId: string;
    itemId: string;
    amountMinor: number | null;
    currency: string | null;
    productId: string | null;
  }): Promise<CheckoutStart>;
  parseWebhook(rawBody: string, headers: Record<string, string | undefined>): ProviderEvent[];
  verifyReceipt(orderId: string, receipt: string): Promise<ProviderEvent[]>;
}

const notConfigured = (id: ProviderId): ApiError =>
  new ApiError('provider_not_configured', `${id} payments are not configured on this server`);

// ---------------------------------------------------------------- development mock

export interface MockCheckoutProvider extends PaymentProvider {
  /** What the (fake) provider's server would send: a signed webhook body + headers. Used by the dev-only completion endpoint and tests. */
  signEvent(e: ProviderEvent): { body: string; headers: Record<string, string> };
}

/**
 * A stand-in for a provider's server. It signs events with an HMAC key that exists only in this process, and `parseWebhook`
 * verifies that signature (and a timestamp window) exactly as a real adapter must verify its provider's. It moves no money.
 */
export function createMockProvider(clock: Clock, secret: string): MockCheckoutProvider {
  const sign = (ts: string, body: string): string =>
    createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
  return {
    id: 'mock',
    configured: true,
    async createCheckout(o) {
      return { kind: 'mock', reference: `mock-${o.orderId}` };
    },
    parseWebhook(rawBody, headers) {
      const ts = headers['x-mock-timestamp'];
      const sig = headers['x-mock-signature'];
      if (!ts || !sig || !safeEqual(sign(ts, rawBody), sig))
        throw new ApiError('provider_rejected', 'bad signature');
      if (Math.abs(clock().getTime() - Number(ts)) > 5 * 60_000)
        throw new ApiError('provider_rejected', 'stale event');
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        throw new ApiError('bad_request', 'malformed event');
      }
      const list = Array.isArray(parsed) ? parsed : [parsed];
      return list.map((x) => {
        const e = x as Partial<ProviderEvent>;
        if (
          typeof e.eventId !== 'string' ||
          typeof e.orderId !== 'string' ||
          typeof e.providerRef !== 'string' ||
          typeof e.type !== 'string'
        )
          throw new ApiError('bad_request', 'malformed event');
        return {
          eventId: e.eventId,
          type: e.type as ProviderEventType,
          orderId: e.orderId,
          providerRef: e.providerRef,
          amountMinor: typeof e.amountMinor === 'number' ? e.amountMinor : null,
          currency: typeof e.currency === 'string' ? e.currency : null,
        };
      });
    },
    async verifyReceipt() {
      throw new ApiError('bad_request', 'the mock provider has no receipts');
    },
    signEvent(e) {
      const body = JSON.stringify(e);
      const ts = String(clock().getTime());
      return { body, headers: { 'x-mock-timestamp': ts, 'x-mock-signature': sign(ts, body) } };
    },
  };
}

// ---------------------------------------------------------------- real-provider skeletons (NOT live)

function skeleton(id: Exclude<ProviderId, 'mock'>): PaymentProvider {
  return {
    id,
    configured: false,
    async createCheckout() {
      throw notConfigured(id);
    },
    parseWebhook() {
      throw notConfigured(id);
    },
    async verifyReceipt() {
      throw notConfigured(id);
    },
  };
}

/**
 * Web checkout (a hosted payment page of a Nigerian / international processor). To make it real: create the processor account,
 * implement `createCheckout` (a hosted-checkout session carrying `orderId` as the reference and the server-side price, never the
 * client's), `parseWebhook` (verify the processor's signature header over the RAW body, read the amount and currency it reports), map
 * their event names onto `ProviderEventType`. Card data stays on the processor's page. docs/PLATFORM_PROVIDER_REQUIREMENTS.md.
 */
export const WebCheckoutProvider: PaymentProvider = skeleton('web');
/**
 * Apple In-App Purchase. Real version: the client buys with StoreKit 2 and sends the signed transaction (JWS); the server verifies it
 * against Apple's certificate chain / App Store Server API and listens to App Store Server Notifications V2 (refunds, revocations).
 * Apple sets the price (`amountMinor: null`). Consumable vs non-consumable and Family Sharing rules must be chosen per item.
 */
export const AppleIapProvider: PaymentProvider = skeleton('apple');
/**
 * Google Play Billing. Real version: the client buys with the Play Billing Library and sends the purchase token; the server verifies it
 * with the Google Play Developer API, ACKNOWLEDGES the purchase within 3 days (or Google refunds it), and consumes Real-time
 * Developer Notifications (Pub/Sub) for refunds / voids. Google sets the price.
 */
export const GooglePlayProvider: PaymentProvider = skeleton('google');

export class PaymentProviders {
  private readonly byId = new Map<ProviderId, PaymentProvider>();
  constructor(providers: PaymentProvider[]) {
    for (const p of providers) this.byId.set(p.id, p);
  }
  get(id: ProviderId): PaymentProvider {
    const p = this.byId.get(id);
    if (!p || !p.configured) throw notConfigured(id);
    return p;
  }
  /** Providers a client may be offered. */
  available(): ProviderId[] {
    return [...this.byId.values()].filter((p) => p.configured).map((p) => p.id);
  }
}
