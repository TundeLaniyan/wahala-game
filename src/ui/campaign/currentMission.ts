/**
 * Story Campaign header: "where am I, what do I do next, what do I gain" for the mission Continue would start. Pure
 * (unit-tested) and derived from the existing save and campaign content only (`nextMission`, `getSectionMission`):
 * no new progression data, and no reward or unlock that the content does not already define.
 */
import { CAMPAIGN, getSectionMission, nextMission } from '../../campaign';
import type { CampaignSave, SectionMissionFormat } from '../../campaign';
import { FINALE_MISSION_ID } from '../../sim';

/** The two gameplay styles inside the campaign, plainly: open-field City Rumble missions and Junction Blast raids. */
export const STYLE_LABEL: Readonly<Record<SectionMissionFormat, string>> = {
  field: 'Open-field 3D mission',
  raid: 'Junction Blast raid',
  boss: 'Keeper fight',
};

export interface CurrentMission {
  districtName: string;
  missionName: string;
  /** "Open-field 3D mission" / "Junction Blast raid" / "Keeper fight". */
  style: string;
  format: SectionMissionFormat;
  objective: string;
  /** The reward paid once on the first clear (from the content), or null. */
  reward: string | null;
  /** What clearing it opens (the content's own unlock ids, humanised only where a name exists). */
  unlockCount: number;
  finale: boolean;
}

export function currentMission(save: CampaignSave): CurrentMission | null {
  const next = nextMission(save);
  const def = next ? getSectionMission(next.missionId) : undefined;
  if (!next || !def) return null;
  return {
    districtName: CAMPAIGN.districts[next.districtId].name,
    missionName: def.name,
    style: STYLE_LABEL[def.format],
    format: def.format,
    objective: def.objectiveCard,
    reward: def.reward ? `${def.reward.name}: ${def.reward.description}` : null,
    unlockCount: def.unlocks.length,
    finale: next.districtId === FINALE_MISSION_ID,
  };
}

/** True once any mission (field, raid or boss) has been cleared: the Home button then says CONTINUE STORY. */
export function storyInProgress(save: CampaignSave): boolean {
  return (
    Object.values(save.missions).some((m) => m.status === 'cleared') ||
    Object.keys(save.districts).some(
      (d) => d !== 'ojuelegba' && save.districts[d as keyof typeof save.districts].clears > 0,
    )
  );
}
