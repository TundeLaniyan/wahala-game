/**
 * Campaign persistence through the controller, with a Map-backed KeyValueStore: restart restores progress,
 * Delete save clears it, and corrupt, unavailable or full storage never crashes (a fresh in-memory save and a
 * small notice instead).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { CAMPAIGN_SAVE_KEY, districtStatus } from '../../src/campaign';
import type { KeyValueStore } from '../../src/campaign';
import { CampaignController } from '../../src/app/campaign';
import { MENU_HOME, currentScreen } from '../../src/app/menu';
import type { MissionHost } from '../../src/app/ports';
import { DEFAULT_GAME_SETTINGS } from '../../src/app/settings';
import { useGameStore } from '../../src/app/store';
import type { MissionOutcome } from '../../src/sim';

class MapStore implements KeyValueStore {
  data = new Map<string, string>();
  failWrites = false;
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    if (this.failWrites) throw new Error('QuotaExceededError');
    this.data.set(k, v);
  }
  removeItem(k: string): void {
    this.data.delete(k);
  }
}

const host: MissionHost = { startMission: () => undefined, stop: () => undefined };
const make = (store: KeyValueStore | null) =>
  new CampaignController({
    store,
    host,
    now: () => 5_000,
    seed: () => 1,
    buildMission: () => ({ seed: 1, players: [] }),
  });
const ui = () => useGameStore.getState().campaign!;

const won = (over: Partial<MissionOutcome> = {}): MissionOutcome => ({
  result: 'won',
  missionId: 'oshodi',
  modifiers: [],
  seconds: 80,
  livesUsed: 0,
  phasesCleared: 3,
  defeat: 'eliminated',
  stars: 3,
  creditedKills: 2,
  ...over,
});

beforeEach(() =>
  useGameStore.setState({
    campaign: null,
    menu: MENU_HOME,
    screen: 'title',
    settings: { ...DEFAULT_GAME_SETTINGS },
  }),
);

describe('campaign persistence', () => {
  it('restart restores progress, loadout and the fact that the campaign started', () => {
    const store = new MapStore();
    const first = make(store);
    first.load();
    first.startNew();
    first.setLoadout({ character: 'lekkiBoy', difficulty: 'skilled' });
    first.finishMission(won());

    useGameStore.setState({ campaign: null }); // a reload: new controller, same browser storage
    const second = make(store);
    second.load();
    expect(ui().started).toBe(true);
    expect(ui().storage).toBe('ok');
    expect(ui().notice).toBeNull();
    expect(ui().save.character).toBe('lekkiBoy');
    expect(ui().save.difficulty).toBe('skilled');
    expect(districtStatus(ui().save, 'oshodi')).toBe('cleared');
    expect(districtStatus(ui().save, 'mushin')).toBe('available');
    expect(ui().save.districts.oshodi.bestStars).toBe(3);
    expect(ui().selected).toBe('mushin'); // Continue goes to the next uncleared district
  });

  it('a fresh browser has no campaign and writes nothing until one is started', () => {
    const store = new MapStore();
    make(store).load();
    expect(ui().started).toBe(false);
    expect(store.data.size).toBe(0);
  });

  it('Delete save clears the store and shows the empty map', () => {
    const store = new MapStore();
    const c = make(store);
    c.load();
    c.startNew();
    c.finishMission(won());
    expect(store.getItem(CAMPAIGN_SAVE_KEY)).not.toBeNull();
    c.deleteSave();
    expect(store.getItem(CAMPAIGN_SAVE_KEY)).toBeNull();
    expect(ui().started).toBe(false);
    expect(districtStatus(ui().save, 'mushin')).toBe('locked');
    expect(currentScreen(useGameStore.getState().menu)).toBe('campaign');
    make(store).load();
    expect(ui().started).toBe(false);
  });

  it('New campaign replaces an old save', () => {
    const store = new MapStore();
    const c = make(store);
    c.load();
    c.startNew();
    c.finishMission(won());
    c.startNew();
    expect(districtStatus(ui().save, 'oshodi')).toBe('available');
    make(store).load();
    expect(districtStatus(ui().save, 'oshodi')).toBe('available');
  });

  it('a corrupt save gives a fresh in-memory campaign and a notice, and keeps a copy of the old text', () => {
    const store = new MapStore();
    store.setItem(CAMPAIGN_SAVE_KEY, '{not json');
    expect(() => make(store).load()).not.toThrow();
    expect(ui().started).toBe(false);
    expect(ui().notice).toMatch(/could not be read/);
    expect(store.getItem(`${CAMPAIGN_SAVE_KEY}.corrupt`)).toBe('{not json');
    expect(ui().save.districts.oshodi.status).toBe('available');
  });

  it('a save from a newer build is not overwritten blindly: it is kept aside and a fresh campaign is offered', () => {
    const store = new MapStore();
    store.setItem(CAMPAIGN_SAVE_KEY, JSON.stringify({ version: 99, districts: {} }));
    make(store).load();
    expect(ui().started).toBe(false);
    expect(ui().notice).toMatch(/could not be read/);
    expect(store.getItem(`${CAMPAIGN_SAVE_KEY}.corrupt`)).toContain('"version":99');
  });

  it('unavailable storage (private mode): the campaign works in memory with a notice', () => {
    const c = make(null);
    c.load();
    expect(ui().storage).toBe('unavailable');
    expect(ui().notice).toMatch(/not letting|save progress/);
    c.startNew();
    c.finishMission(won());
    expect(districtStatus(ui().save, 'mushin')).toBe('available');
  });

  it('a full or refusing store never throws: progress stays in memory and says so', () => {
    const store = new MapStore();
    const c = make(store);
    c.load();
    c.startNew();
    store.failWrites = true;
    expect(() => c.finishMission(won())).not.toThrow();
    expect(ui().storage).toBe('unavailable');
    expect(ui().notice).toMatch(/could not be saved/);
    expect(districtStatus(ui().save, 'oshodi')).toBe('cleared');
  });

  it('a store whose reads throw is treated as unavailable data, not a crash', () => {
    const bad: KeyValueStore = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(() => make(bad).load()).not.toThrow();
    expect(ui().started).toBe(false);
  });

  it('a hand-edited save cannot skip bosses (repaired through the campaign layer)', () => {
    const store = new MapStore();
    store.setItem(
      CAMPAIGN_SAVE_KEY,
      JSON.stringify({ version: 1, districts: { lekki: { status: 'cleared', clears: 1, bestStars: 3 } } }),
    );
    make(store).load();
    expect(districtStatus(ui().save, 'lekki')).toBe('locked');
  });
});
