/**
 * Generator Parts and the campaign-only upgrades (decisions PR1-PR8, src/campaign/upgrades.ts, src/sim/systems/loadout.ts):
 * Parts derive from best stars (first clear, star improvements, no farming), the scope (campaign-wide since PR9; the
 * Oshodi-only slice config still works as a rollback), buying and caps,
 * save compatibility (older saves keep everything, tampered upgrades are clamped and refunded), and the sim bonus
 * (human only, mission matches only, pickups still stack, respawn keeps the upgrade).
 */
import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_PROGRESSION,
  applyMissionResult,
  applySectionResult,
  buyUpgrade,
  canBuy,
  createSave,
  loadSave,
  loadoutBonusFor,
  nextCost,
  partsAvailable,
  partsEarned,
  partsForStars,
  partsGained,
  partsMissions,
  persistSave,
  repairSave,
  upgradesOf,
} from '../src/campaign';
import type { CampaignProgressionConfig, CampaignSave, KeyValueStore } from '../src/campaign';
import { CAMPAIGN_SAVE_KEY } from '../src/campaign';
import { createGame, seatMaxCapacity } from '../src/sim';
import type { GameOptions, MissionId, MissionOutcome } from '../src/sim';
import { buildMissionGame } from '../src/sim/mission/build';
import { applyPickup } from '../src/sim/systems/pickups';
import { respawn } from '../src/sim/systems/respawn';

class MapStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem = (k: string): string | null => this.data.get(k) ?? null;
  setItem = (k: string, v: string): void => void this.data.set(k, v);
  removeItem = (k: string): void => void this.data.delete(k);
}

const fieldWin = (
  fieldId: string,
  stars: 1 | 2 | 3,
  result: MissionOutcome['result'] = 'won',
): MissionOutcome => ({
  result,
  missionId: fieldId.split('.')[0] as MissionId,
  modifiers: [],
  seconds: 120,
  livesUsed: 0,
  phasesCleared: 3,
  defeat: null,
  stars: result === 'won' ? stars : 0,
  creditedKills: 0,
  sectionMissionId: fieldId,
  raidBonus: 0,
});

