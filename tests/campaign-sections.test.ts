/**
 * Sections (docs/CAMPAIGN_SECTIONS.md): the content structure, the per-section / per-mission status, the pure result
 * reducers (losses never unlock, rewards paid once, locked results ignored), ordering, the v1 -> v2 save migration, repair,
 * and save + resume through the store.
 */
import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN,
  allSectionMissions,
  allSections,
  applyMissionResult,
  applyRaidResult,
  applySectionResult,
  bossAvailable,
  bossFor,
  campaignProgress,
  createSave,
  districtStatus,
  loadSave,
  missionStatus,
  nextMission,
  persistSave,
  repairSave,
  sectionStatus,
  sectionsOf,
} from '../src/campaign';
import type { CampaignSave, KeyValueStore } from '../src/campaign';
import { FIELD_MISSION_DEFS, MISSION_IDS } from '../src/sim';
import type { MissionId, MissionOutcome, RaidId, RaidOutcome } from '../src/sim';

const RAID_IDS: RaidId[] = [
  'warehouseDispatchDepot',
  'partsStoreroom',
  'junctionToolShed',
  'railYardGoods',
  'recordsVault',
  'standbyPlant',
];

class MapStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem = (k: string): string | null => this.data.get(k) ?? null;
  setItem = (k: string, v: string): void => void this.data.set(k, v);
  removeItem = (k: string): void => void this.data.delete(k);
}

function fieldWin(fieldId: string, o: Partial<MissionOutcome> = {}): MissionOutcome {
  return {
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
    ...o,
  };
}

function raidWin(raidId: RaidId, o: Partial<RaidOutcome> = {}): RaidOutcome {
  return {
    raidId,
    result: 'completed',
    seconds: 70,
    optionalRoomsOpened: 0,
    optionalRoomsTotal: 0,
    cargoDestroyed: 3,
    cargoTotal: 3,
    hpLeft: 3,
    livesUsed: 0,
    stars: 2,
    ...o,
  };
}

const bossWin = (id: MissionId): MissionOutcome => ({
  result: 'won',
  missionId: id,
  modifiers: [],
  seconds: 200,
  livesUsed: 0,
  phasesCleared: 3,
  defeat: 'eliminated',
  stars: 3,
  creditedKills: 1,
});

/** Clears every field / raid mission of a district through the real reducers. */
function clearSections(save: CampaignSave, id: MissionId): CampaignSave {
  let s = save;
  for (const sec of sectionsOf(id)) {
    for (const m of sec.missions) {
      if (m.format === 'field') s = applySectionResult(s, fieldWin(m.missionRef), 1).save;
      if (m.format === 'raid') s = applyRaidResult(s, m.id, raidWin(m.missionRef as RaidId), 1).save;
    }
  }
  return s;
}

