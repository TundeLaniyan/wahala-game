/**
 * HOTFIX regression: a one-player campaign death must NEVER enter multiplayer spectating (no "OUT" spectator bar, no
 * "Skip to results", no camera following other competitors). The downed human respawns under the mission's lives and
 * checkpoint rules (the DOWN / "Back in N" respawn bar shows), and when the last life is gone the mission ends through
 * `onEnd` (the campaign result flow). Multiplayer is unchanged: a plain City Rumble Survival match still spectates.
 *
 * The cause was presentation only: MatchController.updateSpectate ran for every City Rumble stage and the Rumble HUD
 * picked the spectator bar for any ruleset that is not Deathmatch / Team, so a campaign field or boss mission (played on a
 * Rumble stage) showed the spectator UI the moment the human was down; raids showed the standard "You're out!" bar.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// the Rumble HUD imports the browser session module (window, WebGL ...): only its commands are needed, and only as no-ops
vi.mock('../../src/app/session', () => ({
  commands: new Proxy({}, { get: () => () => undefined }),
  liveMatch: () => null,
}));
import { MatchController } from '../../src/app/MatchController';
import type { Bot, InputPort, MissionMeta, RendererPort } from '../../src/app/ports';
import { DEFAULT_GAME_SETTINGS } from '../../src/app/settings';
import { useGameStore } from '../../src/app/store';
import { RumbleHud } from '../../src/ui/RumbleHud';
import { buildMissionGame, buildRaidGame, createGame } from '../../src/sim';
import type { GameState, MissionOutcome } from '../../src/sim';
import { buildPlayers, matchRules } from '../../src/app/names';
import { advance } from '../mission-helpers';
import { addGenerator } from '../helpers';

const renderer = {
  loadGame() {},
  handleEvents() {},
  render() {},
  pickEntry: () => null,
  setQuality() {},
} as unknown as RendererPort;
const input: InputPort = { navMode: false, pollDevices() {}, buildIntent: () => ({}), clear() {} };
const idle: Bot = { decide: () => ({}) };

function rig(): MatchController {
  return new MatchController({ renderer, input, botFactory: () => idle });
}

let t = 0;
const frames = (m: MatchController, n: number): void => {
  for (let i = 0; i < n; i++) {
    t += 1000 / 60;
    m.frame(t);
  }
};

/**
 * A lethal campaign hit on the human through the real tick path: an enemy generator on their tile with one segment of
 * health left (a blast takes two), so the elimination schedules the respawn exactly as in play.
 */
function defeatHuman(state: GameState): void {
  const me = state.players[0]!;
  me.protectedUntil = 0;
  me.armour = 0;
  me.mounted = false;
  me.vitals!.hp = 1;
  me.vitals!.invulnUntil = 0;
  addGenerator(state, { ownerId: 1, x: me.x, y: me.y, timer: 1 });
  advance(state, 20);
  expect(me.alive).toBe(false);
}

const hud = () => useGameStore.getState().hud!;
const spectatorUi = (h: ReturnType<typeof hud>, alive: boolean): string =>
  renderToStaticMarkup(
    createElement(RumbleHud, { r: h.rumble!, phase: 'playing', localAlive: alive, inCampaign: h.inCampaign }),
  );

beforeEach(() => {
  useGameStore.setState({
    hud: null,
    screen: 'title',
    paused: false,
    settings: { ...DEFAULT_GAME_SETTINGS },
  });
});

