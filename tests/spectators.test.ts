import { describe, expect, it } from 'vitest';
import { createBot } from '../src/ai';
import { MatchController } from '../src/app/MatchController';
import type { InputPort, RendererPort } from '../src/app/ports';
import { DEFAULT_GAME_SETTINGS } from '../src/app/settings';
import { buildHud } from '../src/app/hud';
import {
  canThrow,
  createGame,
  laneStep,
  observe,
  spectatorLane,
  spectatorLanding,
  tick,
  Tile,
} from '../src/sim';
import type { GameState, Intent, Intents, SimEvent } from '../src/sim';
import { addGenerator, addPickup, addSoft, eventsOf, put, run, sandbox } from './helpers';

/** Eliminates player `id` where it stands with a one-tick generator (owned by itself). */
function knockOut(s: GameState, id: number): SimEvent[] {
  const p = s.players[id]!;
  addGenerator(s, { ownerId: id, x: p.x, y: p.y, timer: 1, range: 1 });
  const ev = run(s, 3);
  expect(p.alive).toBe(false);
  return ev;
}

/** A three-player classic match with player 2 eliminated at (6, 6) and on the sideline. */
function withSpectator(): GameState {
  const s = sandbox({ players: 3 });
  put(s, 2, 6, 6);
  knockOut(s, 2);
  // let the knock-out blast burn out
  while (s.flames.length > 0) run(s, 1);
  return s;
}

const southPos = (s: GameState, x: number): number => s.height + 1 + x;

/** Waits out the spectator's cooldown. */
function ready(s: GameState, id: number): void {
  const sp = s.players[id]!.spectator!;
  run(s, Math.max(0, sp.readyTick - s.tick));
}

describe('sideline spectators: who and where', () => {
  it('an eliminated classic player becomes a spectator on the lane tile nearest to where they fell', () => {
    const s = withSpectator();
    const sp = s.players[2]!.spectator!;
    expect(sp).not.toBeNull();
    const lane = spectatorLane(s);
    expect(lane[sp.pos]).toEqual({ x: 6, y: s.height, inward: 'up' });
    // the lane is entirely off the board: west column, south row (camera side), east column
    for (const t of lane) expect(t.x < 0 || t.y >= s.height || t.x >= s.width).toBe(true);
    // never rejoins
    run(s, 600);
    expect(s.players[2]!.alive).toBe(false);
  });

  it('is off in City Rumble survival and when the config disables it', () => {
    const rumble = createGame({
      seed: 1,
      arenaId: 'cityRumble',
      settings: { game: 'survival' },
      players: Array.from({ length: 4 }, (_, i) => ({ name: `P${i}`, characterId: 'streetBaller' as const, isBot: false })),
    });
    expect(rumble.config.spectator.enabled).toBe(false);
    const off = sandbox({ players: 3, config: { spectator: { enabled: false } } });
    put(off, 2, 6, 6);
    knockOut(off, 2);
    run(off, 5);
    expect(off.players[2]!.spectator).toBeNull();
  });
});

describe('sideline spectators: lane movement', () => {
  it('walks along the south row one step per stepTicks and turns the corner onto the west column', () => {
    const s = withSpectator();
    const sp = s.players[2]!.spectator!;
    const lane = spectatorLane(s);
    const step = s.config.spectator.stepTicks;
    // one tick of "left" moves one tile, then the step cadence applies
    run(s, 1, { 2: { move: 'left' } });
    expect(lane[sp.pos]).toMatchObject({ x: 5, y: s.height });
    run(s, step - 1, { 2: { move: 'left' } });
    expect(lane[sp.pos]).toMatchObject({ x: 5, y: s.height });
    run(s, 1, { 2: { move: 'left' } });
    expect(lane[sp.pos]).toMatchObject({ x: 4, y: s.height });
    // all the way to the south-west corner, then up the west column
    run(s, step * 10, { 2: { move: 'left' } });
    expect(lane[sp.pos]).toEqual({ x: -1, y: s.height, inward: null });
    run(s, step * 3, { 2: { move: 'up' } });
    expect(lane[sp.pos]).toMatchObject({ x: -1, y: s.height - 3, inward: 'right' });
    // "down" on the south row and "left" on the west column lead nowhere
    expect(laneStep(lane, southPos(s, 3), 'down')).toBe(southPos(s, 3));
    expect(laneStep(lane, 2, 'left')).toBe(2);
  });
});

