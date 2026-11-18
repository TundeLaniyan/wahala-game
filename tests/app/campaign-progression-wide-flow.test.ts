/**
 * Generator Parts campaign-wide through the real CampaignController (decisions PR9-PR15): the bought levels reach the
 * human seat of every district's field and boss missions, never a raid (standalone, debug or door: all go through the
 * same raid builder, which is never handed a bonus); every result kind reports the Parts it paid (the standalone raid
 * too); the free refund; and a static check that only the campaign controller can hand a seat a bonus (Classic, City
 * Rumble, online and the Academy never see one).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyMissionResult,
  applyRaidResult,
  applySectionResult,
  buyUpgrade,
  createSave,
  loadSave,
  persistSave,
  sectionsOf,
} from '../../src/campaign';
import type { CampaignSave, KeyValueStore } from '../../src/campaign';
import { CampaignController } from '../../src/app/campaign';
import type { MissionHost } from '../../src/app/ports';
import { useGameStore } from '../../src/app/store';
import { MISSION_IDS } from '../../src/sim';
import type { GameOptions, MissionId, RaidId } from '../../src/sim';
import { fieldWin, raidWin } from './sectionHelpers';

class MapStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem = (k: string): string | null => this.data.get(k) ?? null;
  setItem = (k: string, v: string): void => void this.data.set(k, v);
  removeItem = (k: string): void => void this.data.delete(k);
}

const bossWin = (id: MissionId, stars: 1 | 2 | 3) => ({
  result: 'won' as const,
  missionId: id,
  modifiers: [],
  seconds: 100,
  livesUsed: 0,
  phasesCleared: 3,
  defeat: null,
  stars,
  creditedKills: 0,
});

/** The first `n` districts cleared, every mission at `stars`, through the pure reducers. */
function cleared(n: number, stars: 1 | 2 | 3): CampaignSave {
  let s = createSave(0);
  for (const d of MISSION_IDS.slice(0, n))
    for (const sec of sectionsOf(d))
      for (const m of sec.missions) {
        if (m.format === 'field') s = applySectionResult(s, fieldWin(m.missionRef, { stars }), 1).save;
        else if (m.format === 'raid')
          s = applyRaidResult(s, m.id, raidWin(m.missionRef as RaidId, { stars }), 1).save;
        else s = applyMissionResult(s, bossWin(d, stars), 1).save;
      }
  return s;
}

function rig(save: CampaignSave) {
  const store = new MapStore();
  persistSave(store, save);
  const started: GameOptions[] = [];
  const raids: GameOptions[] = [];
  const raidArgs: Record<string, unknown>[] = [];
  const host: MissionHost = {
    startMission: (o) => void started.push(o),
    playRaid: (o) => void raids.push(o),
    stop() {},
  };
  const campaign = new CampaignController({
    store,
    host,
    now: () => 9_000,
    seed: () => 4,
    buildRaid: (args) => {
      raidArgs.push({ ...args });
      return {
        seed: args.seed,
        players: [{ name: 'You', characterId: args.humanCharacter, isBot: false }],
        settings: { game: 'raid' },
      };
    },
  });
  campaign.load();
  return { campaign, store, started, raids, raidArgs };
}

const ui = () => useGameStore.getState().campaign!;