describe('campaign death: a field mission on a City Rumble stage', () => {
  function start(onEnd: MissionMeta['onEnd'] = () => undefined) {
    const m = rig();
    m.startMission(
      buildMissionGame({
        spec: { id: 'oshodi', fieldId: 'oshodi.approach' },
        humanCharacter: 'streetBaller',
        seed: 7,
      }),
      {
        missionId: 'oshodi',
        difficulty: 'rookie',
        onEnd,
      },
    );
    const state = m.state!;
    state.match.phase = 'playing';
    state.match.countdownRemaining = 0;
    advance(state, 2);
    return { m, state };
  }

  it('shows the respawn bar, never the spectator bar or Skip, and does not follow another competitor', () => {
    const { m, state } = start();
    defeatHuman(state);
    frames(m, 5);
    expect(m.spectating, 'the camera must not be handed to another competitor').toBeNull();
    expect(hud().inCampaign).toBe(true);
    expect(hud().rumble!.spectating).toBeNull();
    const markup = spectatorUi(hud(), false);
    expect(markup).toContain('data-testid="respawn-banner"');
    expect(markup).not.toContain('data-testid="spectate"');
    expect(markup).not.toContain('skip-results');
    expect(markup).not.toContain('Skip to results');
    expect(markup).not.toContain('spectate-prev');
  });

  it('respawns the human at the mission checkpoint, one life spent, and the bar goes away', () => {
    const { m, state } = start();
    const before = state.mission!.livesUsed;
    defeatHuman(state);
    frames(m, 60 * 6);
    const me = state.players[0]!;
    expect(me.alive, 'the human respawned').toBe(true);
    expect(state.mission!.livesUsed).toBe(before + 1);
    expect({ x: me.x, y: me.y }).toEqual(state.mission!.field!.checkpoint);
    expect(m.spectating).toBeNull();
    expect(spectatorUi(hud(), true)).not.toContain('respawn-banner');
  });

  it('with no lives left the mission ends through onEnd (the campaign result flow), still never spectating', () => {
    let ended: MissionOutcome | null | undefined;
    const { m, state } = start((o) => {
      ended = o;
    });
    state.mission!.livesUsed = state.mission!.livesMax - 1; // the last life
    defeatHuman(state);
    frames(m, 60 * 8);
    expect(state.match.phase).toBe('ended');
    expect(ended, 'onEnd was called with the lost outcome').toBeTruthy();
    expect(ended!.result).toBe('lost');
    expect(m.spectating).toBeNull();
    expect(spectatorUi(hud(), false)).not.toContain('skip-results');
  });
});

describe('campaign death: a boss mission and a raid', () => {
  it('a boss mission (City Rumble stage) shows the respawn bar, not the spectator bar', () => {
    const m = rig();
    m.startMission(buildMissionGame({ spec: { id: 'oshodi' }, humanCharacter: 'streetBaller', seed: 7 }), {
      missionId: 'oshodi',
      difficulty: 'rookie',
      onEnd: () => undefined,
    });
    const state = m.state!;
    state.match.phase = 'playing';
    state.match.countdownRemaining = 0;
    advance(state, 2);
    defeatHuman(state);
    frames(m, 5);
    expect(m.spectating).toBeNull();
    const markup = spectatorUi(hud(), false);
    expect(markup).toContain('respawn-banner');
    expect(markup).not.toContain('skip-results');
  });

  it('a raid (standard HUD) is flagged as a campaign run, so the "You\'re out! Skip to results" bar cannot show', () => {
    const m = rig();
    m.playRaid(buildRaidGame({ raidId: 'warehouseDispatchDepot', humanCharacter: 'streetBaller', seed: 7 }), {
      raidId: 'warehouseDispatchDepot',
      difficulty: 'rookie',
      onEnd: () => undefined,
    });
    const state = m.state!;
    state.match.phase = 'playing';
    state.match.countdownRemaining = 0;
    advance(state, 2);
    defeatHuman(state);
    frames(m, 5);
    expect(m.spectating).toBeNull();
    expect(hud().inCampaign).toBe(true);
    expect(hud().localAlive).toBe(false);
  });
});

describe('multiplayer is unchanged: a City Rumble Survival match still spectates', () => {
  it('once the local human is out, the camera follows a survivor and the spectator bar (with Skip) shows', () => {
    const m = rig();
    const settings = {
      ...DEFAULT_GAME_SETTINGS,
      rumbleMode: 'survival' as const,
      rumbleArenaId: 'rumbleOshodi',
    };
    const seed = 7;
    const state = createGame({
      seed,
      arenaId: 'rumbleOshodi',
      players: buildPlayers(settings, seed),
      settings: matchRules(settings),
    });
    // start through the normal path (start() builds the same game from the settings)
    m.start(settings, seed);
    const live = m.state!;
    live.match.phase = 'playing';
    live.match.countdownRemaining = 0;
    expect(state.mission).toBeUndefined();
    const me = live.players[0]!;
    me.alive = false;
    me.eliminatedTick = live.tick;
    me.elimination = { kind: 'flame', ownerId: 1, eventId: 1 };
    me.eliminatedBy = 1;
    frames(m, 5);
    expect(m.spectating, 'a survivor is watched').not.toBeNull();
    expect(hud().inCampaign).toBe(false);
    const markup = spectatorUi(hud(), false);
    expect(markup).toContain('data-testid="spectate"');
    expect(markup).toContain('skip-results');
  });
});
