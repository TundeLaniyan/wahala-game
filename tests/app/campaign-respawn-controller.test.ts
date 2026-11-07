/**
 * Campaign respawn through the REAL MatchController frame loop with a controlled clock (hotfix: the "DOWN - Back in 1"
 * freeze after an enemy-attack defeat; see tests/campaign-respawn-lifecycle.test.ts for the sim side). What this adds:
 * the HUD countdown equals the authoritative respawn timer and runs 3 -> 2 -> 1 -> alive, a pause freezes it and the
 * resume completes it (the game's established pause rule), a long gap between frames (a hidden tab) neither skips nor
 * freezes it, the reactivated fighter really answers the controls, repeated deaths all complete, and the last life
 * ends the mission through the result flow. Never a spectator bar or Skip.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/session', () => ({
  commands: new Proxy({}, { get: () => () => undefined }),
  liveMatch: () => null,
}));
import { MatchController } from '../../src/app/MatchController';
import type { Bot, InputPort, MissionMeta, RendererPort } from '../../src/app/ports';
import { DEFAULT_GAME_SETTINGS } from '../../src/app/settings';
import { useGameStore } from '../../src/app/store';
import { RumbleHud } from '../../src/ui/RumbleHud';
import { buildMissionGame } from '../../src/sim';
import type { GameState, Intent, MissionOutcome } from '../../src/sim';
import { enemyFireOf, launchProjectile } from '../../src/sim/systems/projectiles';
import { Tile } from '../../src/sim/types';
import { advance } from '../mission-helpers';

const renderer = {
  loadGame() {},
  handleEvents() {},
  render() {},
  pickEntry: () => null,
  setQuality() {},
} as unknown as RendererPort;

let pressed: Intent = {};
const input: InputPort = { navMode: false, pollDevices() {}, buildIntent: () => pressed, clear() {} };
const idle: Bot = { decide: () => ({}) };

let t = 0;
const frame = (m: MatchController, gapMs = 1000 / 60): void => {
  t += gapMs;
  m.frame(t);
};
const frames = (m: MatchController, n: number): void => {
  for (let i = 0; i < n; i++) frame(m);
};
const hud = () => useGameStore.getState().hud!;
const bar = (): string =>
  renderToStaticMarkup(
    createElement(RumbleHud, {
      r: hud().rumble!,
      phase: 'playing',
      localAlive: hud().localAlive,
      inCampaign: hud().inCampaign,
    }),
  );

beforeEach(() => {
  pressed = {};
  useGameStore.setState({
    hud: null,
    screen: 'title',
    paused: false,
    settings: { ...DEFAULT_GAME_SETTINGS },
  });
});

function start(fieldId: string | undefined, onEnd: MissionMeta['onEnd'] = () => undefined) {
  const m = new MatchController({ renderer, input, botFactory: () => idle });
  m.startMission(
    buildMissionGame({
      spec: { id: 'oshodi', ...(fieldId ? { fieldId } : {}) },
      humanCharacter: 'streetBaller',
      seed: 7,
    }),
    { missionId: 'oshodi', difficulty: 'rookie', onEnd },
  );
  const state = m.state!;
  state.tiles = state.tiles.map((x) => (x === Tile.Soft ? Tile.Empty : x));
  state.hidden = {};
  state.match.phase = 'playing';
  state.match.countdownRemaining = 0;
  advance(state, 2);
  return { m, state };
}

/** An enemy attack kills the human (the path that used to freeze), staged on a free row; the controller runs the ticks. */
function struckDown(m: MatchController, s: GameState): void {
  for (const p of s.players) if (p.id > 1) p.alive = false;
  let at = { x: 0, y: 0 };
  search: for (let y = 1; y < s.height - 1; y++)
    for (let x = 1; x < s.width - 5; x++)
      if ([0, 1, 2, 3].every((k) => s.tiles[y * s.width + x + k] === Tile.Empty)) {
        at = { x, y };
        break search;
      }
  const enemy = s.players[1]!;
  enemy.enemyKind = 'lieutenant';
  const put = (id: number, x: number, y: number) => {
    const p = s.players[id]!;
    p.x = p.stepFromX = x;
    p.y = p.stepFromY = y;
    p.stepRemaining = 0;
  };
  put(1, at.x, at.y);
  put(0, at.x + 3, at.y);
  const me = s.players[0]!;
  me.protectedUntil = 0;
  me.vitals!.hp = 1;
  me.vitals!.invulnUntil = 0;
  const fire = enemyFireOf(s);
  fire.victimSafeUntil = {}; // the free window after an earlier hit would swallow this one
  fire.throwCount = {}; // the lieutenant's first throw is the damaging brick
  fire.nextThrowTick = {};
  fire.groupNextThrowTick = {};
  expect(launchProjectile(s, enemy, 'right', [])).not.toBeNull();
  for (let i = 0; i < 400 && me.alive; i++) frame(m);
  expect(me.alive, 'the projectile defeated the human').toBe(false);
}

