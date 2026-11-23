/**
 * The Team Blast lab scenes (decision TB4): a small REAL Team Rumble whose other seats lay generators through the real
 * `place` intent. These tests run the scenes headlessly through the real tick and prove they are what the founder is told
 * they are: real team rules, real owners, warnings that agree with real damage, and the overlap case that must never look
 * safe. Nothing here is drawn; the browser check is e2e/team-blast.spec.ts.
 */
import { describe, expect, it } from 'vitest';
import {
  addBlastPreview,
  applyDangerPriority,
  emptyBlastTiles,
  labelGenerator,
  previewBlastParts,
  tick,
} from '../../src/sim';
import type { GameState } from '../../src/sim';
import { DEFAULT_GAME_SETTINGS } from '../../src/app/settings';
import { buildTeamBlastScene, findOpenCentre, rolesOf } from '../../src/testlab/teamBlast';
import type { TeamBlastVariant } from '../../src/testlab/teamBlast';

function scene(variant: TeamBlastVariant) {
  const s = buildTeamBlastScene(variant, DEFAULT_GAME_SETTINGS);
  if (!s) throw new Error('no scene');
  return s;
}

/** One tick exactly as the match controller runs a director's scene. */
function step(sc: ReturnType<typeof scene>): void {
  const turn = sc.director.beforeTick(sc.state);
  const events = tick(sc.state, turn.intents);
  sc.director.afterTick(sc.state, events, turn.intents);
}

function runTo(sc: ReturnType<typeof scene>, tickNo: number): void {
  while (sc.state.tick < tickNo) step(sc);
}

/** The real seats: the sim seats teams alternately, so your teammate is seat 2 and the rivals are seats 1 and 3. */
const MATE_ID = 2;
const RIVAL_ID = 1;
const FIRST_WAVE = 120;
const PERIOD = 540;

describe('the Team Blast scenes are real Team Rumble matches', () => {
  for (const variant of ['ffOff', 'ffOn', 'overlap'] as const)
    it(`${variant}: four seats, two teams, team rules, friendly fire as named, nobody a bot`, () => {
      const { state } = scene(variant);
      expect(state.settings.game).toBe('team');
      expect(state.settings.friendlyFire).toBe(variant === 'ffOn');
      // the sim seats teams alternately: you (0) and seat 2 against seats 1 and 3
      expect(state.players.map((p) => p.team)).toEqual([0, 1, 0, 1]);
      expect(state.players.every((p) => !p.isBot)).toBe(true);
      expect(state.players.every((p) => p.alive)).toBe(true);
      expect(state.match.phase).toBe('playing');
      expect(state.crush).toBeNull(); // the stage does not close in on the test
    });

  it('the open floor window exists on the stage and every seat stands on plain floor clear of the waves', () => {
    const { state } = scene('ffOff');
    expect(findOpenCentre(state)).not.toBeNull();
    for (const p of state.players) expect(state.tiles[p.y * state.width + p.x]).toBe(0);
  });

  it('is deterministic: the same seed lays the same generators on the same ticks', () => {
    const a = scene('overlap');
    const b = scene('overlap');
    runTo(a, 700);
    runTo(b, 700);
    expect(JSON.stringify(a.state.generators)).toBe(JSON.stringify(b.state.generators));
    expect(JSON.stringify(a.state.players.map((p) => [p.x, p.y, p.alive]))).toBe(
      JSON.stringify(b.state.players.map((p) => [p.x, p.y, p.alive])),
    );
  });
});

