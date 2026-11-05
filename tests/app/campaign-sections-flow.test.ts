/**
 * The campaign vertical slice with sections, through the REAL controllers and a scripted human (ordinary intents only):
 * Oshodi section 1 (Terminal Approach): walk the checkpoints -> hold the warehouse door -> the raid starts (the game in
 * play switches format) -> the raid ends -> back in the field on the return tile -> walk the way back -> section cleared ->
 * the next section is unlocked -> the save persists and a restart resumes on it. Also: a failed raid and its retry, the
 * pause-menu actions inside a raid (Retry raid, Leave raid, Back to map), and the boss gate.
 *
 * The raid itself is raid-sim's runtime in the integrated build; here `buildRaidGame` is the minimal stub and the raid's
 * outcome is a fixture put where the runtime puts it (`state.raid.outcome`).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { loadSave, nextMission, sectionStatus } from '../../src/campaign';
import type { KeyValueStore } from '../../src/campaign';
import { CampaignController } from '../../src/app/campaign';
import { MatchController } from '../../src/app/MatchController';
import { MENU_HOME, currentScreen } from '../../src/app/menu';
import type { Bot, InputPort, RendererPort } from '../../src/app/ports';
import { DEFAULT_GAME_SETTINGS } from '../../src/app/settings';
import { useGameStore } from '../../src/app/store';
import { Tile } from '../../src/sim';
import type { GameState, RaidOutcome } from '../../src/sim';
import { FieldWalker } from '../field-helpers';
import { raidWin } from './sectionHelpers';

class MapStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem = (k: string): string | null => this.data.get(k) ?? null;
  setItem = (k: string, v: string): void => void this.data.set(k, v);
  removeItem = (k: string): void => void this.data.delete(k);
}

interface Rig {
  campaign: CampaignController;
  match: MatchController;
  store: MapStore;
  loads: GameState[];
  frame(n?: number): void;
  until(done: () => boolean, maxFrames?: number): void;
}

function rig(store = new MapStore()): Rig {
  const loads: GameState[] = [];
  const renderer = {
    loadGame: (s: GameState) => void loads.push(s),
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
  const campaign = new CampaignController({ store, host: match, now: () => 5_000, seed: () => 7 });
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
  return { campaign, match, store, loads, frame, until };
}

const ui = () => useGameStore.getState().campaign!;
const screen = () => currentScreen(useGameStore.getState().menu);

/** What the raid runtime does at the end of a raid: write the outcome where the app reads it. */
function endRaid(state: GameState, outcome: RaidOutcome): void {
  (state as GameState & { raid?: { outcome: RaidOutcome } }).raid = { outcome };
}

