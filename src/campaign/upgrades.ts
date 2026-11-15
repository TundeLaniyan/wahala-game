/**
 * Generator Parts and the campaign-only upgrades (decisions PR1-PR8, docs/CAMPAIGN_GAMEPLAY_BIBLE.md section 2).
 *
 * Parts are never stored: they are DERIVED from the best stars the save already keeps for each eligible mission, so
 *   - a first clear pays `firstClear`, each better star pays `perExtraStar` once, and nothing else can pay;
 *   - replaying a cleared mission at the same or fewer stars pays nothing (no farming);
 *   - an old save that never knew about Parts gets exactly what its stars are worth, and a damaged save cannot invent any.
 * Only the upgrade levels bought are stored (`CampaignSave.upgrades`, optional: no save-version change). They are clamped
 * to the caps and refunded down to what the Parts can pay for when a save is repaired.
 *
 * Scope (PR2): the Oshodi missions only. Everything is data in `CAMPAIGN_PROGRESSION`; `enabled: false` turns the whole
 * slice off (no Parts, no shop, no bonus in missions) without touching a save.
 */
import type { LoadoutBonus, MissionId } from '../sim';
import { allSectionMissions, sectionOfMission } from './content';
import type { CampaignSave, CampaignUpgrades, UpgradeKind } from './types';

export const UPGRADE_KINDS: readonly UpgradeKind[] = ['capacity', 'range'];

export interface UpgradeDef {
  kind: UpgradeKind;
  name: string;
  /** One line for the shop: what a level does. */
  effect: string;
  /** Parts for each level, in order; the cap is `costs.length`. */
  costs: readonly number[];
}

export const CAMPAIGN_PROGRESSION = {
  /** The whole slice. False: no Parts shown, no shop, no bonus in any mission; saves are left as they are. */
  enabled: true,
  /** Districts whose missions earn Parts AND whose missions apply the upgrades (PR2: Oshodi only for now). */
  districts: ['oshodi'] as readonly MissionId[],
  parts: {
    /** Paid once, by the first win (every win is at least one star). */
    firstClear: 3,
    /** Paid once for each best-star step above one (2 stars: +1, 3 stars: +1 more). */
    perExtraStar: 1,
  },
  upgrades: {
    capacity: {
      kind: 'capacity',
      name: 'Generator capacity',
      effect: '+1 generator down at once (an Extra Socket still adds one more).',
      costs: [6],
    },
    range: {
      kind: 'range',
      name: 'Blast range',
      effect: '+1 blast range (Petrol and Diesel still build on it).',
      costs: [6],
    },
  } satisfies Record<UpgradeKind, UpgradeDef>,
} as const;

type Progression = {
  enabled: boolean;
  districts: readonly MissionId[];
  parts: { firstClear: number; perExtraStar: number };
  upgrades: Record<UpgradeKind, UpgradeDef>;
};

/** The configuration in use (tests pass their own). */
const DEFAULT: Progression = CAMPAIGN_PROGRESSION;

export const NO_UPGRADES: CampaignUpgrades = { capacity: 0, range: 0 };

/** Parts a mission is worth at these best stars (0 stars = never won = nothing). */
export function partsForStars(stars: number, cfg: Progression = DEFAULT): number {
  if (!(stars >= 1)) return 0;
  const s = Math.min(3, Math.floor(stars));
  return cfg.parts.firstClear + (s - 1) * cfg.parts.perExtraStar;
}

/** Every mission that earns Parts: the section missions (field, raid, boss) of the eligible districts, in play order. */
export function partsMissions(cfg: Progression = DEFAULT): string[] {
  if (!cfg.enabled) return [];
  return allSectionMissions()
    .filter((m) => cfg.districts.includes(sectionOfMission(m.id)?.districtId as MissionId))
    .map((m) => m.id);
}

/** The best stars the save holds for a section mission (the boss mission's live in `districts`). */
export function bestStarsOf(save: CampaignSave, missionId: string): number {
  const sec = sectionOfMission(missionId);
  if (!sec) return 0;
  if (missionId === `${sec.districtId}.boss`) return save.districts[sec.districtId]?.bestStars ?? 0;
  return save.missions[missionId]?.bestStars ?? 0;
}

