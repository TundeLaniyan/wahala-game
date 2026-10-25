import { describe, expect, it } from 'vitest';
import { runMatch } from '../src/ai/headless';
import { cameraModeFor } from '../src/render/cameraModes';
import { RUMBLE_ARENA_IDS, STANDARD_ARENA_IDS, Tile, createGame, getArena, listEntries, tick } from '../src/sim';
import type { ArenaDef, Difficulty, GameKind, Intents, VehicleKind } from '../src/sim';
import { DEFAULT_CONFIG } from '../src/sim/config';
import { minimapLayers } from '../src/ui/minimapModel';
import { layoutStats } from './rumbleStageStats';

/**
 * City Rumble V2: the five Lagos stages (Oshodi, Lagos Island, Ojuelegba, Apapa, Lekki Nightworks).
 * Every stage must carry Survival / Deathmatch / Team Rumble for up to 32 competitors on a fair,
 * fully connected board with telegraphed stage hazards and a closing city that ends in its core.
 */
const V2 = ['rumbleOshodi', 'rumbleLagosIsland', 'rumbleOjuelegba', 'rumbleApapa', 'rumbleLekkiNight'] as const;
const SIZE: Record<(typeof V2)[number], [number, number]> = {
  rumbleOshodi: [41, 31],
  rumbleLagosIsland: [41, 31],
  rumbleOjuelegba: [41, 31],
  rumbleApapa: [45, 31],
  rumbleLekkiNight: [41, 31],
};

const at = (a: ArenaDef, x: number, y: number): string => a.layout[y]?.[x] ?? '#';
const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** Open tiles reachable from `from`, crates ignored (they can be blasted), `blocked` treated as concrete. */
function reach(a: ArenaDef, from: { x: number; y: number }, blocked?: (x: number, y: number) => boolean): Set<string> {
  const W = a.layout[0]!.length;
  const H = a.layout.length;
  const seen = new Set<string>([`${from.x},${from.y}`]);
  const q = [from];
  for (let h = 0; h < q.length; h++) {
    const c = q[h]!;
    for (const [dx, dy] of DIRS) {
      const n = { x: c.x + dx, y: c.y + dy };
      const k = `${n.x},${n.y}`;
      if (n.x < 0 || n.y < 0 || n.x >= W || n.y >= H || seen.has(k) || at(a, n.x, n.y) === '#') continue;
      if (blocked?.(n.x, n.y)) continue;
      seen.add(k);
      q.push(n);
    }
  }
  return seen;
}

const roster = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    name: `P${i}`,
    characterId: (['streetBaller', 'lekkiBoy', 'campusQueen'] as const)[i % 3]!,
    isBot: i > 0,
  }));

describe('Rumble stage registry', () => {
  it('lists the five V2 stages first, then the original district; the nine standard arenas are unchanged', () => {
    expect(RUMBLE_ARENA_IDS).toEqual([...V2, 'cityRumble']);
    expect(STANDARD_ARENA_IDS).toHaveLength(9);
    for (const id of RUMBLE_ARENA_IDS) expect(getArena(id).kind).toBe('rumble');
  });

  it('every Rumble stage uses the follow (stadium) camera', () => {
    for (const id of RUMBLE_ARENA_IDS) expect(cameraModeFor(id)).toBe('stadium');
    for (const id of STANDARD_ARENA_IDS) expect(cameraModeFor(id)).toBe('arena');
  });

  it('the stages are meaningfully different boards, not recolours of one grid', () => {
    const diff = (a: ArenaDef, b: ArenaDef): number => {
      const W = Math.min(a.layout[0]!.length, b.layout[0]!.length);
      const H = Math.min(a.layout.length, b.layout.length);
      let d = 0;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) if ((at(a, x, y) === '#') !== (at(b, x, y) === '#') || (at(a, x, y) === '=') !== (at(b, x, y) === '=')) d++;
      return d / (W * H);
    };
    const all = RUMBLE_ARENA_IDS.map(getArena);
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++)
        expect(diff(all[i]!, all[j]!), `${all[i]!.id} vs ${all[j]!.id}`).toBeGreaterThan(0.25);
    // and they play differently: distinct hazard sets, and each stage's layout statistics stand apart
    const styles = V2.map((id) =>
      getArena(id)
        .stageHazards.map((h) => `${h.kind}:${h.style}`)
        .sort()
        .join(','),
    );
    expect(new Set(styles).size).toBe(V2.length);
    const stats = Object.fromEntries(V2.map((id) => [id, layoutStats(getArena(id).layout)]));
    // Lagos Island is the corridor maze (by far the most chokepoints), Oshodi and Lekki the open boards,
    // Ojuelegba the longest sight lines, Apapa the widest yard
    expect(stats.rumbleLagosIsland!.chokepoints).toBeGreaterThan(50);
    for (const id of V2) if (id !== 'rumbleLagosIsland') expect(stats[id]!.chokepoints).toBeLessThan(20);
    expect(stats.rumbleLagosIsland!.avgCorridor).toBeLessThan(7);
    expect(stats.rumbleOjuelegba!.avgCorridor).toBeGreaterThan(stats.rumbleApapa!.avgCorridor);
    expect(stats.rumbleOshodi!.roadPct).toBeGreaterThan(20);
    expect(stats.rumbleLekkiNight!.roadPct).toBeLessThan(12);
    expect(stats.rumbleLekkiNight!.openPct).toBeGreaterThan(80);
  });
});