describe('section content', () => {
  it('every district has three ordered sections: approach (field + door), middle, boss', () => {
    for (const id of MISSION_IDS) {
      const secs = sectionsOf(id);
      expect(
        secs.map((s) => s.order),
        id,
      ).toEqual([1, 2, 3]);
      expect(secs.map((s) => s.id)).toEqual([`${id}.s1`, `${id}.s2`, `${id}.s3`]);
      expect(secs[0]!.requires).toEqual([]);
      expect(secs[1]!.requires).toEqual([`${id}.s1`]);
      expect(secs[2]!.requires).toEqual([`${id}.s2`]);
      const first = secs[0]!.missions[0]!;
      expect(first.format, id).toBe('field');
      expect(first.doors?.length, `${id} s1 has a door`).toBeGreaterThanOrEqual(1);
      expect(['field', 'raid']).toContain(secs[1]!.missions[0]!.format);
      expect(secs[2]!.missions).toHaveLength(1);
      expect(secs[2]!.missions[0]).toMatchObject({ format: 'boss', missionRef: id });
    }
    expect(allSections()).toHaveLength(18);
    expect(CAMPAIGN.sections.oshodi).toBe(sectionsOf('oshodi'));
  });

  it('refs are real: field specs exist and match their doors, raid ids are valid, the boss keeps its reward', () => {
    for (const m of allSectionMissions()) {
      if (m.format === 'field') {
        const def = FIELD_MISSION_DEFS[m.missionRef];
        expect(def, m.id).toBeDefined();
        expect(m.id).toBe(m.missionRef);
        expect(sectionsOf(def!.districtId).flatMap((s) => s.missions)).toContain(m);
        expect((m.doors ?? []).map((d) => `${d.doorId}:${d.raidId}`).sort()).toEqual(
          def!.doors.map((d) => `${d.id}:${d.raidId}`).sort(),
        );
      } else if (m.format === 'raid') {
        expect(RAID_IDS).toContain(m.missionRef);
      } else {
        expect(m.reward).toBe(bossFor(m.missionRef as MissionId).reward);
        expect(m.unlocks).toEqual(bossFor(m.missionRef as MissionId).reward.unlocks ?? []);
      }
      for (const d of m.doors ?? []) expect(RAID_IDS).toContain(d.raidId);
    }
    // every field mission is used by exactly one section mission
    const used = allSectionMissions()
      .filter((m) => m.format === 'field')
      .map((m) => m.missionRef)
      .sort();
    expect(used).toEqual(Object.keys(FIELD_MISSION_DEFS).sort());
  });

  it('text is short: objective cards at most 12 words, summaries one or two sentences, ids and rewards unique', () => {
    const ids = new Set<string>();
    const rewards = new Set<string>();
    const sentences = (t: string): number => (t.match(/[.!?](\s|$)/g) ?? []).length;
    for (const s of allSections()) {
      expect(sentences(s.summary), s.id).toBeLessThanOrEqual(2);
      expect(s.summary.length).toBeGreaterThan(20);
      for (const m of s.missions) {
        expect(ids.has(m.id)).toBe(false);
        ids.add(m.id);
        expect(m.objectiveCard.split(/\s+/).length, m.id).toBeLessThanOrEqual(12);
        expect(sentences(m.summary), m.id).toBeLessThanOrEqual(2);
        if (m.reward && m.format !== 'boss') {
          expect(rewards.has(m.reward.id)).toBe(false);
          rewards.add(m.reward.id);
        }
      }
    }
  });

  it('unlock ids name the next section; the last field/raid of a district opens the boss section', () => {
    for (const id of MISSION_IDS) {
      const secs = sectionsOf(id);
      expect(secs[0]!.missions[0]!.unlocks).toEqual([`section.${id}.s2`]);
      expect(secs[1]!.missions[0]!.unlocks).toEqual([`section.${id}.s3`]);
    }
  });

  it('Oshodi (the vertical slice) has the warehouse door and the richest text', () => {
    const approach = sectionsOf('oshodi')[0]!.missions[0]!;
    expect(approach.doors).toEqual([{ doorId: 'depot', raidId: 'warehouseDispatchDepot' }]);
    expect(approach.intro!.length).toBeGreaterThan(0);
    expect(approach.outro!.length).toBeGreaterThan(0);
    expect(approach.readMore!.length).toBeGreaterThan(80);
  });
});

