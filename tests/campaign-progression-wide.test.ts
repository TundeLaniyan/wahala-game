/**
 * Generator Parts across the whole campaign (decisions PR9-PR15, docs/CAMPAIGN_GAMEPLAY_BIBLE.md section 2):
 * every section mission earns from content data, the earning arithmetic behind the level-2 cost, level-2 costs and caps,
 * the purchase / refund reducers, repair of corrupted upgrade data, old-save compatibility, the "what the Ring lost"
 * content, and the seat bonus in every district's field and boss missions but never in raids, Classic, Rumble or the
 * Academy (sim level). The controller side is tests/app/campaign-progression-wide-flow.test.ts.
 */
import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_PROGRESSION,
  CAMPAIGN_SAVE_KEY,
  UPGRADE_KINDS,
  affordableUpgrades,
  allSectionMissions,
  applyMissionResult,
  applyRaidResult,
  applySectionResult,
  buyUpgrade,
  canBuy,
  createSave,
  districtParts,
  loadSave,
  loadoutBonusFor,
  maxPartsPerMission,
  nextCost,
  nextMission,
  partsAvailable,
  partsEarned,
  partsGained,
  partsMissions,
  partsSpent,
  persistSave,
  refundUpgrades,
  repairSave,
  repairUpgrades,
  sectionsOf,
  upgradeCap,
  upgradesOf,
} from '../src/campaign';
import type { CampaignProgressionConfig, CampaignSave, KeyValueStore, UpgradeKind } from '../src/campaign';
import { CAMPAIGN_MISSION_IDS, MISSION_IDS, createGame } from '../src/sim';
import type { GameOptions, MissionId, MissionOutcome, RaidId, RaidOutcome } from '../src/sim';
import { buildMissionGame } from '../src/sim/mission/build';
import { buildRaidGame } from '../src/sim/raid/build';
import { LESSONS } from '../src/tutorial';

class MapStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem = (k: string): string | null => this.data.get(k) ?? null;
  setItem = (k: string, v: string): void => void this.data.set(k, v);
  removeItem = (k: string): void => void this.data.delete(k);
}

type Stars = 1 | 2 | 3;

const fieldWin = (missionRef: string, stars: Stars): MissionOutcome => ({
  result: 'won',
  missionId: missionRef.split('.')[0] as MissionId,
  modifiers: [],
  seconds: 120,
  livesUsed: 0,
  phasesCleared: 3,
  defeat: null,
  stars,
  creditedKills: 0,
  sectionMissionId: missionRef,
  raidBonus: 0,
});

const raidWin = (raidId: RaidId, stars: Stars): RaidOutcome => ({
  raidId,
  result: 'completed',
  seconds: 60,
  optionalRoomsOpened: 0,
  optionalRoomsTotal: 0,
  cargoDestroyed: 3,
  cargoTotal: 3,
  hpLeft: 3,
  livesUsed: 0,
  stars,
});

const bossWin = (id: MissionId, stars: Stars): MissionOutcome => ({
  result: 'won',
  missionId: id,
  modifiers: [],
  seconds: 200,
  livesUsed: 0,
  phasesCleared: 3,
  defeat: null,
  stars,
  creditedKills: 3,
});

/** Wins one section mission (field, raid or boss) through the real reducers. */
function win(save: CampaignSave, missionId: string, stars: Stars): CampaignSave {
  const def = allSectionMissions().find((m) => m.id === missionId)!;
  if (def.format === 'field') return applySectionResult(save, fieldWin(def.missionRef, stars), 1).save;
  if (def.format === 'raid')
    return applyRaidResult(save, def.id, raidWin(def.missionRef as RaidId, stars), 1).save;
  return applyMissionResult(save, bossWin(def.missionRef as MissionId, stars), 1).save;
}

/** Clears the first `districts` districts in order (7 = the six and the Ojuelegba finale), every mission at `stars`. */
function clearDistricts(districts: number, stars: (missionId: string) => Stars): CampaignSave {
  let s = createSave(0);
  for (const d of CAMPAIGN_MISSION_IDS.slice(0, districts))
    for (const sec of sectionsOf(d)) for (const m of sec.missions) s = win(s, m.id, stars(m.id));
  return s;
}

