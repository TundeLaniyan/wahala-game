/**
 * Campaign enemy LOOKS by variant (docs/CAMPAIGN_SECTOR_AI.md "Enemy telegraphs and looks", decision SV4): how each
 * `EnemyVariantId` is dressed so the roster reads apart at a glance - silhouette scale, a two-tone clothing palette,
 * headwear and a few props. Presentation only (nothing in `src/sim` reads this); the renderer builds it in
 * `render/assets/enemyKit.ts` on the existing cast models. TEMPORARY: these are procedural kit pieces on the three
 * hero rigs (and the Area Boss rig for the heavy and the boss) until each variant gets dedicated 3D production.
 *
 * Every organisation is FICTIONAL (docs/STORY_BIBLE.md section 1). The "Ring" crews wear an invented PLUM-and-LIME
 * palette that no real Lagos or Nigerian agency uses: no police black or blue, no army green or camouflage, no LASTMA
 * yellow-and-maroon, no FRSC or civil-defence colours, no insignia, badges with text or real logos.
 */
import type { EnemyKind } from '../sim/campaign/types';
import type { EnemyVariantId } from '../sim/data/enemyVariants';
import { DEFAULT_VARIANT_OF_KIND } from '../sim/data/enemyVariants';

/** Enemy variants that have a dedicated 3D model (docs/CHARACTER_PRODUCTION_AGBERO.md). */
export type DedicatedEnemyModel =
  | 'agbero'
  | 'areaBoy'
  | 'bottleThrower'
  | 'marketEnforcer'
  | 'heavyEnforcer'
  | 'routeMarshal'
  | 'ringSecurity'
  | 'lieutenant';

/**
 * Dedicated boss models, by the boss seat's name (presentation only; mission data is untouched). The Landlord is a PROVISIONAL
 * working title (docs/STORY_BIBLE.md); the model follows the name in the data.
 */
export const BOSS_MODELS: Readonly<Record<string, string>> = {
  'Oga Sunmola': 'bossOgaSunmola',
  'Madam Ronke': 'bossMadamRonke',
  'Marshal Kobo': 'bossMarshalKobo',
  'Ikenna Wayside': 'bossIkennaWayside',
  'Barrister Quill': 'bossBarristerQuill',
  'Steward Halcyon': 'bossStewardHalcyon',
  'The Landlord': 'bossTheLandlord',
};

/** `?legacyEnemies` keeps the temporary kit looks (art comparison, and the safe switch back). */
export function dedicatedModelsEnabled(
  search: string = typeof location === 'undefined' ? '' : location.search,
): boolean {
  return !new URLSearchParams(search).has('legacyEnemies');
}

export type EnemyHeadwear =
  'cap' | 'bandana' | 'bucket' | 'beanie' | 'hardhat' | 'beret' | 'patrolCap' | 'flatCap' | 'fedora';

export type EnemyProp =
  /** a glass bottle in the right hand */
  | 'bottle'
  /** a bottle crate on the back */
  | 'crate'
  /** a short baton in the right hand */
  | 'baton'
  /** a hand radio on the chest */
  | 'radio'
  /** an earpiece and its coiled lead */
  | 'earpiece'
  /** a fitted (security) vest */
  | 'vest'
  /** a padded, bulky vest with straps */
  | 'bulkyVest'
  /** a market apron */
  | 'apron'
  /** a sack over the left shoulder */
  | 'sack'
  /** a diagonal sash across the chest */
  | 'sash'
  /** a heavy chain at the neck */
  | 'chain'
  /** dark glasses */
  | 'shades';

export interface EnemyLook {
  variant: EnemyVariantId;
  /** Rig to use instead of the seat's character: the bulky Area Boss rig, or null = the seat's own character. */
  rig: 'areaBoss' | null;
  /**
   * A DEDICATED, fully dressed model (`char_<model>.glb`, tools/assets/enemies.py): when it is loaded it replaces the
   * rig + kit above; when it is missing or failed to load (or `?legacyEnemies` is in the URL) the rig + kit are used.
   */
  model?: DedicatedEnemyModel;
  /** Uniform scale of the whole model (silhouette): > 1 bigger, < 1 slighter. */
  scale: number;
  /** Clothing recolour: saturated cloth -> `primary`, dark cloth -> `secondary`, light trims -> `trim`. */
  palette: { primary: number; secondary: number; trim: number };
  headwear: EnemyHeadwear;
  headwearColor: number;
  /** Second colour of the headwear (band, badge, stripe). */
  accent: number;
  props: readonly EnemyProp[];
  /** Lieutenants and bosses: a gold leader ring on the floor besides their own. */
  leader: boolean;
}

/** The invented Ring palette (fictional route marshals and private security). */
export const RING_PLUM = 0x5b2463;
export const RING_LIME = 0xa8dc3a;

