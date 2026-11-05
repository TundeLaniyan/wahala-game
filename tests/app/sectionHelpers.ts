import { sectionsOf } from '../../src/campaign';
import type { CampaignController } from '../../src/app/campaign';
import type { MissionId, MissionOutcome, RaidId, RaidOutcome } from '../../src/sim';

export const fieldWin = (fieldId: string, over: Partial<MissionOutcome> = {}): MissionOutcome => ({
  result: 'won',
  missionId: fieldId.split('.')[0] as MissionId,
  modifiers: [],
  seconds: 120,
  livesUsed: 0,
  phasesCleared: 3,
  defeat: null,
  stars: 2,
  creditedKills: 0,
  sectionMissionId: fieldId,
  raidBonus: 0,
  ...over,
});

export const raidWin = (raidId: RaidId, over: Partial<RaidOutcome> = {}): RaidOutcome => ({
  raidId,
  result: 'completed',
  seconds: 60,
  optionalRoomsOpened: 0,
  optionalRoomsTotal: 0,
  cargoDestroyed: 3,
  cargoTotal: 3,
  hpLeft: 3,
  livesUsed: 0,
  stars: 2,
  ...over,
});

/** Clears the field and raid sections of a district through the controller's public result entry points. */
export function clearSectionsOf(campaign: CampaignController, id: MissionId): void {
  for (const sec of sectionsOf(id))
    for (const m of sec.missions) {
      if (m.format === 'field') campaign.finishMission(fieldWin(m.missionRef));
      if (m.format === 'raid') campaign.finishRaidMission(m.id, raidWin(m.missionRef as RaidId));
    }
}