describe('section and mission status', () => {
  it('a new save: Oshodi section 1 is open, everything else is locked', () => {
    const s = createSave(0);
    expect(s.version).toBe(2);
    expect(sectionStatus(s, 'oshodi.s1')).toBe('available');
    expect(sectionStatus(s, 'oshodi.s2')).toBe('locked');
    expect(sectionStatus(s, 'oshodi.s3')).toBe('locked');
    expect(sectionStatus(s, 'mushin.s1')).toBe('locked');
    expect(missionStatus(s, 'oshodi.approach')).toBe('available');
    expect(missionStatus(s, 'oshodi.railEdge')).toBe('locked');
    expect(missionStatus(s, 'oshodi.boss')).toBe('locked');
    expect(bossAvailable(s, 'oshodi')).toBe(false);
    expect(s.sections['oshodi.s1']!.status).toBe('available'); // stored values are refreshed too
    expect(s.missions['oshodi.approach']!.status).toBe('available');
    expect(Object.keys(s.sections)).toHaveLength(18);
    expect(Object.keys(s.missions)).toHaveLength(12); // 11 field + 1 raid
    expect(nextMission(s)).toEqual({
      districtId: 'oshodi',
      sectionId: 'oshodi.s1',
      missionId: 'oshodi.approach',
    });
  });

  it('clearing a section opens the next, and the boss only after both earlier sections', () => {
    let s = createSave(0);
    const a = applySectionResult(s, fieldWin('oshodi.approach'), 10);
    s = a.save;
    expect(a).toMatchObject({
      firstClear: true,
      sectionCleared: true,
      unlockedSections: ['oshodi.s2'],
      bossUnlocked: false,
      missionId: 'oshodi.approach',
      sectionId: 'oshodi.s1',
    });
    expect(a.newRewards.map((r) => r.id)).toEqual(['reward.section.oshodi.approach']);
    expect(sectionStatus(s, 'oshodi.s1')).toBe('cleared');
    expect(sectionStatus(s, 'oshodi.s2')).toBe('available');
    expect(bossAvailable(s, 'oshodi')).toBe(false);
    expect(nextMission(s)!.missionId).toBe('oshodi.railEdge');
    const b = applySectionResult(s, fieldWin('oshodi.railEdge'), 20);
    s = b.save;
    expect(b.bossUnlocked).toBe(true);
    expect(b.unlockedSections).toEqual(['oshodi.s3']);
    expect(bossAvailable(s, 'oshodi')).toBe(true);
    expect(nextMission(s)).toEqual({
      districtId: 'oshodi',
      sectionId: 'oshodi.s3',
      missionId: 'oshodi.boss',
    });
    // the district itself is still not cleared: only the boss does that
    expect(districtStatus(s, 'oshodi')).toBe('available');
    expect(districtStatus(s, 'mushin')).toBe('locked');
  });

  it('a boss win clears the district, opens the next one and its first section', () => {
    let s = clearSections(createSave(0), 'oshodi');
    const r = applyMissionResult(s, bossWin('oshodi'), 30);
    s = r.save;
    expect(districtStatus(s, 'oshodi')).toBe('cleared');
    expect(sectionStatus(s, 'oshodi.s3')).toBe('cleared');
    expect(sectionStatus(s, 'mushin.s1')).toBe('available');
    expect(nextMission(s)!.missionId).toBe('mushin.approach');
    expect(r.newSectionRewards).toBeUndefined(); // all earned by playing
    expect(r.newRewards.map((x) => x.id)).toEqual([bossFor('oshodi').reward.id]);
  });

  it('a boss win with sections skipped (old saves, direct results) counts them cleared and pays their rewards once', () => {
    const r = applyMissionResult(createSave(0), bossWin('oshodi'), 30);
    expect(sectionStatus(r.save, 'oshodi.s1')).toBe('cleared');
    expect(r.newSectionRewards!.map((x) => x.id).sort()).toEqual([
      'reward.section.oshodi.approach',
      'reward.section.oshodi.railEdge',
    ]);
    expect(r.save.sectionRewards).toHaveLength(2);
    expect(r.save.rewards).toEqual([bossFor('oshodi').reward.id]); // the boss rewards stay separate
    const again = applyMissionResult(r.save, bossWin('oshodi'), 31);
    expect(again.newSectionRewards).toBeUndefined();
    expect(again.save.sectionRewards).toEqual(r.save.sectionRewards);
  });

  it('a standalone raid is a section mission of its own (Ebute-Metta section 2)', () => {
    let s = createSave(0);
    s = applyMissionResult(clearSections(s, 'oshodi'), bossWin('oshodi'), 1).save;
    s = applyMissionResult(clearSections(s, 'mushin'), bossWin('mushin'), 1).save;
    s = applyMissionResult(clearSections(s, 'fadeyiSomolu'), bossWin('fadeyiSomolu'), 1).save;
    expect(sectionStatus(s, 'ebuteMetta.s1')).toBe('available');
    // the raid is locked until section 1 is done
    expect(applyRaidResult(s, 'ebuteMetta.railYard', raidWin('railYardGoods'), 5).save).toBe(s);
    s = applySectionResult(s, fieldWin('ebuteMetta.approach'), 6).save;
    expect(missionStatus(s, 'ebuteMetta.railYard')).toBe('available');
    // a raid result of another raid id is ignored
    expect(applyRaidResult(s, 'ebuteMetta.railYard', raidWin('partsStoreroom'), 7).save).toBe(s);
    const r = applyRaidResult(
      s,
      'ebuteMetta.railYard',
      raidWin('railYardGoods', { stars: 3, seconds: 55 }),
      8,
    );
    expect(r).toMatchObject({ firstClear: true, sectionCleared: true, bossUnlocked: true });
    expect(r.save.missions['ebuteMetta.railYard']).toMatchObject({
      status: 'cleared',
      bestStars: 3,
      bestSeconds: 55,
      clears: 1,
    });
  });
});