export const ENEMY_LOOKS: Readonly<Record<EnemyVariantId, EnemyLook>> = {
  agbero: {
    variant: 'agbero',
    rig: null,
    model: 'agbero',
    scale: 1.0,
    palette: { primary: 0xb4552a, secondary: 0x2b3a4e, trim: 0xd9cfb8 },
    headwear: 'cap',
    headwearColor: 0x6e2a1c,
    accent: 0x6e2a1c,
    props: [],
    leader: false,
  },
  areaBoy: {
    variant: 'areaBoy',
    model: 'areaBoy',
    rig: null,
    scale: 0.95,
    palette: { primary: 0xc9a227, secondary: 0x1d1d20, trim: 0xe8e2d0 },
    headwear: 'bandana',
    headwearColor: 0xc4291f,
    accent: 0xf2e7d0,
    props: [],
    leader: false,
  },
  bottleThrower: {
    variant: 'bottleThrower',
    model: 'bottleThrower',
    rig: null,
    scale: 0.98,
    palette: { primary: 0x3a6c9a, secondary: 0x3a3a3c, trim: 0xd8d2c0 },
    headwear: 'bucket',
    headwearColor: 0xb59a66,
    accent: 0xb59a66,
    props: ['bottle', 'crate'],
    leader: false,
  },
  marketEnforcer: {
    variant: 'marketEnforcer',
    model: 'marketEnforcer',
    rig: null,
    scale: 1.03,
    palette: { primary: 0x2f6a3e, secondary: 0x2a2420, trim: 0xd8ccb0 },
    headwear: 'beanie',
    headwearColor: 0x4a3426,
    accent: 0x4a3426,
    props: ['apron', 'sack'],
    leader: false,
  },
  heavyEnforcer: {
    variant: 'heavyEnforcer',
    model: 'heavyEnforcer',
    rig: 'areaBoss',
    scale: 1.16,
    palette: { primary: 0x7a4a2a, secondary: 0x1e1c1a, trim: 0xb8ab90 },
    headwear: 'hardhat',
    headwearColor: 0x1c1c1e,
    accent: 0xd8341e,
    props: ['bulkyVest'],
    leader: false,
  },
  routeMarshal: {
    variant: 'routeMarshal',
    model: 'routeMarshal',
    rig: null,
    scale: 1.02,
    palette: { primary: RING_PLUM, secondary: 0x24232a, trim: 0xcfc8d6 },
    headwear: 'beret',
    headwearColor: RING_PLUM,
    accent: RING_LIME,
    props: ['sash', 'baton'],
    leader: false,
  },
  ringSecurity: {
    variant: 'ringSecurity',
    model: 'ringSecurity',
    rig: null,
    scale: 1.05,
    palette: { primary: 0x34363c, secondary: 0x161618, trim: 0x8a8c94 },
    headwear: 'patrolCap',
    headwearColor: 0x18181a,
    accent: RING_LIME,
    props: ['vest', 'radio', 'earpiece'],
    leader: false,
  },
  lieutenant: {
    variant: 'lieutenant',
    model: 'lieutenant',
    rig: null,
    scale: 1.08,
    palette: { primary: 0x8c1c2a, secondary: 0x141416, trim: 0xe9e1cf },
    headwear: 'flatCap',
    headwearColor: 0x2a1418,
    accent: 0xd8a83a,
    props: ['shades', 'chain'],
    leader: true,
  },
  boss: {
    variant: 'boss',
    rig: 'areaBoss',
    scale: 1.14,
    palette: { primary: 0xece4d2, secondary: 0x1a1a1c, trim: 0xd8a83a },
    headwear: 'fedora',
    headwearColor: 0x241c16,
    accent: 0xd8a83a,
    props: ['shades', 'chain'],
    leader: true,
  },
};

/**
 * The variant a seat is drawn as: its own, else its kind's default; null for a seat that is not a campaign enemy. A boss
 * mission's generator-bot boss may name a look without a kind (the Ojuelegba finale's enforcer, decision FN8).
 */
export function enemyVariantOf(p: {
  enemyKind?: EnemyKind;
  enemyVariant?: EnemyVariantId;
}): EnemyVariantId | null {
  if (p.enemyKind === undefined) return p.enemyVariant ?? null;
  return p.enemyVariant ?? DEFAULT_VARIANT_OF_KIND[p.enemyKind];
}

/**
 * The dedicated model a seat wants (an enemy variant's, or a named boss's), or null: the temporary kit / hero look is used.
 * Whether the file is loaded is the library's business; the caller falls back when it is not.
 */
export function dedicatedModelOf(p: {
  name?: string;
  enemyKind?: EnemyKind;
  enemyVariant?: EnemyVariantId;
}): string | null {
  if (!dedicatedModelsEnabled()) return null;
  const boss = p.name !== undefined ? BOSS_MODELS[p.name] : undefined;
  if (boss) return boss;
  return enemyLookOf(p)?.model ?? null;
}

/** The look of a seat (null = not a campaign enemy: multiplayer fighters and the human keep their identity kit). */
export function enemyLookOf(p: { enemyKind?: EnemyKind; enemyVariant?: EnemyVariantId }): EnemyLook | null {
  const v = enemyVariantOf(p);
  return v ? ENEMY_LOOKS[v] : null;
}

/** Drawn scale of a seat (1 for everyone but campaign enemies): head-height marks (pips, clocks) follow it. */
export const enemyScaleOf = (p: { enemyKind?: EnemyKind; enemyVariant?: EnemyVariantId }): number =>
  enemyLookOf(p)?.scale ?? 1;
