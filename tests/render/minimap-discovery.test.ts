/**
 * A campaign mission's minimap reveals only what has been discovered (docs/CAMPAIGN_CAMERA.md "Minimap", decision CF7):
 * the sector, the tiles near where the human has been and the route to the current objective. Distant streets of the
 * district stay unknown; City Rumble is unchanged; the discovery lives in the UI and never touches the simulation.
 */
import { describe, expect, it } from 'vitest';
import {
  FIELD_MISSION_DEFS,
  Tile,
  buildMissionGame,
  createGame,
  getArena,
  missionView,
  tick,
} from '../../src/sim';
import type { GameState } from '../../src/sim';
import type { MinimapDiscovery } from '../../src/ui/minimapDiscovery';
import { DISCOVER_RADIUS, discoveryFor, objectiveTiles, routeTo } from '../../src/ui/minimapDiscovery';
import { minimapLayers } from '../../src/ui/minimapModel';
import { RUMBLE_FIXTURE, sandbox } from '../helpers';

function field(id: string, noSector = false): GameState {
  const def = FIELD_MISSION_DEFS[id]!;
  return createGame(
    buildMissionGame({
      spec: { id: def.districtId, fieldId: id, ...(noSector ? { noSector: true } : {}) },
      humanCharacter: 'streetBaller',
      seed: 3,
    }),
  );
}
const boss = (): GameState =>
  createGame(buildMissionGame({ spec: { id: 'oshodi' }, humanCharacter: 'streetBaller', seed: 3 }));

const count = (d: MinimapDiscovery): number => d.bits.reduce((a, b) => a + b, 0);

describe('minimap discovery', () => {
  it('a sector mission knows its sector, the fighter’s surroundings and the route to the objective, nothing far', () => {
    const s = field('oshodi.railEdge');
    const d = discoveryFor(s)!;
    d.update(s);
    const me = s.players[0]!;
    // the sector is known
    for (const r of s.sector!.rects)
      for (let y = r[1]; y <= r[3]; y++) for (let x = r[0]; x <= r[2]; x++) expect(d.known(x, y)).toBe(true);
    // round the fighter
    expect(d.known(me.x + DISCOVER_RADIUS, me.y)).toBe(true);
    // the current objective and the way there
    const [goal] = objectiveTiles(s);
    expect(goal).toBeDefined();
    expect(d.known(goal!.x, goal!.y)).toBe(true);
    for (const p of routeTo(s, me.x, me.y, goal!.x, goal!.y)) expect(d.known(p.x, p.y)).toBe(true);
    // the far corners of the 63 x 47 district are not
    for (const [x, y] of [
      [0, 0],
      [s.width - 1, 0],
      [0, s.height - 1],
    ])
      expect(d.known(x!, y!), `${x},${y}`).toBe(false);
    expect(count(d) / (s.width * s.height)).toBeLessThan(0.3);
  });

  it('a boss mission (no sector) starts with the fighter’s surroundings only, and grows as the fighter walks', () => {
    const s = boss();
    const d = discoveryFor(s)!;
    d.update(s);
    const before = count(d);
    expect(before / (s.width * s.height)).toBeLessThan(0.2);
    const me = s.players[0]!;
    // walk (real movement) a few tiles along open floor
    s.match.phase = 'playing';
    s.match.countdownRemaining = 0;
    const start = { x: me.x, y: me.y };
    const dirs = ['right', 'left', 'up', 'down'] as const;
    const dir = dirs.find((dd) => {
      const v = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] }[dd];
      return s.tiles[(me.y + v[1]!) * s.width + me.x + v[0]!] === Tile.Empty;
    })!;
    for (let t = 0; t < 240; t++) {
      tick(s, me.stepRemaining === 0 ? { 0: { move: dir } } : {});
      d.update(s);
    }
    expect(me.x !== start.x || me.y !== start.y).toBe(true);
    expect(count(d)).toBeGreaterThan(before);
    expect(d.known(me.x, me.y)).toBe(true);
  });

  it('the objective route is revealed again when the objective changes, not every frame', () => {
    const s = field('oshodi.approach');
    const d = discoveryFor(s)!;
    d.update(s);
    const v = d.version;
    d.update(s);
    expect(d.version).toBe(v);
  });

  it('the map leaves out crates, rivals and hazards on undiscovered tiles; objectives always show', () => {
    const s = boss();
    const d = discoveryFor(s)!;
    d.update(s);
    const layout = getArena(s.arenaId).layout;
    const all = minimapLayers(s, layout, 0, 0);
    const known = minimapLayers(s, layout, 0, 0, 8, (x, y) => d.known(x, y));
    expect(known.soft.length).toBeLessThan(all.soft.length);
    for (const i of known.soft) expect(d.known(i % s.width, Math.floor(i / s.width))).toBe(true);
    for (const p of known.players) if (p.kind === 'rival') expect(d.known(p.x, p.y)).toBe(true);
    expect(known.players.some((p) => p.kind === 'local')).toBe(true);
    expect(known.mission?.nodes.length).toBe(all.mission?.nodes.length);
  });

  it('City Rumble and Classic have no discovery (the whole map shows); the match is untouched', () => {
    expect(discoveryFor(sandbox({ players: 8, arenaId: RUMBLE_FIXTURE }))).toBeNull();
    expect(discoveryFor(sandbox())).toBeNull();
    const s = field('oshodi.approach');
    const digest = JSON.stringify(s);
    discoveryFor(s)!.update(s);
    expect(JSON.stringify(s)).toBe(digest);
    expect(missionView(s)).not.toBeNull();
  });
});
