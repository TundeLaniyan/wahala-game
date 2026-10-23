import { describe, expect, it } from 'vitest';
import { ARENAS, CITY_RUMBLE_ID, STANDARD_ARENA_IDS, Tile, createGame, getArena, listEntries } from '../src/sim';
import type { ArenaDef, VehicleKind } from '../src/sim';

/**
 * Arena data contract: nine distinct, fair, connected standard arenas and the City Rumble board.
 */
const ALL = Object.values(ARENAS);
const at = (a: ArenaDef, x: number, y: number): string => a.layout[y]?.[x] ?? '#';

function reachable(a: ArenaDef, from: { x: number; y: number }): Set<string> {
  const seen = new Set<string>([`${from.x},${from.y}`]);
  const q = [from];
  for (let h = 0; h < q.length; h++) {
    const c = q[h]!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const n = { x: c.x + dx, y: c.y + dy };
      const k = `${n.x},${n.y}`;
      if (seen.has(k) || at(a, n.x, n.y) === '#') continue;
      seen.add(k);
      q.push(n);
    }
  }
  return seen;
}

describe('arena registry', () => {
  it('has nine standard arenas plus City Rumble, in menu order', () => {
    expect(STANDARD_ARENA_IDS).toEqual([
      'danfoBusPark',
      'balogunMarket',
      'lekkiRoadworks',
      'oshodiInterchange',
      'ajegunleBackstreets',
      'lagoonJetty',
      'surulerePowerYard',
      'yabaAfterDark',
      'thirdMainland',
    ]);
    expect(getArena(CITY_RUMBLE_ID).kind).toBe('rumble');
    expect(ALL).toHaveLength(10);
  });

  it('no two standard arenas share a layout and hazard set (not recolours of one grid)', () => {
    const sig = STANDARD_ARENA_IDS.map((id) => {
      const a = getArena(id);
      return `${a.layout.join('|')}#${a.stageHazards.map((h) => `${h.kind}:${h.style}`).join(',')}#${a.config ? JSON.stringify(a.config) : ''}`;
    });
    expect(new Set(sig).size).toBe(9);
    // and their stage identities differ: no two have the same hazard styles
    const styles = STANDARD_ARENA_IDS.map((id) =>
      getArena(id)
        .stageHazards.map((h) => h.style)
        .sort()
        .join(','),
    );
    expect(new Set(styles).size).toBe(9);
  });
});

