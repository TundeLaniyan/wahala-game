/**
 * The campaign flow in the app layer, headless: the real CampaignController over a Map-backed save store and the
 * real MatchController with fake renderer / input / audio ports. The mission runtime is injected (a plain 2-player
 * game) so the flow is tested independently of the sim's mission code: a mission result is applied with
 * `finishMission(outcome)` exactly as the match-end hook does.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { CAMPAIGN_SAVE_KEY, CAMPAIGN, DISTRICT_ORDER, districtStatus, loadSave } from '../../src/campaign';
import type { KeyValueStore } from '../../src/campaign';
import { CampaignController, outcomeFromMatch } from '../../src/app/campaign';
import type { CampaignDeps } from '../../src/app/campaign';
import { MatchController } from '../../src/app/MatchController';
import { MENU_HOME, currentScreen } from '../../src/app/menu';
import type { Bot, BotFactory, InputPort, RendererPort } from '../../src/app/ports';
import { DEFAULT_GAME_SETTINGS } from '../../src/app/settings';
import { useGameStore } from '../../src/app/store';
import { STANDARD_ARENA_IDS } from '../../src/sim';
import type { Difficulty, GameOptions, MissionOutcome } from '../../src/sim';

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

class FakeInput implements InputPort {
  navMode = false;
  pollDevices(): void {}
  buildIntent(): Record<string, never> {
    return {};
  }
  clear(): void {}
}

class FakeRenderer implements RendererPort {
  loaded = 0;
  loadGame(): void {
    this.loaded++;
  }
  handleEvents(): void {}
  render(): void {}
  pickEntry(): null {
    return null;
  }
  setQuality(): void {}
}

interface Rig {
  campaign: CampaignController;
  match: MatchController;
  store: MapStore;
  renderer: FakeRenderer;
  built: Parameters<NonNullable<CampaignDeps['buildMission']>>[0][];
  botLevels: { playerId: number; difficulty: Difficulty }[];
  clock: { now: number };
}

/** A fake mission runtime: a plain two-player game (human + the "boss" bot) on a standard arena. */
function fakeMission(args: Parameters<NonNullable<CampaignDeps['buildMission']>>[0]): GameOptions {
  return {
    seed: args.seed,
    arenaId: STANDARD_ARENA_IDS[0],
    players: [
      { name: 'YOU', characterId: args.humanCharacter, isBot: false },
      { name: 'Boss', characterId: 'lekkiBoy', isBot: true, difficulty: args.spec.difficulty },
    ],
    settings: { game: 'classic', mode: 'crush' },
  };
}

function rig(store = new MapStore(), over: Partial<CampaignDeps> = {}): Rig {
  const renderer = new FakeRenderer();
  const botLevels: Rig['botLevels'] = [];
  const idle: Bot = { decide: () => ({}) };
  const botFactory: BotFactory = ({ difficulty, playerId }) => {
    botLevels.push({ playerId, difficulty });
    return idle;
  };
  const match = new MatchController({ renderer, input: new FakeInput(), botFactory });
  const built: Rig['built'] = [];
  const clock = { now: 1_000 };
  const campaign = new CampaignController({
    store,
    host: match,
    now: () => clock.now++,
    seed: () => 7,
    buildMission: (a) => {
      built.push(a);
      return fakeMission(a);
    },
    startingFighter: () => 'campusQueen',
    ...over,
  });
  return { campaign, match, store, renderer, built, botLevels, clock };
}

const win = (over: Partial<MissionOutcome> = {}): MissionOutcome => ({
  result: 'won',
  missionId: 'oshodi',
  modifiers: [],
  seconds: 95,
  livesUsed: 1,
  phasesCleared: 3,
  defeat: 'eliminated',
  stars: 2,
  creditedKills: 4,
  ...over,
});

const ui = () => useGameStore.getState().campaign!;
const screen = () => currentScreen(useGameStore.getState().menu);

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