describe('result safety', () => {
  it('a loss or timeout only counts an attempt: nothing unlocks, nothing is paid', () => {
    const s = createSave(0);
    for (const result of ['lost', 'timeout'] as const) {
      const r = applySectionResult(s, fieldWin('oshodi.approach', { result, stars: 0 }), 3);
      expect(r.firstClear).toBe(false);
      expect(r.newRewards).toEqual([]);
      expect(r.unlockedSections).toEqual([]);
      expect(r.save.missions['oshodi.approach']).toMatchObject({
        attempts: 1,
        clears: 0,
        status: 'available',
      });
      expect(r.save.sections['oshodi.s1']!.attempts).toBe(1);
      expect(sectionStatus(r.save, 'oshodi.s2')).toBe('locked');
      expect(r.save.sectionRewards).toEqual([]);
    }
    const failedRaid = applyRaidResult(
      applySectionResult(
        applyMissionResult(
          clearSections(
            applyMissionResult(
              clearSections(
                applyMissionResult(clearSections(createSave(0), 'oshodi'), bossWin('oshodi'), 1).save,
                'mushin',
              ),
              bossWin('mushin'),
              1,
            ).save,
            'fadeyiSomolu',
          ),
          bossWin('fadeyiSomolu'),
          1,
        ).save,
        fieldWin('ebuteMetta.approach'),
        1,
      ).save,
      'ebuteMetta.railYard',
      raidWin('railYardGoods', { result: 'failed', stars: 0 }),
      2,
    );
    expect(failedRaid.save.missions['ebuteMetta.railYard']).toMatchObject({ attempts: 1, clears: 0 });
    expect(failedRaid.newRewards).toEqual([]);
  });

  it('results for locked missions, unknown missions and boss outcomes are ignored', () => {
    const s = createSave(0);
    expect(applySectionResult(s, fieldWin('oshodi.railEdge'), 1).save).toBe(s); // locked
    expect(applySectionResult(s, fieldWin('mushin.approach'), 1).save).toBe(s); // district locked
    expect(applySectionResult(s, fieldWin('oshodi.nope'), 1).save).toBe(s);
    expect(applySectionResult(s, fieldWin('oshodi.approach', { missionId: 'mushin' }), 1).save).toBe(s); // wrong district
    expect(applySectionResult(s, bossWin('oshodi'), 1).save).toBe(s); // not a section outcome
    expect(applyRaidResult(s, 'oshodi.approach', raidWin('warehouseDispatchDepot'), 1).save).toBe(s); // not a raid mission
    // and a section outcome never reaches the boss reducer
    expect(applyMissionResult(s, fieldWin('oshodi.approach'), 1).save).toBe(s);
  });

  it('rewards are paid once; a replay keeps the best stars and time, never lowers them', () => {
    let s = createSave(0);
    s = applySectionResult(s, fieldWin('oshodi.approach', { stars: 3, seconds: 90 }), 1).save;
    const again = applySectionResult(s, fieldWin('oshodi.approach', { stars: 1, seconds: 300 }), 2);
    expect(again.firstClear).toBe(false);
    expect(again.newRewards).toEqual([]);
    expect(again.sectionCleared).toBe(false);
    expect(again.save.sectionRewards).toEqual(['reward.section.oshodi.approach']);
    expect(again.save.missions['oshodi.approach']).toMatchObject({
      clears: 2,
      attempts: 2,
      bestStars: 3,
      bestSeconds: 90,
    });
    const faster = applySectionResult(again.save, fieldWin('oshodi.approach', { stars: 2, seconds: 60 }), 3);
    expect(faster.save.missions['oshodi.approach']).toMatchObject({ bestStars: 3, bestSeconds: 60 });
    expect(faster.save.sections['oshodi.s1']).toMatchObject({ status: 'cleared', bestStars: 3 });
    // a lost replay of a cleared mission changes nothing but the attempt count
    const lost = applySectionResult(
      faster.save,
      fieldWin('oshodi.approach', { result: 'lost', stars: 0 }),
      4,
    );
    expect(lost.save.missions['oshodi.approach']!.status).toBe('cleared');
    expect(lost.save.missions['oshodi.approach']!.clears).toBe(3);
  });

  it('bad numbers are clamped and the input save is never mutated', () => {
    const s = createSave(0);
    const frozen = JSON.stringify(s);
    const r = applySectionResult(s, fieldWin('oshodi.approach', { stars: 99 as never, seconds: NaN }), 1);
    expect(JSON.stringify(s)).toBe(frozen);
    expect(r.save.missions['oshodi.approach']!.bestStars).toBe(3);
    expect(r.save.missions['oshodi.approach']!.bestSeconds).toBeNull();
  });

  it('a full run through every section and boss ends with the campaign complete', () => {
    let s = createSave(0);
    let complete = false;
    for (const id of MISSION_IDS) {
      s = clearSections(s, id);
      expect(bossAvailable(s, id)).toBe(true);
      const r = applyMissionResult(s, bossWin(id), 1);
      s = r.save;
      complete = r.campaignComplete;
    }
    expect(complete).toBe(true);
    expect(campaignProgress(s).cleared).toBe(6);
    expect(allSections().every((sec) => sectionStatus(s, sec.id) === 'cleared')).toBe(true);
    expect(s.sectionRewards).toHaveLength(12);
    expect(nextMission(s)).toBeNull();
  });
});

