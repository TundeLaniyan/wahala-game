/**
 * Ad placement rules (docs/ADS_AND_SEASONS.md). INTERFACE AND POLICY ONLY: no advertising SDK, no network, nothing
 * is shown. `NullAdProvider` is the only provider shipped and never displays anything; `canShowAd` is the pure
 * gate a future provider would have to pass before it could show a unit.
 *
 * Default-deny: an ad can appear only on a surface that is explicitly allowed for its slot.
 */

/** The ad units a game could ever show. */
export type AdSlot = 'postMatch' | 'betweenMatchMenu' | 'rewarded';

/** Where the player is. Every screen of the game maps to exactly one surface. */
export type AdSurface =
  | 'matchResults' // the post-match results screen of a normal match
  | 'mainMenu' // home and the setup screens between matches
  | 'lobby'
  | 'settings'
  | 'liveMatch'
  | 'countdown'
  | 'pauseMenu' // the pause menu of a live match
  | 'tutorial'
  | 'campaignMap'
  | 'campaignBriefing'
  | 'bossIntro'
  | 'cutscene'
  | 'campaignResult';

export interface AdPlacementRule {
  slot: AdSlot;
  /** Surfaces the slot may use. */
  allowedSurfaces: readonly AdSurface[];
  /** The player must have opted in to this unit (rewarded video). */
  requiresOptIn: boolean;
  /** Minimum seconds between two units of any slot. */
  minIntervalSec: number;
}

export const AD_PLACEMENT_RULES: Readonly<Record<AdSlot, AdPlacementRule>> = {
  postMatch: { slot: 'postMatch', allowedSurfaces: ['matchResults'], requiresOptIn: false, minIntervalSec: 180 },
  betweenMatchMenu: { slot: 'betweenMatchMenu', allowedSurfaces: ['mainMenu', 'lobby'], requiresOptIn: false, minIntervalSec: 180 },
  rewarded: { slot: 'rewarded', allowedSurfaces: ['matchResults', 'mainMenu'], requiresOptIn: true, minIntervalSec: 30 },
};

/** Surfaces where no ad may EVER appear, whatever the slot or flags (the product promise). */
export const AD_FORBIDDEN_SURFACES: readonly AdSurface[] = [
  'liveMatch',
  'countdown',
  'pauseMenu',
  'tutorial',
  'campaignMap',
  'campaignBriefing',
  'bossIntro',
  'cutscene',
  'campaignResult',
];

export interface AdContext {
  slot: AdSlot;
  surface: AdSurface;
  /** Global switch (build-time; false in every shipped build). */
  adsEnabled: boolean;
  /** The ad-free premium entitlement. */
  adFree: boolean;
  /** The player tapped "watch to earn" (rewarded units only). */
  optedIn?: boolean;
  /** Seconds since the last unit was shown (omit = none shown yet). */
  secondsSinceLastAd?: number;
}

export type AdDecision = { allowed: true } | { allowed: false; reason: AdDenyReason };
export type AdDenyReason =
  | 'adsDisabled'
  | 'adFree'
  | 'forbiddenSurface'
  | 'surfaceNotAllowedForSlot'
  | 'optInRequired'
  | 'tooSoon';

/** Pure gate: may this ad unit be shown right now? */
export function canShowAd(ctx: AdContext): AdDecision {
  if (!ctx.adsEnabled) return { allowed: false, reason: 'adsDisabled' };
  if (ctx.adFree) return { allowed: false, reason: 'adFree' };
  if (AD_FORBIDDEN_SURFACES.includes(ctx.surface)) return { allowed: false, reason: 'forbiddenSurface' };
  const rule = AD_PLACEMENT_RULES[ctx.slot];
  if (!rule || !rule.allowedSurfaces.includes(ctx.surface)) {
    return { allowed: false, reason: 'surfaceNotAllowedForSlot' };
  }
  if (rule.requiresOptIn && !ctx.optedIn) return { allowed: false, reason: 'optInRequired' };
  if (ctx.secondsSinceLastAd !== undefined && ctx.secondsSinceLastAd < rule.minIntervalSec) {
    return { allowed: false, reason: 'tooSoon' };
  }
  return { allowed: true };
}

// ---------------------------------------------------------------- provider interface

export type AdShowResult =
  | { shown: false; reason: AdDenyReason | 'noProvider' }
  | { shown: true; rewarded: boolean };

/** A placement request: what the UI asks of whichever provider is installed. */
export interface AdPlacement {
  slot: AdSlot;
  surface: AdSurface;
}

export interface AdProvider {
  readonly name: string;
  readonly status: 'disabled' | 'ready';
  /** Never throws. The provider must itself call `canShowAd` (it is pure) before showing anything. */
  show(placement: AdPlacement, ctx: Omit<AdContext, 'slot' | 'surface'>): Promise<AdShowResult>;
}

/** The only provider that ships: never shows anything, never loads anything. */
export const NullAdProvider: AdProvider = {
  name: 'null',
  status: 'disabled',
  show: () => Promise.resolve({ shown: false, reason: 'noProvider' }),
};