describe('campaign flow: new campaign -> prologue -> map -> briefing -> boss intro -> mission -> result', () => {
  it('walks the whole journey and unlocks the next district', () => {
    const { campaign, match, store, built } = rig();
    campaign.load();
    expect(ui().started).toBe(false);
    expect(store.getItem(CAMPAIGN_SAVE_KEY)).toBeNull(); // nothing is written until a campaign starts

    campaign.open();
    expect(screen()).toBe('campaign');

    campaign.startNew();
    expect(ui().started).toBe(true);
    expect(ui().story).toBe('prologue');
    expect(ui().save.character).toBe('campusQueen'); // the menu's fighter is only READ
    expect(screen()).toBe('campaignStory');
    expect(store.getItem(CAMPAIGN_SAVE_KEY)).not.toBeNull();

    campaign.storyDone(); // played or skipped
    expect(screen()).toBe('campaign');
    expect(ui().save.prologueSeen).toBe(true);

    campaign.beginBriefing('oshodi');
    expect(screen()).toBe('briefing');
    expect(ui().selected).toBe('oshodi');

    campaign.setLoadout({ character: 'lekkiBoy', difficulty: 'standard' });
    expect(ui().save.character).toBe('lekkiBoy');
    expect(useGameStore.getState().settings.character).toBe(DEFAULT_GAME_SETTINGS.character); // setup untouched

    campaign.startFromBriefing(); // first time: the boss introduction, not the match
    expect(screen()).toBe('bossIntro');
    expect(useGameStore.getState().screen).toBe('title');

    campaign.bossIntroDone();
    expect(ui().save.districts.oshodi.introSeen).toBe(true);
    expect(useGameStore.getState().screen).toBe('playing');
    expect(match.isMission).toBe(true);
    expect(ui().active).toEqual({ missionId: 'oshodi', modifiers: [] });
    expect(built[0]!.spec).toEqual({ id: 'oshodi', modifiers: [], difficulty: 'standard', lives: 3 });
    expect(built[0]!.humanCharacter).toBe('lekkiBoy');
    expect(built[0]!.seed).toBe(7);

    campaign.finishMission(win());
    expect(useGameStore.getState().screen).toBe('title');
    expect(match.isMission).toBe(false);
    expect(screen()).toBe('campaignResult');
    expect(ui().active).toBeNull();
    expect(ui().result!.outcome.stars).toBe(2);
    expect(ui().result!.reward.rewards[0]!.id).toBe(CAMPAIGN.districts.oshodi.boss!.reward.id);
    expect(ui().result!.reward.unlockedDistricts).toEqual(['mushin']);
    expect(districtStatus(ui().save, 'oshodi')).toBe('cleared');
    expect(districtStatus(ui().save, 'mushin')).toBe('available');

    campaign.nextDistrict();
    expect(screen()).toBe('briefing');
    expect(ui().selected).toBe('mushin');
    expect(ui().result).toBeNull();

    // the save was written after every change: a restart restores the same progress
    const restored = loadSave(store)!;
    expect(restored.districts.oshodi.clears).toBe(1);
    expect(restored.districts.oshodi.bestStars).toBe(2);
    expect(restored.districts.mushin.status).toBe('available');
    expect(restored.character).toBe('lekkiBoy');
  });

  it('a second visit to a district skips the boss introduction and replays with an unlocked modifier', () => {
    const { campaign, built } = rig();
    campaign.load();
    campaign.startNew();
    campaign.beginBriefing('oshodi', 'rushHourDispatch'); // locked: the modifier is ignored until Oshodi is cleared
    expect(ui().modifier).toBeNull();
    campaign.bossIntroDone();
    campaign.finishMission(win());

    campaign.beginBriefing('oshodi', 'rushHourDispatch');
    expect(ui().modifier).toBe('rushHourDispatch');
    campaign.startFromBriefing(); // intro already seen: straight into the match
    expect(useGameStore.getState().screen).toBe('playing');
    expect(built.at(-1)!.spec.modifiers).toEqual(['rushHourDispatch']);
    expect(ui().active!.modifiers).toEqual(['rushHourDispatch']);
  });

  it('a loss or timeout counts an attempt, keeps the save, and Retry starts the same mission again', () => {
    const { campaign, built, match } = rig();
    campaign.load();
    campaign.startNew();
    campaign.startMission('oshodi');
    expect(built).toHaveLength(1);
    campaign.finishMission(win({ result: 'lost', stars: 0, defeat: null, phasesCleared: 1, livesUsed: 3 }));
    expect(screen()).toBe('campaignResult');
    expect(ui().save.districts.oshodi.attempts).toBe(1);
    expect(ui().save.districts.oshodi.status).toBe('available');
    expect(ui().result!.reward.rewards).toEqual([]);
    campaign.retry();
    expect(built).toHaveLength(2);
    expect(match.isMission).toBe(true);
    expect(ui().result).toBeNull();
    campaign.finishMission(win({ result: 'timeout', stars: 0, defeat: null }));
    expect(ui().save.districts.oshodi.attempts).toBe(2);
  });

  it('a locked district never starts a mission', () => {
    const { campaign, built } = rig();
    campaign.load();
    campaign.startNew();
    expect(campaign.startMission('lekki')).toBe(false);
    campaign.beginBriefing('mushin');
    expect(screen()).not.toBe('briefing');
    expect(built).toHaveLength(0);
  });

  it('the pause menu: Back to the map keeps the save; the mission match never writes the menu settings or MatchSummary', () => {
    const { campaign, match, store } = rig();
    campaign.load();
    campaign.startNew();
    campaign.startMission('oshodi');
    const settingsBefore = useGameStore.getState().settings;
    match.frame(0);
    match.frame(50);
    match.togglePause();
    expect(useGameStore.getState().paused).toBe(true);
    const savedBefore = store.getItem(CAMPAIGN_SAVE_KEY);
    campaign.toMap();
    expect(screen()).toBe('campaign');
    expect(useGameStore.getState().screen).toBe('title');
    expect(ui().active).toBeNull();
    expect(store.getItem(CAMPAIGN_SAVE_KEY)).toBe(savedBefore);
    expect(useGameStore.getState().settings).toBe(settingsBefore);
    expect(useGameStore.getState().summary).toBeNull();
  });

  it('the boss (seat 1) is played at least at Standard; the crew keeps the chosen level', () => {
    const { campaign, botLevels } = rig();
    campaign.load();
    campaign.startNew();
    campaign.setLoadout({ difficulty: 'rookie' });
    campaign.startMission('oshodi');
    expect(botLevels).toEqual([{ playerId: 1, difficulty: 'standard' }]);
  });

  it('a mission match that ends without a sim outcome still reaches the result screen (never MatchSummary)', () => {
    const { campaign, match } = rig();
    campaign.load();
    campaign.startNew();
    campaign.startMission('oshodi');
    const state = match.state!;
    state.match.phase = 'ended';
    state.match.result = { kind: 'win', winnerId: 0 };
    match.frame(0);
    expect(useGameStore.getState().screen).toBe('playing'); // the boss beat plays out first
    match.frame(5_000);
    expect(screen()).toBe('campaignResult');
    expect(useGameStore.getState().screen).toBe('title');
    expect(useGameStore.getState().summary).toBeNull();
    expect(ui().result!.outcome.result).toBe('won');
    expect(outcomeFromMatch(state, 'oshodi', []).stars).toBe(1);
    // exactly once
    match.frame(9_000);
    expect(ui().save.districts.oshodi.clears).toBe(1);
  });

  it('a mission that cannot start (runtime missing) leaves a notice instead of crashing', () => {
    const { campaign } = rig(new MapStore(), {
      buildMission: () => {
        throw new Error('mission runtime not merged yet');
      },
    });
    campaign.load();
    campaign.startNew();
    expect(campaign.startMission('oshodi')).toBe(false);
    expect(ui().notice).toContain('mission runtime not merged yet');
    expect(ui().active).toBeNull();
    expect(useGameStore.getState().screen).toBe('title');
  });
});

