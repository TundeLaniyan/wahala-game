/**
 * The catalogue: what exists, what is for sale, and for how much. The game's OWN cosmetic catalogue (`src/cosmetics`) is the source of
 * truth for WHICH items exist; this table adds the commercial facts (is it sellable, its price, its store product ids) and nothing
 * else. Syncing never changes `purchasable`, `active` or a price an operator set.
 *
 * Rules enforced here and by the schema:
 *  - cosmetic and narration items only; `affects_gameplay` can never be true (CHECK constraint): no pay-to-win
 *  - items earned by play (level / rank / wins / season / event / campaign) are NOT sellable until an operator says so
 *  - NO PRICE EXISTS until the founder supplies one; the `XTS` test currency is sandbox-only
 */
import { COSMETICS } from '../../../src/cosmetics/catalogue';
import type { CosmeticKind } from '../../../src/cosmetics/types';
import { audit } from '../audit';
import type { Db, Queryable } from '../db/types';
import { badRequest, conflict, notFound } from '../errors';
import type { Clock } from '../util/clock';
import { SANDBOX_CURRENCY, isMoney } from './types';
import type { ItemCategory, Money } from './types';

const CATEGORY_OF: Record<CosmeticKind, ItemCategory> = {
  fighterSkin: 'outfit',
  vehicleCosmetic: 'vehicle_cosmetic',
  finisher: 'elimination_effect',
  emote: 'emote',
  banner: 'banner',
};

/** The existing narration `EntitlementPort` keys (src/campaign/narration/entitlements.ts): purchasable-in-future, never granted today. */
export const NARRATION_ITEMS = [
  {
    id: 'narration-full',
    key: 'fullNarration',
    name: 'Full narration',
    description: 'Full-length narrated performances.',
  },
  { id: 'narration-lore', key: 'extendedLore', name: 'Extended lore', description: 'Extended story text.' },
  {
    id: 'narration-alt',
    key: 'altPerformance',
    name: 'Alternate performances',
    description: 'Alternate readings of the same cards.',
  },
] as const;

export interface PriceView extends Money {
  sandbox: boolean;
}

export interface ItemView {
  id: string;
  category: ItemCategory;
  name: string;
  description: string;
  rarity: string | null;
  owned: boolean;
  /** True only if the item is for sale RIGHT NOW with at least one price visible to this caller. */
  forSale: boolean;
  prices: PriceView[];
}

interface ItemRow {
  id: string;
  category: ItemCategory;
  name: string;
  description: string;
  rarity: string | null;
  default_owned: boolean;
  purchasable: boolean;
  active: boolean;
}

export class CatalogService {
  constructor(private readonly d: { db: Db; clock: Clock; sandboxVisible: boolean }) {}

  /** Idempotent: inserts the game's items and narration keys that are missing; refreshes names; never touches commercial flags or prices. */
  async syncFromGame(): Promise<{ inserted: number }> {
    const now = this.d.clock();
    let inserted = 0;
    await this.d.db.tx(async (q) => {
      for (const c of COSMETICS) {
        await q.query(
          `INSERT INTO catalog_items (id, category, cosmetic_ref, name, description, rarity, default_owned, created_at)
           VALUES ($1,$2,$1,$3,$4,$5,$6,$7)
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, rarity = EXCLUDED.rarity, default_owned = EXCLUDED.default_owned`,
          [
            c.id,
            CATEGORY_OF[c.kind],
            c.name.slice(0, 80),
            c.description.slice(0, 300),
            c.rarity,
            c.unlock.kind === 'default',
            now,
          ],
        );
      }
      for (const n of NARRATION_ITEMS) {
        await q.query(
          `INSERT INTO catalog_items (id, category, entitlement_key, name, description, created_at) VALUES ($1,'narration',$2,$3,$4,$5)
           ON CONFLICT (id) DO NOTHING`,
          [n.id, n.key, n.name, n.description, now],
        );
      }
      inserted = (await q.query<{ n: number }>('SELECT count(*)::int AS n FROM catalog_items')).rows[0]!.n;
    });
    return { inserted };
  }

  /** The shop window. Sandbox prices are visible only while the development mock checkout is enabled. */
  async list(playerId: string | null, category?: ItemCategory): Promise<ItemView[]> {
    const items = await this.d.db.query<ItemRow>(
      `SELECT id, category, name, description, rarity, default_owned, purchasable, active FROM catalog_items
        WHERE active AND ($1::text IS NULL OR category = $1) ORDER BY category, name`,
      [category ?? null],
    );
    const prices = await this.d.db.query<{
      item_id: string;
      currency: string;
      amount_minor: number;
      sandbox: boolean;
    }>(
      'SELECT item_id, currency, amount_minor, sandbox FROM catalog_prices WHERE active AND ($1 OR NOT sandbox)',
      [this.d.sandboxVisible],
    );
    const owned = new Set<string>();
    if (playerId) {
      const e = await this.d.db.query<{ item_id: string }>(
        'SELECT item_id FROM entitlements WHERE player_id = $1 AND revoked_at IS NULL',
        [playerId],
      );
      for (const r of e.rows) owned.add(r.item_id);
    }
    return items.rows.map((i) => {
      const ps = prices.rows
        .filter((p) => p.item_id === i.id)
        .map((p) => ({ currency: p.currency, amountMinor: p.amount_minor, sandbox: p.sandbox }));
      return {
        id: i.id,
        category: i.category,
        name: i.name,
        description: i.description,
        rarity: i.rarity,
        owned: i.default_owned || owned.has(i.id),
        forSale: i.purchasable && !i.default_owned && ps.length > 0,
        prices: i.purchasable && !i.default_owned ? ps : [],
      };
    });
  }

