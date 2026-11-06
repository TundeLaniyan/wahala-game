/**
 * Decision CI1 (integration of the enemy combat fairness work with the campaign difficulty levels): the campaign level
 * picks the bot level of the campaign's active enemies. Normal = Casual, the baseline the fairness work measured (EF8);
 * Easy = Beginner and Hard = Standard, one level either side. Field-mission and raid enemies follow it through the REAL
 * controllers; a boss mission keeps the save's crew level and the Standard boss floor (MS4); old saves (crew level
 * Rookie, no campaign level) play Normal = Casual enemies.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { KeyValueStore } from '../../src/campaign';
import { CAMPAIGN_SAVE_KEY } from '../../src/campaign';
import { CampaignController } from '../../src/app/campaign';
import { MatchController } from '../../src/app/MatchController';
import { MENU_HOME } from '../../src/app/menu';
import type { BotFactory, InputPort, RendererPort } from '../../src/app/ports';
import { DEFAULT_GAME_SETTINGS } from '../../src/app/settings';
import { useGameStore } from '../../src/app/store';
import { CAMPAIGN_LEVELS, CAMPAIGN_LEVEL_DEFS, DIFFICULTIES, Tile, campaignEnemyLevel } from '../../src/sim';
import type { CampaignLevel, Difficulty } from '../../src/sim';
import { FieldWalker } from '../field-helpers';
import { clearSectionsOf } from './sectionHelpers';

class MapStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem = (k: string): string | null => this.data.get(k) ?? null;
  setItem = (k: string, v: string): void => void this.data.set(k, v);
  removeItem = (k: string): void => void this.data.delete(k);
}

function rig(store = new MapStore()) {
  const renderer = {
    loadGame() {},
    handleEvents() {},
    render() {},
    pickEntry: () => null,
    setQuality() {},
  } as unknown as RendererPort;
  const walker = new FieldWalker();
  const input: InputPort = {
    navMode: false,
    pollDevices() {},
    buildIntent: () => (match.state ? walker.decide(match.state) : {}),
    clear() {},
  };
  // bot levels by the game they were made for (each new game starts with seat 1 again)
  const games: Map<number, Difficulty>[] = [];
  const botFactory: BotFactory = ({ difficulty, playerId }) => {
    if (playerId === 1 || !games.length) games.push(new Map());
    games.at(-1)!.set(playerId, difficulty);
    return { decide: () => ({}) };
  };
  const match = new MatchController({ renderer, input, botFactory });
  const campaign = new CampaignController({ store, host: match, now: () => 5_000, seed: () => 7 });
  let t = 0;
  const until = (done: () => boolean, maxFrames = 60 * 300): void => {
    for (let i = 0; i < maxFrames && !done(); i++) {
      t += 1000 / 60;
      match.frame(t);
    }
  };
  return { campaign, match, games, until, store };
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

describe('the campaign level table picks the enemy bot level', () => {
  it('Normal = Casual (the fairness baseline), Easy one level below, Hard one level above', () => {
    expect(campaignEnemyLevel('normal')).toBe('casual');
    expect(campaignEnemyLevel(undefined)).toBe('casual');
    const at = (l: CampaignLevel) => DIFFICULTIES.indexOf(CAMPAIGN_LEVEL_DEFS[l].enemyLevel);
    expect(at('easy')).toBe(at('normal') - 1);
    expect(at('hard')).toBe(at('normal') + 1);
  });
});

describe.each(CAMPAIGN_LEVELS)('at %s', (level) => {
  it('field enemies and raid enemies play at the level enemy bot level, whatever the crew level', () => {
    const r = rig();
    r.campaign.load();
    r.campaign.startNew();
    r.campaign.storyDone();
    r.campaign.setLoadout({ difficulty: 'nightmare' }); // the crew level must not leak into field or raid enemies
    expect(r.campaign.setLevel(level)).toBe(true);
    expect(r.campaign.startSectionMission('oshodi.approach')).toBe(true);
    const field = r.match.state!;
    field.tiles = field.tiles.map((t) => (t === Tile.Soft ? Tile.Empty : t));
    const fieldBots = r.games.at(-1)!;
    expect(fieldBots.size).toBeGreaterThan(1);
    expect(new Set(fieldBots.values())).toEqual(new Set([campaignEnemyLevel(level)]));

    r.until(() => r.match.isRaid);
    expect(r.match.isRaid).toBe(true);
    const raidBots = r.games.at(-1)!;
    expect(raidBots).not.toBe(fieldBots);
    expect(raidBots.size).toBeGreaterThan(1);
    expect(new Set(raidBots.values())).toEqual(new Set([campaignEnemyLevel(level)]));
  });

  it('a boss mission keeps the crew level and the Standard boss floor', () => {
    const r = rig();
    r.campaign.load();
    r.campaign.startNew();
    r.campaign.storyDone();
    r.campaign.setLoadout({ difficulty: 'beginner' });
    r.campaign.setLevel(level);
    clearSectionsOf(r.campaign, 'oshodi');
    expect(r.campaign.startMission('oshodi')).toBe(true);
    const bots = r.games.at(-1)!;
    expect(bots.get(1)).toBe('standard');
    for (const [id, d] of bots) if (id !== 1) expect(d).toBe('beginner');
  });
});

it('an old save (crew level Rookie, no campaign level) plays Normal: Casual field enemies', () => {
  const store = new MapStore();
  const first = rig(store);
  first.campaign.load();
  first.campaign.startNew();
  first.campaign.storyDone();
  const raw = JSON.parse(store.getItem(CAMPAIGN_SAVE_KEY)!) as Record<string, unknown>;
  delete raw.campaignLevel;
  raw.difficulty = 'rookie';
  store.setItem(CAMPAIGN_SAVE_KEY, JSON.stringify(raw));

  const r = rig(store);
  r.campaign.load();
  expect(useGameStore.getState().campaign!.save.campaignLevel).toBe('normal');
  expect(r.campaign.startSectionMission('oshodi.approach')).toBe(true);
  expect(new Set(r.games.at(-1)!.values())).toEqual(new Set(['casual']));
});