describe('Parts for every campaign mission (PR9)', () => {
  it('every section mission in the content earns, in play order: 18 district missions and the finale’s 3, 105 Parts at most', () => {
    const ids = allSectionMissions().map((m) => m.id);
    expect(partsMissions()).toEqual(ids);
    expect(ids).toHaveLength(21);
    expect(ids.slice(18)).toEqual(['ojuelegba.return', 'ojuelegba.junction', 'ojuelegba.boss']);
    expect(ids.filter((id) => id.endsWith('.boss'))).toHaveLength(7);
    expect(maxPartsPerMission()).toBe(5);
    expect(partsEarned(clearDistricts(7, () => 3))).toBe(105);
    expect(partsEarned(clearDistricts(6, () => 3))).toBe(90);
    expect(partsEarned(clearDistricts(6, () => 2))).toBe(72);
    expect(partsEarned(clearDistricts(6, () => 1))).toBe(54);
  });

  it('each mission pays 3 / +1 / +1 by best stars, and replays at equal or fewer stars pay nothing (no farming)', () => {
    let s = createSave(0);
    for (const m of allSectionMissions()) {
      const before = s;
      s = win(s, m.id, 1);
      expect(partsGained(before, s), `${m.id} first clear`).toBe(3);
      const again = win(s, m.id, 1);
      expect(partsGained(s, again), `${m.id} same stars`).toBe(0);
      const better = win(again, m.id, 2);
      expect(partsGained(again, better), `${m.id} 2 stars`).toBe(1);
      const best = win(better, m.id, 3);
      expect(partsGained(better, best), `${m.id} 3 stars`).toBe(1);
      let replayed = best;
      for (let i = 0; i < 5; i++) replayed = win(replayed, m.id, ((i % 3) + 1) as Stars);
      expect(partsGained(best, replayed), `${m.id} replays`).toBe(0);
      s = replayed;
    }
    expect(partsEarned(s)).toBe(105);
  });

  it('a loss or timeout never pays, and a locked mission pays nothing', () => {
    const s = createSave(0);
    const lost = applySectionResult(
      s,
      { ...fieldWin('oshodi.approach', 1), result: 'lost', stars: 0 },
      1,
    ).save;
    expect(partsEarned(lost)).toBe(0);
    const locked = applySectionResult(s, fieldWin('mushin.approach', 3), 1).save;
    expect(partsEarned(locked)).toBe(0);
  });

  it('districtParts splits the total by district', () => {
    const s = clearDistricts(2, (id) => (id.startsWith('oshodi') ? 3 : 1));
    expect(districtParts(s, 'oshodi')).toEqual({ earned: 15, max: 15 });
    expect(districtParts(s, 'mushin')).toEqual({ earned: 9, max: 15 });
    expect(districtParts(s, 'lekki')).toEqual({ earned: 0, max: 15 });
    expect(districtParts(s, 'ojuelegba')).toEqual({ earned: 0, max: 15 }); // the finale chapter's three missions
    const all = clearDistricts(7, (id) => (id.startsWith('ojuelegba') ? 2 : 1));
    expect(districtParts(all, 'ojuelegba')).toEqual({ earned: 12, max: 15 });
  });

  it('turning the system off pays and applies nothing, saves untouched', () => {
    const off: CampaignProgressionConfig = { ...CAMPAIGN_PROGRESSION, enabled: false };
    const s = { ...clearDistricts(6, () => 3), upgrades: { capacity: 2, range: 2 } };
    expect(partsEarned(s, off)).toBe(0);
    expect(affordableUpgrades(s, off)).toEqual([]);
    for (const d of MISSION_IDS) expect(loadoutBonusFor(s, d, off)).toBeUndefined();
  });
});