describe('sideline spectators: throwing', () => {
  it('A throws a telegraphed generator that lands throwDistance tiles in, then explodes like any other', () => {
    const s = withSpectator();
    ready(s, 2);
    const ev = run(s, 1, { 2: { place: true } });
    const thrown = eventsOf(ev, 'spectatorThrow');
    expect(thrown).toHaveLength(1);
    const t = thrown[0]!;
    expect([t.fromX, t.fromY]).toEqual([6, s.height]);
    expect([t.toX, t.toY]).toEqual([6, s.height - s.config.spectator.throwDistance]);
    const g = s.generators.find((o) => o.id === t.generatorId)!;
    expect(g.fromSpectator).toBe(true);
    expect(g.flight).not.toBeNull();
    expect(t.landTick).toBe(s.tick + s.config.spectator.flightTicks - 1);
    run(s, t.landTick - s.tick);
    expect(g.flight).toBeNull();
    // then the ordinary fuse, the spectator's range
    const boom = run(s, s.config.generator.fuseTicks + 2);
    const blast = eventsOf(boom, 'generatorExploded').find((e) => e.generatorId === g.id);
    expect(blast).toBeDefined();
  });

  it('cooldown and live limit: one throw at a time, the next only after cooldownTicks', () => {
    const s = withSpectator();
    const p = s.players[2]!;
    // no throw straight after elimination
    expect(canThrow(s, p)).toBe(false);
    expect(eventsOf(run(s, 1, { 2: { place: true } }), 'spectatorThrow')).toHaveLength(0);
    ready(s, 2);
    expect(eventsOf(run(s, 1, { 2: { place: true } }), 'spectatorThrow')).toHaveLength(1);
    const thrownAt = s.tick;
    // pressing A every tick during the cooldown does nothing
    const during = run(s, s.config.spectator.cooldownTicks - 2, (i) => (i % 2 === 0 ? { 2: { place: true } } : {}));
    expect(eventsOf(during, 'spectatorThrow')).toHaveLength(0);
    // the first generator is long gone by now (flight + fuse < cooldown), so the next throw goes
    run(s, thrownAt + s.config.spectator.cooldownTicks - s.tick);
    expect(eventsOf(run(s, 1, { 2: { place: true } }), 'spectatorThrow')).toHaveLength(1);
  });

  it('maxLive caps the spectator generators in play even with no cooldown', () => {
    const s = sandbox({ players: 3, config: { spectator: { cooldownTicks: 1 } } });
    put(s, 2, 6, 6);
    knockOut(s, 2);
    run(s, 2);
    const ev = run(s, 30, (i) => (i % 3 === 0 ? { 2: { place: true } } : { 2: { move: 'right' } }));
    expect(eventsOf(ev, 'spectatorThrow')).toHaveLength(s.config.spectator.maxLive);
  });

  it('lands only on open floor: skips concrete, crates, generators, pickups and players, never from a corner', () => {
    const s = withSpectator();
    const pos = southPos(s, 4);
    expect(s.config.spectator.throwDistance).toBe(3);
    // (4, 8) is the preferred tile; block it and the next ones in different ways
    addSoft(s, 4, 8);
    addGenerator(s, { ownerId: 0, x: 4, y: 7, timer: 999 });
    addPickup(s, 4, 6, 'petrol');
    put(s, 1, 4, 5);
    // (4, 4) is open floor: the throw goes past every blocked tile
    expect(spectatorLanding(s, pos)).toEqual({ x: 4, y: 4 });
    // a column of pillars (odd x) only offers the even rows
    const odd = spectatorLanding(s, southPos(s, 5))!;
    expect(odd.y % 2).toBe(0);
    expect(s.tiles[odd.y * s.width + odd.x]).toBe(Tile.Empty);
    // corners cannot throw
    expect(spectatorLanding(s, s.height)).toBeNull();
  });

  it('a tile with a player on it at throw time is never chosen', () => {
    const s = withSpectator();
    put(s, 0, 6, 8);
    expect(spectatorLanding(s, southPos(s, 6))).toEqual({ x: 6, y: 7 });
  });
});

