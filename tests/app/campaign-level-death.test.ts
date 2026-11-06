/**
 * The hotfix rules (a one-player campaign death never enters multiplayer spectating; the mission's lives and checkpoint
 * respawn it) hold on EVERY campaign difficulty: Easy, Normal and Hard, in a field mission, a boss mission and a raid.
 * Mirrors tests/app/campaign-death-respawn.test.ts with `level` passed to the real builders.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/session', () => ({
  commands: new Proxy({}, { get: () => () => undefined }),
  liveMatch: () => null,
}));
import { MatchController } from '../../src/app/MatchController';
import type { Bot, InputPort, RendererPort } from '../../src/app/ports';
import { DEFAULT_GAME_SETTINGS } from '../../src/app/settings';
import { useGameStore } from '../../src/app/store';
import { RumbleHud } from '../../src/ui/RumbleHud';
import { CAMPAIGN_LEVELS, buildMissionGame, buildRaidGame } from '../../src/sim';
import type { CampaignLevel, GameState } from '../../src/sim';
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
const rig = () => new MatchController({ renderer, input, botFactory: () => idle });

let t = 0;
const frames = (m: MatchController, n: number): void => {
  for (let i = 0; i < n; i++) {
    t += 1000 / 60;
    m.frame(t);
  }
};

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

beforeEach(() => {
  useGameStore.setState({
    hud: null,
    screen: 'title',
    paused: false,
    settings: { ...DEFAULT_GAME_SETTINGS },
  });
});

describe.each(CAMPAIGN_LEVELS)('campaign death at %s', (level: CampaignLevel) => {
  const begin = (m: MatchController, fieldId?: string) => {
    m.startMission(
      buildMissionGame({
        spec: { id: 'oshodi', ...(fieldId ? { fieldId } : {}) },
        humanCharacter: 'streetBaller',
        seed: 7,
        level,
      }),
      { missionId: 'oshodi', difficulty: 'rookie', onEnd: () => undefined },
    );
    const state = m.state!;
    state.match.phase = 'playing';
    state.match.countdownRemaining = 0;
    advance(state, 2);
    return state;
  };

  it.each([
    ['field mission', 'oshodi.approach'],
    ['boss mission', undefined],
  ])('%s: respawn bar, no spectating, one life spent, respawned at the checkpoint', (_n, fieldId) => {
    const m = rig();
    const state = begin(m, fieldId);
    expect(state.players[0]!.vitals!.maxHp).toBe({ easy: 5, normal: 4, hard: 3 }[level]);
    const before = state.mission!.livesUsed;
    defeatHuman(state);
    frames(m, 5);
    expect(m.spectating).toBeNull();
    expect(hud().inCampaign).toBe(true);
    const markup = renderToStaticMarkup(
      createElement(RumbleHud, { r: hud().rumble!, phase: 'playing', localAlive: false, inCampaign: true }),
    );
    expect(markup).toContain('respawn-banner');
    expect(markup).not.toContain('skip-results');
    expect(markup).not.toContain('data-testid="spectate"');
    frames(m, 60 * 6);
    expect(state.players[0]!.alive).toBe(true);
    expect(state.mission!.livesUsed).toBe(before + 1);
    expect(m.spectating).toBeNull();
  });

  it('a raid is a campaign run: never the multiplayer "out" bar', () => {
    const m = rig();
    m.playRaid(
      buildRaidGame({ raidId: 'warehouseDispatchDepot', humanCharacter: 'streetBaller', seed: 7, level }),
      { raidId: 'warehouseDispatchDepot', difficulty: 'rookie', onEnd: () => undefined },
    );
    const state = m.state!;
    state.match.phase = 'playing';
    state.match.countdownRemaining = 0;
    advance(state, 2);
    defeatHuman(state);
    frames(m, 5);
    expect(m.spectating).toBeNull();
    expect(hud().inCampaign).toBe(true);
  });
});