describe('Level 2 costs and caps (PR10)', () => {
  it('two levels each: 6 then 14 Parts, +2 at most', () => {
    for (const k of UPGRADE_KINDS) {
      expect(CAMPAIGN_PROGRESSION.upgrades[k].costs).toEqual([6, 14]);
      expect(upgradeCap(k)).toBe(2);
      expect(CAMPAIGN_PROGRESSION.upgrades[k].levelEffects).toHaveLength(2);
    }
    expect(partsSpent({ capacity: 2, range: 2 })).toBe(40);
  });

  it('the arithmetic: average play (2 stars) buys everything during district 4, not before', () => {
    const all = partsSpent({ capacity: 2, range: 2 });
    const two = () => 2 as const;
    expect(partsEarned(clearDistricts(1, two))).toBe(12); // both level 1 after Oshodi (slice, PR4)
    expect(partsEarned(clearDistricts(3, two))).toBe(36);
    expect(partsEarned(clearDistricts(3, two))).toBeLessThan(all);
    expect(partsEarned(clearDistricts(4, two))).toBe(48);
    let s = clearDistricts(3, two);
    s = win(s, 'ebuteMetta.approach', 2); // first mission of district 4
    expect(partsEarned(s)).toBe(all);
    // one star everywhere: during district 5; three stars everywhere: during district 3
    expect(partsEarned(clearDistricts(4, () => 1))).toBe(36);
    expect(partsEarned(clearDistricts(5, () => 1))).toBeGreaterThanOrEqual(all);
    expect(partsEarned(clearDistricts(2, () => 3))).toBeLessThan(all);
    expect(partsEarned(clearDistricts(3, () => 3))).toBeGreaterThanOrEqual(all);
  });

  it('levels are bought in order and never past the cap', () => {
    let s = clearDistricts(6, () => 3); // 90 Parts
    for (const k of UPGRADE_KINDS) {
      expect(nextCost(s, k)).toBe(6);
      s = buyUpgrade(s, k, 2);
      expect(nextCost(s, k)).toBe(14);
      s = buyUpgrade(s, k, 3);
      expect(nextCost(s, k)).toBeNull();
      expect(buyUpgrade(s, k, 4)).toBe(s);
    }
    expect(upgradesOf(s)).toEqual({ capacity: 2, range: 2 });
    expect(partsAvailable(s)).toBe(50);
    expect(affordableUpgrades(s)).toEqual([]);
  });
});

describe('Purchase and refund reducers (PR10, PR12)', () => {
  it('an exact cost leaves 0; one Part short is refused; the input save is never mutated', () => {
    const s = clearDistricts(1, (id) => (id === 'oshodi.boss' ? 3 : 2)); // 13 Parts
    const a = buyUpgrade(s, 'capacity', 50); // 7 left
    expect(a).not.toBe(s);
    expect(s.upgrades).toBeUndefined();
    expect(a.updatedAt).toBe(50);
    const b = buyUpgrade(a, 'range', 51); // 1 left
    expect(partsAvailable(b)).toBe(1);
    expect(canBuy(b, 'capacity')).toBe(false); // level 2 needs 14
    expect(buyUpgrade(b, 'capacity', 52)).toBe(b);
  });

  it('an unknown kind is refused', () => {
    const s = clearDistricts(6, () => 3);
    expect(buyUpgrade(s, 'speed' as UpgradeKind, 1)).toBe(s);
    expect(buyUpgrade(s, '__proto__' as UpgradeKind, 1)).toBe(s);
  });

  it('refund returns every level for free; buying again costs the same', () => {
    let s = clearDistricts(4, () => 2); // 48 Parts
    s = buyUpgrade(buyUpgrade(buyUpgrade(s, 'capacity', 1), 'capacity', 2), 'range', 3);
    expect(partsAvailable(s)).toBe(48 - 26);
    const r = refundUpgrades(s, 9);
    expect(r.upgrades).toBeUndefined();
    expect('upgrades' in r).toBe(false);
    expect(r.updatedAt).toBe(9);
    expect(partsAvailable(r)).toBe(48);
    expect(r.districts).toBe(s.districts);
    expect(r.missions).toBe(s.missions);
    expect(refundUpgrades(r, 10)).toBe(r); // nothing bought: same save
    const again = buyUpgrade(buyUpgrade(r, 'range', 11), 'range', 12);
    expect(partsAvailable(again)).toBe(48 - 20);
  });
});

