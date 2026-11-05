/**
 * Every raid layout is valid data and solvable from the data alone (docs/CLASSIC_RAIDS.md): size, glyphs, doors, spots,
 * rooms and belts are consistent; the reachability analysis (`analyseRaid`) proves every marked cargo can be destroyed,
 * the extraction tile reached once the objective is done, every optional room entered and every wave met; every belt tile
 * can be left within `maxDodgeSteps`; and the arena built from the layout is a legal match.
 */
import { describe, expect, it } from 'vitest';
import { RAID_ARENAS, createGame, getArena, buildRaidGame, RAID_DEFS, RAID_IDS } from '../src/sim';
import {
  RAID_MAX_HEIGHT,
  RAID_MAX_WIDTH,
  RAID_TUNING,
  enemySeats,
  parseRaidLayout,
  raidProblems,
} from '../src/sim/raid';
import { analyseRaid } from '../src/sim/raid/analysis';
import { Tile } from '../src/sim/types';

describe('raid layouts', () => {
  it('there are six raids, one per RaidId, and at least four hand-drawn ones', () => {
    expect([...RAID_IDS].sort()).toEqual(
      [
        'junctionToolShed',
        'partsStoreroom',
        'railYardGoods',
        'recordsVault',
        'standbyPlant',
        'warehouseDispatchDepot',
      ].sort(),
    );
    for (const id of RAID_IDS) expect(RAID_DEFS[id].id).toBe(id);
    const hand = ['warehouseDispatchDepot', 'partsStoreroom', 'railYardGoods', 'recordsVault'] as const;
    for (const id of hand) expect(RAID_DEFS[id].layout.length).toBeGreaterThan(9);
  });

  for (const id of RAID_IDS) {
    describe(id, () => {
      const def = RAID_DEFS[id];

      it('the data has no authoring problems and fits the fixed screen', () => {
        expect(raidProblems(def)).toEqual([]);
        expect(def.layout[0]!.length).toBeLessThanOrEqual(RAID_MAX_WIDTH);
        expect(def.layout.length).toBeLessThanOrEqual(RAID_MAX_HEIGHT);
      });

      it('is solvable: cargo, extraction, rooms, switches, waves and doors are all reachable', () => {
        const a = analyseRaid(def);
        expect(a.problems).toEqual([]);
        // the marked cargo fell, so the objective can be met
        const parsed = parseRaidLayout(def);
        for (const c of parsed.cargo.filter((q) => q.marked)) expect(a.fellInOrder).toContain(c.id);
        expect(a.reachable.has(`${parsed.extraction.x},${parsed.extraction.y}`)).toBe(true);
      });

      it('every belt tile can be left within a couple of steps (a shipment can always be sidestepped)', () => {
        const parsed = parseRaidLayout(def);
        const belt = new Set(parsed.belts.flatMap((b) => b.tiles.map((t) => `${t.x},${t.y}`)));
        const walkable = (x: number, y: number): boolean => parsed.arenaLayout[y]?.[x] === '.';
        for (const key of belt) {
          const [bx, by] = key.split(',').map(Number) as [number, number];
          let frontier = [[bx, by]] as [number, number][];
          const seen = new Set([key]);
          let ok = false;
          for (let step = 1; step <= RAID_TUNING.maxDodgeSteps && !ok; step++) {
            const next: [number, number][] = [];
            for (const [x, y] of frontier) {
              for (const [dx, dy] of [
                [0, 1],
                [1, 0],
                [0, -1],
                [-1, 0],
              ] as const) {
                const k = `${x + dx},${y + dy}`;
                if (seen.has(k) || !walkable(x + dx, y + dy)) continue;
                seen.add(k);
                if (!belt.has(k)) ok = true;
                next.push([x + dx, y + dy]);
              }
            }
            frontier = next;
          }
          expect(
            ok,
            `${id}: belt tile ${key} has no way off the belt within ${RAID_TUNING.maxDodgeSteps} steps`,
          ).toBe(true);
        }
      });

      it('the arena is registered, outside ARENAS, and builds a legal raid match', () => {
        const arena = getArena(def.arenaId);
        expect(arena.kind).toBe('raid');
        expect(RAID_ARENAS[def.arenaId]).toBe(arena);
        const seats = enemySeats(def);
        expect(arena.spawns.length).toBe(1 + seats.length);
        const state = createGame(buildRaidGame({ raidId: id, humanCharacter: 'streetBaller', seed: 5 }));
        expect(state.width).toBe(def.layout[0]!.length);
        expect(state.height).toBe(def.layout.length);
        expect(state.players.length).toBe(1 + seats.length);
        // the human stands on the entrance; every enemy seat is dormant; closed doors and cargo are solid
        const parsed = parseRaidLayout(def);
        expect([state.players[0]!.x, state.players[0]!.y]).toEqual([parsed.entrance.x, parsed.entrance.y]);
        for (const s of state.raid!.seats) expect(state.players[s.playerId]!.alive).toBe(false);
        for (const d of parsed.doors) expect(state.tiles[d.y * state.width + d.x]).toBe(Tile.Hard);
        for (const c of parsed.cargo) expect(state.tiles[c.y * state.width + c.x]).toBe(Tile.Soft);
        // no random crates and no hidden pickups
        expect(Object.keys(state.hidden)).toEqual([]);
        expect(state.crush).toBeNull();
      });
    });
  }
});
