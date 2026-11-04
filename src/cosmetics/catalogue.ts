/**
 * The cosmetic catalogue: FICTIONAL placeholder entries that exercise every kind, rarity and unlock rule. Nothing
 * here is rendered by the game yet (the renderer never reads this module); it is the data model a later
 * presentation pass and the online profile would use.
 */
import type { CosmeticDef, Loadout, ProgressView, UnlockRule } from './types';
import { EMPTY_LOADOUT } from './types';

const def = (c: CosmeticDef): CosmeticDef => c;

export const COSMETICS: readonly CosmeticDef[] = [
  def({
    id: 'skin-default',
    kind: 'fighterSkin',
    name: 'Street Classic',
    description: 'The look you start with.',
    rarity: 'common',
    source: 'default',
    unlock: { kind: 'default' },
  }),
  def({
    id: 'skin-ankara-festive',
    kind: 'fighterSkin',
    name: 'Ankara Festive',
    description: 'Bold festive print.',
    rarity: 'rare',
    source: 'season',
    unlock: { kind: 'seasonTier', seasonId: 'season-1', tier: 6 },
    theme: 'christmas',
  }),
  def({
    id: 'skin-agbada-gold',
    kind: 'fighterSkin',
    name: 'Gold Agbada',
    description: 'Flowing gold-trim robe.',
    rarity: 'epic',
    source: 'season',
    unlock: { kind: 'seasonTier', seasonId: 'season-2', tier: 6 },
    theme: 'eid',
  }),
  def({
    id: 'skin-dust-runner',
    kind: 'fighterSkin',
    name: 'Dust Runner',
    description: 'Scarf and goggles for the haze.',
    rarity: 'rare',
    source: 'season',
    unlock: { kind: 'seasonTier', seasonId: 'season-3', tier: 6 },
    theme: 'harmattan',
  }),
  def({
    id: 'skin-veteran',
    kind: 'fighterSkin',
    name: 'Veteran Jacket',
    description: 'Earned by winning.',
    rarity: 'rare',
    source: 'wins',
    unlock: { kind: 'wins', count: 25 },
  }),
  def({
    id: 'vehicle-default',
    kind: 'vehicleCosmetic',
    name: 'Stock Paint',
    description: 'Factory paint.',
    rarity: 'common',
    source: 'default',
    unlock: { kind: 'default' },
  }),
  def({
    id: 'vehicle-danfo-lanterns',
    kind: 'vehicleCosmetic',
    name: 'Lantern Danfo',
    description: 'Lanterns along the roofline.',
    rarity: 'epic',
    source: 'season',
    unlock: { kind: 'seasonTier', seasonId: 'season-2', tier: 8 },
    theme: 'eid',
    appliesTo: 'danfo',
  }),
  def({
    id: 'vehicle-keke-dust',
    kind: 'vehicleCosmetic',
    name: 'Dusty Keke',
    description: 'Road-worn paint.',
    rarity: 'rare',
    source: 'season',
    unlock: { kind: 'seasonTier', seasonId: 'season-3', tier: 8 },
    theme: 'harmattan',
    appliesTo: 'keke',
  }),
  def({
    id: 'finisher-spark',
    kind: 'finisher',
    name: 'Spark Shower',
    description: 'A shower of sparks on a win.',
    rarity: 'rare',
    source: 'level',
    unlock: { kind: 'level', level: 8 },
  }),
  def({
    id: 'finisher-fireworks',
    kind: 'finisher',
    name: 'Rooftop Fireworks',
    description: 'Fireworks behind the winner.',
    rarity: 'epic',
    source: 'season',
    unlock: { kind: 'seasonTier', seasonId: 'season-1', tier: 8 },
    theme: 'christmas',
  }),
  def({
    id: 'emote-wave',
    kind: 'emote',
    name: 'Wave',
    description: 'A friendly wave.',
    rarity: 'common',
    source: 'default',
    unlock: { kind: 'default' },
  }),
  def({
    id: 'emote-jingle-dance',
    kind: 'emote',
    name: 'Jingle Dance',
    description: 'A festive shuffle.',
    rarity: 'rare',
    source: 'season',
    unlock: { kind: 'seasonTier', seasonId: 'season-1', tier: 4 },
    theme: 'christmas',
  }),
  def({
    id: 'emote-greeting-wave',
    kind: 'emote',
    name: 'Greeting',
    description: 'A warm greeting.',
    rarity: 'rare',
    source: 'season',
    unlock: { kind: 'seasonTier', seasonId: 'season-2', tier: 4 },
    theme: 'eid',
  }),
  def({
    id: 'emote-scarf-wrap',
    kind: 'emote',
    name: 'Scarf Wrap',
    description: 'Wrap up against the dust.',
    rarity: 'common',
    source: 'season',
    unlock: { kind: 'seasonTier', seasonId: 'season-3', tier: 4 },
    theme: 'harmattan',
  }),
  def({
    id: 'banner-default',
    kind: 'banner',
    name: 'Plain Banner',
    description: 'A plain nameplate.',
    rarity: 'common',
    source: 'default',
    unlock: { kind: 'default' },
  }),
  def({
    id: 'banner-christmas-lights',
    kind: 'banner',
    name: 'String Lights',
    description: 'Festive string lights.',
    rarity: 'common',
    source: 'season',
    unlock: { kind: 'seasonTier', seasonId: 'season-1', tier: 2 },
    theme: 'christmas',
  }),
  def({
    id: 'banner-eid-crescent',
    kind: 'banner',
    name: 'Crescent',
    description: 'A crescent and stars.',
    rarity: 'common',
    source: 'season',
    unlock: { kind: 'seasonTier', seasonId: 'season-2', tier: 2 },
    theme: 'eid',
  }),
  def({
    id: 'banner-dust-haze',
    kind: 'banner',
    name: 'Haze',
    description: 'Warm orange haze.',
    rarity: 'common',
    source: 'season',
    unlock: { kind: 'seasonTier', seasonId: 'season-3', tier: 2 },
    theme: 'harmattan',
  }),
  def({
    id: 'banner-season-1-gold',
    kind: 'banner',
    name: 'Season 1 Gold',
    description: 'Finished the season track.',
    rarity: 'legendary',
    source: 'season',
    unlock: { kind: 'seasonTier', seasonId: 'season-1', tier: 10 },
    theme: 'christmas',
  }),
  def({
    id: 'banner-season-2-gold',
    kind: 'banner',
    name: 'Season 2 Gold',
    description: 'Finished the season track.',
    rarity: 'legendary',
    source: 'season',
    unlock: { kind: 'seasonTier', seasonId: 'season-2', tier: 10 },
    theme: 'eid',
  }),
  def({
    id: 'banner-season-3-gold',
    kind: 'banner',
    name: 'Season 3 Gold',
    description: 'Finished the season track.',
    rarity: 'legendary',
    source: 'season',
    unlock: { kind: 'seasonTier', seasonId: 'season-3', tier: 10 },
    theme: 'harmattan',
  }),
  def({
    id: 'banner-gold-tier',
    kind: 'banner',
    name: 'Gold Plate',
    description: 'Reached Gold rank.',
    rarity: 'epic',
    source: 'rank',
    unlock: { kind: 'rank', tierIndex: 2 },
  }),
  def({
    id: 'banner-level-10',
    kind: 'banner',
    name: 'Level 10',
    description: 'Reached level 10.',
    rarity: 'rare',
    source: 'level',
    unlock: { kind: 'level', level: 10 },
  }),
];

