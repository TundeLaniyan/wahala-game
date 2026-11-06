/**
 * Campaign difficulty in the app layer: the level chosen at "New campaign" is saved and handed to every mission and raid
 * builder; it can be changed on the map but never during a live mission; a campaign saved before the levels existed
 * resumes as Normal. Real CampaignController over a Map-backed store (same fakes as campaign-flow.test.ts).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { CAMPAIGN_SAVE_KEY, createSave, loadSave } from '../../src/campaign';
import type { KeyValueStore } from '../../src/campaign';
import { CampaignController } from '../../src/app/campaign';
import type { CampaignDeps } from '../../src/app/campaign';
import { MatchController } from '../../src/app/MatchController';
import { MENU_HOME } from '../../src/app/menu';
import type { Bot, BotFactory, InputPort, RendererPort } from '../../src/app/ports';
import { DEFAULT_GAME_SETTINGS } from '../../src/app/settings';
import { useGameStore } from '../../src/app/store';
import { STANDARD_ARENA_IDS } from '../../src/sim';
import type { GameOptions } from '../../src/sim';
import { clearSectionsOf } from './sectionHelpers';

class MapStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v);
  }
  removeItem(k: string): void {
    this.data.delete(k);
  }
}
const input: InputPort = { navMode: false, pollDevices() {}, buildIntent: () => ({}), clear() {} } as never;
const renderer: RendererPort = {
  loadGame() {},
  handleEvents() {},
  render() {},
  pickEntry: () => null,
  setQuality() {},
} as never;
const idle: Bot = { decide: () => ({}) };
const botFactory: BotFactory = () => idle;

function rig(store = new MapStore()) {
  const built: Parameters<NonNullable<CampaignDeps['buildMission']>>[0][] = [];
  const match = new MatchController({ renderer, input, botFactory });
  const campaign = new CampaignController({
    store,
    host: match,
    now: () => 1_000,
    seed: () => 7,
    buildMission: (a): GameOptions => {
      built.push(a);
      return {
        seed: a.seed,
        arenaId: STANDARD_ARENA_IDS[0],
        players: [
          { name: 'YOU', characterId: a.humanCharacter, isBot: false },
          { name: 'Boss', characterId: 'lekkiBoy', isBot: true, difficulty: a.spec.difficulty },
        ],
        settings: { game: 'classic', mode: 'crush' },
      };
    },
  });
  return { campaign, store, built };
}
const ui = () => useGameStore.getState().campaign!;

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

describe('campaign difficulty in the controller', () => {
  it('defaults to Normal and saves the level chosen at New campaign', () => {
    const a = rig();
    a.campaign.load();
    a.campaign.startNew();
    expect(ui().save.campaignLevel).toBe('normal');

    const b = rig();
    b.campaign.load();
    b.campaign.startNew('hard');
    expect(ui().save.campaignLevel).toBe('hard');
    expect(loadSave(b.store)!.campaignLevel).toBe('hard');
  });

  it('hands the level to the mission builder and keeps it across a reload', () => {
    const a = rig();
    a.campaign.load();
    a.campaign.startNew('easy');
    a.campaign.storyDone();
    clearSectionsOf(a.campaign, 'oshodi');
    a.campaign.startMission('oshodi');
    expect(a.built.at(-1)!.level).toBe('easy');

    const b = rig(a.store);
    b.campaign.load();
    expect(ui().save.campaignLevel).toBe('easy');
  });

  it('can be changed between missions but not during one', () => {
    const a = rig();
    a.campaign.load();
    a.campaign.startNew();
    a.campaign.storyDone();
    expect(a.campaign.setLevel('hard')).toBe(true);
    expect(ui().save.campaignLevel).toBe('hard');
    expect(loadSave(a.store)!.campaignLevel).toBe('hard');

    clearSectionsOf(a.campaign, 'oshodi');
    expect(a.campaign.startMission('oshodi')).toBe(true);
    expect(ui().active).not.toBeNull();
    expect(a.campaign.setLevel('easy')).toBe(false);
    expect(ui().save.campaignLevel).toBe('hard');
    expect(ui().notice).toContain('not during a mission');
  });

  it('a campaign saved before the levels existed resumes as Normal', () => {
    const store = new MapStore();
    const old = JSON.parse(JSON.stringify(createSave(5))) as Record<string, unknown>;
    delete old.campaignLevel;
    store.setItem(CAMPAIGN_SAVE_KEY, JSON.stringify(old));
    const a = rig(store);
    a.campaign.load();
    expect(ui().started).toBe(true);
    expect(ui().save.campaignLevel).toBe('normal');
  });
});
