/** All campaign content, assembled. Pure data (see docs/CAMPAIGN_STORY.md). */
import type { MissionId, MissionModifierId } from '../../sim';
import { CAMPAIGN_MISSION_IDS, FINALE_MISSION_ID, MISSION_IDS, MODIFIER_FOR } from '../../sim';
import type {
  BossDef,
  CampaignContent,
  DistrictContent,
  DistrictId,
  ReplayModifierDef,
  RewardDef,
  SectionDef,
  SectionMissionDef,
  StoryLine,
} from '../types';
import { DISTRICT_ORDER } from '../types';
import { EBUTE_METTA } from './ebuteMetta';
import { FINALE_CHAPTER } from './finale';
import { FACTIONS } from './factions';
import { FADEYI_SOMOLU } from './fadeyiSomolu';
import { LAGOS_ISLAND } from './lagosIsland';
import { LEKKI } from './lekki';
import { MUSHIN } from './mushin';
import { OJUELEGBA } from './ojuelegba';
import { OSHODI } from './oshodi';
import { SECTIONS, allSectionMissions, allSections } from './sections';
import { BROKER, ENDING, FINALE, PROLOGUE } from './story';

export { BROKER, ENDING, FINALE, PROLOGUE } from './story';
export { FINALE_CHAPTER, FINALE_SECTIONS, INTERIM, LANDLORD } from './finale';
export { FACTIONS, FACTION_IDS, NPC_ROLE_INFO } from './factions';
export { SECTIONS, allSectionMissions, allSections } from './sections';

export const CAMPAIGN: CampaignContent = {
  broker: BROKER,
  districts: {
    ojuelegba: OJUELEGBA,
    oshodi: OSHODI,
    mushin: MUSHIN,
    fadeyiSomolu: FADEYI_SOMOLU,
    ebuteMetta: EBUTE_METTA,
    lagosIsland: LAGOS_ISLAND,
    lekki: LEKKI,
  },
  sections: SECTIONS,
  finaleChapter: FINALE_CHAPTER,
  factions: { ...FACTIONS },
  prologue: PROLOGUE,
  finale: FINALE,
  ending: ENDING,
};

/** The unlock id that opens the finale scene (given by the last boss reward). */
export const FINALE_UNLOCK = 'finale.unlocked';

/** Districts in campaign order. */
export function districtList(): DistrictContent[] {
  return DISTRICT_ORDER.map((id) => CAMPAIGN.districts[id]);
}

/** The six district bosses in campaign order (the finale's enforcer is `finaleBoss()`). */
export function bossList(): BossDef[] {
  return MISSION_IDS.map((id) => CAMPAIGN.districts[id].boss!);
}

/** The Ojuelegba finale's territorial enforcer (working title, provisional: decision FN8). */
export function finaleBoss(content: CampaignContent = CAMPAIGN): BossDef {
  return content.finaleChapter!.boss;
}

/** The boss of a mission district: a district's keeper, or the finale's enforcer for `ojuelegba` (the hub has none). */
export function bossFor(id: MissionId, content: CampaignContent = CAMPAIGN): BossDef {
  return id === FINALE_MISSION_ID ? finaleBoss(content) : content.districts[id].boss!;
}

/** Every boss of the campaign: the six keepers, then the finale's enforcer. */
export function campaignBosses(): BossDef[] {
  return CAMPAIGN_MISSION_IDS.map((id) => bossFor(id));
}

/** The briefing of a mission's boss fight (the hub keeps its own briefing; the finale has the chapter's). */
export function bossBriefingOf(
  id: DistrictId,
  content: CampaignContent = CAMPAIGN,
): DistrictContent['briefing'] {
  return id === FINALE_MISSION_ID && content.finaleChapter
    ? content.finaleChapter.briefing
    : content.districts[id].briefing;
}

/** The district that opens after this one is cleared; null for the last. */
export function nextDistrict(id: DistrictId): DistrictId | null {
  const i = DISTRICT_ORDER.indexOf(id);
  return i >= 0 && i + 1 < DISTRICT_ORDER.length ? DISTRICT_ORDER[i + 1]! : null;
}

/** Defeat scene for this boss, honouring the sim's `defeat` kind (falls back to the standard scene). */
export function defeatLines(boss: BossDef, defeat: 'eliminated' | 'ousted' | null): StoryLine[] {
  return defeat === 'ousted' && boss.defeatSequenceOusted?.length
    ? boss.defeatSequenceOusted
    : boss.defeatSequence;
}

/** Every boss reward, in campaign order. */
export function allRewards(): RewardDef[] {
  return bossList().map((b) => b.reward);
}

/** Every replay modifier, in campaign order. */
export function allReplayModifiers(): ReplayModifierDef[] {
  return bossList().map((b) => b.replayModifier);
}

export function replayModifierFor(id: MissionId): ReplayModifierDef {
  return bossFor(id).replayModifier;
}

/** Every replay modifier id, the finale's included (curfew, provisional: FN6). */
export const MODIFIER_IDS: readonly MissionModifierId[] = CAMPAIGN_MISSION_IDS.map((id) => MODIFIER_FOR[id]);

/** Every reward id (`reward.*`). */
export function allRewardIds(): string[] {
  return allRewards().map((r) => r.id);
}

/** Every unlock id a reward can grant (costumes, titles, perks, modifiers, districts, the finale). */
export function allUnlockIds(): string[] {
  return [...new Set(allRewards().flatMap((r) => r.unlocks ?? []))];
}

/** Unlock ids of a kind: 'costume' | 'title' | 'perk' | 'modifier' | 'district' | 'finale'. */
export function unlockIdsOfKind(kind: string): string[] {
  return allUnlockIds().filter((u) => u.startsWith(`${kind}.`));
}

/** Story flags the consequences can set (plus the per-district `.cleared` flags and `campaign.completed`). */
export function allFlags(): string[] {
  const flags = campaignBosses().flatMap((b) => b.consequenceFlags ?? []);
  return [...new Set([...flags, ...DISTRICT_ORDER.map((d) => `${d}.cleared`), 'campaign.completed'])];
}

// ---------------------------------------------------------------- sections

/** The three sections of a mission district (or of the Ojuelegba finale), in order. */
export function sectionsOf(id: MissionId): SectionDef[] {
  return CAMPAIGN.sections[id];
}

export function getSection(id: string): SectionDef | undefined {
  return allSections().find((s) => s.id === id);
}

export function getSectionMission(id: string): SectionMissionDef | undefined {
  return allSectionMissions().find((m) => m.id === id);
}

/** The section a mission belongs to. */
export function sectionOfMission(missionId: string): SectionDef | undefined {
  return allSections().find((s) => s.missions.some((m) => m.id === missionId));
}

/** The field or raid mission whose spec/raid id is `ref` of that format (null for an unknown one). */
export function missionByRef(format: 'field' | 'raid', ref: string): SectionMissionDef | undefined {
  return allSectionMissions().find((m) => m.format === format && m.missionRef === ref);
}
