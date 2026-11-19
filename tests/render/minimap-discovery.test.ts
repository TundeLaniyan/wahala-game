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
import {
  DISCOVER_RADIUS,
  ROUTE_HALF_WIDTH,
  TARGET_RADIUS,
  discoveryFor,
  objectiveTiles,
  routeTo,
} from '../../src/ui/minimapDiscovery';
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
// Mushin's boss has no sector (Oshodi's is bounded to the dispatch corridor since WX9)
const boss = (): GameState =>
  createGame(buildMissionGame({ spec: { id: 'mushin' }, humanCharacter: 'streetBaller', seed: 3 }));

const count = (d: MinimapDiscovery): number => d.bits.reduce((a, b) => a + b, 0);

describe('minimap discovery', () => {
  it('a sector mission on a district map knows its sector, the fighter’s surroundings and the route to the objective, nothing far', () => {
    // a field mission still played on its district's City Rumble map (Oshodi's now have their own areas, below)
    const s = field('mushin.approach');
    expect(getArena(s.arenaId).campaignOnly).toBeUndefined();
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
    // the far corners of the district are not
    for (const [x, y] of [
      [0, 0],
      [s.width - 1, 0],
      [0, s.height - 1],
    ])
      expect(d.known(x!, y!), `${x},${y}`).toBe(false);
    expect(count(d) / (s.width * s.height)).toBeLessThan(0.3);
  });

  it('a campaign-only area (CF9): only the part the fighter stands in is known at the start; a part is revealed on entry', () => {
    const s = field('oshodi.railEdge');
    const arena = getArena(s.arenaId);
    expect(arena.campaignOnly).toBe(true);
    const parts = arena.districts!;
    const d = discoveryFor(s)!;
    d.update(s);
    const me = s.players[0]!;
    const inPart = (p: (typeof parts)[number], x: number, y: number): boolean =>
      p.rects.some((r) => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]);
    const here = parts.find((p) => inPart(p, me.x, me.y))!;
    expect(here, 'the fighter starts in a named part').toBeDefined();
    for (const r of here.rects)
      for (let y = r[1]; y <= r[3]; y++) for (let x = r[0]; x <= r[2]; x++) expect(d.known(x, y)).toBe(true);
    // the area's whole board is NOT known at the start (the sector is the whole board here)
    expect(count(d) / (s.width * s.height)).toBeLessThan(0.6);
    // a part far from the start and off the first route has unknown tiles
    const far = parts.filter(
      (p) => p !== here && p.rects.some((r) => !d.known(r[0], r[1]) || !d.known(r[2], r[3])),
    );
    expect(far.length, 'some part is still undiscovered').toBeGreaterThan(0);
    // entering it reveals it whole
    const target = far[0]!;
    const [x0, y0, x1, y1] = target.rects[0]!;
    let spot: { x: number; y: number } | null = null;
    for (let y = y0; y <= y1 && !spot; y++)
      for (let x = x0; x <= x1 && !spot; x++) if (s.tiles[y * s.width + x] === Tile.Empty) spot = { x, y };
    me.x = me.stepFromX = spot!.x;
    me.y = me.stepFromY = spot!.y;
    d.update(s);
    for (const r of target.rects)
      for (let y = r[1]; y <= r[3]; y++) for (let x = r[0]; x <= r[2]; x++) expect(d.known(x, y)).toBe(true);
  });

  it('a boss mission (no sector) starts with the fighter’s surroundings only, and grows as the fighter walks', () => {
    const s = boss();
    const d = discoveryFor(s)!;
    d.update(s);
    const before = count(d);
    expect(before / (s.width * s.height)).toBeLessThan(0.25);
    const me = s.players[0]!;
    // exactly the rule: every known tile is near the fighter, or near an objective or the route to it
    const near: boolean[] = new Array(s.width * s.height).fill(false);
    const mark = (cx: number, cy: number, r: number): void => {
      for (let y = cy - r; y <= cy + r; y++)
        for (let x = cx - r; x <= cx + r; x++)
          if (x >= 0 && y >= 0 && x < s.width && y < s.height) near[y * s.width + x] = true;
    };
    mark(me.x, me.y, DISCOVER_RADIUS);
    for (const t of objectiveTiles(s)) {
      mark(t.x, t.y, TARGET_RADIUS);
      for (const p of routeTo(s, me.x, me.y, t.x, t.y)) mark(p.x, p.y, ROUTE_HALF_WIDTH);
    }
    for (let i = 0; i < near.length; i++)
      if (d.bits[i]) expect(near[i], `${i % s.width},${Math.floor(i / s.width)}`).toBe(true);
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