describe('save, resume and migration', () => {
  it('save and resume after completing a section: the store round-trips and the map opens on the next section', () => {
    const store = new MapStore();
    let s = applySectionResult(createSave(5), fieldWin('oshodi.approach', { stars: 3 }), 6).save;
    expect(persistSave(store, s)).toBe(true);
    // "restart": a fresh load from the same store
    const loaded = loadSave(store)!;
    expect(loaded).toEqual(s);
    expect(loaded.version).toBe(2);
    expect(sectionStatus(loaded, 'oshodi.s1')).toBe('cleared');
    expect(nextMission(loaded)).toEqual({
      districtId: 'oshodi',
      sectionId: 'oshodi.s2',
      missionId: 'oshodi.railEdge',
    });
    s = applySectionResult(loaded, fieldWin('oshodi.railEdge'), 7).save;
    persistSave(store, s);
    expect(nextMission(loadSave(store)!)!.missionId).toBe('oshodi.boss');
  });

  it('a mid-mission state is not part of the save (only finished results are)', () => {
    const s = createSave(0);
    expect(JSON.stringify(s)).not.toMatch(/pendingRaid|legStart|checkpoint/);
  });

  it('migrates a v1 save: cleared districts mark all their sections cleared, nothing is lost', () => {
    const v1 = {
      version: 1,
      startedAt: 100,
      updatedAt: 200,
      prologueSeen: true,
      districts: {
        ojuelegba: { status: 'cleared' },
        oshodi: {
          status: 'cleared',
          clears: 2,
          attempts: 5,
          bestStars: 3,
          bestSeconds: 180,
          introSeen: true,
          modifiersCleared: ['rushHourDispatch'],
        },
        mushin: { status: 'cleared', clears: 1, attempts: 1, bestStars: 2, bestSeconds: 250 },
        fadeyiSomolu: { status: 'available', attempts: 1 },
      },
      rewards: [bossFor('oshodi').reward.id, bossFor('mushin').reward.id],
      unlocks: ['district.mushin'],
      completed: false,
      flags: [],
      character: 'lekkiBoy',
      difficulty: 'standard',
    };
    const s = repairSave(v1)!;
    expect(s.version).toBe(2);
    // everything v1 had survives
    expect(s.districts.oshodi).toMatchObject({
      status: 'cleared',
      clears: 2,
      attempts: 5,
      bestStars: 3,
      bestSeconds: 180,
      introSeen: true,
    });
    expect(s.districts.oshodi.modifiersCleared).toEqual(['rushHourDispatch']);
    expect(s.districts.mushin).toMatchObject({ status: 'cleared', bestStars: 2 });
    expect(s.rewards).toEqual([bossFor('oshodi').reward.id, bossFor('mushin').reward.id]);
    expect(s.character).toBe('lekkiBoy');
    expect(s.difficulty).toBe('standard');
    expect(s.prologueSeen).toBe(true);
    // sections of cleared districts are cleared, their rewards are paid, the next district's first section is open
    for (const id of ['oshodi', 'mushin'] as const) {
      for (const sec of sectionsOf(id)) expect(sectionStatus(s, sec.id), sec.id).toBe('cleared');
    }
    expect([...s.sectionRewards].sort()).toEqual([
      'reward.section.mushin.approach',
      'reward.section.mushin.market',
      'reward.section.oshodi.approach',
      'reward.section.oshodi.railEdge',
    ]);
    expect(sectionStatus(s, 'fadeyiSomolu.s1')).toBe('available');
    expect(sectionStatus(s, 'fadeyiSomolu.s2')).toBe('locked');
    expect(bossAvailable(s, 'fadeyiSomolu')).toBe(false);
    expect(nextMission(s)!.missionId).toBe('fadeyiSomolu.approach');
    // idempotent: migrating the migrated save changes nothing
    expect(repairSave(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('migrates the pre-release list shape too, and a fresh v1 save keeps Oshodi open', () => {
    const v0 = repairSave({ version: 0, cleared: ['oshodi'] })!;
    expect(v0.version).toBe(2);
    expect(sectionStatus(v0, 'oshodi.s3')).toBe('cleared');
    expect(sectionStatus(v0, 'mushin.s1')).toBe('available');
    const fresh = repairSave({ version: 1, districts: {} })!;
    expect(sectionStatus(fresh, 'oshodi.s1')).toBe('available');
    expect(fresh.sectionRewards).toEqual([]);
  });

  it('loads a v1 save from the store and rewrites it as v2 on the next write', () => {
    const store = new MapStore();
    store.setItem(
      'wahala.campaign.v1',
      JSON.stringify({ version: 1, districts: { oshodi: { status: 'cleared', clears: 1 } } }),
    );
    const loaded = loadSave(store)!;
    expect(loaded.version).toBe(2);
    persistSave(store, loaded);
    expect(JSON.parse(store.getItem('wahala.campaign.v1')!).version).toBe(2);
  });

  it('repair: no skipped sections, no cleared missions in a locked district, unknown ids dropped, rewards rebuilt', () => {
    const raw = {
      version: 2,
      districts: { oshodi: { status: 'available' }, mushin: { status: 'cleared', clears: 1 } }, // mushin claims cleared but oshodi is not
      missions: {
        'oshodi.railEdge': { status: 'cleared', clears: 1 }, // section 2 without section 1
        'mushin.approach': { status: 'cleared', clears: 1 },
        'nope.nope': { status: 'cleared', clears: 1 },
      },
      sectionRewards: ['reward.section.oshodi.railEdge', 'free.money'],
    };
    const s = repairSave(raw)!;
    expect(s.missions['oshodi.railEdge']!.status).not.toBe('cleared');
    expect(s.missions['nope.nope']).toBeUndefined();
    expect(s.districts.mushin.status).not.toBe('cleared');
    expect(missionStatus(s, 'mushin.approach')).toBe('locked');
    expect(s.sectionRewards).toEqual([]);
    // a valid partial progress is kept
    const ok = repairSave({
      version: 2,
      districts: {},
      missions: {
        'oshodi.approach': { status: 'cleared', clears: 1, bestStars: 3, attempts: 4, bestSeconds: 77 },
      },
    })!;
    expect(ok.missions['oshodi.approach']).toMatchObject({
      status: 'cleared',
      bestStars: 3,
      attempts: 4,
      bestSeconds: 77,
    });
    expect(ok.sectionRewards).toEqual(['reward.section.oshodi.approach']);
    expect(sectionStatus(ok, 'oshodi.s2')).toBe('available');
  });
});
