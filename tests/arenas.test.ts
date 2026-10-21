import { describe, expect, it } from 'vitest';
import {
  ARENAS,
  DEFAULT_CONFIG,
  createGame,
  getArena,
  listEntries,
  observe,
  tick,
  tileAt,
  Tile,
  validateArena,
} from '../src/sim';
import { createBot } from '../src/ai';
import { runMatch } from '../src/ai/headless';
import { migrateSettings, DEFAULT_GAME_SETTINGS } from '../src/app/settings';

const RULES = {
  baseRange: DEFAULT_CONFIG.generator.baseRange,
  minRouteTiles: DEFAULT_CONFIG.vehicles.minRouteTiles,
  minLanes: 12,
};
const IDS = Object.keys(ARENAS);
const quad = [0, 1, 2, 3].map((i) => ({
  name: `P${i}`,
  characterId: (['streetBaller', 'lekkiBoy', 'campusQueen'] as const)[i % 3],
  isBot: true,
}));

describe('arena registry', () => {
  it('offers the Danfo Bus Park and Balogun Market, each once', () => {
    expect(IDS.sort()).toEqual(['balogunMarket', 'danfoBusPark']);
    const names = Object.values(ARENAS).map((a) => a.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('never registers the same stage twice under different names', () => {
    const layouts = Object.values(ARENAS).map((a) => a.layout.join('\n'));
    expect(new Set(layouts).size).toBe(layouts.length);
    // the market is not a re-skin: a large share of the permanent concrete sits elsewhere
    const a = getArena('danfoBusPark').layout.join('');
    const b = getArena('balogunMarket').layout.join('');
    let differ = 0;
    for (let i = 0; i < a.length; i++) if ((a[i] === '#') !== (b[i] === '#')) differ++;
    expect(differ).toBeGreaterThan(20);
  });

  it('keeps floor traps to one specially designed arena (the market)', () => {
    expect(IDS.filter((id) => getArena(id).hazardLayout)).toEqual(['balogunMarket']);
  });

  it.each(IDS)('%s passes the layout validation', (id) => {
    expect(validateArena(getArena(id), RULES)).toEqual([]);
  });

  it('validation catches broken layouts', () => {
    const base = getArena('balogunMarket');
    const sealed = {
      ...base,
      id: 'sealed',
      layout: base.layout.map((r, y) => (y === 5 ? '#'.repeat(15) : r)),
    };
    expect(validateArena(sealed, RULES).join()).toMatch(/unreachable|symmetric|lanes/);
    const boxed = { ...base, id: 'boxed', spawnClearance: [{ x: 0, y: 0 }] };
    expect(validateArena(boxed, RULES).join()).toMatch(/no cleared escape/);
  });

  it('migrates the retired "Lekki Roadworks" trap arena setting to the market trap arena', () => {
    const old = migrateSettings({ ...DEFAULT_GAME_SETTINGS, arenaId: 'lekkiRoadworks', floorHazards: false });
    expect(old.arenaId).toBe('balogunMarket');
    expect(old.floorHazards).toBe(true);
    expect(migrateSettings({ ...DEFAULT_GAME_SETTINGS, arenaId: 'nowhere' }).arenaId).toBe('danfoBusPark');
    expect(migrateSettings({ ...DEFAULT_GAME_SETTINGS, arenaId: 'balogunMarket' }).arenaId).toBe(
      'balogunMarket',
    );
  });
});

describe.each(IDS)('%s in a real match', (id) => {
  it('builds concrete exactly from the layout, keeps spawns and their escapes clear', () => {
    const arena = getArena(id);
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = createGame({ seed, arenaId: id, players: quad });
      expect(s.arenaId).toBe(id);
      for (let y = 0; y < s.height; y++)
        for (let x = 0; x < s.width; x++)
          expect(tileAt(s, x, y) === Tile.Hard).toBe(arena.layout[y]![x] === '#');
      for (const p of s.players) expect(tileAt(s, p.x, p.y)).toBe(Tile.Empty);
      for (const sp of arena.spawns) {
        const sx = sp.x < s.width / 2 ? 1 : -1;
        const sy = sp.y < s.height / 2 ? 1 : -1;
        for (const o of arena.spawnClearance)
          expect(tileAt(s, sp.x + o.x * sx, sp.y + o.y * sy)).not.toBe(Tile.Soft);
      }
    }
  });

  it('has legal vehicle entries for every vehicle on a fresh board', () => {
    const s = createGame({ seed: 3, arenaId: id, players: quad });
    for (const kind of ['danfo', 'taxi', 'keke'] as const)
      expect(listEntries(s, kind).length).toBeGreaterThan(8);
  });

  it('places floor traps only in the designated trap arena, only when the option is on, never on concrete', () => {
    expect(Object.keys(createGame({ seed: 1, arenaId: id, players: quad }).floorHazards)).toHaveLength(0);
    const s = createGame({ seed: 1, arenaId: id, players: quad, settings: { floorHazards: true } });
    const tiles = Object.keys(s.floorHazards).map(Number);
    // Bible (LOCKED): stage hazards only exist in specially designed arenas, not in every arena
    expect(tiles.length > 0).toBe(!!getArena(id).hazardLayout);
    for (const i of tiles) expect(s.tiles[i]).not.toBe(Tile.Hard);
  });

  it('Wahala Crush fills every open tile of this layout in order', () => {
    const s = createGame({ seed: 2, arenaId: id, players: quad, settings: { mode: 'crush' } });
    const open = s.tiles.filter((t) => t !== Tile.Hard).length;
    expect(s.crush!.order).toHaveLength(open);
    expect(new Set(s.crush!.order).size).toBe(open);
  });

  it.each(['classic', 'crush'] as const)(
    'bots finish %s matches without stalling',
    (mode) => {
      let suicides = 0;
      let seats = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const out = runMatch({
          seed,
          arenaId: id,
          difficulties: ['medium', 'hard', 'medium', 'easy'],
          settings: { mode },
        });
        // every match reaches a result inside the match clock (crush always resolves before the timer)
        expect(out.ticks).toBeGreaterThan(0);
        if (mode === 'crush') expect(out.timeout).toBe(false);
        for (const seat of out.seats.filter((x) => x.difficulty !== 'easy')) {
          seats++;
          if (seat.suicide && !seat.assisted) suicides++;
        }
      }
      // Medium/Hard rarely blow themselves up unassisted on either layout
      expect(suicides / seats).toBeLessThan(0.35);
    },
    120_000,
  );

  it('bots holding a voucher launch vehicles on this layout', () => {
    const s = createGame({ seed: 11, arenaId: id, players: quad });
    const bots = s.players.map((_, i) => createBot({ difficulty: 'hard', seed: 50 + i, playerId: i }));
    for (const p of s.players) p.hasVoucher = true;
    const kinds = new Set<string>();
    for (let t = 0; t < 2400 && s.match.phase !== 'ended'; t++) {
      const intents: Record<number, ReturnType<(typeof bots)[0]['decide']>> = {};
      for (const p of s.players) if (p.alive) intents[p.id] = bots[p.id]!.decide(observe(s, p.id));
      for (const e of tick(s, intents)) {
        if (e.type === 'vehicleLaunched')
          kinds.add(s.vehicles.find((v) => v.id === e.vehicleId)?.kind ?? '?');
      }
    }
    expect(kinds.size).toBeGreaterThan(0);
  }, 120_000);
});