const bossWin = (id: MissionId, stars: 1 | 2 | 3): MissionOutcome => ({
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

const field = (save: CampaignSave, id: string, stars: 1 | 2 | 3, result: MissionOutcome['result'] = 'won') =>
  applySectionResult(save, fieldWin(id, stars, result), 1).save;

/** Oshodi cleared with these stars for approach, rail edge and the boss. */
function oshodi(a: 1 | 2 | 3, b: 1 | 2 | 3, c: 1 | 2 | 3): CampaignSave {
  let s = createSave(0);
  s = field(s, 'oshodi.approach', a);
  s = field(s, 'oshodi.railEdge', b);
  return applyMissionResult(s, bossWin('oshodi', c), 2).save;
}

describe('Generator Parts are derived from best stars (PR1)', () => {
  it('pays 3 for a first clear and 1 for each better star, at most 5 per mission', () => {
    expect([0, 1, 2, 3].map((s) => partsForStars(s))).toEqual([0, 3, 4, 5]);
  });

  it('the Oshodi-only slice config (PR2) still earns only from the three Oshodi missions', () => {
    const slice: CampaignProgressionConfig = { ...CAMPAIGN_PROGRESSION, districts: ['oshodi'] };
    expect(partsMissions(slice)).toEqual(['oshodi.approach', 'oshodi.railEdge', 'oshodi.boss']);
    expect(partsEarned(createSave(0), slice)).toBe(0);
    expect(partsEarned(oshodi(1, 1, 1), slice)).toBe(9);
    expect(partsEarned(oshodi(3, 3, 3), slice)).toBe(15);
    const mushin = field(oshodi(1, 1, 1), 'mushin.approach', 3);
    expect(partsEarned(mushin, slice)).toBe(9);
    expect(
      loadoutBonusFor({ ...mushin, upgrades: { capacity: 1, range: 0 } }, 'mushin', slice),
    ).toBeUndefined();
    // campaign-wide (PR9): the Mushin clear pays too
    expect(partsEarned(mushin)).toBe(9 + 5);
  });

  it('a first clear pays once; a replay pays only the star difference; losses and same stars pay nothing', () => {
    const s0 = createSave(0);
    const s1 = field(s0, 'oshodi.approach', 1);
    expect(partsGained(s0, s1)).toBe(3);
    const s2 = field(s1, 'oshodi.approach', 1);
    expect(partsGained(s1, s2)).toBe(0);
    const s3 = field(s2, 'oshodi.approach', 3);
    expect(partsGained(s2, s3)).toBe(2);
    const s4 = field(s3, 'oshodi.approach', 2);
    expect(partsGained(s3, s4)).toBe(0);
    const s5 = field(s4, 'oshodi.approach', 1, 'lost');
    expect(partsGained(s4, s5)).toBe(0);
    // twenty replays at three stars change nothing
    let s = s5;
    for (let i = 0; i < 20; i++) s = field(s, 'oshodi.approach', 3);
    expect(partsEarned(s)).toBe(5);
  });

  it('the boss mission pays through the district record', () => {
    const before = field(field(createSave(0), 'oshodi.approach', 1), 'oshodi.railEdge', 1);
    const after = applyMissionResult(before, bossWin('oshodi', 2), 3).save;
    expect(partsGained(before, after)).toBe(4);
  });

  it('turning the slice off pays nothing and offers nothing', () => {
    const off: CampaignProgressionConfig = { ...CAMPAIGN_PROGRESSION, enabled: false };
    const s = oshodi(3, 3, 3);
    expect(partsEarned(s, off)).toBe(0);
    expect(canBuy(s, 'capacity', off)).toBe(false);
    expect(loadoutBonusFor({ ...s, upgrades: { capacity: 1, range: 1 } }, 'oshodi', off)).toBeUndefined();
  });
});

describe('Buying upgrades (PR4)', () => {
  it('costs Parts, stops at the cap and never overspends', () => {
    let s = oshodi(1, 1, 1); // 9 Parts
    expect(nextCost(s, 'capacity')).toBe(6);
    s = buyUpgrade(s, 'capacity', 10);
    expect(upgradesOf(s)).toEqual({ capacity: 1, range: 0 });
    expect(partsAvailable(s)).toBe(3);
    expect(canBuy(s, 'range')).toBe(false);
    expect(buyUpgrade(s, 'range', 11)).toBe(s);
    expect(nextCost(s, 'capacity')).toBe(14); // level 2 (PR10)
    expect(buyUpgrade(s, 'capacity', 11)).toBe(s); // 3 Parts left: not enough for level 2
  });

  it('better stars pay for the second upgrade (an average of two stars buys both)', () => {
    let s = buyUpgrade(oshodi(2, 2, 2), 'capacity', 10);
    s = buyUpgrade(s, 'range', 11);
    expect(upgradesOf(s)).toEqual({ capacity: 1, range: 1 });
    expect(partsAvailable(s)).toBe(0);
  });

  it('a fresh save cannot buy anything', () => {
    const s = createSave(0);
    expect(buyUpgrade(s, 'capacity', 1)).toBe(s);
    expect(buyUpgrade(s, 'range', 1)).toBe(s);
  });

  it('the bonus applies in every district once bought (PR11), and is absent before', () => {
    const s = buyUpgrade(oshodi(1, 1, 1), 'range', 10);
    expect(loadoutBonusFor(s, 'oshodi')).toEqual({ capacity: 0, range: 1 });
    expect(loadoutBonusFor(s, 'mushin')).toEqual({ capacity: 0, range: 1 });
    expect(loadoutBonusFor(oshodi(1, 1, 1), 'oshodi')).toBeUndefined();
  });
});

describe('Save compatibility (PR5)', () => {
  it('a save without upgrades loads with every bit of progress and no new field', () => {
    const s = oshodi(2, 3, 1);
    const store = new MapStore();
    persistSave(store, s);
    const loaded = loadSave(store)!;
    expect(loaded.upgrades).toBeUndefined();
    expect(loaded.districts.oshodi).toEqual(s.districts.oshodi);
    expect(loaded.missions).toEqual(s.missions);
    expect(loaded.rewards).toEqual(s.rewards);
    expect(loaded.unlocks).toEqual(s.unlocks);
    expect(loaded.flags).toEqual(s.flags);
    expect(loaded.sectionRewards).toEqual(s.sectionRewards);
    expect(partsEarned(loaded)).toBe(4 + 5 + 3);
  });

  it('a version 0 save (cleared list) earns the Parts its stars are worth', () => {
    const s = repairSave({ cleared: ['oshodi'] })!;
    expect(s.districts.oshodi.status).toBe('cleared');
    expect(partsEarned(s)).toBe(9); // every Oshodi mission counted as one star
    expect(s.upgrades).toBeUndefined();
  });

  it('bought upgrades round-trip through storage', () => {
    const s = buyUpgrade(buyUpgrade(oshodi(3, 3, 3), 'capacity', 10), 'range', 11);
    const store = new MapStore();
    persistSave(store, s);
    expect(loadSave(store)!.upgrades).toEqual({ capacity: 1, range: 1 });
  });

  it('tampered upgrades are clamped to the caps and refunded down to what the Parts pay for', () => {
    const base = JSON.parse(JSON.stringify(oshodi(1, 1, 1))) as Record<string, unknown>; // 9 Parts
    const load = (upgrades: unknown) => {
      const store = new MapStore();
      store.setItem(CAMPAIGN_SAVE_KEY, JSON.stringify({ ...base, upgrades }));
      return loadSave(store)!;
    };
    expect(load({ capacity: 99, range: 0 }).upgrades).toEqual({ capacity: 1, range: 0 });
    expect(load({ capacity: 1, range: 1 }).upgrades).toEqual({ capacity: 1, range: 0 }); // 12 > 9: range refunded
    expect(load({ capacity: -3, range: 'x' }).upgrades).toBeUndefined();
    expect(load('garbage').upgrades).toBeUndefined();
    // no Parts at all: nothing survives
    const fresh = JSON.parse(JSON.stringify(createSave(0))) as Record<string, unknown>;
    expect(repairSave({ ...fresh, upgrades: { capacity: 1, range: 1 } })!.upgrades).toBeUndefined();
  });

  it('the save version is unchanged', () => {
    expect(createSave(0).version).toBe(2);
  });
});

describe('The sim bonus (PR3, PR6)', () => {
  const opts = (bonus?: { capacity: number; range: number }, fieldId?: string): GameOptions =>
    buildMissionGame({
      spec: { id: 'oshodi', lives: 3, ...(fieldId ? { fieldId } : {}) },
      humanCharacter: 'streetBaller',
      seed: 3,
      ...(bonus ? { loadoutBonus: bonus } : {}),
    });

  it('no bonus (or a zero bonus) leaves the mission options and state exactly as before', () => {
    for (const fieldId of [undefined, 'oshodi.approach']) {
      const plain = createGame(opts(undefined, fieldId));
      expect(createGame(opts({ capacity: 0, range: 0 }, fieldId))).toEqual(plain);
      expect(JSON.stringify(opts({ capacity: 0, range: 0 }, fieldId))).toBe(
        JSON.stringify(opts(undefined, fieldId)),
      );
      expect(plain.players[0]!.loadoutBonus).toBeUndefined();
    }
  });

  it('raises the human seat only, in field and boss missions', () => {
    for (const fieldId of [undefined, 'oshodi.approach']) {
      const plain = createGame(opts(undefined, fieldId));
      const s = createGame(opts({ capacity: 1, range: 1 }, fieldId));
      expect(s.players[0]!.capacity).toBe(plain.players[0]!.capacity + 1);
      expect(s.players[0]!.range).toBe(plain.players[0]!.range + 1);
      for (let i = 1; i < s.players.length; i++) {
        expect(s.players[i]!.capacity).toBe(plain.players[i]!.capacity);
        expect(s.players[i]!.range).toBe(plain.players[i]!.range);
        expect(s.players[i]!.loadoutBonus).toBeUndefined();
      }
      expect(s.config).toEqual(plain.config);
    }
  });

  it('an Extra Socket still adds one on top of the upgrade, and Petrol still builds on the range', () => {
    const s = createGame(opts({ capacity: 1, range: 1 }));
    const p = s.players[0]!;
    const g = s.config.generator;
    expect(seatMaxCapacity(p, g)).toBe(g.maxCapacity + 1);
    expect(applyPickup(s, p, 'socket', [])).toBe(true);
    expect(p.capacity).toBe(g.baseCapacity + 2);
    expect(applyPickup(s, p, 'socket', [])).toBe(false);
    expect(applyPickup(s, p, 'petrol', [])).toBe(true);
    expect(p.range).toBe(g.baseRange + 2);
  });

  it('a respawn resets pickups to the upgraded base, never below it', () => {
    const s = createGame(opts({ capacity: 1, range: 1 }));
    const p = s.players[0]!;
    const g = s.config.generator;
    applyPickup(s, p, 'socket', []);
    applyPickup(s, p, 'petrol', []);
    p.alive = false;
    respawn(s, p, p.x, p.y);
    expect(p.capacity).toBe(g.baseCapacity + 1);
    expect(p.range).toBe(g.baseRange + 1);
  });

  it('is ignored in every non-mission ruleset', () => {
    for (const game of ['classic', 'survival', 'deathmatch', 'team'] as const) {
      const s = createGame({
        seed: 1,
        players: [
          { name: 'A', characterId: 'streetBaller', isBot: false, loadoutBonus: { capacity: 2, range: 2 } },
          { name: 'B', characterId: 'lekkiBoy', isBot: true },
        ],
        settings: { game },
      });
      expect(s.players[0]!.loadoutBonus).toBeUndefined();
      expect(s.players[0]!.capacity).toBe(s.config.generator.baseCapacity);
      expect(s.players[0]!.range).toBe(s.config.generator.baseRange);
    }
  });
});
