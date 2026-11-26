# Commerce foundations (Checkpoint D): sandbox only, no real payment is possible

**Nothing here accepts money.** No payment provider is configured, no real price exists anywhere in the repository, no card data or payment credential is ever stored or handled, and the only way an order can complete is the development mock, which production configuration refuses and the app refuses to construct in production even if the flag is forced (`commerce.test.ts`).

## 1. Model

| Concept | Where | Notes |
| --- | --- | --- |
| Catalogue | `catalog_items` | one row per item. **Synced from the game's own cosmetic catalogue** (`src/cosmetics`, 24 items, ids reused: `skin-ankara-festive` ...) plus the three existing narration keys (`fullNarration`, `extendedLore`, `altPerformance` -> items `narration-full` / `-lore` / `-alt`) so a purchase can later feed the existing `EntitlementPort`. The renderer still does not read cosmetics: this is data. |
| Categories | outfit (`fighterSkin`), emote, elimination effect (`finisher`), banner, vehicle cosmetic, **generator skin** (category and loadout slot `generatorSkin` exist; the game has **no generator-skin asset or `CosmeticKind` yet**: needs a `src/cosmetics` change, not made here), narration |
| Pay-to-win | `affects_gameplay boolean CHECK (affects_gameplay = false)`; no stat column exists; categories are a closed list | tested: the database refuses it |
| For sale? | `purchasable` (default **false**) | items earned by play (level, rank, wins, season, event, campaign) are not sellable until an operator decides; free default items can never be sold |
| Prices | `catalog_prices` (integer minor units + ISO currency) | **none exist.** Operators set them (`PUT /admin/v1/catalog/:id/price`, audited). `XTS` is the sandbox test currency: a CHECK ties it to `sandbox = true` rows and the mock provider only |
| Store product ids | `store_products` (item x apple / google / web) | supplied when the store accounts exist |
| Orders | `orders` | state machine below; price **snapshot** at creation; one open order per player per item (partial unique index); `Idempotency-Key` per player |
| Provider events | `order_events` | `UNIQUE (provider, event_id)`: a webhook is applied once; replays answer `duplicate` |
| Ownership | `entitlements` | `(player, item)` with source `purchase` (needs an order) or `grant` (support); revoked rows keep the reason |

## 2. Transaction states (pure table in `stateMachine.ts`, exhaustively tested)

```
created -> pending -> paid -> fulfilled -> refunded | revoked
   |          |        '-> refunded | revoked
   '----------'--> failed | cancelled           (failed, cancelled, refunded, revoked are final)
```
`paid` is reachable **only** by a verified provider event; `fulfilled` only from `paid`; a failed or cancelled order can never be paid later.

## 3. The two guarantees

1. **No paid entitlement without a server-verified confirmation.** The only code that creates a purchased entitlement is `CommerceService.applyEvent`, fed by `provider.parseWebhook` (which verifies the provider's signature over the raw body and a timestamp window) or `provider.verifyReceipt` (the store's own server API). There is no player route that sets paid or grants (tested by route inspection), the operator `grant` route is for support gifts and is audited, and the dev mock goes through the **same** signature-verified path (`POST /v1/dev/mock-checkout/:id/complete` signs a test event and posts it to the real ingest).
2. **Idempotent fulfilment.** Order creation is idempotent (client key, plus a second tap returns the open order). A provider event is applied once (event id). Fulfilment is one transaction holding the order row lock. A provider transaction id can belong to only one order. The amount and currency the provider reports must equal the order snapshot, otherwise the order fails and nothing is granted (store purchases, where the store sets the price, skip that comparison by design).

## 4. Refunds and revocation

- `refund.succeeded` / `chargeback` events: order -> `refunded` / `revoked`, the entitlement is revoked, the item is removed from the player's equipped loadout, audit row written. The item can be bought again later.
- Operators can revoke without a refund (`POST /admin/v1/orders/:id/revoke`, fraud / abuse) and grant without a sale.
- Real refunds are executed **in the provider's dashboard or API** and arrive as events; the platform never moves money. A refund event that arrives before the payment event (providers do not guarantee order) is ignored and visible in `order_events` for reconciliation; a reconciliation job against each provider is a required follow-up.
- Open orders expire after one hour (`expireStale`, run by the purge job).

## 5. Who may buy

`capabilities.purchases` = **adult registered account** (`capabilitiesFor`). Guests, minors and undeclared ages get 403. A guardian-consent purchase flow is **not built** and is a legal decision (app-store family rules, NDPA).

## 6. Provider interface and what each real adapter must do

`PaymentProvider { createCheckout, parseWebhook, verifyReceipt }`. Shipped: `MockCheckoutProvider` and three **unconfigured skeletons** (`WebCheckoutProvider`, `AppleIapProvider`, `GooglePlayProvider`) that answer 501 `provider_not_configured`. `test/commerce.test.ts` contains a reusable provider contract (accepts its own signed event, rejects tampering / missing signature / stale event / malformed body) that every adapter must pass. Details per provider: `PLATFORM_PROVIDER_REQUIREMENTS.md`.

## 7. API (all in `openapi.yaml`)

Players: `GET /v1/shop/status`, `/catalog`, `/entitlements`, `POST /v1/shop/orders` (Idempotency-Key), `GET /orders`, `/orders/:id`, `POST /orders/:id/cancel`, `POST /orders/:id/receipt`; provider: `POST /v1/shop/webhooks/:provider`; operators (`/admin/v1`): orders, revoke, grants, catalogue price / sale / store product; dev only: `POST /v1/dev/mock-checkout/:orderId/complete`.

## 8. Decisions and open questions for the founder

Which items are sold at all (earned items stay earned?); every price and currency (NGN first? USD / GBP for stores); bundles, gifts, season-pass style sales (not modelled); refund policy and who decides; guardian consent and minors; whether purchases follow the account across Apple / Google (entitlements are per account, but a store requires its own purchase restoration flow); financial-record retention; tax (VAT) handling per provider.
