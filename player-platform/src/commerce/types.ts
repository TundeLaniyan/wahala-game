/** Money is ALWAYS an integer count of minor units (kobo, cents) plus a currency code. Never a float. */
export interface Money {
  currency: string;
  amountMinor: number;
}

export const SANDBOX_CURRENCY = 'XTS';

export function isMoney(m: unknown): m is Money {
  const x = m as Money;
  return (
    typeof x === 'object' &&
    x !== null &&
    /^[A-Z]{3}$/.test(x.currency) &&
    Number.isSafeInteger(x.amountMinor) &&
    x.amountMinor > 0
  );
}

/** The game's cosmetic categories as a shop sees them. `generator_skin` has no renderable item yet (docs/PLATFORM_AUDIT.md section 3). */
export type ItemCategory =
  'outfit' | 'generator_skin' | 'emote' | 'elimination_effect' | 'banner' | 'vehicle_cosmetic' | 'narration';
export const ITEM_CATEGORIES: readonly ItemCategory[] = [
  'outfit',
  'generator_skin',
  'emote',
  'elimination_effect',
  'banner',
  'vehicle_cosmetic',
  'narration',
];

/** Where each category is EQUIPPED in `profile.loadout` (the slots of src/cosmetics `Loadout`; `generatorSkin` is new). Narration is never equipped. */
export const SLOT_OF: Record<Exclude<ItemCategory, 'narration'>, string> = {
  outfit: 'fighterSkin',
  generator_skin: 'generatorSkin',
  emote: 'emote',
  elimination_effect: 'finisher',
  banner: 'banner',
  vehicle_cosmetic: 'vehicleCosmetic',
};

export type OrderStatus =
  'created' | 'pending' | 'paid' | 'fulfilled' | 'failed' | 'cancelled' | 'refunded' | 'revoked';
export type ProviderId = 'mock' | 'web' | 'apple' | 'google';
export const PROVIDER_IDS: readonly ProviderId[] = ['mock', 'web', 'apple', 'google'];
