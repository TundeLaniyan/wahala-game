/**
 * Generator Parts through the real CampaignController (decisions PR1-PR8): a saved Oshodi run earns Parts, buying an
 * upgrade persists, the bonus reaches the field and boss mission options (human seat only) of every district (PR11),
 * buying is refused during a mission, and a finished mission reports the Parts it paid. Campaign-wide coverage (every
 * district, raids, refund) is in tests/app/campaign-progression-wide-flow.test.ts.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyMissionResult,
  applySectionResult,
  createSave,
  loadSave,
  persistSave,
} from '../../src/campaign';
import type { CampaignSave, KeyValueStore } from '../../src/campaign';
import { CampaignController } from '../../src/app/campaign';
import type { MissionHost } from '../../src/app/ports';
import { useGameStore } from '../../src/app/store';
import type { GameOptions, MissionId, MissionOutcome } from '../../src/sim';

class MapStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem = (k: string): string | null => this.data.get(k) ?? null;
  setItem = (k: string, v: string): void => void this.data.set(k, v);
  removeItem = (k: string): void => void this.data.delete(k);
}

const win = (id: MissionId, stars: 1 | 2 | 3, sectionMissionId?: string): MissionOutcome => ({
  result: 'won',
  missionId: id,
  modifiers: [],
  seconds: 100,
  livesUsed: 0,
  phasesCleared: 3,
  defeat: null,
  stars,
  creditedKills: 0,
  ...(sectionMissionId ? { sectionMissionId, raidBonus: 0 } : {}),
});

function oshodiCleared(): CampaignSave {
  let s = createSave(0);
  s = applySectionResult(s, win('oshodi', 2, 'oshodi.approach'), 1).save;
  s = applySectionResult(s, win('oshodi', 2, 'oshodi.railEdge'), 1).save;
  return applyMissionResult(s, win('oshodi', 2), 1).save; // 12 Parts
}

function rig(save: CampaignSave) {
  const store = new MapStore();
  persistSave(store, save);
  const started: GameOptions[] = [];
  const host: MissionHost = { startMission: (o) => void started.push(o), stop() {} };
  const campaign = new CampaignController({ store, host, now: () => 9_000, seed: () => 4 });
  campaign.load();
  return { campaign, store, started };
}

const ui = () => useGameStore.getState().campaign!;

describe('Generator Parts in the campaign controller', () => {
  beforeEach(() => useGameStore.setState({ campaign: null }));

  it('buys, persists and applies the upgrade to field and boss missions (human seat)', () => {
    const { campaign, store, started } = rig(oshodiCleared());
    expect(campaign.buyUpgrade('capacity')).toBe(true);
    expect(campaign.buyUpgrade('range')).toBe(true);
    expect(campaign.buyUpgrade('range')).toBe(false); // level 2 costs 14: 0 Parts left
    expect(loadSave(store)!.upgrades).toEqual({ capacity: 1, range: 1 });

    expect(campaign.startSectionMission('oshodi.approach')).toBe(true);
    expect(started.at(-1)!.players[0]!.loadoutBonus).toEqual({ capacity: 1, range: 1 });
    expect(
      started
        .at(-1)!
        .players.slice(1)
        .every((p) => p.loadoutBonus === undefined),
    ).toBe(true);
    campaign.toMap();

    expect(campaign.startMission('oshodi')).toBe(true);
    expect(started.at(-1)!.players[0]!.loadoutBonus).toEqual({ capacity: 1, range: 1 });
    campaign.toMap();

    expect(campaign.startSectionMission('mushin.approach')).toBe(true);
    expect(started.at(-1)!.players[0]!.loadoutBonus).toEqual({ capacity: 1, range: 1 });
  });

  it('refuses to buy during a mission', () => {
    const { campaign } = rig(oshodiCleared());
    campaign.startSectionMission('oshodi.approach');
    expect(campaign.buyUpgrade('capacity')).toBe(false);
    expect(ui().save.upgrades).toBeUndefined();
  });

  it('reports the Parts a result paid, once', () => {
    const { campaign } = rig(createSave(0));
    campaign.startSectionMission('oshodi.approach');
    campaign.finishMission(win('oshodi', 1, 'oshodi.approach'));
    expect(ui().sectionResult!.partsGained).toBe(3);
    campaign.startSectionMission('oshodi.approach');
    campaign.finishMission(win('oshodi', 1, 'oshodi.approach'));
    expect(ui().sectionResult!.partsGained).toBe(0);
    campaign.startSectionMission('oshodi.approach');
    campaign.finishMission(win('oshodi', 3, 'oshodi.approach'));
    expect(ui().sectionResult!.partsGained).toBe(2);
  });
});
