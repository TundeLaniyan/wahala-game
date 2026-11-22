/**
 * Decision SU2: a Rumble winner can be down when the match ends (the kill totals decide, decisions SD1 / SD4 / AS6a), and
 * then the result screen must still show them standing in the victory pose. The simulation rules are exactly as before
 * (these tests pin them: simultaneous deaths with a shared lead are the only draw, a lead earned in the round wins even
 * if the leader falls in the same blast, a dead leader wins a timeout); only the presentation model and the figure's
 * pose change.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Object3D } from 'three';
import { createGame } from '../../src/sim';
import type { GameKind, GameState, MatchSettings } from '../../src/sim';
import { Tile } from '../../src/sim/types';
import { createLayout } from '../../src/render/coords';
import { QUALITY } from '../../src/render/quality';
import { Effects } from '../../src/render/fx/Effects';
import { PlayerViews } from '../../src/render/views/PlayerViews';
import type { FrameContext } from '../../src/render/views/types';
import {
  isWinner,
  shownStanding,
  victoryTile,
  winnersShownStanding,
} from '../../src/render/views/victoryPose';
import { eventsOf, run, runUntil, RUMBLE_FIXTURE } from '../helpers';

function match(game: GameKind, n: number, settings: Partial<MatchSettings> = {}): GameState {
  const state = createGame({
    seed: 7,
    arenaId: RUMBLE_FIXTURE,
    players: Array.from({ length: n }, (_, i) => ({
      name: `P${i}`,
      characterId: 'streetBaller',
      isBot: false,
    })),
    settings: { game, stageHazards: false, ...settings },
  });
  state.tiles = state.tiles.map((t) => (t === Tile.Soft ? Tile.Empty : t));
  state.hidden = {};
  state.match.phase = 'playing';
  state.match.countdownRemaining = 0;
  state.crush = null;
  state.endgameTraps = { waves: [], liveAt: [], warned: 0, live: 0, warnings: [] };
  return state;
}

const timeUp = (s: GameState) => {
  s.match.playTicks = s.config.match.durationTicks - 1;
  return run(s, 1);
};
const toCountdown = (s: GameState) =>
  runUntil(s, (ev) => eventsOf(ev, 'suddenDeathCountdown').length > 0, 600);
const toBlast = (s: GameState) => runUntil(s, (ev) => eventsOf(ev, 'suddenDeathBlast').length > 0, 4000);

/** Two fighters tied on 2 eliminations at time up, in the sudden-death countdown. */
function sudden(): GameState {
  const s = match('survival', 2);
  s.players.forEach((p) => (p.stats.kills = 2));
  timeUp(s);
  toCountdown(s);
  return s;
}

