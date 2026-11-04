/**
 * Cosmetic catalogue data model (docs/ADS_AND_SEASONS.md). Cosmetics are PURELY visual and never change a rule,
 * a stat or a hitbox. There is no store, no currency and no purchase flow in this branch. All content is fictional.
 */
import type { SeasonTheme } from '../seasons';

export type CosmeticKind = 'fighterSkin' | 'vehicleCosmetic' | 'finisher' | 'emote' | 'banner';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type CosmeticSource = 'default' | 'level' | 'rank' | 'wins' | 'season' | 'event' | 'campaign';

/** What a player needs to have done for the item to unlock. Evaluated by `isUnlocked` against a `ProgressView`. */
export type UnlockRule =
  | { kind: 'default' }
  | { kind: 'level'; level: number }
  /** Reached rank tier index `tierIndex` or higher (0 = lowest; see progression RANK_TIERS). */
  | { kind: 'rank'; tierIndex: number }
  | { kind: 'wins'; count: number }
  | { kind: 'seasonTier'; seasonId: string; tier: number }
  | { kind: 'event'; theme: SeasonTheme }
  | { kind: 'campaignReward'; rewardId: string };

export interface CosmeticDef {
  id: string;
  kind: CosmeticKind;
  name: string;
  description: string;
  rarity: Rarity;
  source: CosmeticSource;
  unlock: UnlockRule;
  /** Optional theme (seasonal dressing). */
  theme?: SeasonTheme;
  /** Fighter id or vehicle kind this item applies to; absent = any. */
  appliesTo?: string;
}

/** The slice of a player's progress cosmetics need (structural: src/progression builds it). */
export interface ProgressView {
  level: number;
  /** Highest rank tier index reached. */
  rankTierIndex: number;
  wins: number;
  /** Highest tier reached per season id. */
  seasonTiers: Readonly<Record<string, number>>;
  /** Event themes the player has taken part in. */
  eventThemes: readonly SeasonTheme[];
  campaignRewards: readonly string[];
}

/** What a player has equipped (ids; null = the default look). */
export interface Loadout {
  fighterSkin: string | null;
  vehicleCosmetic: string | null;
  finisher: string | null;
  emote: string | null;
  banner: string | null;
}

export const EMPTY_LOADOUT: Readonly<Loadout> = Object.freeze({
  fighterSkin: null,
  vehicleCosmetic: null,
  finisher: null,
  emote: null,
  banner: null,
});
