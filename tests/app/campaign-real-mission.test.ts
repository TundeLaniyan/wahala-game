/**
 * The first campaign vertical slice, end to end and headless: the real CampaignController starts the real Oshodi
 * mission (real mission runtime, no fakes for the rules) on the real MatchController; a scripted human (ordinary
 * intents only) jams the relays, exposes and eliminates the boss; the match-end hook turns the sim's outcome into
 * the campaign result, the district clears, the next one unlocks and the save survives a restart.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { CampaignController } from '../../src/app/campaign';
import { MatchController } from '../../src/app/MatchController';
import { MENU_HOME, currentScreen } from '../../src/app/menu';
import type { Bot, InputPort, RendererPort } from '../../src/app/ports';
import { DEFAULT_GAME_SETTINGS } from '../../src/app/settings';
import { useGameStore } from '../../src/app/store';
import { districtStatus, loadSave } from '../../src/campaign';
import type { KeyValueStore } from '../../src/campaign';
import { Tile } from '../../src/sim';
import { ScriptedHuman } from '../mission-helpers';
import { clearSectionsOf } from './sectionHelpers';

class MapStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem = (k: string): string | null => this.data.get(k) ?? null;
  setItem = (k: string, v: string): void => void this.data.set(k, v);
  removeItem = (k: string): void => void this.data.delete(k);
}

const renderer: RendererPort = {
  loadGame() {},
  handleEvents() {},
  render() {},
  pickEntry: () => null,
  setQuality() {},
} as unknown as RendererPort;

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

describe('campaign vertical slice: Oshodi, real runtime', () => {
  it('plays from the briefing to the defeated boss, clears the district and persists it', () => {
    const store = new MapStore();
    const human = new ScriptedHuman();
    const input: InputPort = {
      navMode: false,
      pollDevices() {},
      buildIntent: () => human.decide(match.state!),
      clear() {},
    };
    const idle: Bot = { decide: () => ({}) };
    const match = new MatchController({ renderer, input, botFactory: () => idle });
    const campaign = new CampaignController({ store, host: match, now: () => 5_000, seed: () => 7 });
    campaign.load();
    campaign.startNew();
    campaign.storyDone();
    clearSectionsOf(campaign, 'oshodi'); // the boss is playable once its earlier sections are cleared
    campaign.beginBriefing('oshodi');
    campaign.startFromBriefing();
    campaign.bossIntroDone();

    expect(useGameStore.getState().screen).toBe('playing');
    expect(match.isMission).toBe(true);
    expect(match.state!.mission).toBeTruthy();
    // the scripted human walks; it does not blast crates, so the soft blocks are cleared (the sim's own playthrough test does the same)
    match.state!.tiles = match.state!.tiles.map((t) => (t === Tile.Soft ? Tile.Empty : t));

    // run frames of wall-clock time until the campaign shows the result (the match-end hook fires ~1.6 s after)
    let t = 0;
    for (let i = 0; i < 60 * 260 && currentScreen(useGameStore.getState().menu) !== 'campaignResult'; i++) {
      t += 1000 / 60;
      match.frame(t);
    }
    const ui = useGameStore.getState().campaign!;
    expect(currentScreen(useGameStore.getState().menu)).toBe('campaignResult');
    expect(ui.result!.outcome).toMatchObject({ result: 'won', missionId: 'oshodi', defeat: 'eliminated' });
    expect(ui.result!.reward.unlockedDistricts).toEqual(['mushin']);
    expect(districtStatus(ui.save, 'oshodi')).toBe('cleared');
    expect(districtStatus(ui.save, 'mushin')).toBe('available');

    const restored = loadSave(store)!;
    expect(restored.districts.oshodi.clears).toBe(1);
    expect(restored.districts.oshodi.bestStars).toBeGreaterThanOrEqual(1);
  }, 120_000);
});
