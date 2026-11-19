/**
 * The briefing in the campaign flow (docs/MISSION_GUIDANCE.md, decisions MG1 and MG3): the map's Start / Continue open
 * the visual briefing (no match is running under it), its START plays the mission; a boss mission goes to the boss
 * briefing; a locked mission opens nothing. At the door hand-over the raid's instructions come up over the HELD raid:
 * real frames pass and the raid's clock does not move until START, then it runs.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { CampaignController } from '../../src/app/campaign';
import { MatchController } from '../../src/app/MatchController';
import { MENU_HOME, currentScreen } from '../../src/app/menu';
import type { Bot, InputPort, RendererPort } from '../../src/app/ports';
import { DEFAULT_GAME_SETTINGS } from '../../src/app/settings';
import { useGameStore } from '../../src/app/store';
import type { KeyValueStore } from '../../src/campaign';
import { Tile } from '../../src/sim';
import type { GameState } from '../../src/sim';
import { FieldWalker } from '../field-helpers';

class MapStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem = (k: string): string | null => this.data.get(k) ?? null;
  setItem = (k: string, v: string): void => void this.data.set(k, v);
  removeItem = (k: string): void => void this.data.delete(k);
}

function rig() {
  const renderer = {
    loadGame: () => undefined,
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
  const idle: Bot = { decide: () => ({}) };
  const match = new MatchController({ renderer, input, botFactory: () => idle });
  const campaign = new CampaignController({
    store: new MapStore(),
    host: match,
    now: () => 5_000,
    seed: () => 7,
  });
  let t = 0;
  const frame = (n = 1): void => {
    for (let i = 0; i < n; i++) {
      t += 1000 / 60;
      match.frame(t);
    }
  };
  const until = (done: () => boolean, maxFrames = 60 * 300): void => {
    for (let i = 0; i < maxFrames && !done(); i++) frame();
  };
  return { campaign, match, frame, until };
}

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

describe('the briefing screen before a mission', () => {
  it('Continue opens the first mission briefing with no match under it; START plays it', () => {
    const r = rig();
    r.campaign.load();
    r.campaign.startNew();
    r.campaign.storyDone();
    r.campaign.continue();
    expect(screen()).toBe('missionBrief');
    expect(ui().brief).toBe('oshodi.approach');
    expect(r.match.state).toBeNull(); // nothing is running: nothing can hurt the player
    expect(r.campaign.startBriefed()).toBe(true);
    expect(r.match.state!.mission!.field!.fieldId).toBe('oshodi.approach');
  });

  it('a locked mission opens nothing; a boss mission goes to the boss briefing', () => {
    const r = rig();
    r.campaign.load();
    r.campaign.startNew();
    r.campaign.storyDone();
    expect(r.campaign.openBrief('oshodi.railEdge')).toBe(false);
    expect(ui().notice).toMatch(/earlier sections/);
    expect(screen()).not.toBe('missionBrief');
    expect(r.campaign.openBrief('nope')).toBe(false);
    r.campaign.openBrief('oshodi.boss'); // locked boss: the briefing refuses with its own notice
    expect(screen()).not.toBe('missionBrief');
  });
});

describe('the raid briefing at the door hand-over', () => {
  it('the raid is held under its instructions until START, then it runs', () => {
    const r = rig();
    r.campaign.load();
    r.campaign.startNew();
    r.campaign.storyDone();
    expect(r.campaign.openBrief('oshodi.approach')).toBe(true);
    expect(r.campaign.startBriefed()).toBe(true);
    const field = r.match.state!;
    field.tiles = field.tiles.map((t) => (t === Tile.Soft ? Tile.Empty : t)); // the walker does not blast crates
    r.until(() => r.match.isRaid);
    expect(r.match.isRaid).toBe(true);
    expect(ui().raidBrief).toEqual({ raidId: 'warehouseDispatchDepot', compact: false });
    expect(r.match.briefHeld).toBe(true);
    const raid: GameState = r.match.state!;
    const tick = raid.tick;
    const fieldTick = field.tick;
    r.frame(120); // two seconds of real frames under the briefing
    expect(raid.tick).toBe(tick);
    expect(field.tick).toBe(fieldTick); // the field stays held underneath too
    r.campaign.startRaidFromBrief();
    expect(ui().raidBrief).toBeNull();
    expect(r.match.briefHeld).toBe(false);
    r.frame(30);
    expect(raid.tick).toBeGreaterThan(tick);
  });

  it('leaving the raid from the pause menu drops the briefing and the hold', () => {
    const r = rig();
    r.campaign.load();
    r.campaign.startNew();
    r.campaign.storyDone();
    r.campaign.openBrief('oshodi.approach');
    r.campaign.startBriefed();
    const field = r.match.state!;
    field.tiles = field.tiles.map((t) => (t === Tile.Soft ? Tile.Empty : t));
    r.until(() => r.match.isRaid);
    expect(ui().raidBrief).not.toBeNull();
    r.campaign.leaveRaid();
    expect(ui().raidBrief).toBeNull();
    expect(r.match.briefHeld).toBe(false);
    expect(r.match.state).toBe(field); // back in the field, which runs again
  });
});