describe('sideline spectators: Wahala Crush and the final seconds', () => {
  function crushGame(): GameState {
    const s = createGame({
      seed: 3,
      players: Array.from({ length: 3 }, (_, i) => ({ name: `P${i}`, characterId: 'streetBaller' as const, isBot: false })),
      settings: { mode: 'crush', stageHazards: false },
    });
    s.tiles = s.tiles.map((t) => (t === Tile.Soft ? Tile.Empty : t));
    s.hidden = {};
    s.match.phase = 'playing';
    return s;
  }

  it('never targets a tile the crush is telegraphing, nor the final safe tile and its neighbours', () => {
    const s = crushGame();
    const last = s.crush!.order[s.crush!.order.length - 1]!;
    const lx = last % s.width;
    const ly = Math.floor(last / s.width);
    // start the closing
    s.crush!.next = 1;
    for (let x = 0; x < s.width; x++) {
      const at = spectatorLanding(s, southPos(s, x));
      if (!at) continue;
      expect(Math.abs(at.x - lx) + Math.abs(at.y - ly)).toBeGreaterThan(1);
    }
    s.crush!.pending.push({ index: 8 * s.width + 2, landTick: s.tick + 50 });
    expect(spectatorLanding(s, southPos(s, 2))).not.toEqual({ x: 2, y: 8 });
  });

  it('no throws once noThrowRemainingTicks or less is left', () => {
    const s = crushGame();
    put(s, 2, 6, 6);
    knockOut(s, 2);
    run(s, 1);
    const p = s.players[2]!;
    s.match.playTicks = s.config.match.durationTicks - s.config.spectator.noThrowRemainingTicks - 1;
    p.spectator!.readyTick = 0;
    expect(canThrow(s, p)).toBe(true);
    run(s, 1);
    expect(canThrow(s, p)).toBe(false);
    expect(eventsOf(run(s, 1, { 2: { place: true } }), 'spectatorThrow')).toHaveLength(0);
  });
});

describe('sideline spectators: no credit, no effect on the result', () => {
  it('a spectator elimination is credited to nobody and the last living player wins', () => {
    const s = withSpectator();
    put(s, 0, 6, 8);
    put(s, 1, 14, 0);
    const gen = addGenerator(s, { ownerId: 2, x: 6, y: 7, timer: 2, fromSpectator: true });
    const ev = run(s, 6);
    const out = eventsOf(ev, 'playerEliminated').find((e) => e.playerId === 0)!;
    expect(out.cause).toMatchObject({ kind: 'spectator', ownerId: 2 });
    expect(out.creditId).toBeNull();
    expect(s.players[0]!.eliminatedBy).toBeNull();
    expect(s.players[2]!.stats.kills).toBe(0);
    expect(gen.fromSpectator).toBe(true);
    expect(s.match.result).toEqual({ kind: 'win', winnerId: 1 });
  });

  it('a spectator throw that takes out the last two together is a draw; the spectator never wins', () => {
    const s = withSpectator();
    put(s, 0, 6, 8);
    put(s, 1, 6, 7);
    addGenerator(s, { ownerId: 2, x: 6, y: 6, timer: 2, range: 3, fromSpectator: true });
    run(s, 6);
    expect(s.players[0]!.alive).toBe(false);
    expect(s.players[1]!.alive).toBe(false);
    expect(s.match.result).toEqual({ kind: 'draw', reason: 'simultaneous' });
  });

  it('the spectator does not count as alive: the match still ends when one player is left', () => {
    const s = withSpectator();
    put(s, 1, 8, 8);
    knockOut(s, 1);
    expect(s.match.result).toEqual({ kind: 'win', winnerId: 0 });
  });
});