describe.each(ALL.map((a) => [a.id, a] as const))('%s', (_id, a) => {
  const W = a.layout[0]!.length;
  const H = a.layout.length;

  it('has a rectangular layout, menu info and enough valid spawns', () => {
    for (const row of a.layout) expect(row).toHaveLength(W);
    expect(a.info.tagline.length).toBeGreaterThan(10);
    expect(a.info.lighting.length).toBeGreaterThan(3);
    expect(a.spawns.length).toBeGreaterThanOrEqual(a.maxPlayers);
    const keys = new Set(a.spawns.map((s) => `${s.x},${s.y}`));
    expect(keys.size).toBe(a.spawns.length);
    for (const s of a.spawns) {
      expect(at(a, s.x, s.y), `spawn ${s.x},${s.y}`).not.toBe('#');
      const sx = s.x < W / 2 ? 1 : -1;
      const sy = s.y < H / 2 ? 1 : -1;
      for (const o of a.spawnClearance)
        expect(at(a, s.x + o.x * sx, s.y + o.y * sy), `clearance of ${s.x},${s.y}`).not.toBe('#');
    }
  });

  it('every open tile is connected to every spawn', () => {
    const open = a.layout.flatMap((row, y) => [...row].map((c, x) => (c === '#' ? null : `${x},${y}`))).filter(Boolean);
    const seen = reachable(a, a.spawns[0]!);
    expect(seen.size).toBe(open.length);
  });

  if (a.kind === 'standard') {
    it('is a 15 x 11, 4-fold mirror-symmetric board (every corner faces the same arena)', () => {
      expect([W, H]).toEqual([15, 11]);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const c = at(a, x, y) === '#';
          expect(at(a, W - 1 - x, y) === '#', `${x},${y}`).toBe(c);
          expect(at(a, x, H - 1 - y) === '#', `${x},${y}`).toBe(c);
        }
      expect(a.maxPlayers).toBe(4);
    });
  }

  it('every signature vehicle has legal entrances', () => {
    const s = createGame({
      seed: 1,
      arenaId: a.id,
      players: [
        { name: 'A', characterId: 'streetBaller', isBot: false },
        { name: 'B', characterId: 'lekkiBoy', isBot: false },
      ],
    });
    for (const kind of ['danfo', 'taxi', 'keke'] as VehicleKind[]) expect(listEntries(s, kind).length).toBeGreaterThan(4);
  });

  it('road tiles never get a crate, and stage hazard data is on the board', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const s = createGame({
        seed,
        arenaId: a.id,
        players: [
          { name: 'A', characterId: 'streetBaller', isBot: false },
          { name: 'B', characterId: 'lekkiBoy', isBot: false },
        ],
      });
      a.layout.forEach((row, y) => {
        for (let x = 0; x < W; x++) if (row[x] === '=') expect(s.tiles[y * W + x]).toBe(Tile.Empty);
      });
    }
    const inside = ([x, y]: readonly [number, number]): boolean => x >= 0 && y >= 0 && x < W && y < H;
    for (const h of a.stageHazards) {
      if (h.kind === 'sweep') {
        for (const route of h.routes) {
          expect(route.length).toBeGreaterThan(3);
          route.forEach((t, i) => {
            expect(inside(t)).toBe(true);
            expect(at(a, t[0], t[1]), `route tile ${t}`).toBe('=');
            if (i > 0) expect(Math.abs(t[0] - route[i - 1]![0]) + Math.abs(t[1] - route[i - 1]![1])).toBe(1);
          });
        }
      } else if (h.kind === 'strike') {
        for (const z of h.zones) for (const t of z) expect(inside(t)).toBe(true);
        expect(h.zones.length > 0 || h.targetPlayers).toBe(true);
      } else if (h.kind === 'push') {
        for (const z of h.zones) for (const t of z.tiles) expect(inside(t)).toBe(true);
      } else if (h.kind === 'teleport') {
        const ends = h.pairs.flat();
        expect(new Set(ends.map((t) => `${t}`)).size).toBe(ends.length);
        for (const t of ends) expect(at(a, t[0], t[1]), `manhole ${t}`).toBe('=');
      }
      if (h.kind !== 'teleport' && (h.kind === 'sweep' || h.kind === 'strike')) expect(h.warnSec).toBeGreaterThanOrEqual(1.5);
    }
    for (const rows of [a.floorTraps ?? [], ...a.endgameTraps])
      rows.forEach((row, y) => [...row].forEach((c, x) => c !== '.' && expect(at(a, x, y), `trap ${x},${y}`).not.toBe('#')));
  });
});

describe('City Rumble board', () => {
  const a = getArena(CITY_RUMBLE_ID);
  it('is a large 41 x 31 district for up to 32 competitors with spread-out spawns', () => {
    expect([a.layout[0]!.length, a.layout.length]).toEqual([41, 31]);
    expect(a.maxPlayers).toBe(32);
    const minGap = (n: number): number => {
      const s = a.spawns.slice(0, n);
      let m = Infinity;
      for (let i = 0; i < s.length; i++)
        for (let j = i + 1; j < s.length; j++) m = Math.min(m, Math.abs(s[i]!.x - s[j]!.x) + Math.abs(s[i]!.y - s[j]!.y));
      return m;
    };
    expect(minGap(8)).toBeGreaterThanOrEqual(12);
    expect(minGap(16)).toBeGreaterThanOrEqual(8);
    expect(minGap(32)).toBeGreaterThanOrEqual(4);
  });
});
