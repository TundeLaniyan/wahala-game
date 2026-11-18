/**
 * Pure view model of a district's sections for the campaign map and the section result (unit-tested without React).
 * Everything comes from the section content and the save; nothing is invented.
 */
import {
  CAMPAIGN,
  finaleAvailable,
  getSectionMission,
  missionStatus,
  nextMission,
  sectionOfMission,
  sectionStatus,
  sectionsOf,
} from '../../campaign';
import type { CampaignSave, SectionMissionFormat, SectionStatus } from '../../campaign';
import type { MissionId } from '../../sim';
import type { SectionResultView } from '../../app/campaignState';

export const FORMAT_LABEL: Readonly<Record<SectionMissionFormat, string>> = {
  field: 'Field mission',
  raid: 'Raid',
  boss: 'Boss',
};

export const SECTION_STATUS_LABEL: Readonly<Record<SectionStatus, string>> = {
  locked: 'Locked',
  available: 'Open',
  cleared: 'Reclaimed',
};

export interface MissionRow {
  id: string;
  name: string;
  objectiveCard: string;
  format: SectionMissionFormat;
  status: SectionStatus;
  stars: 0 | 1 | 2 | 3;
  doors: number;
  /** This is the mission "Continue" would start. */
  suggested: boolean;
}

export interface SectionRow {
  id: string;
  order: 1 | 2 | 3;
  name: string;
  summary: string;
  status: SectionStatus;
  missions: MissionRow[];
}

/** The sections of a district as the map lists them, with the suggested next mission marked. */
export function sectionRows(save: CampaignSave, id: MissionId): SectionRow[] {
  const next = nextMission(save)?.missionId ?? null;
  return sectionsOf(id).map((s) => ({
    id: s.id,
    order: s.order,
    name: s.name,
    summary: s.summary,
    status: sectionStatus(save, s.id),
    missions: s.missions.map((m) => ({
      id: m.id,
      name: m.name,
      objectiveCard: m.objectiveCard,
      format: m.format,
      status: missionStatus(save, m.id),
      stars:
        m.format === 'boss'
          ? (save.districts[id]?.bestStars ?? 0)
          : ((save.missions[m.id]?.bestStars ?? 0) as 0 | 1 | 2 | 3),
      doors: m.doors?.length ?? 0,
      suggested: m.id === next,
    })),
  }));
}

/** "Sections reclaimed: 1 of 3" for the district card. */
export function sectionsText(save: CampaignSave, id: MissionId): string {
  const rows = sectionRows(save, id);
  return `${rows.filter((s) => s.status === 'cleared').length} of ${rows.length} sections reclaimed`;
}

/** The mission "Continue" starts, for the map's button label and hint; null when there is none. */
export function suggestedMission(
  save: CampaignSave,
): { id: string; name: string; format: SectionMissionFormat } | null {
  const next = nextMission(save);
  const def = next ? getSectionMission(next.missionId) : undefined;
  return def ? { id: def.id, name: def.name, format: def.format } : null;
}

export interface SectionResultText {
  title: string;
  kicker: string;
  won: boolean;
  /** Plain lines under the title: what was won or what went wrong. */
  lines: string[];
  /** Names of the sections / the boss this result opened. */
  opened: string[];
}

/** Wording of a section result (field mission or standalone raid). */
export function sectionResultText(view: SectionResultView): SectionResultText {
  const def = getSectionMission(view.missionId);
  const name = def?.name ?? 'Mission';
  const won = view.outcome.result === 'won' || view.outcome.result === 'completed';
  const opened = view.summary.unlockedSections
    .map((id) => sectionsOf(id.split('.')[0] as MissionId).find((s) => s.id === id)?.name)
    .filter((n): n is string => Boolean(n));
  if (view.summary.bossUnlocked) opened.push('the boss');
  const lines: string[] = [];
  if (won) {
    if (view.summary.sectionCleared) lines.push('Section reclaimed.');
    if (def?.ringWeakened) lines.push(`Ring weakened: ${def.ringWeakened}`);
    for (const r of view.summary.newRewards) lines.push(`${r.name}: ${r.description}`);
    if ('raidBonus' in view.outcome && (view.outcome.raidBonus ?? 0) > 0)
      lines.push('A three-star raid on the way earned the bonus.');
  } else if (view.outcome.result === 'timeout')
    lines.push('Time ran out. The section keeps its hold: go again.');
  else lines.push('The mission was lost. Nothing is lost from your progress: try again.');
  return {
    title: won ? `${name} done` : view.outcome.result === 'timeout' ? 'Out of time' : 'Not this time',
    kicker: def ? FORMAT_LABEL[def.format] : 'Mission',
    won,
    lines,
    opened,
  };
}

// ---------------------------------------------------------------- world-state feedback (decision PR14)

/** The one short "what the Ring lost" line of a section mission (field, raid or boss); null when it has none. */
export function ringLostLine(missionId: string): string | null {
  return getSectionMission(missionId)?.ringWeakened ?? null;
}

/**
 * The next reason to continue, after any result: the mission Continue would start (its district and objective), the
 * finale once all six districts are cleared, or null when the campaign is complete.
 */
export function upNextLine(save: CampaignSave): string | null {
  const next = nextMission(save);
  const def = next ? getSectionMission(next.missionId) : undefined;
  if (next && def) {
    const district = CAMPAIGN.districts[next.districtId].name;
    return def.format === 'boss'
      ? `Up next: ${def.name}, the keeper of ${district}. ${def.objectiveCard}`
      : `Up next: ${def.name} in ${district}. ${def.objectiveCard}`;
  }
  return finaleAvailable(save) && !save.completed ? 'Up next: the finale.' : null;
}

export interface DistrictLiberation {
  /** Sections reclaimed (0..total). */
  reclaimed: number;
  total: number;
  /** The boss is beaten: the district is free of the Ring. */
  freed: boolean;
  /** "What the Ring lost" lines of every mission won here, in play order. */
  losses: string[];
}

/** How far a district is reclaimed, derived from the save only (no world-state engine). */
export function districtLiberation(save: CampaignSave, id: MissionId): DistrictLiberation {
  const sections = sectionsOf(id);
  const losses = sections
    .flatMap((s) => s.missions)
    .filter((m) => missionStatus(save, m.id) === 'cleared' && m.ringWeakened)
    .map((m) => m.ringWeakened!);
  return {
    reclaimed: sections.filter((s) => sectionStatus(save, s.id) === 'cleared').length,
    total: sections.length,
    freed: save.districts[id]?.status === 'cleared',
    losses,
  };
}

/** The district a section mission belongs to (for the result screens). */
export const districtOfMission = (missionId: string): MissionId | null =>
  sectionOfMission(missionId)?.districtId ?? null;
