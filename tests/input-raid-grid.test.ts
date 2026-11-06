/**
 * No corner clipping in the classic grid (docs/CLASSIC_GRID.md, decision CG5): on the REAL depot board (pillars on every
 * (even, even) tile), through the REAL InputManager and simulation, no device - keyboard, gamepad, the touch stick
 * with full assistance, the raid cross - moves the player diagonally, around a pillar corner or into a pillar while the
 * raid has the input layer cardinal-only. And the simulation itself never moves a player diagonally or onto a solid
 * tile from any intent on any raid board. (The generic cross / cardinal rules are tests/input-raid-cross.test.ts.)
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CampaignController } from '../src/app/campaign';
import { MatchController } from '../src/app/MatchController';
import type { Bot, InputPort, RendererPort } from '../src/app/ports';
import type { KeyValueStore } from '../src/campaign';
import { inputModeFor } from '../src/input';
import { RAID_IDS, tick } from '../src/sim';
import type { Dir, Intents } from '../src/sim';
import { Tile } from '../src/sim/types';
import { AssistRig } from './assistRig';
import { newRaid } from './raid-helpers';

afterEach(() => vi.unstubAllGlobals());

/** The depot junction (7,7): crate west (6,7), marked crate east (8,7), aisles north and south, pillars on all diagonals. */
const JUNCTION: [number, number] = [7, 7];
/** The depot aisle tile (7,6) between the pillars (6,6) and (8,6). */
const AISLE: [number, number] = [7, 6];

function raidRig(start: [number, number]): AssistRig {
  const r = new AssistRig({ state: newRaid('warehouseDispatchDepot'), start, assist: 'on' });
  r.input.setCardinalOnly(true);
  return r;
}

const DELTA: Record<Dir, [number, number]> = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] };

/** Every step of the trace is one orthogonal tile onto floor, in a direction that was actually handed to the sim. */
function expectNoClipping(r: AssistRig, allowed: Dir[]): void {
  r.assertCleanTrace();
  for (let i = 1; i < r.trace.length; i++) {
    const [px, py] = r.trace[i - 1]!;
    const [x, y] = r.trace[i]!;
    const dir = (Object.keys(DELTA) as Dir[]).find((d) => DELTA[d][0] === x - px && DELTA[d][1] === y - py)!;
    expect(allowed, `step ${px},${py} -> ${x},${y}`).toContain(dir);
  }
  for (const m of r.movesDelivered) expect(allowed).toContain(m.move);
}

describe('the raid turns the input layer cardinal-only', () => {
  it('inputModeFor a real raid state: cardinal-only with the cross', () => {
    expect(inputModeFor(newRaid('warehouseDispatchDepot'))).toEqual({ cardinalOnly: true, cross: true });
  });

  it('the match controller switches the input layer to cardinal-only when a raid starts', () => {
    class MapStore implements KeyValueStore {
      data = new Map<string, string>();
      getItem = (key: string): string | null => this.data.get(key) ?? null;
      setItem = (key: string, v: string): void => void this.data.set(key, v);
      removeItem = (key: string): void => void this.data.delete(key);
    }
    const calls: boolean[] = [];
    const renderer = {
      loadGame() {},
      handleEvents() {},
      render() {},
      pickEntry: () => null,
      setQuality() {},
    } as unknown as RendererPort;
    const input: InputPort = {
      navMode: false,
      pollDevices() {},
      buildIntent: () => ({}),
      clear() {},
      setCardinalOnly: (on: boolean) => void calls.push(on),
    };
    const idle: Bot = { decide: () => ({}) };
    const match = new MatchController({ renderer, input, botFactory: () => idle });
    const campaign = new CampaignController({
      store: new MapStore(),
      host: match,
      now: () => 5_000,
      seed: () => 7,
    });
    campaign.load();
    campaign.startNew();
    campaign.storyDone();
    expect(campaign.debugStartRaid('warehouseDispatchDepot')).toBe(true);
    expect(match.isRaid).toBe(true);
    expect(calls[calls.length - 1]).toBe(true);
  });
});