describe('Save repair of upgrade data (PR13)', () => {
  const rich = clearDistricts(6, () => 3); // 90 Parts
  const load = (base: CampaignSave, upgrades: unknown): CampaignSave => {
    const store = new MapStore();
    const raw = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
    store.setItem(CAMPAIGN_SAVE_KEY, JSON.stringify({ ...raw, upgrades }));
    return loadSave(store)!;
  };

  it('clamps to whole levels within the caps and drops junk', () => {
    expect(load(rich, { capacity: 99, range: 7 }).upgrades).toEqual({ capacity: 2, range: 2 });
    expect(load(rich, { capacity: 1.9, range: 2.2 }).upgrades).toEqual({ capacity: 1, range: 2 });
    expect(load(rich, { capacity: -1, range: '2' }).upgrades).toBeUndefined();
    expect(load(rich, { capacity: null, range: true }).upgrades).toBeUndefined();
    expect(load(rich, [2, 2]).upgrades).toBeUndefined();
    expect(load(rich, 2).upgrades).toBeUndefined();
    expect(load(rich, { capacity: 1e308, range: 0, speed: 5 }).upgrades).toEqual({ capacity: 2, range: 0 });
    // JSON turns NaN and Infinity into null
    expect(repairUpgrades({ capacity: Number.NaN, range: Number.POSITIVE_INFINITY }, rich)).toBeUndefined();
  });

  it('refunds the most expensive level first (range on a tie) until the Parts pay', () => {
    const p9 = clearDistricts(1, () => 1);
    expect(partsEarned(p9)).toBe(9);
    expect(repairUpgrades({ capacity: 2, range: 2 }, p9)).toEqual({ capacity: 1, range: 0 });
    const p24 = clearDistricts(2, () => 2);
    expect(partsEarned(p24)).toBe(24);
    expect(repairUpgrades({ capacity: 2, range: 2 }, p24)).toEqual({ capacity: 1, range: 1 });
    const p30 = win(win(p24, 'fadeyiSomolu.approach', 1), 'fadeyiSomolu.junctions', 1);
    expect(partsEarned(p30)).toBe(30);
    expect(repairUpgrades({ capacity: 2, range: 2 }, p30)).toEqual({ capacity: 2, range: 1 }); // 26
    expect(repairUpgrades({ capacity: 1, range: 2 }, p30)).toEqual({ capacity: 1, range: 2 }); // 26
    expect(repairUpgrades({ capacity: 2, range: 2 }, createSave(0))).toBeUndefined();
  });

  it('the repaired save never has more spent than earned, for any claimed levels', () => {
    for (const districts of [0, 1, 2, 3, 6])
      for (const stars of [1, 2, 3] as const) {
        const s = clearDistricts(districts, () => stars);
        for (let c = -1; c <= 3; c++)
          for (let r = -1; r <= 3; r++) {
            const u = repairUpgrades({ capacity: c, range: r }, s);
            const spent = partsSpent(u ?? { capacity: 0, range: 0 });
            expect(spent).toBeLessThanOrEqual(partsEarned(s));
            if (u) {
              expect(u.capacity).toBeLessThanOrEqual(2);
              expect(u.range).toBeLessThanOrEqual(2);
            }
          }
      }
  });
});

describe('Old saves load unchanged (PR13)', () => {
  /** A v2 save from before the Parts slice: Oshodi cleared, Mushin's first section won, no `upgrades` key. */
  function preSlice(): Record<string, unknown> {
    let s = clearDistricts(1, () => 2);
    s = win(s, 'mushin.approach', 3);
    return JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
  }

  it('a pre-slice save keeps every record, gets no new field and earns what its stars are worth', () => {
    const raw = preSlice();
    expect('upgrades' in raw).toBe(false);
    const store = new MapStore();
    store.setItem(CAMPAIGN_SAVE_KEY, JSON.stringify(raw));
    const loaded = loadSave(store)!;
    expect(JSON.parse(JSON.stringify(loaded))).toEqual(raw);
    expect(loaded.upgrades).toBeUndefined();
    expect(partsEarned(loaded)).toBe(12 + 5);
    expect(nextMission(loaded)?.missionId).toBe('mushin.market');
  });

  it('a slice save with both Oshodi upgrades bought keeps them, its stars and its unlocks', () => {
    const raw = { ...preSlice(), upgrades: { capacity: 1, range: 1 } };
    const store = new MapStore();
    store.setItem(CAMPAIGN_SAVE_KEY, JSON.stringify(raw));
    const loaded = loadSave(store)!;
    expect(JSON.parse(JSON.stringify(loaded))).toEqual(raw);
    expect(loaded.upgrades).toEqual({ capacity: 1, range: 1 });
    expect(partsAvailable(loaded)).toBe(17 - 12);
    // and it round-trips byte for byte
    persistSave(store, loaded);
    expect(JSON.parse(store.getItem(CAMPAIGN_SAVE_KEY)!)).toEqual(raw);
  });

  it('a version 1 save (districts only) is migrated: cleared districts count one star per section mission', () => {
    const v1 = {
      version: 1,
      startedAt: 1,
      updatedAt: 2,
      districts: { oshodi: { status: 'cleared', clears: 1, attempts: 2, bestStars: 3 } },
      upgrades: { capacity: 1, range: 1 },
    };
    const s = repairSave(v1)!;
    expect(s.version).toBe(2);
    expect(partsEarned(s)).toBe(3 + 3 + 5);
    expect(s.upgrades).toEqual({ capacity: 1, range: 0 }); // 11 Parts pay for one level-1 upgrade
  });
});

