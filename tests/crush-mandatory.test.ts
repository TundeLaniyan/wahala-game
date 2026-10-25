import { describe, expect, it } from 'vitest';
import { MatchController } from '../src/app/MatchController';
import type { InputPort, RendererPort } from '../src/app/ports';
import { DEFAULT_GAME_SETTINGS } from '../src/app/settings';
import { EXPERIMENTAL_ARENA_IDS, STANDARD_ARENA_IDS, Tile, createGame, getArena, tick } from '../src/sim';
import type { GameState, Intent, SimEvent } from '../src/sim';
import { addGenerator, put } from './helpers';

/**
 * Wahala Crush is mandatory in every standard four-fighter match (decision WB8): the app always asks for it,
 * no arena configuration or stage-hazard setting can switch it off, and the final tick resolves ties,
 * simultaneous eliminations and last survivors correctly.
 */
const TPS = 60;
const ALL_STANDARD = [...STANDARD_ARENA_IDS, ...EXPERIMENTAL_ARENA_IDS];

class Input implements InputPort {
  navMode = false;
  pollDevices(): void {}
  buildIntent(): Intent {
    return {};
  }
  takeVehiclePress(): boolean {
    return false;
  }
  clear(): void {}
}
const renderer: RendererPort = {
  loadGame: () => undefined,
  handleEvents: () => undefined,
  render: () => undefined,
  pickEntry: () => null,
  setQuality: () => undefined,
};

function game(players: number, arenaId = 'danfoBusPark', stageHazards = false): GameState {
  const s = createGame({
    seed: 5,
    arenaId,
    players: Array.from({ length: players }, (_, i) => ({ name: `P${i}`, characterId: 'streetBaller' as const, isBot: false })),
    settings: { mode: 'crush', stageHazards },
  });
  s.tiles = s.tiles.map((t) => (t === Tile.Soft ? Tile.Empty : t));
  s.hidden = {};
  s.match.phase = 'playing';
  s.match.countdownRemaining = 0;
  return s;
}

const finalTile = (s: GameState): { x: number; y: number } => {
  const last = s.crush!.order[s.crush!.order.length - 1]!;
  return { x: last % s.width, y: Math.floor(last / s.width) };
};

function playOut(s: GameState): SimEvent[] {
  const all: SimEvent[] = [];
  while (s.match.phase === 'playing') all.push(...tick(s, {}));
  return all;
}

describe('Wahala Crush is mandatory in standard matches', () => {
  it.each(ALL_STANDARD)('the app always starts %s with the crush on, whatever the extras', (arenaId) => {
    for (const crowdThrows of [false, true]) {
      const c = new MatchController({ renderer, input: new Input(), botFactory: () => ({ decide: () => ({}) }) });
      c.start({ ...DEFAULT_GAME_SETTINGS, play: 'classic', arenaId, competitors: 4, crowdThrows }, 9);
      const s = c.state!;
      expect(s.arenaId).toBe(arenaId);
      expect(s.settings.game).toBe('classic');
      expect(s.settings.mode).toBe('crush');
      expect(s.crush).not.toBeNull();
      expect(s.settings.stageHazards).toBe(true);
    }
  });

  it.each(ALL_STANDARD)('%s: switching the stage hazards off (tutorials/tests) never disables the crush or the endgame traps', (arenaId) => {
    for (const stageHazards of [true, false]) {
      const s = game(2, arenaId, stageHazards);
      expect(s.crush).not.toBeNull();
      expect(s.crush!.order.length).toBe(s.tiles.filter((t) => t !== Tile.Hard).length);
      expect(s.endgameTraps.waves).toHaveLength(2);
      const dur = s.config.match.durationTicks;
      expect(s.crush!.warnAt[0]).toBe(dur - 45 * TPS);
      expect(s.crush!.warnAt[s.crush!.warnAt.length - 1]! + s.config.crush.warnTicks).toBe(dur);
    }
  });

  it('no standard arena configuration touches the crush rules or the match length', () => {
    for (const id of ALL_STANDARD) {
      const cfg = getArena(id).config;
      expect(cfg?.crush, id).toBeUndefined();
      expect(cfg?.match, id).toBeUndefined();
      expect(getArena(id).forcedMode, id).toBeUndefined();
    }
  });
});