describe('no corner clipping on the pillar maze (full assistance on, every device)', () => {
  it('keyboard: two arrows held at a junction - the newest wins, a blocked one stays blocked (no slide round a pillar)', () => {
    const r = raidRig(JUNCTION);
    r.keyDown('up');
    r.keyDown('right'); // newest: right, into the marked crate
    r.step(60);
    r.keyUp('right');
    r.keyUp('up');
    r.step(10);
    expect(r.at).toEqual(JUNCTION);
    expectNoClipping(r, ['right']);
  });

  it('gamepad: a diagonal d-pad at a junction never becomes a diagonal or a corner route', () => {
    const r = raidRig(JUNCTION);
    r.pad(['up', 'right']);
    r.step(60);
    r.pad([]);
    r.step(10);
    // one cardinal only, and a step only ever goes that way
    const used = new Set(r.movesDelivered.map((m) => m.move));
    expect(used.size).toBeLessThanOrEqual(1);
    expectNoClipping(r, [...used] as Dir[]);
    for (const [x, y] of r.trace) expect(x === JUNCTION[0] || y === JUNCTION[1]).toBe(true);
  });

  it('the raid cross: a press into the marked crate does nothing, a press up the aisle is one tile', () => {
    const r = raidRig(JUNCTION);
    r.input.touchActive();
    r.input.setTouchDir('right');
    r.step(30);
    r.input.setTouchDir(null);
    r.step(10);
    expect(r.at).toEqual(JUNCTION);
    r.input.setTouchDir('up');
    r.step(4);
    r.input.setTouchDir(null);
    r.step(30);
    expect(r.at).toEqual([7, 6]);
    expectNoClipping(r, ['right', 'up']);
  });

  // the touch stick swept round the clock at a junction and in an aisle between two pillars: whatever the thumb does,
  // the player moves only along the stick's dominant axis (never the other cardinal of a diagonal, never round a corner)
  const ANGLES = Array.from({ length: 24 }, (_, i) => i * 15).filter((a) => a % 90 !== 45);
  const dominant = (deg: number): Dir => {
    const a = ((deg % 360) + 360) % 360;
    return a < 45 || a > 315 ? 'right' : a < 135 ? 'up' : a < 225 ? 'left' : 'down';
  };
  for (const [name, start] of [
    ['junction (7,7)', JUNCTION],
    ['aisle (7,6)', AISLE],
  ] as const) {
    it(`touch stick round the clock at the ${name}`, () => {
      let moved = 0;
      for (const deg of ANGLES) {
        const r = raidRig(start);
        r.thumbDown();
        r.aim(deg, 0.85);
        r.step(45);
        r.lift();
        r.step(10);
        expectNoClipping(r, [dominant(deg)]);
        moved += r.tiles;
        vi.unstubAllGlobals();
      }
      expect(moved, 'the open aisles do let the stick move the player').toBeGreaterThan(0);
    });
  }

  it('a flick across a pillar corner (the stick swung from up to right mid-step) stays on the grid', () => {
    const r = raidRig(AISLE);
    r.thumbDown();
    r.aim(80, 0.85); // up the aisle
    r.step(6);
    r.aim(10, 0.85); // swung right while the step to (7,5) is under way: the pillar corner of (8,6) is in between
    r.step(40);
    r.lift();
    r.step(10);
    expectNoClipping(r, ['up', 'right']);
  });
});

describe('the simulation never moves a player diagonally or into a solid tile (every raid, any intent)', () => {
  for (const id of RAID_IDS) {
    it(id, () => {
      const state = newRaid(id);
      const human = state.players[0]!;
      let seed = 97;
      const rnd = (): number => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
      const dirs: (Dir | null)[] = ['up', 'down', 'left', 'right', null];
      let move: Dir | null = null;
      for (let i = 0; i < 1800 && state.match.phase !== 'ended'; i++) {
        if (i % 7 === 0) move = dirs[Math.floor(rnd() * dirs.length)]!;
        const intents: Intents = { 0: move ? { move } : {} };
        const before = [human.x, human.y];
        const events = tick(state, intents);
        // a fall and the respawn at the entrance are not a step (a shipment can knock a careless walker out)
        if (!human.alive || events.some((e) => e.type === 'playerRespawned' && e.playerId === 0)) continue;
        const dx = Math.abs(human.x - before[0]!);
        const dy = Math.abs(human.y - before[1]!);
        expect(dx + dy, `${id} tick ${state.tick}: ${before} -> ${human.x},${human.y}`).toBeLessThanOrEqual(
          1,
        );
        expect(state.tiles[human.y * state.width + human.x]).toBe(Tile.Empty);
      }
    });
  }
});
