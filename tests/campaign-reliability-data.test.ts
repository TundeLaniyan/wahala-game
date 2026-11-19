/**
 * Campaign combat reliability, part 2: readable patrol routes in every field mission (decision RC2c,
 * docs/CAMPAIGN_COMBAT_RELIABILITY.md). Every ORDINARY roaming enemy (agbero, area boy, market enforcer, route marshal, Ring
 * security) of all 13 field missions owns a real route: at least two waypoints, one circuit at least 12 tiles of walking,
 * on walkable floor inside the sector, off every objective tile (checkpoints, exits, doors, equipment, the return marker) and
 * never on a floor trap (the bots never step on one, so a route over one stalls). Throwers, heavies, equipment guards and an
 * escape leg's pursuers may hold a post by design.
 */
import { describe, expect, it } from 'vitest';
import { FIELD_MISSION_IDS } from '../src/sim';
import { inSector } from '../src/sim/mission/sector';
import { describeRoutes } from '../scripts/lib/patrolRoutes';
import { rig } from '../scripts/lib/readability';

const ROUTES = FIELD_MISSION_IDS.map((id) => ({ id, rows: describeRoutes(id) }));

describe('patrol coverage of the 13 field missions (RC2c)', () => {
  it('there are 13 field missions', () => {
    expect(FIELD_MISSION_IDS).toHaveLength(13);
  });

  for (const { id, rows } of ROUTES) {
    it(`${id}: at least 70 % of the ordinary roamers walk a real route (>= 6 tiles each way)`, () => {
      const roamers = rows.filter((r) => r.role === 'roamer');
      const real = roamers.filter((r) => r.waypoints.length >= 2 && r.circuit >= 12 && r.circuit < 200);
      expect(
        real.length / Math.max(1, roamers.length),
        `${real.length} / ${roamers.length}`,
      ).toBeGreaterThanOrEqual(0.7);
      // in fact every one of them
      for (const r of roamers) {
        expect(r.waypoints.length, `${id} ${r.name} #${r.index} needs a route`).toBeGreaterThanOrEqual(2);
        expect(r.circuit, `${id} ${r.name} #${r.index} circuit`).toBeGreaterThanOrEqual(12);
        expect(r.circuit, `${id} ${r.name} #${r.index} is reachable round a loop`).toBeLessThan(200);
      }
    });

    it(`${id}: every waypoint is walkable, reachable, and off every objective tile`, () => {
      for (const r of rows) expect(r.tilesOk, `${r.name} #${r.index}`).toBe(true);
    });

    it(`${id}: every waypoint is inside the mission's sector and never on a floor trap (any seed)`, () => {
      for (let seed = 1; seed <= 3; seed++) {
        const s = rig(id, 'normal', seed).state;
        for (const [key, m] of Object.entries(s.territory!.minds)) {
          for (const a of m.spec.anchors) {
            expect(inSector(s, a.x, a.y), `#${key} ${a.x},${a.y} in the sector`).toBe(true);
            expect(
              s.floorHazards[a.y * s.width + a.x],
              `#${key} ${a.x},${a.y} floor trap, seed ${seed}`,
            ).toBeUndefined();
          }
        }
      }
    });
  }

  it('routes are readable: most are loops round a block or a lane and back, none is a tiny shuttle', () => {
    const roamers = ROUTES.flatMap((m) => m.rows.filter((r) => r.role === 'roamer'));
    const loops = roamers.filter((r) => r.waypoints.length >= 3);
    expect(roamers.length).toBeGreaterThanOrEqual(35);
    expect(loops.length / roamers.length).toBeGreaterThanOrEqual(0.3);
    for (const r of ROUTES.flatMap((m) => m.rows).filter((x) => x.waypoints.length >= 2))
      expect(r.circuit, `${r.name} #${r.index}`).toBeGreaterThanOrEqual(12);
  });

  it('every mission has an enemy on a moving patrol (something to watch and time)', () => {
    for (const { id, rows } of ROUTES)
      expect(
        rows.some((r) => r.circuit >= 12),
        id,
      ).toBe(true);
  });
});
