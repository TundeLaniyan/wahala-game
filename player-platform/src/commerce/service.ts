/**
 * Orders, verified fulfilment, refunds and revocation, entitlements.
 *
 * THE RULE: ownership is created ONLY by `ingest` (a provider event whose signature the provider adapter verified) or `verifyReceipt`
 * (a store receipt the platform verified with the store). No player-facing call, no admin call, and no development shortcut sets an
 * order to `paid` or grants a purchased entitlement. Every step is idempotent (client key, provider event id, order state machine) and
 * transactional, so a retry, a replayed webhook or a double tap can neither double-charge nor double-grant.
 */
import { ApiError, badRequest, conflict, forbidden, notFound } from '../errors';
import { audit } from '../audit';
import type { Db, Queryable } from '../db/types';
import type { IdentityService } from '../identity/service';
import { capabilitiesFor } from '../identity/capabilities';
import type { AgeGroup, PlayerKind, Principal } from '../identity/types';
import { HOUR, addMs } from '../util/clock';
import type { Clock } from '../util/clock';
import type { CatalogService } from './catalog';
import type { PaymentProviders, ProviderEvent } from './providers';
import { grantsOwnership, isOpen, nextStatus } from './stateMachine';
import type { OrderEvent } from './stateMachine';
import { SANDBOX_CURRENCY, SLOT_OF } from './types';
import type { OrderStatus, ProviderId } from './types';

export const OPEN_ORDER_TTL_MS = 1 * HOUR;

export interface OrderView {
  id: string;
  itemId: string;
  provider: ProviderId;
  status: OrderStatus;
  price: { currency: string; amountMinor: number } | null;
  createdAt: string;
  updatedAt: string;
}

interface OrderRow {
  id: string;
  provider_ref: string | null;
  player_id: string;
  item_id: string;
  provider: ProviderId;
  currency: string | null;
  amount_minor: number | null;
  status: OrderStatus;
  created_at: Date;
  updated_at: Date;
}

const view = (o: OrderRow): OrderView => ({
  id: o.id,
  itemId: o.item_id,
  provider: o.provider,
  status: o.status,
  price: o.currency && o.amount_minor ? { currency: o.currency, amountMinor: o.amount_minor } : null,
  createdAt: o.created_at.toISOString(),
  updatedAt: o.updated_at.toISOString(),
});

export type IngestOutcome =
  | { eventId: string; outcome: 'applied'; orderId: string; status: OrderStatus }
  | { eventId: string; outcome: 'duplicate' }
  | { eventId: string; outcome: 'ignored'; reason: string; orderId?: string };

export class CommerceService {
  constructor(
    private readonly d: {
      db: Db;
      clock: Clock;
      identity: IdentityService;
      catalog: CatalogService;
      providers: PaymentProviders;
    },
  ) {
    d.identity.setLoadoutValidator((q, playerId, loadout) => this.validateLoadout(q, playerId, loadout));
  }

  // ---------------------------------------------------------------- ownership

  async owns(q: Queryable, playerId: string, itemId: string): Promise<boolean> {
    const r = await q.query(
      `SELECT 1 FROM catalog_items i WHERE i.id = $2 AND (i.default_owned OR EXISTS
         (SELECT 1 FROM entitlements e WHERE e.player_id = $1 AND e.item_id = i.id AND e.revoked_at IS NULL))`,
      [playerId, itemId],
    );
    return r.rowCount > 0;
  }

  /** What the player owns that is not owned by everybody, plus the feature keys (the existing narration `EntitlementPort`). */
  async entitlements(playerId: string): Promise<{ items: string[]; features: string[] }> {
    const r = await this.d.db.query<{ item_id: string; entitlement_key: string | null }>(
      `SELECT e.item_id, i.entitlement_key FROM entitlements e JOIN catalog_items i ON i.id = e.item_id
        WHERE e.player_id = $1 AND e.revoked_at IS NULL ORDER BY e.granted_at`,
      [playerId],
    );
    return {
      items: r.rows.map((x) => x.item_id),
      features: r.rows.flatMap((x) => (x.entitlement_key ? [x.entitlement_key] : [])),
    };
  }