describe('finale and ending', () => {
  /** A save with the first five missions cleared (through the real reducers, not a hand-built object). */
  function clearUpTo(campaign: CampaignController, last: number) {
    const ids = DISTRICT_ORDER.filter((d) => d !== 'ojuelegba');
    for (const id of ids.slice(0, last)) {
      campaign.startMission(id);
      campaign.finishMission(win({ missionId: id as 'oshodi' }));
    }
  }

  it('clearing the sixth district offers the finale; the finale completes the campaign', () => {
    const { campaign, store } = rig();
    campaign.load();
    campaign.startNew();
    clearUpTo(campaign, 5);
    expect(ui().result!.reward.campaignComplete).toBe(false);
    campaign.continue();
    expect(ui().selected).toBe('lekki');
    campaign.startMission('lekki');
    campaign.finishMission(win({ missionId: 'lekki' }));
    expect(ui().result!.reward.campaignComplete).toBe(true);
    expect(ui().save.completed).toBe(false);

    campaign.playStory('finale');
    expect(screen()).toBe('campaignStory');
    campaign.storyDone();
    expect(ui().save.completed).toBe(true);
    expect(screen()).toBe('campaignComplete');
    expect(loadSave(store)!.completed).toBe(true);

    campaign.toMap();
    campaign.continue(); // a finished campaign opens the ending
    expect(screen()).toBe('campaignComplete');
  });

  it('the finale cannot be played before all six districts are cleared', () => {
    const { campaign } = rig();
    campaign.load();
    campaign.startNew();
    campaign.playStory('finale');
    expect(ui().story).toBe('prologue'); // the request was ignored
  });
});