function startOshodiApproach(r: Rig): GameState {
  r.campaign.load();
  r.campaign.startNew();
  r.campaign.storyDone();
  expect(r.campaign.startSectionMission('oshodi.approach')).toBe(true);
  const field = r.match.state!;
  // the scripted human walks and does not blast crates, so the soft blocks are cleared (the sim tests do the same)
  field.tiles = field.tiles.map((t) => (t === Tile.Soft ? Tile.Empty : t));
  return field;
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

describe('Oshodi section 1, end to end', () => {
  it('field -> door -> raid -> back in the field -> the way back -> section cleared -> next section -> saved', () => {
    const r = rig();
    const field = startOshodiApproach(r);
    expect(useGameStore.getState().screen).toBe('playing');
    expect(r.match.isMission).toBe(true);
    expect(field.mission!.field!.fieldId).toBe('oshodi.approach');
    expect(ui().active).toMatchObject({ missionId: 'oshodi', sectionMissionId: 'oshodi.approach' });

    // the scripted human walks the checkpoints and holds the warehouse door: the raid starts
    r.until(() => r.match.isRaid);
    expect(r.match.isRaid).toBe(true);
    expect(r.match.state).not.toBe(field);
    expect(r.match.state!.settings.game).toBe('raid'); // the game in play switched format
    expect(r.match.state!.mission).toBeUndefined();
    expect(r.match.isMission).toBe(false);
    expect(field.mission!.pendingRaid).toMatchObject({ doorId: 'depot', raidId: 'warehouseDispatchDepot' });
    expect(ui().active!.raid).toEqual({ doorId: 'depot', raidId: 'warehouseDispatchDepot' });
    const ticksAtDoor = field.tick;
    r.frame(120); // the field is paused underneath: it does not advance while the raid is played
    expect(field.tick).toBe(ticksAtDoor);

    // the raid ends (the runtime writes the outcome); after a beat the field comes back
    endRaid(r.match.state!, raidWin('warehouseDispatchDepot', { stars: 3, hpLeft: 2 }));
    r.until(() => !r.match.isRaid);
    expect(r.match.state).toBe(field);
    expect(r.match.isMission).toBe(true);
    expect(r.loads.at(-1)).toBe(field); // the renderer was handed the field map again
    const f = field.mission!.field!;
    expect(f.doors[0]).toMatchObject({ status: 'done', stars: 3 });
    expect(field.mission!.pendingRaid).toBeNull();
    expect([field.players[0]!.x, field.players[0]!.y]).toEqual([25, 43]); // the return tile
    expect(ui().active!.raid).toBeUndefined();
    expect(f.leg).toBe(2); // the way back

    // walk the return route: the mission is complete and the section result shows
    r.until(() => screen() === 'campaignResult');
    expect(screen()).toBe('campaignResult');
    const sr = ui().sectionResult!;
    expect(sr).toMatchObject({ missionId: 'oshodi.approach', kind: 'field' });
    expect(sr.summary).toMatchObject({
      firstClear: true,
      sectionCleared: true,
      unlockedSections: ['oshodi.s2'],
    });
    expect(sr.outcome).toMatchObject({ result: 'won', sectionMissionId: 'oshodi.approach', raidBonus: 1 });
    expect(ui().result).toBeNull();
    expect(useGameStore.getState().screen).toBe('title');
    expect(sectionStatus(ui().save, 'oshodi.s1')).toBe('cleared');
    expect(sectionStatus(ui().save, 'oshodi.s2')).toBe('available');
    expect(ui().save.districts.oshodi.status).toBe('available'); // only the boss clears the district
    expect(ui().save.sectionRewards).toEqual(['reward.section.oshodi.approach']);

    // persisted: a restart resumes on the next section
    const restarted = rig(r.store);
    restarted.campaign.load();
    expect(sectionStatus(restarted.campaign.ui!.save, 'oshodi.s1')).toBe('cleared');
    expect(nextMission(loadSave(r.store)!)).toMatchObject({ missionId: 'oshodi.railEdge' });
    restarted.campaign.open();
    expect(restarted.campaign.ui!.selected).toBe('oshodi');
    // Continue starts the next suggested mission: Rail Edge
    restarted.campaign.continue();
    expect(restarted.match.state!.mission!.field!.fieldId).toBe('oshodi.railEdge');
  });

  it('a failed raid returns to the field; the door stays open and the retry succeeds', () => {
    const r = rig();
    const field = startOshodiApproach(r);
    r.until(() => r.match.isRaid);
    endRaid(r.match.state!, raidWin('warehouseDispatchDepot', { result: 'failed', stars: 0, hpLeft: 0 }));
    r.until(() => !r.match.isRaid);
    expect(r.match.state).toBe(field);
    const f = field.mission!.field!;
    expect(f.doors[0]).toMatchObject({ status: 'failed', attempts: 1 });
    expect(field.mission!.livesUsed).toBe(1);
    expect(f.leg).toBe(1); // still on the door leg
    expect([field.players[0]!.x, field.players[0]!.y]).toEqual([25, 43]);

    // the walker steps back on the door: a second raid, this one completed
    r.until(() => r.match.isRaid);
    expect(r.match.isRaid).toBe(true);
    endRaid(r.match.state!, raidWin('warehouseDispatchDepot'));
    r.until(() => screen() === 'campaignResult');
    expect(ui().sectionResult!.outcome).toMatchObject({ result: 'won', livesUsed: 1 });
    expect(f.doors[0]).toMatchObject({ status: 'done', attempts: 2 });
  });

  it('a raid that ends with no outcome (the match just ends) still hands control back', () => {
    const r = rig();
    const field = startOshodiApproach(r);
    r.until(() => r.match.isRaid);
    const raid = r.match.state!;
    raid.match.phase = 'ended';
    raid.match.result = { kind: 'win', winnerId: 0 };
    r.until(() => !r.match.isRaid);
    expect(r.match.state).toBe(field);
    expect(field.mission!.field!.doors[0]!.status).toBe('done');
  });
});

describe('the pause menu inside a raid', () => {
  it('Retry raid starts a fresh raid and keeps the field underneath', () => {
    const r = rig();
    const field = startOshodiApproach(r);
    r.until(() => r.match.isRaid);
    const first = r.match.state!;
    r.campaign.retryRaid();
    expect(r.match.isRaid).toBe(true);
    expect(r.match.state).not.toBe(first);
    expect(r.match.state!.settings.game).toBe('raid');
    expect(useGameStore.getState().paused).toBe(false);
    // the field mission is still waiting: ending the new raid returns to it
    endRaid(r.match.state!, raidWin('warehouseDispatchDepot'));
    r.until(() => !r.match.isRaid);
    expect(r.match.state).toBe(field);
  });

  it('Leave raid abandons it: back in the field, no life lost, the door open again', () => {
    const r = rig();
    const field = startOshodiApproach(r);
    r.until(() => r.match.isRaid);
    r.campaign.leaveRaid();
    expect(r.match.isRaid).toBe(false);
    expect(r.match.state).toBe(field);
    expect(field.mission!.livesUsed).toBe(0);
    expect(field.mission!.field!.doors[0]).toMatchObject({ status: 'idle', attempts: 1 });
    expect([field.players[0]!.x, field.players[0]!.y]).toEqual([25, 43]);
    expect(ui().active!.raid).toBeUndefined();
    // and the door can be entered again
    r.until(() => r.match.isRaid);
    expect(r.match.isRaid).toBe(true);
  });

  it('Back to campaign map leaves everything: nothing is saved mid-mission', () => {
    const r = rig();
    startOshodiApproach(r);
    const before = r.store.getItem('wahala.campaign.v1');
    r.until(() => r.match.isRaid);
    r.campaign.toMap();
    expect(r.match.isRaid).toBe(false);
    expect(r.match.state).toBeNull();
    expect(screen()).toBe('campaign');
    expect(ui().active).toBeNull();
    expect(r.store.getItem('wahala.campaign.v1')).toBe(before);
    expect(sectionStatus(ui().save, 'oshodi.s1')).toBe('available');
  });
});

describe('the boss gate and a locked section', () => {
  it('the boss briefing and start are refused until the earlier sections are cleared', () => {
    const r = rig();
    r.campaign.load();
    r.campaign.startNew();
    r.campaign.storyDone();
    r.campaign.beginBriefing('oshodi');
    expect(screen()).toBe('campaign');
    expect(r.campaign.startMission('oshodi')).toBe(false);
    expect(ui().notice).toContain('earlier sections');
    expect(r.campaign.startSectionMission('oshodi.railEdge')).toBe(false); // section 2 is locked
    expect(r.match.state).toBeNull();
  });

  it('a lost field mission counts an attempt only; Retry starts it again', () => {
    const r = rig();
    const field = startOshodiApproach(r);
    field.match.phase = 'ended';
    field.match.result = { kind: 'win', winnerId: 1 };
    r.until(() => screen() === 'campaignResult');
    expect(ui().sectionResult!.outcome.result).toBe('lost');
    expect(ui().save.missions['oshodi.approach']).toMatchObject({ attempts: 1, clears: 0 });
    expect(sectionStatus(ui().save, 'oshodi.s2')).toBe('locked');
    r.campaign.retry();
    expect(r.match.isMission).toBe(true);
    expect(r.match.state!.mission!.field!.fieldId).toBe('oshodi.approach');
    expect(ui().sectionResult).toBeNull();
  });
});