  /** `profile.loadout`: every equipped id must exist, fit its slot, and be OWNED. Nothing else can be equipped. */
  private async validateLoadout(
    q: Queryable,
    playerId: string,
    loadout: Record<string, string>,
  ): Promise<void> {
    for (const [slot, itemId] of Object.entries(loadout)) {
      const item = await this.d.catalog.itemRow(q, itemId);
      if (!item || !item.active) throw badRequest(`unknown item in slot ${slot}`);
      if (item.category === 'narration' || SLOT_OF[item.category] !== slot)
        throw badRequest(`that item does not fit slot ${slot}`);
      if (!(await this.owns(q, playerId, itemId))) throw forbidden('You do not own that item.');
    }
  }

  private async unequip(q: Queryable, playerId: string, itemId: string, now: Date): Promise<void> {
    const r = await q.query<{ loadout: Record<string, string> }>(
      'SELECT loadout FROM profiles WHERE player_id = $1 FOR UPDATE',
      [playerId],
    );
    const cur = r.rows[0]?.loadout;
    if (!cur) return;
    const next = Object.fromEntries(Object.entries(cur).filter(([, v]) => v !== itemId));
    if (Object.keys(next).length !== Object.keys(cur).length)
      await q.query('UPDATE profiles SET loadout = $2::jsonb, updated_at = $3 WHERE player_id = $1', [
        playerId,
        JSON.stringify(next),
        now,
      ]);
  }

  // ---------------------------------------------------------------- creating an order

  private async canBuy(playerId: string): Promise<void> {
    const r = await this.d.db.query<{ kind: PlayerKind; age_group: AgeGroup }>(
      "SELECT kind, age_group FROM players WHERE id = $1 AND status = 'active'",
      [playerId],
    );
    const p = r.rows[0];
    if (!p || !capabilitiesFor(p.kind, p.age_group).purchases)
      throw new ApiError('restricted_account', 'Purchases are only for registered adult accounts.');
  }

