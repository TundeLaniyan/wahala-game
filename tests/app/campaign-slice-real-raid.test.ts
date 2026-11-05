/**
 * THE FULL VERTICAL SLICE WITH THE REAL RAID (docs/CAMPAIGN_EXPANSION_PLAN.md): Oshodi section 1 through the real
 * campaign and match controllers. The field part is walked by a scripted human; at the warehouse door the REAL raid
 * runtime (`warehouseDispatchDepot`: marked cargo, waves, belts and shipments, a locked area, two optional rooms,
 * extraction) is played to `completed` by the raid scripted human (ordinary intents); the field comes back on the
 * return tile, the return route clears the section, the next section unlocks and the save persists.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { loadSave, sectionStatus } from '../../src/campaign';
import type { KeyValueStore } from '../../src/campaign';
import { CampaignController } from '../../src/app/campaign';
import { MatchController } from '../../src/app/MatchController';
import { MENU_HOME, currentScreen } from '../../src/app/menu';
import type { Bot, InputPort, RendererPort } from '../../src/app/ports';
import { DEFAULT_GAME_SETTINGS } from '../../src/app/settings';
import { useGameStore } from '../../src/app/store';
import { Tile } from '../../src/sim';
import type { SimEvent } from '../../src/sim';
import { RAID_TUNING } from '../../src/sim/raid';
import { FieldWalker } from '../field-helpers';
import { ScriptedHuman as RaidHuman } from '../raid-helpers';

class MapStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem = (k: string): string | null => this.data.get(k) ?? null;
  setItem = (k: string, v: string): void => void this.data.set(k, v);
  removeItem = (k: string): void => void this.data.delete(k);
}

beforeEach(() => {
  useGameStore.setState({
    campaign: null,
    menu: MENU_HOME,
    screen: 'title',
    hud: null,
    paused: false,
    settings: { ...DEFAULT_GAME_SETTINGS },
  });
});

describe('campaign vertical slice with the real classic raid', () => {
  it('field -> warehouse door -> real raid completed -> back in the field -> section cleared -> next section unlocked -> saved', () => {
    const store = new MapStore();
    const walker = new FieldWalker();
    const renderer = {
      loadGame() {},
      handleEvents() {},
      render() {},
      pickEntry: () => null,
      setQuality() {},
    } as unknown as RendererPort;
    const input: InputPort = {
      navMode: false,
      pollDevices() {},
      buildIntent: () => (match.state && !match.isRaid ? walker.decide(match.state) : {}),
      clear() {},
    };
    const idle: Bot = { decide: () => ({}) };
    const match = new MatchController({ renderer, input, botFactory: () => idle });
    const campaign = new CampaignController({ store, host: match, now: () => 5_000, seed: () => 7 });
    let t = 0;
    const frame = (n = 1): void => {
      for (let i = 0; i < n; i++) {
        t += 1000 / 60;
        match.frame(t);
      }
    };
    const until = (done: () => boolean, max = 60 * 400): void => {
      for (let i = 0; i < max && !done(); i++) frame();
    };
    const ui = () => useGameStore.getState().campaign!;
    const screen = () => currentScreen(useGameStore.getState().menu);

    campaign.load();
    campaign.startNew();
    campaign.storyDone();
    expect(campaign.startSectionMission('oshodi.approach')).toBe(true);
    const field = match.state!;
    field.tiles = field.tiles.map((tile) => (tile === Tile.Soft ? Tile.Empty : tile)); // the walker does not blast crates

    // 1-3: enter the district section, walk to the warehouse and hold the door: the real raid starts
    until(() => match.isRaid);
    const raid = match.state!;
    expect(raid.settings.game).toBe('raid');
    expect(raid.raid).toBeTruthy();
    expect(raid.config.generator.blastMode).toBe('plus'); // classic raids use cross bombs
    expect(field.config.generator.blastMode).toBe('radial'); // the field mission keeps the Rumble radius

    // 4-9: the raid is played start to finish by the scripted human: marked cargo, waves, optional rooms, extraction
    // the script is written for a raid already in play: skip the 2.5 s countdown exactly like tests/raid-helpers newRaid
    raid.match.phase = 'playing';
    raid.match.countdownRemaining = 0;
    const sink: SimEvent[] = [];
    const me = new RaidHuman(raid, sink);
    me.idle(RAID_TUNING.spawnWarnTicks + 5);
    for (const id of [1, 2, 3]) me.kill(id);
    me.destroy({ x: 11, y: 1 }); // the lock-box crate: the armour room
    me.walkTo(1, 1);
    me.destroy({ x: 8, y: 7 });
    me.idle(RAID_TUNING.spawnWarnTicks + 5);
    for (const id of [4, 5, 6]) me.kill(id);
    me.walkTo(13, 8); // the floor switch: the heal room
    me.walkTo(11, 11);
    me.destroy({ x: 9, y: 9 });
    me.destroy({ x: 14, y: 1 });
    me.opts = { belts: true };
    me.walkTo(15, 11);
    me.idle(2);
    expect(raid.raid!.outcome?.result).toBe('completed');
    expect(raid.raid!.outcome!.cargoDestroyed).toBe(raid.raid!.outcome!.cargoTotal);
    expect(raid.raid!.outcome!.optionalRoomsOpened).toBe(2);

    // 10: the controller hands the player back to the field map on the return tile, then the return route clears it
    until(() => !match.isRaid);
    expect(match.state).toBe(field);
    expect(field.mission!.field!.doors[0]).toMatchObject({ status: 'done' });
    until(() => screen() === 'campaignResult');
    expect(ui().sectionResult).toMatchObject({ missionId: 'oshodi.approach', kind: 'field' });
    expect(ui().sectionResult!.summary).toMatchObject({ firstClear: true, sectionCleared: true });
    expect((ui().sectionResult!.outcome as { raidBonus?: number }).raidBonus ?? 0).toBeGreaterThan(0); // the real raid's stars paid a bonus
    expect(sectionStatus(ui().save, 'oshodi.s1')).toBe('cleared');
    expect(sectionStatus(ui().save, 'oshodi.s2')).toBe('available'); // the next section is unlocked
    expect(sectionStatus(loadSave(store)!, 'oshodi.s2')).toBe('available'); // and persisted
  }, 180_000);
});