  // ---------------------------------------------------------------- operator changes (admin API / seed), all audited

  async setPurchasable(itemId: string, purchasable: boolean, actor: string): Promise<void> {
    const now = this.d.clock();
    await this.d.db.tx(async (q) => {
      const r = await q.query(
        'UPDATE catalog_items SET purchasable = $2 WHERE id = $1 AND NOT default_owned',
        [itemId, purchasable],
      );
      if (r.rowCount === 0) throw notFound('no such sellable item');
      await audit(q, now, {
        type: 'commerce.catalog_changed',
        detail: { itemId, purchasable, by: actor.slice(0, 40) },
      });
    });
  }

  /** Sets (replaces) the active price of an item in one currency. The sandbox currency is refused unless the mock checkout is on. */
  async setPrice(itemId: string, price: Money, actor: string): Promise<void> {
    if (!isMoney(price))
      throw badRequest('a price is a 3-letter currency and a positive whole number of minor units');
    const sandbox = price.currency === SANDBOX_CURRENCY;
    if (sandbox && !this.d.sandboxVisible)
      throw conflict('the sandbox currency exists only with the development mock checkout');
    const now = this.d.clock();
    await this.d.db.tx(async (q) => {
      const item = await q.query('SELECT 1 FROM catalog_items WHERE id = $1 AND NOT default_owned', [itemId]);
      if (item.rowCount === 0) throw notFound('no such sellable item');
      await q.query(
        'UPDATE catalog_prices SET active = false WHERE item_id = $1 AND currency = $2 AND active',
        [itemId, price.currency],
      );
      await q.query(
        'INSERT INTO catalog_prices (item_id, currency, amount_minor, sandbox, created_at) VALUES ($1,$2,$3,$4,$5)',
        [itemId, price.currency, price.amountMinor, sandbox, now],
      );
      await audit(q, now, {
        type: 'commerce.catalog_changed',
        detail: { itemId, currency: price.currency, amountMinor: price.amountMinor, by: actor.slice(0, 40) },
      });
    });
  }

  async setStoreProduct(
    itemId: string,
    provider: 'apple' | 'google' | 'web',
    productId: string,
    actor: string,
  ): Promise<void> {
    if (productId.length < 3 || productId.length > 120) throw badRequest('product id length');
    const now = this.d.clock();
    await this.d.db.tx(async (q) => {
      const item = await q.query('SELECT 1 FROM catalog_items WHERE id = $1', [itemId]);
      if (item.rowCount === 0) throw notFound('no such item');
      await q.query(
        'INSERT INTO store_products (item_id, provider, provider_product_id) VALUES ($1,$2,$3) ON CONFLICT (item_id, provider) DO UPDATE SET provider_product_id = EXCLUDED.provider_product_id',
        [itemId, provider, productId],
      );
      await audit(q, now, {
        type: 'commerce.catalog_changed',
        detail: { itemId, provider, by: actor.slice(0, 40) },
      });
    });
  }

  /**
   * DEVELOPMENT / TEST ONLY: marks a few items sellable for test money (XTS) so the sandbox flow has something to buy. These prices
   * are not real and not a proposal; production has none.
   */
  async seedSandbox(): Promise<string[]> {
    if (!this.d.sandboxVisible) throw conflict('sandbox data needs the development mock checkout');
    const picks = (['fighterSkin', 'emote', 'finisher'] as CosmeticKind[]).flatMap((k) => {
      const c = COSMETICS.find((x) => x.kind === k && x.unlock.kind !== 'default');
      return c ? [c.id] : [];
    });
    let amount = 100;
    for (const id of picks) {
      await this.setPurchasable(id, true, 'sandbox-seed');
      await this.setPrice(id, { currency: SANDBOX_CURRENCY, amountMinor: amount }, 'sandbox-seed');
      amount += 150;
    }
    return picks;
  }

  async itemRow(q: Queryable, itemId: string): Promise<ItemRow | null> {
    const r = await q.query<ItemRow>(
      'SELECT id, category, name, description, rarity, default_owned, purchasable, active FROM catalog_items WHERE id = $1',
      [itemId],
    );
    return r.rows[0] ?? null;
  }
}
