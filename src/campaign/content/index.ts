/** All campaign content, assembled. Pure data (see docs/CAMPAIGN_STORY.md). */
import type { MissionId, MissionModifierId } from '../../sim';
import { MISSION_IDS, MODIFIER_FOR } from '../../sim';
import type {
  BossDef,
  CampaignContent,
  DistrictContent,
  DistrictId,
  ReplayModifierDef,
  RewardDef,
  StoryLine,
} from '../types';
import { DISTRICT_ORDER } from '../types';
import { EBUTE_METTA } from './ebuteMetta';
import { FACTIONS } from './factions';
import { FADEYI_SOMOLU } from './fadeyiSomolu';
import { LAGOS_ISLAND } from './lagosIsland';
import { LEKKI } from './lekki';
import { MUSHIN } from './mushin';
import { OJUELEGBA } from './ojuelegba';
import { OSHODI } from './oshodi';
import { BROKER, ENDING, FINALE, PROLOGUE } from './story';

export { BROKER, ENDING, FINALE, PROLOGUE } from './story';
export { FACTIONS, FACTION_IDS, NPC_ROLE_INFO } from './factions';

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

/** The six bosses in campaign order. */
export function bossList(): BossDef[] {
  return MISSION_IDS.map((id) => CAMPAIGN.districts[id].boss!);
}

export function bossFor(id: MissionId): BossDef {
  return CAMPAIGN.districts[id].boss!;
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

export const MODIFIER_IDS: readonly MissionModifierId[] = MISSION_IDS.map((id) => MODIFIER_FOR[id]);

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
  const flags = bossList().flatMap((b) => b.consequenceFlags ?? []);
  return [...new Set([...flags, ...DISTRICT_ORDER.map((d) => `${d}.cleared`), 'campaign.completed'])];
}