describe('the other seats lay REAL generators with their own owner, and the warning agrees with the damage', () => {
  it("ffOff, wave 1 (a teammate): the generator is the teammate's, labelled SAFE, and standing in it does not kill you", () => {
    const sc = scene('ffOff');
    runTo(sc, FIRST_WAVE + 1);
    const gens = sc.state.generators;
    expect(gens).toHaveLength(1);
    expect(gens[0]!.ownerId).toBe(MATE_ID);
    expect(labelGenerator(sc.state, 0, gens[0]!)).toBe('safe');
    // the viewer steps onto the generator's tile and the blast goes off: friendly fire is OFF, the viewer lives
    const g = gens[0]!;
    const me = sc.state.players[0]!;
    me.x = me.stepFromX = g.x;
    me.y = me.stepFromY = g.y;
    runTo(sc, FIRST_WAVE + 400);
    expect(me.stats.deaths).toBe(0); // (a fallen Team Rumble fighter respawns, so count the deaths)
  });

  it("ffOn, the same wave: the teammate's generator is labelled DANGEROUS and the same step kills you", () => {
    const sc = scene('ffOn');
    runTo(sc, FIRST_WAVE + 1);
    const g = sc.state.generators[0]!;
    expect(g.ownerId).toBe(MATE_ID);
    expect(labelGenerator(sc.state, 0, g)).toBe('danger');
    const me = sc.state.players[0]!;
    me.x = me.stepFromX = g.x;
    me.y = me.stepFromY = g.y;
    runTo(sc, FIRST_WAVE + 400);
    expect(me.stats.deaths).toBe(1);
  });

  it("a rival's wave is dangerous in both modes and kills (wave 2)", () => {
    for (const variant of ['ffOff', 'ffOn'] as const) {
      const sc = scene(variant);
      runTo(sc, FIRST_WAVE + PERIOD + 1);
      const g = sc.state.generators.find((x) => x.ownerId === RIVAL_ID)!;
      expect(g, variant).toBeDefined();
      expect(labelGenerator(sc.state, 0, g)).toBe('danger');
      const me = sc.state.players[0]!;
      me.x = me.stepFromX = g.x;
      me.y = me.stepFromY = g.y;
      runTo(sc, FIRST_WAVE + PERIOD + 400);
      expect(me.stats.deaths, variant).toBe(1);
    }
  });

  /** The truth from the geometry: a tile is dangerous iff some link that burns it has an owner who can hurt the viewer. */
  function expectedLabels(state: GameState, gens: GameState['generators']) {
    const harmful = new Set<number>();
    const spared = new Set<number>();
    for (const g of gens)
      for (const part of previewBlastParts(state, g))
        for (const t of part.tiles)
          (labelGenerator(state, 0, part.gen) === 'danger' ? harmful : spared).add(t);
    return { harmful, safeOnly: new Set([...spared].filter((t) => !harmful.has(t))) };
  }

  it('the overlap wave (teammate + rival side by side): tiles both owners burn are dangerous, no tile is both, safe ones remain', () => {
    const sc = scene('overlap');
    runTo(sc, FIRST_WAVE + 1);
    const gens = sc.state.generators;
    expect(gens.map((g) => g.ownerId).sort()).toEqual([MATE_ID, RIVAL_ID].sort());
    const tiles = emptyBlastTiles();
    for (const g of gens) addBlastPreview(sc.state, 0, g, 0.5, tiles);
    applyDangerPriority(tiles);
    const { harmful, safeOnly } = expectedLabels(sc.state, gens);
    expect(harmful.size).toBeGreaterThan(0);
    expect(safeOnly.size).toBeGreaterThan(0); // the teammate-only tiles stay safe
    expect([...tiles.danger.keys()].sort()).toEqual([...harmful].sort());
    expect([...tiles.safe.keys()].sort()).toEqual([...safeOnly].sort());
    for (const t of tiles.danger.keys()) expect(tiles.safe.has(t)).toBe(false);
    // a tile that BOTH the teammate's own flames and the rival's own flames burn is the overlap itself: dangerous
    const own = (owner: number) =>
      new Set(
        gens
          .flatMap((g) => previewBlastParts(sc.state, g))
          .filter((p) => p.gen.ownerId === owner)
          .flatMap((p) => [...p.tiles]),
      );
    const both = [...own(MATE_ID)].filter((t) => own(RIVAL_ID).has(t));
    expect(both.length).toBeGreaterThan(0);
    for (const t of both) expect(tiles.danger.has(t)).toBe(true);
  });

  it("the chain wave: the teammate's generator sets off the rival's, and the rival's link is dangerous", () => {
    const sc = scene('ffOff');
    runTo(sc, FIRST_WAVE + 3 * PERIOD + 1);
    const gens: GameState['generators'] = sc.state.generators;
    expect(gens.map((g) => g.ownerId).sort()).toEqual([MATE_ID, RIVAL_ID].sort());
    const seed = gens.find((g) => g.ownerId === MATE_ID)!;
    // the seed's blast really chains into the rival's generator
    const chain = previewBlastParts(sc.state, seed);
    expect(chain.map((p) => p.gen.ownerId).sort()).toEqual([MATE_ID, RIVAL_ID].sort());
    const tiles = emptyBlastTiles();
    addBlastPreview(sc.state, 0, seed, 0.5, tiles);
    applyDangerPriority(tiles);
    const rivalLink = chain.find((p) => p.gen.ownerId === RIVAL_ID)!;
    for (const t of rivalLink.tiles) expect(tiles.danger.has(t)).toBe(true);
    const mateLink = chain.find((p) => p.gen.ownerId === MATE_ID)!;
    for (const t of mateLink.tiles) if (!rivalLink.tiles.has(t)) expect(tiles.safe.has(t)).toBe(true);
  });

  it('three at once (a teammate between two rivals) lay on the same tick', () => {
    const sc = scene('overlap');
    runTo(sc, FIRST_WAVE + PERIOD + 1);
    expect(sc.state.generators.map((g) => g.ownerId).sort()).toEqual([1, 2, 3]);
    const seat = rolesOf(sc.state.players.map((p) => p.team));
    expect(sc.state.generators.find((g) => g.ownerId === seat.mate)).toBeDefined();
  });
});