const BY_ID = new Map(COSMETICS.map((c) => [c.id, c]));
export const cosmeticById = (id: string): CosmeticDef | null => BY_ID.get(id) ?? null;

/** Pure: has the player met the rule? (Unknown season ids / themes are simply not unlocked.) */
export function ruleMet(rule: UnlockRule, p: ProgressView): boolean {
  switch (rule.kind) {
    case 'default':
      return true;
    case 'level':
      return p.level >= rule.level;
    case 'rank':
      return p.rankTierIndex >= rule.tierIndex;
    case 'wins':
      return p.wins >= rule.count;
    case 'seasonTier':
      return (p.seasonTiers[rule.seasonId] ?? 0) >= rule.tier;
    case 'event':
      return p.eventThemes.includes(rule.theme);
    case 'campaignReward':
      return p.campaignRewards.includes(rule.rewardId);
  }
}

/** Ids of every catalogue entry the progress view unlocks. */
export function unlockedCosmetics(p: ProgressView, catalogue: readonly CosmeticDef[] = COSMETICS): string[] {
  return catalogue.filter((c) => ruleMet(c.unlock, p)).map((c) => c.id);
}

/** A loadout with anything not owned (or of the wrong kind) reset to the default look. */
export function sanitizeLoadout(
  loadout: Partial<Loadout> | null | undefined,
  owned: readonly string[],
): Loadout {
  const out: Loadout = { ...EMPTY_LOADOUT };
  for (const kind of Object.keys(out) as (keyof Loadout)[]) {
    const id = loadout?.[kind];
    const c = typeof id === 'string' ? cosmeticById(id) : null;
    if (c && c.kind === kind && owned.includes(c.id)) out[kind] = c.id;
  }
  return out;
}
