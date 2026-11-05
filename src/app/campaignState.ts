/**
 * The campaign's slice of the UI store (`UiState.campaign`, owned by app/campaign.ts). Types and pure helpers
 * only, so the store can import it without a cycle. The save itself is `CampaignSave` (src/campaign); the rest
 * is what the screens need between two commands.
 */
import type { CampaignSave, DistrictId, RewardDef, SectionResultSummary } from '../campaign';
import { DISTRICT_ORDER, districtStatus } from '../campaign';
import type { MissionId, MissionModifierId, MissionOutcome, RaidId, RaidOutcome } from '../sim';

export type StoryKind = 'prologue' | 'finale';

/** What a finished mission paid, for the result screen and the map's "new" badges. */
export interface RewardSummary {
  rewards: RewardDef[];
  unlocks: string[];
  unlockedDistricts: DistrictId[];
  firstClear: boolean;
  /** This result cleared the sixth district: the finale just became available. */
  campaignComplete: boolean;
}

export interface MissionResultView {
  outcome: MissionOutcome;
  reward: RewardSummary;
}

/** What a finished section mission (a field mission or a standalone raid) hands the result screen. */
export interface SectionResultView {
  /** The section mission id ("oshodi.approach"). */
  missionId: string;
  kind: 'field' | 'raid';
  outcome: MissionOutcome | RaidOutcome;
  summary: SectionResultSummary;
}

/** The mission being played right now (null in the menus). */
export interface ActiveMission {
  missionId: MissionId;
  modifiers: MissionModifierId[];
  /** Set for a section mission (the field mission or standalone raid); absent for the boss mission. */
  sectionMissionId?: string;
  /** Set while a raid is in play: the door of the field mission it came from (null: a standalone raid). */
  raid?: { doorId: string | null; raidId: RaidId } | null;
}

export interface CampaignUi {
  save: CampaignSave;
  /** A campaign exists (a save was loaded or New Campaign was pressed); false shows the "start" card. */
  started: boolean;
  /** 'unavailable' = localStorage is missing or blocked: progress lives in memory only. */
  storage: 'ok' | 'unavailable';
  /** A small notice for the map ("your save could not be read ..."), or null. */
  notice: string | null;
  /** The district highlighted on the map / opened by the briefing. */
  selected: DistrictId;
  /** The replay modifier chosen in the briefing (must be unlocked), or null. */
  modifier: MissionModifierId | null;
  /** Which cutscene the story screen plays. */
  story: StoryKind;
  active: ActiveMission | null;
  /** The mission result being shown (null outside the result screen). */
  result: MissionResultView | null;
  /** A section mission's result (the same result screen shows it); null otherwise. */
  sectionResult: SectionResultView | null;
  /** The last result that paid something new (kept for the map after the result screen). */
  lastReward: RewardSummary | null;
}

/** The district a "Continue" opens: the first mission not yet cleared, or the last one when all are. */
export function defaultDistrict(save: CampaignSave): DistrictId {
  const next = DISTRICT_ORDER.find((id) => id !== 'ojuelegba' && districtStatus(save, id) !== 'cleared');
  return next ?? DISTRICT_ORDER[DISTRICT_ORDER.length - 1]!;
}

export function freshCampaignUi(save: CampaignSave, p: Partial<Omit<CampaignUi, 'save'>> = {}): CampaignUi {
  return {
    save,
    started: false,
    storage: 'ok',
    notice: null,
    selected: defaultDistrict(save),
    modifier: null,
    story: 'prologue',
    active: null,
    result: null,
    sectionResult: null,
    lastReward: null,
    ...p,
  };
}
