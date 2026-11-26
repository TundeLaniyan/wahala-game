-- Checkpoint D: commerce FOUNDATIONS. No real payment can happen: no provider is configured, no real price exists, and only the
-- development mock (refused in production) can complete an order. No card data and no payment credential is ever stored.

CREATE TABLE catalog_items (
  id               text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9._-]{2,63}$'),
  category         text NOT NULL CHECK (category IN ('outfit', 'generator_skin', 'emote', 'elimination_effect', 'banner', 'vehicle_cosmetic', 'narration')),
  -- the id in src/cosmetics (the game's own catalogue) or, for narration, the existing EntitlementPort key
  cosmetic_ref     text,
  entitlement_key  text CHECK (entitlement_key IS NULL OR entitlement_key IN ('fullNarration', 'extendedLore', 'altPerformance')),
  name             text NOT NULL CHECK (length(name) <= 80),
  description      text NOT NULL DEFAULT '' CHECK (length(description) <= 300),
  rarity           text CHECK (rarity IS NULL OR rarity IN ('common', 'rare', 'epic', 'legendary')),
  -- owned by everybody (the game's "default" unlock rule): no entitlement row is needed
  default_owned    boolean NOT NULL DEFAULT false,
  -- only items an operator explicitly marked may be sold; earned items (level / rank / wins / season) are NOT sellable by default
  purchasable      boolean NOT NULL DEFAULT false,
  active           boolean NOT NULL DEFAULT true,
  -- PAY-TO-WIN IS REFUSED BY THE SCHEMA: nothing sold may change a rule, a stat or a hitbox
  affects_gameplay boolean NOT NULL DEFAULT false CHECK (affects_gameplay = false),
  created_at       timestamptz NOT NULL,
  CHECK ((category = 'narration') = (entitlement_key IS NOT NULL))
);

-- Prices are DATA supplied by the founder. None exists. `XTS` is the sandbox test currency and may only appear on sandbox rows.
CREATE TABLE catalog_prices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id       text NOT NULL REFERENCES catalog_items (id),
  currency      text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  amount_minor  integer NOT NULL CHECK (amount_minor > 0 AND amount_minor <= 100000000),
  sandbox       boolean NOT NULL DEFAULT false,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL,
  CHECK (sandbox = (currency = 'XTS'))
);
CREATE UNIQUE INDEX catalog_prices_one_active_idx ON catalog_prices (item_id, currency) WHERE active;

-- which product id each STORE uses for an item (supplied when the store accounts exist)
CREATE TABLE store_products (
  item_id             text NOT NULL REFERENCES catalog_items (id),
  provider            text NOT NULL CHECK (provider IN ('apple', 'google', 'web')),
  provider_product_id text NOT NULL CHECK (length(provider_product_id) <= 120),
  PRIMARY KEY (item_id, provider),
  UNIQUE (provider, provider_product_id)
);

CREATE TABLE orders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id        uuid NOT NULL REFERENCES players (id),
  item_id          text NOT NULL REFERENCES catalog_items (id),
  provider         text NOT NULL CHECK (provider IN ('mock', 'web', 'apple', 'google')),
  -- the price AT ORDER TIME (a later price change never changes an open order). NULL = the store sets it (Apple / Google).
  currency         text CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  amount_minor     integer CHECK (amount_minor IS NULL OR amount_minor > 0),
  status           text NOT NULL CHECK (status IN ('created', 'pending', 'paid', 'fulfilled', 'failed', 'cancelled', 'refunded', 'revoked')),
  status_reason    text CHECK (status_reason IS NULL OR length(status_reason) <= 80),
  -- client-supplied: retrying a create never makes a second order. Cleared on erasure.
  idempotency_key  text CHECK (idempotency_key IS NULL OR length(idempotency_key) BETWEEN 8 AND 80),
  provider_ref     text CHECK (provider_ref IS NULL OR length(provider_ref) <= 120),
  created_at       timestamptz NOT NULL,
  updated_at       timestamptz NOT NULL,
  paid_at          timestamptz,
  fulfilled_at     timestamptz,
  ended_at         timestamptz,
  CHECK (provider = 'mock' OR currency IS DISTINCT FROM 'XTS')
);
CREATE UNIQUE INDEX orders_idempotency_idx ON orders (player_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX orders_provider_ref_idx ON orders (provider, provider_ref) WHERE provider_ref IS NOT NULL;
-- one OPEN order per player per item: no double charge for a double tap
CREATE UNIQUE INDEX orders_open_idx ON orders (player_id, item_id) WHERE status IN ('created', 'pending');
CREATE INDEX orders_player_idx ON orders (player_id, created_at);

-- every provider event ever received, once: replays of a webhook are recognised and ignored
CREATE TABLE order_events (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider     text NOT NULL,
  event_id     text NOT NULL CHECK (length(event_id) <= 120),
  type         text NOT NULL,
  order_id     uuid REFERENCES orders (id),
  outcome      text NOT NULL CHECK (length(outcome) <= 60),
  received_at  timestamptz NOT NULL,
  UNIQUE (provider, event_id)
);

CREATE TABLE entitlements (
  player_id      uuid NOT NULL REFERENCES players (id),
  item_id        text NOT NULL REFERENCES catalog_items (id),
  source         text NOT NULL CHECK (source IN ('purchase', 'grant')),
  order_id       uuid REFERENCES orders (id),
  granted_at     timestamptz NOT NULL,
  revoked_at     timestamptz,
  revoke_reason  text CHECK (revoke_reason IS NULL OR length(revoke_reason) <= 80),
  PRIMARY KEY (player_id, item_id),
  CHECK (source <> 'purchase' OR order_id IS NOT NULL)
);
