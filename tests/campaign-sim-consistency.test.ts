import { describe, expect, it } from 'vitest';
import { CAMPAIGN } from '../src/campaign';
import { FACTION_IDS, MISSION_DEFS, MISSION_IDS } from '../src/sim';

describe('campaign content matches the mission simulation', () => {
  for (const id of MISSION_IDS) {
    it(`${id}: boss name, fighter, faction and arena agree`, () => {
      const district = CAMPAIGN.districts[id];
      const boss = district.boss!;
      const def = MISSION_DEFS[id];
      expect(boss.protectionCrew.factionId).toBe(FACTION_IDS[id]);
      expect(CAMPAIGN.factions[FACTION_IDS[id]], 'faction defined').toBeTruthy();
      expect(boss.name.includes(def.boss.name.split(' ').slice(-1)[0]!)).toBe(true);
      expect(boss.visualDirection.characterId).toBe(def.boss.characterId);
      expect(boss.objectiveKind).toBe(def.objective);
      expect(district.arenaId).toBe(def.arenaId);
    });
  }
});