/** Parts earned so far: derived from best stars, so it can only grow by first clears and better stars. */
export function partsEarned(save: CampaignSave, cfg: Progression = DEFAULT): number {
  return partsMissions(cfg).reduce((sum, id) => sum + partsForStars(bestStarsOf(save, id), cfg), 0);
}

export function upgradesOf(save: CampaignSave): CampaignUpgrades {
  return save.upgrades ?? NO_UPGRADES;
}

/** Parts the bought levels cost in total. */
export function partsSpent(upgrades: CampaignUpgrades, cfg: Progression = DEFAULT): number {
  return UPGRADE_KINDS.reduce(
    (sum, k) => sum + cfg.upgrades[k].costs.slice(0, upgrades[k]).reduce((a, b) => a + b, 0),
    0,
  );
}

export function partsAvailable(save: CampaignSave, cfg: Progression = DEFAULT): number {
  return Math.max(0, partsEarned(save, cfg) - partsSpent(upgradesOf(save), cfg));
}

export const upgradeCap = (kind: UpgradeKind, cfg: Progression = DEFAULT): number =>
  cfg.upgrades[kind].costs.length;

/** Parts the next level of `kind` costs, or null at the cap. */
export function nextCost(save: CampaignSave, kind: UpgradeKind, cfg: Progression = DEFAULT): number | null {
  const level = upgradesOf(save)[kind];
  return level < upgradeCap(kind, cfg) ? cfg.upgrades[kind].costs[level]! : null;
}

export function canBuy(save: CampaignSave, kind: UpgradeKind, cfg: Progression = DEFAULT): boolean {
  if (!cfg.enabled) return false;
  const cost = nextCost(save, kind, cfg);
  return cost !== null && cost <= partsAvailable(save, cfg);
}

/** Buys the next level of `kind`. Returns the same save when it cannot (cap, not enough Parts, slice off). */
export function buyUpgrade(
  save: CampaignSave,
  kind: UpgradeKind,
  now: number,
  cfg: Progression = DEFAULT,
): CampaignSave {
  if (!UPGRADE_KINDS.includes(kind) || !canBuy(save, kind, cfg)) return save;
  const current = upgradesOf(save);
  return { ...save, upgrades: { ...current, [kind]: current[kind] + 1 }, updatedAt: now };
}

/**
 * Repairs an untrusted `upgrades` value against a (repaired) save: whole numbers, clamped to the caps, and refunded
 * (range first, then capacity, top level first) until the Parts earned pay for them. Returns undefined when nothing is
 * bought, so a save that never bought anything keeps its exact old shape.
 */
export function repairUpgrades(
  raw: unknown,
  save: CampaignSave,
  cfg: Progression = DEFAULT,
): CampaignUpgrades | undefined {
  const src =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const level = (k: UpgradeKind): number => {
    const v = src[k];
    return typeof v === 'number' && Number.isFinite(v)
      ? Math.min(upgradeCap(k, cfg), Math.max(0, Math.floor(v)))
      : 0;
  };
  const out: CampaignUpgrades = { capacity: level('capacity'), range: level('range') };
  const earned = partsEarned(save, cfg);
  for (const k of ['range', 'capacity'] as const) {
    while (out[k] > 0 && partsSpent(out, cfg) > earned) out[k]--;
  }
  return out.capacity === 0 && out.range === 0 ? undefined : out;
}

/**
 * The bonus the human carries into a mission of `district`: the bought levels when the slice is on and the district is
 * eligible, otherwise undefined (no change to the mission). Raids, the Academy, Classic and Rumble never ask for one.
 */
export function loadoutBonusFor(
  save: CampaignSave,
  district: MissionId,
  cfg: Progression = DEFAULT,
): LoadoutBonus | undefined {
  if (!cfg.enabled || !cfg.districts.includes(district)) return undefined;
  const u = upgradesOf(save);
  return u.capacity === 0 && u.range === 0 ? undefined : { capacity: u.capacity, range: u.range };
}

/** Parts a result paid: the difference between two saves (never negative). */
export function partsGained(before: CampaignSave, after: CampaignSave, cfg: Progression = DEFAULT): number {
  return Math.max(0, partsEarned(after, cfg) - partsEarned(before, cfg));
}

/** Whether the Parts and the shop belong on this district's screens. */
export const progressionDistrict = (district: string, cfg: Progression = DEFAULT): boolean =>
  cfg.enabled && cfg.districts.includes(district as MissionId);

export type { Progression as CampaignProgressionConfig };