describe('sideline spectators: bots', () => {
  function botSpectator(difficulty: 'rookie' | 'standard'): { s: GameState; throws: SimEvent[] } {
    const s = withSpectator();
    put(s, 0, 8, 4);
    put(s, 1, 14, 0);
    const bot = createBot({ difficulty, seed: 5, playerId: 2 });
    const throws: SimEvent[] = [];
    for (let i = 0; i < 60 * 30 && s.match.phase === 'playing'; i++) {
      const intents: Intents = { 2: bot.decide(observe(s, 2)) };
      // keep the living players safe and still: this test is about the spectator only
      if (s.players[0]!.alive) put(s, 0, 8, 4);
      throws.push(...eventsOf(tick(s, intents), 'spectatorThrow'));
      for (const g of s.generators) if (!g.fromSpectator) g.timer = 999;
      s.flames = [];
    }
    return { s, throws };
  }

  it('a Standard bot walks the lane near a living player and throws, slower than the cooldown allows', () => {
    const { s, throws } = botSpectator('standard');
    expect(throws.length).toBeGreaterThanOrEqual(1);
    const first = throws[0] as Extract<SimEvent, { type: 'spectatorThrow' }>;
    // near the living player at x = 8, but never exactly in line with it
    expect(Math.abs(first.toX - 8)).toBeGreaterThanOrEqual(1);
    expect(Math.abs(first.toX - 8)).toBeLessThanOrEqual(2);
    // throws are spaced by more than the rule's cooldown (bots wait longer than a human may)
    const thrownTicks = throws.map((e) => (e as Extract<SimEvent, { type: 'spectatorThrow' }>).landTick);
    for (let i = 1; i < thrownTicks.length; i++)
      expect(thrownTicks[i]! - thrownTicks[i - 1]!).toBeGreaterThan(s.config.spectator.cooldownTicks);
  });

  it('a Rookie bot stays passive on the sideline', () => {
    const { throws } = botSpectator('rookie');
    expect(throws).toHaveLength(0);
  });
});

describe('sideline spectators: the app', () => {
  class Input implements InputPort {
    navMode = false;
    next: Intent = {};
    pollDevices(): void {}
    buildIntent(): Intent {
      const i = this.next;
      this.next = {};
      return i;
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

  it('MatchController keeps feeding the eliminated local player\'s input to the sideline (classic match)', () => {
    const input = new Input();
    const c = new MatchController({ renderer, input, botFactory: () => ({ decide: () => ({}) }) });
    c.start({ ...DEFAULT_GAME_SETTINGS, play: 'classic', competitors: 3 }, 4);
    const s = c.state!;
    while (s.match.phase === 'countdown') c.stepOnce();
    put(s, 0, 6, 6);
    s.tiles[6 * s.width + 6] = Tile.Empty;
    addGenerator(s, { ownerId: 0, x: 6, y: 6, timer: 1, range: 1 });
    for (let i = 0; i < 4; i++) c.stepOnce();
    const sp = s.players[0]!.spectator!;
    expect(sp).not.toBeNull();
    const lane = spectatorLane(s);
    const x0 = lane[sp.pos]!.x;
    input.next = { move: 'right' };
    c.stepOnce();
    expect(lane[sp.pos]!.x).toBe(x0 + 1);
    // the HUD knows the local player is on the sideline
    expect(buildHud(s, 0, null).sideline).not.toBeNull();
    sp.readyTick = 0;
    input.next = { place: true };
    expect(eventsOf(c.stepOnce(), 'spectatorThrow')).toHaveLength(1);
    expect(buildHud(s, 0, null).sideline!.charge).toBeLessThan(0.05);
  });
});