describe('field mission: the countdown is the authoritative timer and it completes', () => {
  it('the HUD shows 3 -> 2 -> 1 matching the sim, then the fighter is back, controls live, no spectator UI', () => {
    const { m, state } = start('oshodi.approach');
    struckDown(m, state);
    const me = state.players[0]!;
    expect(me.respawnAt).not.toBeNull();
    frames(m, 2);
    const seen: number[] = [];
    for (let i = 0; i < 60 * 4 && !me.alive; i++) {
      frame(m);
      if (!me.alive) {
        const shown = hud().rumble!.local!.respawnIn;
        const truth = Math.max(1, Math.ceil((me.respawnAt! - state.tick) / 60));
        // the HUD publishes on its own cadence: it may trail the sim by a tick, never lead it or drift further
        expect([truth, truth + 1], 'the HUD countdown is the sim timer, never a guess').toContain(shown);
        if (seen.at(-1) !== shown) seen.push(shown!);
        expect(bar()).toContain('respawn-banner');
        expect(bar()).not.toContain('skip-results');
        expect(m.spectating).toBeNull();
      }
    }
    expect(seen).toEqual([3, 2, 1]);
    expect(me.alive, 'the countdown ended and the fighter reactivated').toBe(true);
    expect(me.vitals!.hp).toBe(me.vitals!.maxHp);
    expect(state.mission!.livesUsed).toBe(1);
    // the controls answer: a placed generator appears under the reactivated fighter once the spawn mercy lets it act
    frames(m, 3);
    pressed = { place: true };
    frames(m, 2);
    pressed = {};
    expect(
      state.generators.some((g) => g.ownerId === 0),
      'the respawned fighter can act',
    ).toBe(true);
    expect(hud().localAlive).toBe(true);
    expect(bar()).not.toContain('respawn-banner');
  });

  it('pausing during the countdown freezes it; resuming completes it', () => {
    const { m, state } = start('oshodi.approach');
    struckDown(m, state);
    const me = state.players[0]!;
    frames(m, 30);
    const left = me.respawnAt! - state.tick;
    expect(left).toBeGreaterThan(0);
    m.setPaused(true);
    frames(m, 600); // ten seconds paused
    expect(me.alive).toBe(false);
    expect(me.respawnAt! - state.tick, 'a pause does not run the timer').toBe(left);
    m.setPaused(false);
    frames(m, left + 6);
    expect(me.alive, 'the respawn completes after the resume').toBe(true);
    expect(state.mission!.livesUsed).toBe(1);
  });

  it('a hidden tab (a long gap between frames) neither skips nor freezes the respawn', () => {
    const { m, state } = start('oshodi.approach');
    struckDown(m, state);
    const me = state.players[0]!;
    frames(m, 20);
    // the tab was hidden for 40 s: rAF stopped, then comes back with ONE frame after a huge gap
    frame(m, 40_000);
    expect(state.mission!.livesUsed, 'no life is lost or doubled by the gap').toBe(1);
    // the frame gap is clamped: at most a few ticks passed, so the timer is still a real countdown that completes
    let guard = 0;
    while (!me.alive && guard++ < 60 * 5) frame(m);
    expect(me.alive).toBe(true);
    expect(state.mission!.livesUsed).toBe(1);
    expect(me.respawnAt).toBeNull();
    // and a hidden tab after the respawn changes nothing
    frame(m, 60_000);
    frames(m, 30);
    expect(me.alive).toBe(true);
    expect(state.mission!.livesUsed).toBe(1);
  });

  it('three deaths in a row: every respawn completes and the third ends the mission through onEnd', () => {
    let ended: MissionOutcome | null | undefined;
    const { m, state } = start('oshodi.approach', (o) => {
      ended = o;
    });
    const max = state.mission!.livesMax;
    for (let i = 1; i <= max; i++) {
      struckDown(m, state);
      expect(state.mission!.livesUsed).toBe(i);
      if (i < max) {
        let guard = 0;
        while (!state.players[0]!.alive && guard++ < 60 * 6) frame(m);
        expect(state.players[0]!.alive, `respawn ${i} completed`).toBe(true);
        expect(state.match.phase).toBe('playing');
      }
    }
    frames(m, 60 * 8);
    expect(state.match.phase).toBe('ended');
    expect(ended?.result).toBe('lost');
    expect(m.spectating).toBeNull();
    expect(bar()).not.toContain('skip-results');
  });
});

describe('boss mission: the same lifecycle', () => {
  it('an enemy-attack defeat respawns the human and costs one life', () => {
    const { m, state } = start(undefined);
    struckDown(m, state);
    const me = state.players[0]!;
    expect(state.mission!.livesUsed).toBe(1);
    let guard = 0;
    while (!me.alive && guard++ < 60 * 5) frame(m);
    expect(me.alive).toBe(true);
    expect(me.vitals!.hp).toBe(me.vitals!.maxHp);
    expect(m.spectating).toBeNull();
  });
});
