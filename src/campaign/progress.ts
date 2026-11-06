/**
 * Pure campaign progress logic: no storage, no DOM, no clock (callers pass `now`). Every function returns a NEW
 * save and never mutates its input. Rewards, unlocks and story flags are derived from the districts that are
 * cleared, so a save can always be repaired (see save.ts) without losing a paid reward.
 */
import type {
  CampaignLevel,
  CharacterId,
  Difficulty,
  MissionId,
  MissionModifierId,
  MissionOutcome,
} from '../sim';
import {
  CHARACTER_IDS,
  DEFAULT_CAMPAIGN_LEVEL,
  DIFFICULTIES,
  MISSION_IDS,
  MODIFIER_FOR,
  isCampaignLevel,
} from '../sim';
import { CAMPAIGN, FINALE_UNLOCK, MODIFIER_IDS, nextDistrict } from './content';
import { clearDistrictSections, initialSectionState, refreshSections } from './sectionState';
import type { CampaignSave, DistrictId, DistrictProgress, DistrictStatus, RewardDef } from './types';
import { DISTRICT_ORDER } from './types';

export const CAMPAIGN_DISTRICT_TOTAL = 6 as const;

export function freshProgress(status: DistrictStatus): DistrictProgress {
  return {
    status,
    attempts: 0,
    clears: 0,
    bestStars: 0,
    bestSeconds: null,
    introSeen: false,
    modifiersCleared: [],
  };
}

function isMissionId(id: string): id is MissionId {
  return (MISSION_IDS as readonly string[]).includes(id);
}

function isModifierId(id: unknown): id is MissionModifierId {
  return typeof id === 'string' && (MODIFIER_IDS as readonly string[]).includes(id);
}

function union(a: readonly string[], b: readonly string[]): string[] {
  return [...new Set([...a, ...b])];
}

/** The story flags a cleared district sets (the `.cleared` flag plus its boss consequence flags). */
export function flagsForClear(id: DistrictId): string[] {
  const boss = CAMPAIGN.districts[id].boss;
  return [`${id}.cleared`, ...(boss?.consequenceFlags ?? [])];
}

/** Everything a first clear of this district grants. */
export function grantsForClear(id: DistrictId): {
  reward: RewardDef | null;
  unlocks: string[];
  flags: string[];
} {
  const reward = CAMPAIGN.districts[id].boss?.reward ?? null;
  const next = nextDistrict(id);
  const unlocks = union(reward?.unlocks ?? [], next ? [`district.${next}`] : []);
  return { reward, unlocks, flags: flagsForClear(id) };
}

/** A brand-new save: Ojuelegba (the hub) cleared, Oshodi open, everything else locked. */
export function createSave(now: number): CampaignSave {
  const districts = {} as Record<DistrictId, DistrictProgress>;
  for (const id of DISTRICT_ORDER) {
    districts[id] = freshProgress(id === 'ojuelegba' ? 'cleared' : id === 'oshodi' ? 'available' : 'locked');
  }
  return refreshSections({
    version: 2,
    startedAt: now,
    updatedAt: now,
    prologueSeen: false,
    districts,
    rewards: [],
    unlocks: [],
    completed: false,
    flags: [],
    character: CHARACTER_IDS[0]!,
    difficulty: 'rookie',
    campaignLevel: DEFAULT_CAMPAIGN_LEVEL,
    ...initialSectionState(),
    sectionRewards: [],
  });
}

/** Status as the campaign map should show it: `cleared` is stored, `available` is derived from `requires`. */
export function districtStatus(save: CampaignSave, id: DistrictId): DistrictStatus {
  const p = save.districts[id];
  if (!p) return 'locked';
  if (id === 'ojuelegba' || p.status === 'cleared') return 'cleared';
  const requires = CAMPAIGN.districts[id].requires;
  return requires.every((r) => save.districts[r]?.status === 'cleared' || r === 'ojuelegba')
    ? 'available'
    : 'locked';
}

function clearedCount(save: CampaignSave): number {
  return MISSION_IDS.filter((id) => districtStatus(save, id) === 'cleared').length;
}

export function campaignProgress(save: CampaignSave): { cleared: number; total: 6; percent: number } {
  const cleared = clearedCount(save);
  return {
    cleared,
    total: CAMPAIGN_DISTRICT_TOTAL,
    percent: Math.round((cleared / CAMPAIGN_DISTRICT_TOTAL) * 100),
  };
}

/** All six bosses are down: the finale scene can be played (and replayed). */
export function finaleAvailable(save: CampaignSave): boolean {
  return clearedCount(save) === CAMPAIGN_DISTRICT_TOTAL;
}

export interface MissionResultSummary {
  save: CampaignSave;
  newRewards: RewardDef[];
  newUnlocks: string[];
  unlockedDistricts: DistrictId[];
  /** True exactly when THIS result cleared the sixth district (the finale just became available). */
  campaignComplete: boolean;
  firstClear: boolean;
  /** Section mission rewards this first clear paid for the sections the boss win counted as cleared (usually none). */
  newSectionRewards?: RewardDef[];
}

/**
 * Applies a finished mission. A loss or timeout only counts an attempt. A win counts a clear, keeps the best
 * stars and time, records the replay modifiers it used (only when `outcome.modifiers` is non-empty), and on the
 * FIRST clear pays the boss reward once, sets the consequence flags and opens the next district. A result for a
 * still-locked district is ignored (the UI never starts one).
 */