describe('simulation outcomes the victory presentation has to serve (rules unchanged)', () => {
  it('simultaneous final deaths with the lead still shared are a draw: nobody is shown standing', () => {
    const s = sudden();
    toBlast(s);
    expect(s.match.result).toEqual({ kind: 'draw', reason: 'suddenDeathExhausted' });
    expect(s.players.every((p) => !p.alive)).toBe(true);
    expect(winnersShownStanding(s)).toEqual([]);
  });

  it('A had the lead (earned in the round), the blast took both: A wins on score, is dead in the sim, and is shown standing', () => {
    const s = sudden();
    s.players[0]!.stats.kills++; // A earns an elimination in the round
    toBlast(s);
    expect(s.match.phase).toBe('ended');
    expect(s.match.result).toEqual({ kind: 'win', winnerId: 0, decidedBy: 'simultaneousKills' });
    expect(s.players.map((p) => p.alive)).toEqual([false, false]); // the simulation does not revive anybody
    expect(winnersShownStanding(s)).toEqual([0]);
    expect(shownStanding(s, s.players[0]!)).toBe(true);
    expect(shownStanding(s, s.players[1]!)).toBe(false); // the loser stays down
  });

  it('the mirror: B earns it, B is the one shown standing (never by id or order)', () => {
    const s = sudden();
    s.players[1]!.stats.kills++;
    toBlast(s);
    expect(s.match.result).toMatchObject({ kind: 'win', winnerId: 1 });
    expect(winnersShownStanding(s)).toEqual([1]);
  });

  it('a timeout with a unique leader who already fell: that leader wins and is shown standing; the standing rivals are not', () => {
    const s = match('survival', 4);
    s.players.forEach((p, i) => (p.stats.kills = [1, 3, 2, 9][i]!));
    const leader = s.players[3]!;
    leader.alive = false;
    leader.eliminatedTick = 1;
    timeUp(s);
    expect(s.match.result).toEqual({ kind: 'win', winnerId: 3, decidedBy: 'timeoutKills' });
    expect(winnersShownStanding(s)).toEqual([3]);
    expect(s.players.filter((p) => p.alive).map((p) => shownStanding(s, p))).toEqual([false, false, false]);
  });

  it('a winner who is standing needs no help', () => {
    const s = match('survival', 3);
    s.players.forEach((p, i) => (p.stats.kills = [1, 3, 2][i]!));
    timeUp(s);
    expect(s.match.result).toMatchObject({ kind: 'win', winnerId: 1 });
    expect(s.players[1]!.alive).toBe(true);
    expect(winnersShownStanding(s)).toEqual([]);
  });

  it('a tie at time up is not a result: the sudden-death round plays and nobody is shown yet', () => {
    const s = match('survival', 2);
    s.players.forEach((p) => (p.stats.kills = 4));
    timeUp(s);
    expect(s.match.phase).toBe('playing');
    expect(s.match.result).toBeNull();
    expect(winnersShownStanding(s)).toEqual([]);
  });

  it('Classic is unchanged: everybody falling together is a draw and nobody is revived', () => {
    const s = match('classic', 2);
    s.players.forEach((p) => {
      p.alive = false;
      p.eliminatedTick = s.tick;
    });
    run(s, 2);
    expect(s.match.result).toEqual({ kind: 'draw', reason: 'simultaneous' });
    expect(winnersShownStanding(s)).toEqual([]);
  });

  it('Team Rumble: a winning team with nobody left shows only its last fighters to fall', () => {
    const s = match('team', 4);
    s.players.forEach((p, i) => (p.team = i < 2 ? 0 : 1));
    s.players.forEach((p, i) => (p.stats.kills = [3, 3, 2, 2][i]!));
    for (const p of s.players) {
      p.alive = false;
      p.eliminatedTick = 10 + p.id; // the team's second fighter (id 1) fell last
    }
    timeUp(s);
    expect(s.match.result).toMatchObject({ kind: 'teamWin', team: 0 });
    expect(winnersShownStanding(s)).toEqual([1]);
    // with a team-mate standing, nobody is raised
    const t = match('team', 4);
    t.players.forEach((p, i) => (p.team = i < 2 ? 0 : 1));
    t.players.forEach((p, i) => (p.stats.kills = [4, 3, 2, 2][i]!));
    for (const id of [1, 2, 3]) {
      t.players[id]!.alive = false;
      t.players[id]!.eliminatedTick = 5;
    }
    timeUp(t);
    expect(t.match.result).toMatchObject({ kind: 'teamWin', team: 0 });
    expect(winnersShownStanding(t)).toEqual([]);
  });

  it('is deterministic: the same scenario gives the same presentation every time', () => {
    const play = (): number[] => {
      const s = sudden();
      s.players[0]!.stats.kills++;
      toBlast(s);
      return winnersShownStanding(s);
    };
    expect(play()).toEqual(play());
  });
});

describe('the pure presentation model', () => {
  it('names winners from the result alone', () => {
    const win = { kind: 'win', winnerId: 2, decidedBy: 'timeoutKills' } as const;
    expect(isWinner(win, { id: 2, team: -1 })).toBe(true);
    expect(isWinner(win, { id: 1, team: -1 })).toBe(false);
    expect(isWinner({ kind: 'teamWin', team: 1 }, { id: 5, team: 1 })).toBe(true);
    expect(isWinner({ kind: 'teamWin', team: 1 }, { id: 5, team: 0 })).toBe(false);
    expect(isWinner({ kind: 'draw', reason: 'tie' }, { id: 0, team: 0 })).toBe(false);
    expect(isWinner(null, { id: 0, team: 0 })).toBe(false);
  });

  it('nobody is shown standing before the match has ended', () => {
    const s = sudden();
    s.players[0]!.alive = false;
    expect(winnersShownStanding(s)).toEqual([]);
  });

  it('stands the winner where they fell, or on the nearest open floor when a block has landed there', () => {
    const s = match('survival', 2);
    const at = s.tiles.findIndex((_t, i) => {
      const x = i % s.width;
      const y = Math.floor(i / s.width);
      return [-1, 0, 1].every((d) => s.tiles[y * s.width + x + d] === Tile.Empty && x > 2 && x < s.width - 3);
    });
    const open = { x: at % s.width, y: Math.floor(at / s.width) };
    expect(s.tiles[open.y * s.width + open.x]).toBe(Tile.Empty);
    expect(victoryTile(s, open)).toEqual(open);
    s.tiles[open.y * s.width + open.x] = Tile.Hard;
    const moved = victoryTile(s, open);
    expect(moved).not.toEqual(open);
    expect(Math.abs(moved.x - open.x)).toBeLessThanOrEqual(3);
    expect(Math.abs(moved.y - open.y)).toBeLessThanOrEqual(3);
    expect(s.tiles[moved.y * s.width + moved.x]).toBe(Tile.Empty);
  });
});