describe('Campaign-wide Generator Parts in the controller', () => {
  beforeEach(() => useGameStore.setState({ campaign: null }));

  it('level-2 upgrades reach the human seat of every field and boss mission, in every district', () => {
    let save = cleared(6, 3);
    for (const k of ['capacity', 'range', 'capacity', 'range'] as const) save = buyUpgrade(save, k, 1);
    const { campaign, started } = rig(save);
    let checked = 0;
    for (const d of MISSION_IDS) {
      for (const sec of sectionsOf(d))
        for (const m of sec.missions) {
          if (m.format === 'raid') continue;
          const ok = m.format === 'boss' ? campaign.startMission(d) : campaign.startSectionMission(m.id);
          expect(ok, m.id).toBe(true);
          const o = started.at(-1)!;
          expect(o.settings?.game, m.id).toBe('mission');
          expect(o.players[0]!.loadoutBonus, m.id).toEqual({ capacity: 2, range: 2 });
          expect(
            o.players.slice(1).every((p) => p.loadoutBonus === undefined),
            m.id,
          ).toBe(true);
          campaign.toMap();
          checked++;
        }
    }
    expect(checked).toBe(17);
  });

  it('raids never receive the bonus: the standalone section raid and a debug raid', () => {
    let save = cleared(6, 3);
    save = buyUpgrade(buyUpgrade(save, 'capacity', 1), 'range', 1);
    const { campaign, raids, raidArgs } = rig(save);
    expect(campaign.startSectionMission('ebuteMetta.railYard')).toBe(true);
    campaign.toMap();
    expect(campaign.debugStartRaid('warehouseDispatchDepot')).toBe(true);
    expect(raidArgs).toHaveLength(2);
    for (const a of raidArgs) expect(a).not.toHaveProperty('loadoutBonus');
    for (const o of raids) expect(o.players.every((p) => p.loadoutBonus === undefined)).toBe(true);
  });

  it('every result kind reports the Parts it paid: field, standalone raid and boss, any district', () => {
    const { campaign } = rig(cleared(3, 1));
    campaign.startSectionMission('ebuteMetta.approach');
    campaign.finishMission(fieldWin('ebuteMetta.approach', { stars: 2 }));
    expect(ui().sectionResult!.partsGained).toBe(4);
    campaign.startSectionMission('ebuteMetta.railYard');
    campaign.finishRaidMission('ebuteMetta.railYard', raidWin('railYardGoods', { stars: 3 }));
    expect(ui().sectionResult!.kind).toBe('raid');
    expect(ui().sectionResult!.partsGained).toBe(5);
    campaign.startSectionMission('ebuteMetta.railYard');
    campaign.finishRaidMission('ebuteMetta.railYard', raidWin('railYardGoods', { stars: 3 }));
    expect(ui().sectionResult!.partsGained).toBe(0); // no farming
    campaign.startMission('ebuteMetta');
    campaign.finishMission(bossWin('ebuteMetta', 1));
    expect(ui().result!.partsGained).toBe(3);
  });

  it('the free refund returns every level, persists, and is refused during a mission', () => {
    let save = cleared(2, 2); // 24 Parts
    save = buyUpgrade(buyUpgrade(save, 'capacity', 1), 'range', 1);
    const { campaign, store } = rig(save);
    campaign.startSectionMission('mushin.approach');
    expect(campaign.refundUpgrades()).toBe(false);
    expect(ui().save.upgrades).toEqual({ capacity: 1, range: 1 });
    campaign.toMap();
    expect(campaign.refundUpgrades()).toBe(true);
    expect(ui().save.upgrades).toBeUndefined();
    expect(loadSave(store)!.upgrades).toBeUndefined();
    expect(campaign.refundUpgrades()).toBe(false); // nothing left to refund
    expect(campaign.buyUpgrade('range')).toBe(true);
    expect(campaign.buyUpgrade('range')).toBe(true); // 6 + 14 = 20 of 24
    expect(loadSave(store)!.upgrades).toEqual({ capacity: 0, range: 2 });
  });
});

describe('Only the campaign controller hands a seat a bonus (static)', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
    });

  it('outside src/sim and src/campaign, only src/app/campaign.ts mentions a loadout bonus', () => {
    const users = files('src')
      .filter((f) => !f.startsWith(join('src', 'sim')) && !f.startsWith(join('src', 'campaign')))
      .filter((f) => /loadoutBonus/.test(readFileSync(f, 'utf8')));
    expect(users).toEqual([join('src', 'app', 'campaign.ts')]);
  });

  it('the controller asks for one only in the boss and field mission builders, never for a raid', () => {
    const src = readFileSync(join('src', 'app', 'campaign.ts'), 'utf8');
    expect(src.match(/withLoadout\(/g)).toHaveLength(3); // the definition and two builders
    const playRaid = src.slice(src.indexOf('private playRaid('), src.indexOf('private enterRaid('));
    expect(playRaid.length).toBeGreaterThan(100);
    expect(playRaid).not.toMatch(/loadout/i);
  });
});
