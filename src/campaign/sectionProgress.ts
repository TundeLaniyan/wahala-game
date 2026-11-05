/**
 * Pure reducers for the field and raid missions of a section (docs/CAMPAIGN_SECTIONS.md), with the same safety as
 * `applyMissionResult`: a loss or timeout only counts an attempt, a result for a locked mission is ignored, the
 * reward is paid once (on the first clear), best stars and time are kept, and a mid-mission state is never saved
 * (only finished results reach these functions). Each returns a NEW save.
 */
import type { MissionOutcome, RaidOutcome } from '../sim';
import {
  allSectionMissions,
  allSections,
  getSection,
  getSectionMission,
  missionByRef,
  sectionOfMission,
} from './content';
import {
  freshMissionProgress,
  freshSectionProgress,
  missionStatus,
  refreshSections,
  sectionStatus,
} from './sectionState';
import type { CampaignSave, MissionProgress, RewardDef, SectionMissionDef } from './types';

export interface SectionResultSummary {
  save: CampaignSave;
  missionId: string | null;
  sectionId: string | null;
  firstClear: boolean;
  newRewards: RewardDef[];
  /** THIS result cleared the section for the first time. */
  sectionCleared: boolean;
  /** Sections this result opened (the next one, or the boss section). */
  unlockedSections: string[];
  /** Missions this result opened inside its section or the next. */
  unlockedMissions: string[];
  /** The boss mission just became playable. */
  bossUnlocked: boolean;
}

const ignored = (save: CampaignSave): SectionResultSummary => ({
  save,
  missionId: null,
  sectionId: null,
  firstClear: false,
  newRewards: [],
  sectionCleared: false,
  unlockedSections: [],
  unlockedMissions: [],
  bossUnlocked: false,
});

function clampStars(stars: number): 1 | 2 | 3 {
  return Math.min(3, Math.max(1, Math.floor(Number.isFinite(stars) ? stars || 1 : 1))) as 1 | 2 | 3;
}

function apply(
  save: CampaignSave,
  def: SectionMissionDef,
  won: boolean,
  stars: number,
  seconds: number,
  now: number,
): SectionResultSummary {
  const sec = sectionOfMission(def.id)!;
  const before = save.missions[def.id] ?? freshMissionProgress('locked');
  const wasCleared = missionStatus(save, def.id) === 'cleared';
  const sectionBefore = save.sections[sec.id] ?? freshSectionProgress('locked');
  const sectionWasCleared = sectionStatus(save, sec.id) === 'cleared';

  const progress: MissionProgress = { ...before, attempts: before.attempts + 1 };
  const missions = { ...save.missions, [def.id]: progress };
  const sections = {
    ...save.sections,
    [sec.id]: { ...sectionBefore, attempts: sectionBefore.attempts + 1 },
  };
  let next: CampaignSave = { ...save, missions, sections, updatedAt: now };

  const newRewards: RewardDef[] = [];
  if (won) {
    progress.status = 'cleared';
    progress.clears = before.clears + 1;
    progress.bestStars = Math.max(before.bestStars, clampStars(stars)) as 1 | 2 | 3;
    if (Number.isFinite(seconds) && seconds >= 0)
      progress.bestSeconds = before.bestSeconds === null ? seconds : Math.min(before.bestSeconds, seconds);
    if (!wasCleared && def.reward && !save.sectionRewards.includes(def.reward.id)) {
      newRewards.push(def.reward);
      next = { ...next, sectionRewards: [...save.sectionRewards, def.reward.id] };
    }
  }

  const bossBefore = missionStatus(save, `${sec.districtId}.boss`);
  const openSections = new Set(
    allSections()
      .filter((o) => sectionStatus(save, o.id) !== 'locked')
      .map((o) => o.id),
  );
  const openMissions = new Set(
    allSectionMissions()
      .filter((o) => missionStatus(save, o.id) !== 'locked')
      .map((o) => o.id),
  );
  next = refreshSections(next);
  const sectionCleared = !sectionWasCleared && sectionStatus(next, sec.id) === 'cleared';
  if (sectionCleared) {
    const s = next.sections[sec.id]!;
    next = { ...next, sections: { ...next.sections, [sec.id]: { ...s, clears: s.clears + 1 } } };
  }
  const unlockedSections = allSections()
    .filter((o) => sectionStatus(next, o.id) === 'available' && !openSections.has(o.id))
    .map((o) => o.id);
  const unlockedMissions = allSectionMissions()
    .filter((o) => missionStatus(next, o.id) === 'available' && !openMissions.has(o.id))
    .map((o) => o.id);
  return {
    save: next,
    missionId: def.id,
    sectionId: sec.id,
    firstClear: won && !wasCleared,
    newRewards,
    sectionCleared,
    unlockedSections,
    unlockedMissions,
    bossUnlocked: bossBefore === 'locked' && missionStatus(next, `${sec.districtId}.boss`) === 'available',
  };
}

/**
 * A finished SECTION FIELD mission (`outcome.sectionMissionId` set). Boss outcomes, unknown missions and locked ones
 * are ignored (the save is returned unchanged).
 */
export function applySectionResult(
  save: CampaignSave,
  outcome: MissionOutcome,
  now: number,
): SectionResultSummary {
  const ref = outcome.sectionMissionId;
  if (!ref) return ignored(save);
  const def = missionByRef('field', ref);
  if (!def || sectionOfMission(def.id)?.districtId !== outcome.missionId) return ignored(save);
  if (missionStatus(save, def.id) === 'locked') return ignored(save);
  return apply(save, def, outcome.result === 'won', outcome.stars, outcome.seconds, now);
}

/** A finished STANDALONE raid (a section mission with format 'raid'). Door raids belong to their field mission. */
export function applyRaidResult(
  save: CampaignSave,
  missionId: string,
  outcome: RaidOutcome,
  now: number,
): SectionResultSummary {
  const def = getSectionMission(missionId);
  if (!def || def.format !== 'raid' || def.missionRef !== outcome.raidId) return ignored(save);
  if (missionStatus(save, def.id) === 'locked') return ignored(save);
  return apply(save, def, outcome.result === 'completed', outcome.stars, outcome.seconds, now);
}

export { getSection };