describe.each(V2.map((id) => [id, getArena(id)] as const))('%s', (id, a) => {
  const W = a.layout[0]!.length;
  const H = a.layout.length;

  it('is a large board for up to 32 competitors that always closes in, with menu info', () => {
    expect([W, H]).toEqual(SIZE[id]);
    for (const row of a.layout) expect(row).toMatch(new RegExp(`^[#=.]{${W}}$`));
    expect(a.kind).toBe('rumble');
    expect(a.maxPlayers).toBe(32);
    expect(a.forcedMode).toBe('crush');
    expect(a.info.tagline.length).toBeGreaterThan(20);
    expect(a.info.lighting.length).toBeGreaterThan(5);
    expect(a.info.hazards.length).toBeGreaterThanOrEqual(2);
  });

  it('is 4-fold mirror symmetric (every quarter of the city faces the same streets)', () => {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        expect(at(a, W - 1 - x, y), `${x},${y}`).toBe(at(a, x, y));
        expect(at(a, x, H - 1 - y), `${x},${y}`).toBe(at(a, x, y));
      }
  });

  it('has 32 distinct spawns on open floor with a clear way out, spread out and mirror-paired for teams', () => {
    expect(a.spawns).toHaveLength(32);
    expect(new Set(a.spawns.map((s) => `${s.x},${s.y}`)).size).toBe(32);
    for (const s of a.spawns) {
      expect(at(a, s.x, s.y), `spawn ${s.x},${s.y}`).toBe('.');
      const sx = s.x < W / 2 ? 1 : -1;
      const sy = s.y < H / 2 ? 1 : -1;
      for (const o of a.spawnClearance) expect(at(a, s.x + o.x * sx, s.y + o.y * sy), `clearance of ${s.x},${s.y}`).toBe('.');
    }
    // slot 2k on the west half, slot 2k + 1 its exact 180-degree mirror: id % 2 teams are side vs side
    for (let k = 0; k < 16; k++) {
      const p = a.spawns[2 * k]!;
      const q = a.spawns[2 * k + 1]!;
      expect(p.x).toBeLessThan(W / 2);
      expect(q).toEqual({ x: W - 1 - p.x, y: H - 1 - p.y });
    }
    const minGap = (n: number): number => {
      const s = a.spawns.slice(0, n);
      let m = Infinity;
      for (let i = 0; i < s.length; i++)
        for (let j = i + 1; j < s.length; j++) m = Math.min(m, Math.abs(s[i]!.x - s[j]!.x) + Math.abs(s[i]!.y - s[j]!.y));
      return m;
    };
    expect(minGap(8)).toBeGreaterThanOrEqual(12);
    expect(minGap(16)).toBeGreaterThanOrEqual(8);
    expect(minGap(32)).toBeGreaterThanOrEqual(5);
  });

  it('every spawn reaches every other spawn and every open tile (no unreachable pockets)', () => {
    const open = a.layout.flatMap((row, y) => [...row].flatMap((c, x) => (c === '#' ? [] : [`${x},${y}`])));
    for (const s of a.spawns) {
      const seen = reach(a, s);
      expect(seen.size, `from ${s.x},${s.y}`).toBe(open.length);
    }
  });

  it('stage hazards are valid: sweeps drive road tiles, zones sit on open floor, every lethal one is telegraphed', () => {
    const inside = ([x, y]: readonly [number, number]): boolean => x >= 0 && y >= 0 && x < W && y < H;
    const minWarnSec = DEFAULT_CONFIG.stage.minLethalWarnTicks / 60;
    let lethal = 0;
    for (const h of a.stageHazards) {
      if (h.kind === 'teleport') continue;
      if (h.kind === 'sweep' || h.kind === 'strike') {
        lethal++;
        expect(h.warnSec).toBeGreaterThanOrEqual(minWarnSec);
        expect(h.firstAtSec).toBeGreaterThanOrEqual(8); // nobody is hit while still leaving the spawn
      }
      expect(h.everySec[0]).toBeGreaterThan(0);
      expect(h.everySec[1]).toBeGreaterThanOrEqual(h.everySec[0]);
      if (h.kind === 'sweep') {
        for (const route of h.routes) {
          expect(route.length).toBeGreaterThan(4);
          route.forEach((t, i) => {
            expect(inside(t)).toBe(true);
            expect(at(a, t[0], t[1]), `route tile ${t}`).toBe('=');
            if (i > 0) expect(Math.abs(t[0] - route[i - 1]![0]) + Math.abs(t[1] - route[i - 1]![1])).toBe(1);
          });
          // traffic enters from the edge of the board, never out of thin air in the middle
          const [x0, y0] = route[0]!;
          expect(x0 === 0 || y0 === 0 || x0 === W - 1 || y0 === H - 1, `route start ${x0},${y0}`).toBe(true);
        }
      } else if (h.kind === 'strike') {
        expect(h.zones.length > 0 || h.targetPlayers).toBe(true);
        for (const z of h.zones) {
          expect(z.length).toBeGreaterThan(0);
          for (const t of z) {
            expect(inside(t)).toBe(true);
            expect(at(a, t[0], t[1]), `zone tile ${t}`).not.toBe('#');
          }
        }
      }
    }
    expect(lethal).toBeGreaterThanOrEqual(1);
    expect(a.stageHazards.length).toBeGreaterThanOrEqual(2);
    for (const rows of [a.floorTraps ?? [], ...a.endgameTraps])
      rows.forEach((row, y) => [...row].forEach((c, x) => c !== '.' && expect(at(a, x, y), `trap ${x},${y}`).not.toBe('#')));
  });

  it('Survival closes the city ring by ring into a core that is never cut off, where the endgame traps land', () => {
    const s = createGame({ seed: 3, arenaId: id, players: roster(32), settings: { game: 'survival' } });
    const crush = s.crush!;
    expect(crush).not.toBeNull();
    const keep = s.config.crush.keepCore!;
    const x0 = Math.floor((W - keep.w) / 2);
    const y0 = Math.floor((H - keep.h) / 2);
    const inCore = (x: number, y: number): boolean => x >= x0 && x < x0 + keep.w && y >= y0 && y < y0 + keep.h;
    // every open tile outside the core closes, nothing inside it does
    const order = new Set(crush.order);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (at(a, x, y) === '#') continue;
        expect(order.has(y * W + x), `${x},${y}`).toBe(!inCore(x, y));
      }
    // the core is open ground (mostly), connected on its own
    const coreOpen: { x: number; y: number }[] = [];
    for (let y = y0; y < y0 + keep.h; y++) for (let x = x0; x < x0 + keep.w; x++) if (at(a, x, y) !== '#') coreOpen.push({ x, y });
    expect(coreOpen.length).toBeGreaterThan(keep.w * keep.h * 0.6);
    const coreReach = reach(a, coreOpen[0]!, (x, y) => !inCore(x, y));
    expect(coreReach.size).toBe(coreOpen.length);
    // at every stage of the closing (prefixes of the order) whatever is still open stays one region,
    // apart from a few ring tiles briefly sealed behind pillars just before their own ring closes
    // (inherent to ring-by-ring closing: the original district peaks at 17 such tiles)
    for (let k = 0; k < crush.order.length; k += Math.ceil(crush.order.length / 50)) {
      const closed = new Set(crush.order.slice(0, k));
      const blocked = (x: number, y: number): boolean => closed.has(y * W + x);
      const stillOpen = a.layout.flatMap((row, y) =>
        [...row].flatMap((c, x) => (c === '#' || blocked(x, y) ? [] : [{ x, y }])),
      );
      const seen = reach(a, coreOpen[0]!, blocked);
      expect(stillOpen.length - seen.size, `after ${k} tiles`).toBeLessThanOrEqual(30);
    }
    // the schedule: open until 2:00 left, the last ring tile lands by 0:30 left
    const end = s.config.match.durationTicks;
    expect(crush.warnAt[0]).toBe(end - s.config.crush.startRemainingTicks);
    expect(crush.warnAt[crush.warnAt.length - 1]! + s.config.crush.warnTicks).toBeLessThanOrEqual(
      end - s.config.crush.coreClosedRemainingTicks,
    );
    // the mandatory endgame waves land inside the core
    expect(s.endgameTraps.waves).toHaveLength(2);
    for (const wave of s.endgameTraps.waves) {
      expect(wave.length).toBeGreaterThan(3);
      for (const t of wave) expect(inCore(t.index % W, Math.floor(t.index / W))).toBe(true);
    }
  });

  it.each(['survival', 'deathmatch', 'team'] as GameKind[])('%s: a 32-competitor match is created correctly', (game) => {
    const s = createGame({ seed: 9, arenaId: id, players: roster(32), settings: { game, durationSec: 300 } });
    expect(s.players).toHaveLength(32);
    expect(new Set(s.players.map((p) => `${p.x},${p.y}`)).size).toBe(32);
    for (const p of s.players) expect(s.tiles[p.y * W + p.x]).toBe(Tile.Empty);
    // road tiles never carry a crate
    a.layout.forEach((row, y) => [...row].forEach((c, x) => c === '=' && expect(s.tiles[y * W + x]).toBe(Tile.Empty)));
    if (game === 'survival') {
      expect(s.crush).not.toBeNull();
      expect(s.config.respawn.enabled).toBe(false);
    } else {
      // respawn modes never close the city
      expect(s.crush).toBeNull();
      expect(s.config.respawn.enabled).toBe(true);
      expect(s.config.match.durationTicks).toBe(300 * 60);
    }
    if (game === 'team') {
      const t0 = s.players.filter((p) => p.team === 0);
      expect(t0).toHaveLength(16);
      // the default split puts each team on its own half, mirror-balanced tile for tile
      for (const p of t0) expect(p.x).toBeLessThan(W / 2);
      for (const p of s.players.filter((q) => q.team === 1)) expect(p.x).toBeGreaterThan(W / 2);
    }
    // every signature vehicle can attack from the border
    for (const kind of ['danfo', 'taxi', 'keke'] as VehicleKind[]) expect(listEntries(s, kind).length).toBeGreaterThan(8);
  });

  it('stage events are telegraphed before they turn lethal and show on the minimap', () => {
    const s = createGame({ seed: 4, arenaId: id, players: roster(16), settings: { game: 'survival' } });
    s.match.phase = 'playing';
    s.match.countdownRemaining = 0;
    const none: Intents = {};
    let warned = 0;
    let shown = 0;
    for (let t = 0; t < 60 * 40 && s.match.phase === 'playing'; t++) {
      const events = tick(s, none);
      for (const e of events) {
        if (e.type === 'stageWarning') {
          warned++;
          if (e.event.kind === 'sweep' || e.event.kind === 'strike')
            expect(e.event.startTick - e.event.warnTick).toBeGreaterThanOrEqual(s.config.stage.minLethalWarnTicks);
        }
      }
      if (s.stage.events.some((e) => e.kind !== 'drop')) {
        const L = minimapLayers(s, a.layout, 0, 0);
        if (L.hazards.length > 0) shown++;
      }
    }
    expect(warned).toBeGreaterThanOrEqual(3);
    expect(shown).toBeGreaterThan(0);
  });
});