export function applyMissionResult(
  save: CampaignSave,
  outcome: MissionOutcome,
  now: number,
): MissionResultSummary {
  const id = outcome.missionId;
  const unchanged: MissionResultSummary = {
    save,
    newRewards: [],
    newUnlocks: [],
    unlockedDistricts: [],
    campaignComplete: false,
    firstClear: false,
  };
  if (outcome.sectionMissionId) return unchanged; // a section field mission: applySectionResult
  if (!isMissionId(id) || !save.districts[id] || districtStatus(save, id) === 'locked') return unchanged;

  const before = save.districts[id];
  const districts = { ...save.districts };
  const won = outcome.result === 'won';
  const wasCleared = before.status === 'cleared';
  const wasComplete = finaleAvailable(save);

  const progress: DistrictProgress = { ...before, attempts: before.attempts + 1 };
  const next: CampaignSave = { ...save, districts, updatedAt: now };

  if (!won) {
    districts[id] = progress;
    return { ...unchanged, save: next };
  }

  progress.clears = before.clears + 1;
  progress.status = 'cleared';
  const stars = Math.min(3, Math.max(1, Math.floor(outcome.stars || 1))) as 1 | 2 | 3;
  progress.bestStars = Math.max(before.bestStars, stars) as 0 | 1 | 2 | 3;
  if (Number.isFinite(outcome.seconds) && outcome.seconds >= 0) {
    progress.bestSeconds =
      before.bestSeconds === null ? outcome.seconds : Math.min(before.bestSeconds, outcome.seconds);
  }
  const used = (outcome.modifiers ?? []).filter(isModifierId);
  if (used.length > 0)
    progress.modifiersCleared = union(before.modifiersCleared, used) as MissionModifierId[];
  districts[id] = progress;

  const firstClear = !wasCleared;
  const newRewards: RewardDef[] = [];
  const newUnlocks: string[] = [];
  const unlockedDistricts: DistrictId[] = [];

  if (firstClear) {
    const grants = grantsForClear(id);
    if (grants.reward && !save.rewards.includes(grants.reward.id)) {
      newRewards.push(grants.reward);
      next.rewards = [...save.rewards, grants.reward.id];
    }
    const freshUnlocks = grants.unlocks.filter((u) => !save.unlocks.includes(u));
    newUnlocks.push(...freshUnlocks);
    next.unlocks = union(save.unlocks, grants.unlocks);
    next.flags = union(save.flags, grants.flags);

    const following = nextDistrict(id);
    if (following && districts[following] && districts[following].status === 'locked') {
      districts[following] = { ...districts[following], status: 'available' };
      unlockedDistricts.push(following);
    }
  }

  // a cleared district counts all its sections as cleared (a boss win normally comes after them; this keeps the
  // invariant for older saves and direct results, and pays any section reward not yet earned)
  let sectionRewards: RewardDef[] = [];
  let saved = next;
  if (firstClear) {
    const swept = clearDistrictSections(next, id);
    saved = swept.save;
    sectionRewards = swept.newRewards;
  }
  return {
    save: refreshSections(saved),
    newRewards,
    newUnlocks,
    unlockedDistricts,
    campaignComplete: !wasComplete && finaleAvailable(next),
    firstClear,
    ...(sectionRewards.length > 0 ? { newSectionRewards: sectionRewards } : {}),
  };
}

function withDistrict(
  save: CampaignSave,
  id: DistrictId,
  patch: Partial<DistrictProgress>,
  now: number,
): CampaignSave {
  const current = save.districts[id];
  if (!current) return save;
  return { ...save, updatedAt: now, districts: { ...save.districts, [id]: { ...current, ...patch } } };
}

export function markIntroSeen(save: CampaignSave, id: DistrictId, now: number): CampaignSave {
  return withDistrict(save, id, { introSeen: true }, now);
}

export function markPrologueSeen(save: CampaignSave, now: number): CampaignSave {
  return save.prologueSeen ? save : { ...save, prologueSeen: true, updatedAt: now };
}

/** The finale was watched. Ignored (returns the same save) until all six districts are cleared. */
export function completeCampaign(save: CampaignSave, now: number): CampaignSave {
  if (!finaleAvailable(save) || save.completed) return save;
  return { ...save, completed: true, flags: union(save.flags, ['campaign.completed']), updatedAt: now };
}

/** A district's replay modifier unlocks after its first clear (it is a rule tweak, never a requirement). */
export function availableModifiers(save: CampaignSave, id: MissionId): MissionModifierId[] {
  const p = save.districts[id];
  return p && p.clears > 0 && districtStatus(save, id) === 'cleared' ? [MODIFIER_FOR[id]] : [];
}

/** Chooses the fighter and bot level for the next mission; invalid values are ignored. */
export function setLoadout(
  save: CampaignSave,
  loadout: { character?: CharacterId; difficulty?: Difficulty },
  now: number,
): CampaignSave {
  const character =
    loadout.character && (CHARACTER_IDS as readonly string[]).includes(loadout.character)
      ? loadout.character
      : save.character;
  const difficulty =
    loadout.difficulty && (DIFFICULTIES as readonly string[]).includes(loadout.difficulty)
      ? loadout.difficulty
      : save.difficulty;
  if (character === save.character && difficulty === save.difficulty) return save;
  return { ...save, character, difficulty, updatedAt: now };
}

/**
 * Changes the campaign difficulty. Pure (callers decide WHEN: the controller allows it only outside a live mission).
 * Progress, stars, rewards and flags are untouched: the level never changes what is cleared or earned.
 */
export function setCampaignLevel(save: CampaignSave, level: CampaignLevel, now: number): CampaignSave {
  if (!isCampaignLevel(level) || level === save.campaignLevel) return save;
  return { ...save, campaignLevel: level, updatedAt: now };
}

/** Is a reward-granted fighter content id (costume, title, perk, modifier, district, finale) unlocked? */
export function isUnlockedFighterContent(save: CampaignSave, unlockId: string): boolean {
  return save.unlocks.includes(unlockId);
}

export { FINALE_UNLOCK };
