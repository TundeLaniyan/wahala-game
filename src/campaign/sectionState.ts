/**
 * Section and mission status over a `CampaignSave` (docs/CAMPAIGN_SECTIONS.md): which sections and missions are
 * locked, available or cleared, which mission comes next, and the helpers progress.ts and save.ts share. Pure; it
 * imports content and types only (not progress.ts), so progress.ts can use it without a cycle.
 *
 * Only `cleared` is authoritative in the save. `available` and `locked` are derived (`sectionStatus`,
 * `missionStatus`) from the districts, the section order and the missions cleared; `refreshSections` writes the
 * derived values back so a reader of the raw save sees them, and repair (save.ts) can always recompute them.
 */
import type { MissionId } from '../sim';
import { MISSION_IDS } from '../sim';
import {
  CAMPAIGN,
  allSectionMissions,
  allSections,
  getSection,
  getSectionMission,
  sectionOfMission,
} from './content';
import type {
  CampaignSave,
  DistrictId,
  MissionProgress,
  RewardDef,
  SectionDef,
  SectionMissionDef,
  SectionProgress,
  SectionStatus,
} from './types';

export function freshMissionProgress(status: SectionStatus): MissionProgress {
  return { status, attempts: 0, clears: 0, bestStars: 0, bestSeconds: null };
}

export function freshSectionProgress(status: SectionStatus): SectionProgress {
  return { status, attempts: 0, clears: 0, bestStars: 0 };
}

/** Field and raid missions (the ones stored in `save.missions`); the boss mission lives in `save.districts`. */
export const isStoredMission = (m: SectionMissionDef): boolean => m.format !== 'boss';

/** Every stored (non-boss) mission of a district, in play order. */
export function storedMissionsOf(id: MissionId): SectionMissionDef[] {
  return CAMPAIGN.sections[id].flatMap((s) => s.missions).filter(isStoredMission);
}

// ---------------------------------------------------------------- district gate (no dependency on progress.ts)

function districtCleared(save: CampaignSave, id: DistrictId): boolean {
  return id === 'ojuelegba' || save.districts[id]?.status === 'cleared';
}

/** The same rule as `districtStatus(...) !== 'locked'`: cleared, or every required district cleared. */
function districtOpen(save: CampaignSave, id: DistrictId): boolean {
  if (districtCleared(save, id)) return true;
  return CAMPAIGN.districts[id].requires.every((r) => districtCleared(save, r));
}

// ---------------------------------------------------------------- derived status

const missionCleared = (save: CampaignSave, m: SectionMissionDef): boolean => {
  const sec = sectionOfMission(m.id);
  if (!sec) return false;
  if (districtCleared(save, sec.districtId)) return true;
  return m.format === 'boss' ? false : save.missions[m.id]?.status === 'cleared';
};

export function sectionStatus(save: CampaignSave, sectionId: string): SectionStatus {
  const s = getSection(sectionId);
  if (!s) return 'locked';
  if (districtCleared(save, s.districtId)) return 'cleared';
  if (!districtOpen(save, s.districtId)) return 'locked';
  if (s.missions.every((m) => missionCleared(save, m))) return 'cleared';
  return s.requires.every((r) => sectionStatus(save, r) === 'cleared') ? 'available' : 'locked';
}

export function missionStatus(save: CampaignSave, missionId: string): SectionStatus {
  const m = getSectionMission(missionId);
  const sec = sectionOfMission(missionId);
  if (!m || !sec) return 'locked';
  if (missionCleared(save, m)) return 'cleared';
  if (sectionStatus(save, sec.id) !== 'available') return 'locked';
  const i = sec.missions.indexOf(m);
  return sec.missions.slice(0, i).every((p) => missionCleared(save, p)) ? 'available' : 'locked';
}

/** May this mission be started right now? (Replaying a cleared one is allowed.) */
export const canPlayMission = (save: CampaignSave, missionId: string): boolean =>
  missionStatus(save, missionId) !== 'locked';

/** The boss mission of a district is playable only once its earlier sections are cleared (and the district is open). */
export function bossAvailable(save: CampaignSave, id: MissionId): boolean {
  return missionStatus(save, `${id}.boss`) !== 'locked';
}

export function sectionsCleared(save: CampaignSave, id: MissionId): number {
  return CAMPAIGN.sections[id].filter((s) => sectionStatus(save, s.id) === 'cleared').length;
}

export interface NextMission {
  districtId: MissionId;
  sectionId: string;
  missionId: string;
}