describe('the final tick', () => {
  it('two players left on the final tile: both crushed at exactly 0:00, a draw', () => {
    const s = game(2);
    const f = finalTile(s);
    put(s, 0, f.x, f.y);
    put(s, 1, f.x, f.y);
    const ev = playOut(s);
    expect(s.match.playTicks).toBe(s.config.match.durationTicks);
    expect(s.match.result).toEqual({ kind: 'draw', reason: 'simultaneous' });
    const out = ev.filter((e) => e.type === 'playerEliminated');
    expect(out).toHaveLength(2);
    expect(new Set(out.map((e) => (e as Extract<SimEvent, { type: 'playerEliminated' }>).cause.kind))).toEqual(new Set(['crush']));
  });

  it('a blast and the final crush on the same tick: still one simultaneous draw, nobody is credited a win', () => {
    const s = game(2);
    const f = finalTile(s);
    put(s, 0, f.x, f.y);
    put(s, 1, f.x, f.y);
    // player 0's generator next to the final tile goes off exactly when the final tile lands
    const dur = s.config.match.durationTicks;
    s.match.playTicks = dur - 3 * TPS;
    s.tick = 10_000;
    // fast-forward the crush to the same point of the schedule
    while (s.crush!.next < s.crush!.order.length - 1) {
      const idx = s.crush!.order[s.crush!.next++]!;
      s.tiles[idx] = Tile.Hard;
    }
    s.crush!.nextAtTick = s.crush!.warnAt[s.crush!.next]!;
    // a remote-free timed generator under both, timed to the final tick
    const left = dur - s.match.playTicks;
    addGenerator(s, { ownerId: 0, x: f.x, y: f.y, timer: left, range: 1 });
    const ev = playOut(s);
    expect(s.match.playTicks).toBe(dur);
    expect(s.match.result).toEqual({ kind: 'draw', reason: 'simultaneous' });
    expect(ev.filter((e) => e.type === 'playerEliminated')).toHaveLength(2);
  });

  it('last survivor: the other player crushed before the end makes it a win at that tick, the winner is never crushed', () => {
    const s = game(2);
    const f = finalTile(s);
    put(s, 0, f.x, f.y);
    // player 1 waits on the second-to-last tile to close (it lands 0:02 before the end at the latest)
    const second = s.crush!.order[s.crush!.order.length - 2]!;
    put(s, 1, second % s.width, Math.floor(second / s.width));
    playOut(s);
    expect(s.match.result).toEqual({ kind: 'win', winnerId: 0 });
    expect(s.players[0]!.alive).toBe(true);
    expect(s.match.playTicks).toBeLessThanOrEqual(s.config.match.durationTicks - 2 * TPS);
    // the world is frozen after the result: the final tile never lands on the winner
    for (let i = 0; i < 4 * TPS; i++) tick(s, {});
    expect(s.players[0]!.alive).toBe(true);
    expect(s.tiles[f.y * s.width + f.x]).toBe(Tile.Empty);
  });

  it('three players: one falls early, the last two on the final tile draw at 0:00', () => {
    const s = game(3);
    const f = finalTile(s);
    put(s, 0, f.x, f.y);
    put(s, 1, f.x, f.y);
    // player 2 stays in its corner, which closes first
    playOut(s);
    expect(s.players[2]!.eliminatedTick).toBeLessThan(s.players[0]!.eliminatedTick!);
    expect(s.match.playTicks).toBe(s.config.match.durationTicks);
    expect(s.match.result).toEqual({ kind: 'draw', reason: 'simultaneous' });
  });

  it('a sideline spectator does not change the final-tick result', () => {
    const s = game(3);
    const f = finalTile(s);
    put(s, 0, f.x, f.y);
    put(s, 1, f.x, f.y);
    const ev = playOut(s);
    // player 2 fell early and became a spectator...
    expect(s.players[2]!.spectator).not.toBeNull();
    expect(ev.some((e) => e.type === 'spectatorThrow')).toBe(false);
    // ...and is never part of the result
    expect(s.match.result).toEqual({ kind: 'draw', reason: 'simultaneous' });
  });

  it('a crush match never times out with players still standing', () => {
    for (const players of [2, 3, 4]) {
      const s = game(players);
      playOut(s);
      expect(s.match.result).not.toEqual({ kind: 'draw', reason: 'timeout' });
      expect(s.match.playTicks).toBeLessThanOrEqual(s.config.match.durationTicks);
    }
  });
});