  /**
   * Creates (or returns) the player's order for an item. The PRICE is read here, on the server, from the catalogue: a client can only
   * name the item and the provider. A repeated `idempotencyKey`, or a second tap while an order is open, returns the same order.
   */
  async createOrder(
    principal: Principal,
    input: { itemId: string; provider: ProviderId; idempotencyKey: string },
  ): Promise<{ order: OrderView; checkout: unknown; reused: boolean }> {
    await this.canBuy(principal.playerId);
    const provider = this.d.providers.get(input.provider);
    const now = this.d.clock();
    const created = await this.d.db.tx(async (q) => {
      const item = await this.d.catalog.itemRow(q, input.itemId);
      if (!item || !item.active) throw notFound('no such item');
      const prior = await q.query<OrderRow>(
        'SELECT * FROM orders WHERE player_id = $1 AND idempotency_key = $2',
        [principal.playerId, input.idempotencyKey],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].item_id !== input.itemId || prior.rows[0].provider !== input.provider)
          throw conflict('That Idempotency-Key was used for a different order.');
        return { row: prior.rows[0], reused: true, productId: null as string | null };
      }
      if (!item.purchasable || item.default_owned) throw conflict('That item is not for sale.');
      if (await this.owns(q, principal.playerId, item.id)) throw conflict('You already own that item.');
      const open = await q.query<OrderRow>(
        "SELECT * FROM orders WHERE player_id = $1 AND item_id = $2 AND status IN ('created','pending')",
        [principal.playerId, item.id],
      );
      if (open.rows[0]) {
        if (open.rows[0].provider !== input.provider)
          throw conflict('You already have an open order for that item.');
        return { row: open.rows[0], reused: true, productId: null };
      }
      let currency: string | null = null;
      let amount: number | null = null;
      let productId: string | null = null;
      if (input.provider === 'apple' || input.provider === 'google') {
        const sp = await q.query<{ provider_product_id: string }>(
          'SELECT provider_product_id FROM store_products WHERE item_id = $1 AND provider = $2',
          [item.id, input.provider],
        );
        if (!sp.rows[0]) throw conflict('That item is not sold in this store.');
        productId = sp.rows[0].provider_product_id;
      } else {
        const price = await q.query<{ currency: string; amount_minor: number }>(
          `SELECT currency, amount_minor FROM catalog_prices WHERE item_id = $1 AND active AND sandbox = $2 ORDER BY created_at DESC LIMIT 1`,
          [item.id, input.provider === 'mock'],
        );
        if (!price.rows[0]) throw conflict('That item has no price yet.');
        currency = price.rows[0].currency;
        amount = price.rows[0].amount_minor;
        if (input.provider === 'mock' && currency !== SANDBOX_CURRENCY)
          throw conflict('the mock checkout only sells sandbox prices');
        if (input.provider === 'web') {
          const w = await q.query<{ provider_product_id: string }>(
            "SELECT provider_product_id FROM store_products WHERE item_id = $1 AND provider = 'web'",
            [item.id],
          );
          productId = w.rows[0]?.provider_product_id ?? null;
        }
      }
      const ins = await q.query<OrderRow>(
        `INSERT INTO orders (player_id, item_id, provider, currency, amount_minor, status, idempotency_key, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,'created',$6,$7,$7) RETURNING *`,
        [principal.playerId, item.id, input.provider, currency, amount, input.idempotencyKey, now],
      );
      await audit(q, now, {
        type: 'commerce.order_created',
        actor: principal.playerId,
        subject: principal.playerId,
        detail: { orderId: ins.rows[0]!.id, itemId: item.id, provider: input.provider },
      });
      return { row: ins.rows[0]!, reused: false, productId };
    });
    // the provider is called OUTSIDE the transaction (it can be a network call); its failure ends the order cleanly
    let checkout: unknown = null;
    let row = created.row;
    if (row.status === 'created') {
      try {
        checkout = await provider.createCheckout({
          orderId: row.id,
          itemId: row.item_id,
          amountMinor: row.amount_minor,
          currency: row.currency,
          productId: created.productId,
        });
      } catch (e) {
        await this.transition(row.id, 'payment_failed', 'checkout_failed');
        throw e;
      }
      row = (await this.transition(row.id, 'checkout_started'))!;
    }
    return { order: view(row), checkout, reused: created.reused };
  }

  private async transition(orderId: string, event: OrderEvent, reason?: string): Promise<OrderRow | null> {
    return this.d.db.tx(async (q) => {
      const cur = (await q.query<OrderRow>('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]))
        .rows[0];
      if (!cur) return null;
      const next = nextStatus(cur.status, event);
      if (!next) return cur;
      const now = this.d.clock();
      const up = await q.query<OrderRow>(
        `UPDATE orders SET status = $2, status_reason = COALESCE($3, status_reason), updated_at = $4,
                ended_at = CASE WHEN $2 IN ('failed','cancelled','refunded','revoked') THEN $4 ELSE ended_at END WHERE id = $1 RETURNING *`,
        [orderId, next, reason ?? null, now],
      );
      return up.rows[0]!;
    });
  }

  async orders(playerId: string): Promise<OrderView[]> {
    const r = await this.d.db.query<OrderRow>(
      'SELECT * FROM orders WHERE player_id = $1 ORDER BY created_at DESC LIMIT 50',
      [playerId],
    );
    return r.rows.map(view);
  }

  async order(playerId: string, orderId: string): Promise<OrderView> {
    const r = await this.d.db.query<OrderRow>('SELECT * FROM orders WHERE id = $1 AND player_id = $2', [
      orderId,
      playerId,
    ]);
    if (!r.rows[0]) throw notFound('no such order');
    return view(r.rows[0]);
  }

  /** A player may abandon an order that has not been paid. */
  async cancel(playerId: string, orderId: string): Promise<OrderView> {
    const own = await this.d.db.query('SELECT 1 FROM orders WHERE id = $1 AND player_id = $2', [
      orderId,
      playerId,
    ]);
    if (own.rowCount === 0) throw notFound('no such order');
    const cur = await this.d.db.query<{ status: OrderStatus }>('SELECT status FROM orders WHERE id = $1', [
      orderId,
    ]);
    if (!cur.rows[0] || !isOpen(cur.rows[0].status)) throw conflict('That order can no longer be cancelled.');
    const row = await this.transition(orderId, 'cancelled', 'cancelled_by_player');
    if (!row || row.status !== 'cancelled') throw conflict('That order can no longer be cancelled.');
    return view(row);
  }

  /** Open orders nobody finished within an hour are cancelled (the provider's own session has expired by then). */
  async expireStale(): Promise<number> {
    const now = this.d.clock();
    const r = await this.d.db.query(
      "UPDATE orders SET status = 'cancelled', status_reason = 'expired', updated_at = $1, ended_at = $1 WHERE status IN ('created','pending') AND created_at < $2",
      [now, addMs(now, -OPEN_ORDER_TTL_MS)],
    );
    return r.rowCount;
  }

  // ---------------------------------------------------------------- verified events: the ONLY way to ownership

  /** A provider webhook. The adapter verifies the signature (throws `provider_rejected`); each event is then applied once. */
  async ingestWebhook(
    providerId: ProviderId,
    rawBody: string,
    headers: Record<string, string | undefined>,
  ): Promise<IngestOutcome[]> {
    const events = this.d.providers.get(providerId).parseWebhook(rawBody, headers);
    const out: IngestOutcome[] = [];
    for (const e of events) out.push(await this.applyEvent(providerId, e));
    return out;
  }

  /** A store receipt the client reports: verified with the store, never believed. */
  async verifyReceipt(playerId: string, orderId: string, receipt: string): Promise<IngestOutcome[]> {
    const o = await this.d.db.query<{ provider: ProviderId }>(
      'SELECT provider FROM orders WHERE id = $1 AND player_id = $2',
      [orderId, playerId],
    );
    if (!o.rows[0]) throw notFound('no such order');
    const events = await this.d.providers.get(o.rows[0].provider).verifyReceipt(orderId, receipt);
    const out: IngestOutcome[] = [];
    for (const e of events) out.push(await this.applyEvent(o.rows[0].provider, e));
    return out;
  }

  private async applyEvent(provider: ProviderId, e: ProviderEvent): Promise<IngestOutcome> {
    const now = this.d.clock();
    return this.d.db.tx(async (q) => {
      const dup = await q.query(
        'INSERT INTO order_events (provider, event_id, type, outcome, received_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
        [provider, e.eventId, e.type, 'received', now],
      );
      if (dup.rowCount === 0) return { eventId: e.eventId, outcome: 'duplicate' as const };
      const settle = async (outcome: string, orderId?: string): Promise<void> => {
        await q.query(
          'UPDATE order_events SET outcome = $3, order_id = $4 WHERE provider = $1 AND event_id = $2',
          [provider, e.eventId, outcome.slice(0, 60), orderId ?? null],
        );
      };
      const ignore = async (reason: string, orderId?: string): Promise<IngestOutcome> => {
        await settle(`ignored:${reason}`, orderId);
        return { eventId: e.eventId, outcome: 'ignored' as const, reason, ...(orderId ? { orderId } : {}) };
      };
      const ordRow = (
        await q.query<OrderRow>('SELECT * FROM orders WHERE id::text = $1 AND provider = $2 FOR UPDATE', [
          e.orderId,
          provider,
        ])
      ).rows[0];
      if (!ordRow) return ignore('unknown_order');
      // a provider transaction id belongs to ONE order: a reused id is a provider bug or an attack, never a sale
      if (!ordRow.provider_ref) {
        const used = await q.query(
          'SELECT 1 FROM orders WHERE provider = $1 AND provider_ref = $2 AND id <> $3',
          [provider, e.providerRef, ordRow.id],
        );
        if (used.rowCount > 0) return ignore('provider_ref_reuse', ordRow.id);
      }
      let status = ordRow.status;
      const step = (event: OrderEvent): boolean => {
        const n = nextStatus(status, event);
        if (!n) return false;
        status = n;
        return true;
      };
      const setStatus = async (reason?: string): Promise<void> => {
        await q.query(
          `UPDATE orders SET status = $2, status_reason = COALESCE($3, status_reason), provider_ref = COALESCE(provider_ref, $4), updated_at = $5,
                  paid_at = CASE WHEN $2 IN ('paid','fulfilled') THEN COALESCE(paid_at, $5) ELSE paid_at END,
                  fulfilled_at = CASE WHEN $2 = 'fulfilled' THEN $5 ELSE fulfilled_at END,
                  ended_at = CASE WHEN $2 IN ('failed','cancelled','refunded','revoked') THEN $5 ELSE ended_at END WHERE id = $1`,
          [ordRow.id, status, reason ?? null, e.providerRef, now],
        );
      };

      switch (e.type) {
        case 'payment.succeeded': {
          if (!isOpen(ordRow.status)) return ignore('not_open', ordRow.id);
          // the provider must report EXACTLY what we asked for; anything else is not a sale
          if (
            ordRow.amount_minor !== null &&
            (e.amountMinor !== ordRow.amount_minor || e.currency !== ordRow.currency)
          ) {
            step('payment_failed');
            await setStatus('amount_mismatch');
            await settle('failed:amount_mismatch', ordRow.id);
            return { eventId: e.eventId, outcome: 'applied' as const, orderId: ordRow.id, status };
          }
          step('payment_verified');
          const player = await q.query<{ status: string }>('SELECT status FROM players WHERE id = $1', [
            ordRow.player_id,
          ]);
          if (player.rows[0]?.status === 'deleted') {
            await setStatus('account_deleted'); // paid, never fulfilled: needs a refund by support (documented)
            await settle('paid:account_deleted', ordRow.id);
            return { eventId: e.eventId, outcome: 'applied' as const, orderId: ordRow.id, status };
          }
          step('fulfilled');
          await q.query(
            `INSERT INTO entitlements (player_id, item_id, source, order_id, granted_at) VALUES ($1,$2,'purchase',$3,$4)
             ON CONFLICT (player_id, item_id) DO UPDATE SET source = 'purchase', order_id = EXCLUDED.order_id, granted_at = EXCLUDED.granted_at, revoked_at = NULL, revoke_reason = NULL`,
            [ordRow.player_id, ordRow.item_id, ordRow.id, now],
          );
          await setStatus();
          await audit(q, now, {
            type: 'commerce.fulfilled',
            actor: null,
            subject: ordRow.player_id,
            detail: { orderId: ordRow.id, itemId: ordRow.item_id, provider },
          });
          await settle('applied', ordRow.id);
          return { eventId: e.eventId, outcome: 'applied' as const, orderId: ordRow.id, status };
        }
        case 'payment.failed':
        case 'payment.cancelled': {
          if (!step(e.type === 'payment.failed' ? 'payment_failed' : 'cancelled'))
            return ignore('not_open', ordRow.id);
          await setStatus(e.type === 'payment.failed' ? 'provider_failed' : 'provider_cancelled');
          await settle('applied', ordRow.id);
          return { eventId: e.eventId, outcome: 'applied' as const, orderId: ordRow.id, status };
        }
        case 'refund.succeeded':
        case 'chargeback': {
          const refund = e.type === 'refund.succeeded';
          if (!step(refund ? 'refunded' : 'revoked')) return ignore('nothing_to_refund', ordRow.id);
          await setStatus(refund ? 'refunded' : 'chargeback');
          await this.revokeOwnership(q, ordRow, refund ? 'refund' : 'chargeback', now);
          await audit(q, now, {
            type: refund ? 'commerce.refunded' : 'commerce.revoked',
            subject: ordRow.player_id,
            detail: { orderId: ordRow.id, itemId: ordRow.item_id },
          });
          await settle('applied', ordRow.id);
          return { eventId: e.eventId, outcome: 'applied' as const, orderId: ordRow.id, status };
        }
      }
    });
  }

  private async revokeOwnership(q: Queryable, o: OrderRow, reason: string, now: Date): Promise<void> {
    await q.query(
      'UPDATE entitlements SET revoked_at = $3, revoke_reason = $4 WHERE player_id = $1 AND item_id = $2 AND order_id = $5 AND revoked_at IS NULL',
      [o.player_id, o.item_id, now, reason, o.id],
    );
    await this.unequip(q, o.player_id, o.item_id, now);
  }

  // ---------------------------------------------------------------- operators

  /** Support revokes an entitlement without a refund (fraud, abuse). The order becomes `revoked`. */
  async adminRevoke(orderId: string, reason: string, actor: string): Promise<OrderView> {
    const now = this.d.clock();
    return this.d.db.tx(async (q) => {
      const o = (await q.query<OrderRow>('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId])).rows[0];
      if (!o) throw notFound('no such order');
      const next = nextStatus(o.status, 'revoked');
      if (!next || !grantsOwnership(o.status)) throw conflict('Only a paid order can be revoked.');
      const up = await q.query<OrderRow>(
        "UPDATE orders SET status = 'revoked', status_reason = $2, updated_at = $3, ended_at = $3 WHERE id = $1 RETURNING *",
        [orderId, reason.slice(0, 80), now],
      );
      await this.revokeOwnership(q, o, reason.slice(0, 80), now);
      await audit(q, now, {
        type: 'commerce.revoked',
        subject: o.player_id,
        detail: { orderId, by: actor.slice(0, 40) },
      });
      return view(up.rows[0]!);
    });
  }

  /**
   * Support grants an item without a sale (a promotion, a compensation). Source `grant`, no order. Never for an item that is not in the
   * catalogue, and never a way around the schema's no-gameplay rule (there is no gameplay item).
   */
  async adminGrant(playerId: string, itemId: string, actor: string): Promise<void> {
    const now = this.d.clock();
    await this.d.db.tx(async (q) => {
      if (!(await this.d.catalog.itemRow(q, itemId))) throw notFound('no such item');
      const p = await q.query("SELECT 1 FROM players WHERE id = $1 AND status = 'active'", [playerId]);
      if (p.rowCount === 0) throw notFound('no such player');
      await q.query(
        `INSERT INTO entitlements (player_id, item_id, source, granted_at) VALUES ($1,$2,'grant',$3)
         ON CONFLICT (player_id, item_id) DO UPDATE SET source = 'grant', order_id = NULL, granted_at = EXCLUDED.granted_at, revoked_at = NULL, revoke_reason = NULL`,
        [playerId, itemId, now],
      );
      await audit(q, now, {
        type: 'commerce.fulfilled',
        actor: null,
        subject: playerId,
        detail: { itemId, grant: true, by: actor.slice(0, 40) },
      });
    });
  }

  /** Development tooling only: what a provider would report for this order (its price and provider). */
  async eventBasis(orderId: string): Promise<{
    provider: ProviderId;
    currency: string | null;
    amountMinor: number | null;
    providerRef: string | null;
  }> {
    const r = await this.d.db.query<OrderRow & { provider_ref: string | null }>(
      'SELECT * FROM orders WHERE id::text = $1',
      [orderId],
    );
    const o = r.rows[0];
    if (!o) throw notFound('no such order');
    return {
      provider: o.provider,
      currency: o.currency,
      amountMinor: o.amount_minor,
      providerRef: o.provider_ref,
    };
  }

  async adminOrders(
    status: OrderStatus | null,
    limit: number,
  ): Promise<(OrderView & { playerId: string })[]> {
    const r = await this.d.db.query<OrderRow>(
      'SELECT * FROM orders WHERE ($1::text IS NULL OR status = $1) ORDER BY created_at DESC LIMIT $2',
      [status, Math.min(Math.max(limit, 1), 100)],
    );
    return r.rows.map((o) => ({ ...view(o), playerId: o.player_id }));
  }

  // ---------------------------------------------------------------- erasure

  /**
   * Account deletion: entitlements go (they mean nothing without the account); ORDERS STAY (accounting / tax / dispute records) but lose
   * the idempotency key. The tombstone id is all that links them to anyone. The retention period of financial records is a legal
   * question (docs/PLATFORM_PRIVACY.md, OPEN).
   */
  async erase(q: Queryable, playerId: string): Promise<void> {
    await q.query('DELETE FROM entitlements WHERE player_id = $1', [playerId]);
    await q.query(
      "UPDATE orders SET idempotency_key = NULL, status = CASE WHEN status IN ('created','pending') THEN 'cancelled' ELSE status END WHERE player_id = $1",
      [playerId],
    );
  }
}