/**
 * Where "Continue" and a reopened campaign map go: the first mission, in campaign order, that is available and not
 * cleared. Null when every district is cleared or the next district is still locked behind an uncleared one.
 */
export function nextMission(save: CampaignSave): NextMission | null {
  for (const districtId of MISSION_IDS) {
    if (districtCleared(save, districtId)) continue;
    if (!districtOpen(save, districtId)) return null;
    for (const sec of CAMPAIGN.sections[districtId]) {
      if (sectionStatus(save, sec.id) === 'cleared') continue;
      const m = sec.missions.find((o) => missionStatus(save, o.id) === 'available');
      return m ? { districtId, sectionId: sec.id, missionId: m.id } : null;
    }
  }
  return null;
}

// ---------------------------------------------------------------- state construction and refresh

/** The `sections` and `missions` of a brand-new save: everything locked except what is derivable as available. */
export function initialSectionState(): Pick<CampaignSave, 'sections' | 'missions'> {
  const sections: Record<string, SectionProgress> = {};
  const missions: Record<string, MissionProgress> = {};
  for (const s of allSections()) sections[s.id] = freshSectionProgress('locked');
  for (const m of allSectionMissions())
    if (isStoredMission(m)) missions[m.id] = freshMissionProgress('locked');
  return { sections, missions };
}

function lowest(stars: number[]): 0 | 1 | 2 | 3 {
  return (stars.length === 0 ? 0 : Math.min(...stars)) as 0 | 1 | 2 | 3;
}

/** Writes the derived statuses (and each cleared section's stars) back into the save. Returns a new save. */
export function refreshSections(save: CampaignSave): CampaignSave {
  const sections: Record<string, SectionProgress> = {};
  const missions: Record<string, MissionProgress> = {};
  for (const m of allSectionMissions()) {
    if (!isStoredMission(m)) continue;
    const old = save.missions[m.id] ?? freshMissionProgress('locked');
    missions[m.id] = { ...old, status: missionStatus(save, m.id) };
  }
  const probe: CampaignSave = { ...save, missions };
  for (const s of allSections()) {
    const old = save.sections[s.id] ?? freshSectionProgress('locked');
    const status = sectionStatus(probe, s.id);
    const stars =
      status === 'cleared'
        ? lowest(
            s.missions.map((m) =>
              m.format === 'boss'
                ? (save.districts[s.districtId]?.bestStars ?? 0)
                : (missions[m.id]?.bestStars ?? 0),
            ),
          )
        : 0;
    sections[s.id] = { ...old, status, bestStars: stars };
  }
  return { ...save, sections, missions };
}

/** The section-mission rewards a save has earned: one for every stored mission that is cleared. */
export function earnedSectionRewards(save: CampaignSave): RewardDef[] {
  return allSectionMissions()
    .filter((m) => isStoredMission(m) && m.reward && missionStatus(save, m.id) === 'cleared')
    .map((m) => m.reward!);
}

/**
 * A district was cleared (its boss fell, or an older save said so): every field and raid mission of it counts as
 * cleared too, so nothing the player had is lost and the invariant "a cleared district has cleared sections" holds.
 * Returns the new save and the section rewards that this paid for the first time.
 */
export function clearDistrictSections(
  save: CampaignSave,
  id: MissionId,
): { save: CampaignSave; newRewards: RewardDef[] } {
  const missions = { ...save.missions };
  const newRewards: RewardDef[] = [];
  for (const m of storedMissionsOf(id)) {
    const old = missions[m.id] ?? freshMissionProgress('locked');
    if (old.status === 'cleared') continue;
    missions[m.id] = {
      ...old,
      status: 'cleared',
      clears: Math.max(1, old.clears),
      attempts: Math.max(1, old.attempts),
      bestStars: Math.max(1, old.bestStars) as 1 | 2 | 3,
    };
    if (m.reward) newRewards.push(m.reward);
  }
  const sections = { ...save.sections };
  for (const s of CAMPAIGN.sections[id]) {
    const old = sections[s.id] ?? freshSectionProgress('locked');
    sections[s.id] = {
      ...old,
      status: 'cleared',
      clears: Math.max(1, old.clears),
      attempts: Math.max(1, old.attempts),
    };
  }
  const rewards = [...new Set([...save.sectionRewards, ...newRewards.map((r) => r.id)])];
  return { save: { ...save, missions, sections, sectionRewards: rewards }, newRewards };
}

export type { SectionDef };