describe('What the Ring lost: content for every mission (PR14)', () => {
  it('every section mission (field, raid, boss) has one short line, all different', () => {
    const lines = allSectionMissions().map((m) => [m.id, m.ringWeakened] as const);
    for (const [id, line] of lines) {
      expect(line, id).toBeTruthy();
      expect(line!.length, id).toBeLessThanOrEqual(110);
      expect(line, id).toMatch(/[.]$/);
      expect(line, id).toMatch(/:/); // "what broke: what it means for people"
    }
    expect(new Set(lines.map(([, l]) => l)).size).toBe(lines.length);
  });

  it('the two shipped Oshodi field lines are unchanged', () => {
    const byId = new Map(allSectionMissions().map((m) => [m.id, m.ringWeakened]));
    expect(byId.get('oshodi.approach')).toBe(
      'The depot’s dispatch cargo is broken: the convoys lose their schedule.',
    );
    expect(byId.get('oshodi.railEdge')).toBe(
      'The trailer crews lose the rail-edge lane: the controller has nowhere left to hide.',
    );
  });
});

describe('The seat bonus in every district, never outside field and boss missions (PR11, sim level)', () => {
  const bonus = { capacity: 2, range: 2 };
  const specs: { label: string; spec: { id: MissionId; lives: number; fieldId?: string } }[] =
    MISSION_IDS.flatMap((d) => [
      { label: `${d} boss`, spec: { id: d, lives: 3 } },
      ...sectionsOf(d)
        .flatMap((s) => s.missions)
        .filter((m) => m.format === 'field')
        .map((m) => ({ label: m.id, spec: { id: d, lives: 3, fieldId: m.missionRef } })),
    ]);

  it('covers 6 boss and 11 field missions', () => {
    expect(specs).toHaveLength(17);
  });

  it.each(specs)(
    '$label: the human seat gets +2 / +2 (radius cap kept), every other seat nothing',
    ({ spec }) => {
      const build = (b?: typeof bonus): GameOptions =>
        buildMissionGame({ spec, humanCharacter: 'campusQueen', seed: 5, ...(b ? { loadoutBonus: b } : {}) });
      const plain = createGame(build());
      const s = createGame(build(bonus));
      const g = s.config.generator;
      const human = s.players[0]!;
      expect(human.loadoutBonus).toEqual(bonus);
      expect(human.capacity).toBe(plain.players[0]!.capacity + 2);
      expect(human.range).toBe(Math.min(g.maxRange, plain.players[0]!.range + 2));
      for (let i = 1; i < s.players.length; i++) {
        expect(s.players[i]!.loadoutBonus).toBeUndefined();
        expect(s.players[i]!.capacity).toBe(plain.players[i]!.capacity);
        expect(s.players[i]!.range).toBe(plain.players[i]!.range);
      }
      expect(s.config).toEqual(plain.config);
    },
  );

  it('a raid (door or standalone) drops a bonus even if one were passed', () => {
    for (const raidId of ['warehouseDispatchDepot', 'railYardGoods', 'partsStoreroom'] as RaidId[]) {
      const o = buildRaidGame({ raidId, humanCharacter: 'streetBaller', seed: 2 });
      const plain = createGame(o);
      const s = createGame({
        ...o,
        players: o.players.map((p, i) => (i === 0 ? { ...p, loadoutBonus: bonus } : p)),
      });
      expect(s.settings.game).toBe('raid');
      expect(s.players[0]!.loadoutBonus).toBeUndefined();
      expect(s.players[0]!.capacity).toBe(plain.players[0]!.capacity);
      expect(s.players[0]!.range).toBe(plain.players[0]!.range);
    }
  });

  it('Classic and every City Rumble ruleset drop it', () => {
    for (const game of ['classic', 'survival', 'deathmatch', 'team'] as const) {
      const s = createGame({
        seed: 1,
        players: [
          { name: 'A', characterId: 'streetBaller', isBot: false, loadoutBonus: bonus },
          { name: 'B', characterId: 'lekkiBoy', isBot: true },
        ],
        settings: { game },
      });
      expect(s.players[0]!.loadoutBonus).toBeUndefined();
    }
  });

  it('no Training Academy lesson (demo or practice) seats a bonus', () => {
    expect(LESSONS.length).toBeGreaterThan(0);
    for (const lesson of LESSONS) {
      for (const state of [lesson.demo.build(), lesson.practice.build('streetBaller')]) {
        expect(state.settings.game, lesson.id).not.toBe('mission');
        expect(
          state.players.every((p) => p.loadoutBonus === undefined),
          lesson.id,
        ).toBe(true);
      }
    }
  });
});