describe('Rumble stages: bots play every ruleset', () => {
  const mixed = (n: number): Difficulty[] =>
    Array.from({ length: n }, (_, k): Difficulty => (k % 3 === 2 ? 'beginner' : 'standard'));

  it.each(V2.flatMap((id) => (['survival', 'deathmatch', 'team'] as GameKind[]).map((g) => [id, g] as const)))(
    '%s %s: 32 bots run 7 s without a fault',
    (id, game) => {
      const out = runMatch({
        seed: 7,
        arenaId: id,
        difficulties: mixed(32),
        settings: { game, durationSec: 300 },
        maxPlayTicks: 7 * 60,
      });
      expect(out.ticks).toBeGreaterThan(0);
      expect(out.seats).toHaveLength(32);
      // bots leave their spawns and put generators down
      expect(out.seats.filter((s) => s.tilesVisited >= 3).length).toBeGreaterThan(24);
      expect(out.seats.reduce((n, s) => n + s.placed, 0)).toBeGreaterThan(16);
    },
  );

  it.each(V2)('%s: a full 16-bot Survival match ends with a result', (id) => {
    const out = runMatch({ seed: 21, arenaId: id, difficulties: mixed(16), settings: { game: 'survival' } });
    const end = getArena(id).config!.match!.durationTicks!;
    expect(out.ticks).toBeLessThanOrEqual(end + 1);
    if (!out.timeout) expect(out.winner !== null || out.draw).toBe(true);
    // hardly anybody is buried by the closing city or killed by the stage: bots read the telegraphs
    expect(out.seats.filter((s) => s.cause?.kind === 'crush').length).toBeLessThanOrEqual(3);
    expect(out.seats.filter((s) => s.cause?.kind === 'hazard').length).toBeLessThanOrEqual(4);
  });
});