// ------------------------------------------------------------------------------------ the figure's pose

function fakeContext(canvas: { width: number; height: number }): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => undefined };
  const target: Record<string | symbol, unknown> = {
    canvas,
    measureText: () => ({ width: 10 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => null,
  };
  return new Proxy(target, {
    get: (t, p) => (p in t ? t[p] : () => undefined),
    set: (t, p, v) => {
      t[p] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

describe('the figure on the result screen', () => {
  beforeAll(() => {
    vi.stubGlobal('document', {
      createElement: () => {
        const c = { width: 1, height: 1, style: {} } as {
          width: number;
          height: number;
          getContext?: () => unknown;
        };
        c.getContext = () => fakeContext(c);
        return c;
      },
    });
  });
  afterAll(() => vi.unstubAllGlobals());

  function rig(state: GameState) {
    const layout = createLayout(state.width, state.height);
    const fx = new Effects(layout, QUALITY.medium);
    const views = new PlayerViews();
    let t = 0;
    const frame = (seconds: number): void => {
      for (let i = 0; i < seconds * 60; i++) {
        t += 1 / 60;
        views.update({
          state,
          alpha: 0,
          time: t,
          dt: 1 / 60,
          info: { localPlayerId: 0, excitement: 0, entryOverlay: null },
          layout,
          fx,
        } as unknown as FrameContext);
      }
    };
    const root = (id: number): Object3D =>
      (views as unknown as { visuals: Map<number, { model: { root: Object3D } }> }).visuals.get(id)!.model
        .root;
    return { frame, root, layout };
  }

  it('a winner who is down is drawn upright and visible at the end; a down loser is hidden once its fall is over', () => {
    const s = sudden();
    s.players[0]!.stats.kills++;
    const view = rig(s);
    view.frame(0.1); // both stand in the sudden-death round
    toBlast(s);
    expect(s.match.result).toMatchObject({ kind: 'win', winnerId: 0 });
    expect(s.players.map((p) => p.alive)).toEqual([false, false]);
    view.frame(4); // longer than the fall (1.7 s) and the end moment (2.2 s)
    const winner = view.root(0);
    expect(winner.visible).toBe(true);
    expect(winner.rotation.x).toBe(0);
    expect(winner.rotation.z).toBe(0);
    expect(winner.position.y).toBe(0);
    expect(winner.scale.y).toBeGreaterThan(0.5); // not squashed or shrunk away
    expect(view.root(1).visible).toBe(false);
  });

  it('a draw leaves everybody down', () => {
    const s = sudden();
    const view = rig(s);
    view.frame(0.1);
    toBlast(s);
    expect(s.match.result).toMatchObject({ kind: 'draw' });
    view.frame(4);
    expect(view.root(0).visible).toBe(false);
    expect(view.root(1).visible).toBe(false);
  });

  it('a winner who fell long before the end is raised where they fell, facing the camera', () => {
    const s = match('survival', 4);
    s.players.forEach((p, i) => (p.stats.kills = [1, 3, 2, 9][i]!));
    const view = rig(s);
    view.frame(0.1);
    const leader = s.players[3]!;
    leader.alive = false;
    leader.eliminatedTick = s.tick;
    view.frame(4); // the fall is over and the figure is gone
    expect(view.root(3).visible).toBe(false);
    timeUp(s);
    expect(s.match.result).toMatchObject({ kind: 'win', winnerId: 3 });
    view.frame(0.5);
    const raised = view.root(3);
    expect(raised.visible).toBe(true);
    expect(raised.rotation.x).toBe(0);
    const at = view.layout;
    expect(raised.position.x).toBeCloseTo(at.wx(leader.x), 3);
    expect(raised.position.z).toBeCloseTo(at.wz(leader.y), 3);
  });
});
