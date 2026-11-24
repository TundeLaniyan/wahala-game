/**
 * Light-based detection in the night raid (decisions NL10-NL13, docs/CLASSIC_LIGHTING.md "P1b"; `systems/nightSight.ts`
 * inside the raid AI's `updateTerritory`). Scenario tests on the Records Vault with its interior cleared (walls only
 * where a test puts them) and one calm hall warden holding his post: he notices the fighter only on his own lit torch
 * tiles, never through a wall or a crate, after a reaction delay that restarts when the fighter leaves the cone; the
 * fighter's beam seen by the warden lengthens the cone by exactly one tile; in the dark only contact counts. The lit
 * raids play byte-for-byte as recorded (digests of the scripted player's full raid at every level; first recorded on
 * 785f84c, re-recorded for the Classic raid combat correction, decisions AM1-AM6, and for CV1-CV7, both of which
 * deliberately changed every raid).
 */
import { describe, expect, it } from 'vitest';
import {
  NIGHT_SIGHT_LEVELS,
  Tile,
  buildRaidGame,
  campaignEnemyLevel,
  createGame,
  raidLightMap,
} from '../src/sim';
import type { CampaignLevel, Dir, GameState, Player, RaidId, SimEvent } from '../src/sim';
import { updateTerritory } from '../src/sim/systems/territory';
import { nightNotice, nightReactTicks } from '../src/sim/systems/nightSight';
import { LIGHT_TUNING, lightCone } from '../src/sim/raid/light';
import { hashOf, knockOut, letWavesAppear, newRaid, put } from './raid-helpers';
import { playRaidFight } from '../scripts/lib/fairHuman';

const N = NIGHT_SIGHT_LEVELS.normal;

/** The vault, hall wardens appeared, interior cleared, only warden `id` alive and calm at (x, y) looking `facing`. */
function vault(): { s: GameState; g: Player } {
  const s = newRaid('recordsVault');
  letWavesAppear(s);
  for (let y = 1; y < s.height - 1; y++)
    for (let x = 1; x < s.width - 1; x++) s.tiles[y * s.width + x] = Tile.Empty;
  const wardens = s.players.filter((p) => p.isBot && p.alive);
  const g = wardens[0]!;
  knockOut(s, ...wardens.slice(1).map((p) => p.id));
  return { s, g };
}
function post(s: GameState, g: Player, x: number, y: number, facing: Dir): void {
  put(s, g.id, x, y);
  g.facing = facing;
  const m = s.territory!.minds[g.id]!;
  m.state = 'watch';
  m.notice = 0;
  m.noticeBlockedUntil = -1;
}
function fighter(s: GameState, x: number, y: number, facing: Dir): Player {
  const h = s.players[0]!;
  put(s, 0, x, y);
  h.facing = facing;
  return h;
}
/** Runs the territory for `n` ticks holding the warden's facing; the tick he became alert (or null). */
function watch(s: GameState, g: Player, n: number): number | null {
  const facing = g.facing;
  const events: SimEvent[] = [];
  for (let i = 1; i <= n; i++) {
    s.tick++;
    g.facing = facing;
    updateTerritory(s, events);
    if (s.territory!.minds[g.id]!.state === 'alert') return i;
  }
  return null;
}
const torchTiles = (s: GameState, g: Player, reach: number): Set<string> => {
  const t = new Uint8Array(s.width * s.height);
  lightCone(s, t, g.x, g.y, g.facing, reach, LIGHT_TUNING.guard.spread, false);
  const out = new Set<string>();
  t.forEach((v, i) => v >= LIGHT_TUNING.lit && out.add(`${i % s.width},${Math.floor(i / s.width)}`));
  return out;
};

describe('a calm torch guard notices the fighter only in his own drawn cone', () => {
  it('every tile of the board: noticed exactly on the torch tiles (fighter facing away, no beam bonus)', () => {
    const { s, g } = vault();
    post(s, g, 6, 6, 'right');
    const lit = torchTiles(s, g, LIGHT_TUNING.guard.range);
    // the rule's tiles are the ones the renderer draws: raidLightMap's guard channel
    const drawn = raidLightMap(s)!.guard;
    for (const k of lit) {
      const [x, y] = k.split(',').map(Number) as [number, number];
      expect(drawn[y * s.width + x]!).toBeGreaterThanOrEqual(LIGHT_TUNING.lit);
    }
    for (let y = 1; y < s.height - 1; y++)
      for (let x = 1; x < s.width - 1; x++) {
        if (Math.max(Math.abs(x - 6), Math.abs(y - 6)) <= 1) continue; // contact: below
        // facing left with a wall in front of him: his beam lights nothing the warden can see
        const h = fighter(s, x, y, x > 6 ? 'right' : 'left');
        const n = nightNotice(s, g, h)!;
        expect(n.sees, `${x},${y}`).toBe(
          lit.has(`${x},${y}`) || (n.beamSeen && torchTiles(s, g, 5).has(`${x},${y}`)),
        );
      }
  });

  it('a tile in the calm 90-degree cone but outside the narrow torch is not noticed by night (it is in a lit raid)', () => {
    const { s, g } = vault();
    post(s, g, 6, 6, 'right');
    fighter(s, 8, 8, 'down'); // 2 ahead, 2 aside: inside the calm cone, outside the torch
    expect(watch(s, g, 120)).toBeNull();
    // the same scene without night detection (the raid AI's own rule) notices him
    const lit = vault();
    delete lit.s.config.nightSight;
    post(lit.s, lit.g, 6, 6, 'right');
    fighter(lit.s, 8, 8, 'down');
    expect(watch(lit.s, lit.g, 120)).not.toBeNull();
  });

  it('never through a wall or a crate', () => {
    for (const solid of [Tile.Hard, Tile.Soft]) {
      const { s, g } = vault();
      post(s, g, 4, 6, 'right');
      s.tiles[6 * s.width + 6] = solid;
      fighter(s, 7, 6, 'right');
      expect(watch(s, g, 120), `tile ${solid}`).toBeNull();
      s.tiles[6 * s.width + 6] = Tile.Empty;
      expect(watch(s, g, 120), `tile ${solid} removed`).not.toBeNull();
    }
  });
});

describe('the reaction delay', () => {
  it('holds for the configured ticks, longer at range, and leaving the cone restarts it', () => {
    expect(nightReactTicks(N, 2, 4)).toBe(N.reactNearTicks);
    expect(nightReactTicks(N, 4, 4)).toBe(N.reactFarTicks);
    expect(nightReactTicks(N, 3, 4)).toBeGreaterThan(N.reactNearTicks);
    expect(nightReactTicks(N, 3, 4)).toBeLessThan(N.reactFarTicks);
    // 2 ahead: the near reaction exactly
    const near = vault();
    post(near.s, near.g, 4, 6, 'right');
    fighter(near.s, 6, 6, 'right');
    expect(watch(near.s, near.g, 200)).toBe(N.reactNearTicks);
    // 4 ahead: longer (his beam is in view, so the cone reaches 5 and 4 is not its end)
    const far = vault();
    post(far.s, far.g, 4, 6, 'right');
    const fh = fighter(far.s, 8, 6, 'right');
    const want = nightNotice(far.s, far.g, fh)!.reactTicks;
    expect(want).toBe(nightReactTicks(N, 4, 5));
    expect(want).toBeGreaterThan(N.reactNearTicks);
    expect(watch(far.s, far.g, 200)).toBe(want);
    // in the cone for most of the delay, out for a tick, back in: the full delay again
    const { s, g } = vault();
    post(s, g, 4, 6, 'right');
    fighter(s, 6, 6, 'right');
    expect(watch(s, g, N.reactNearTicks - 1)).toBeNull();
    fighter(s, 6, 9, 'right');
    expect(watch(s, g, 1)).toBeNull();
    fighter(s, 6, 6, 'right');
    expect(watch(s, g, N.reactNearTicks - 1)).toBeNull();
    expect(watch(s, g, 1)).toBe(1);
  });

  it('is slower on Easy and faster on Hard (the only difficulty term)', () => {
    const e = NIGHT_SIGHT_LEVELS.easy;
    const h = NIGHT_SIGHT_LEVELS.hard;
    expect(e.reactNearTicks).toBeGreaterThan(N.reactNearTicks);
    expect(h.reactNearTicks).toBeLessThan(N.reactNearTicks);
    for (const c of [e, N, h]) {
      expect(c.beamBonusTiles).toBe(1);
      expect(c.contactTiles).toBe(1);
      // about 0.2 to 0.6 s
      expect(c.reactNearTicks).toBeGreaterThanOrEqual(12);
      expect(c.reactFarTicks).toBeLessThanOrEqual(36);
    }
    for (const level of ['easy', 'normal', 'hard'] as const) {
      const s = createGame(
        buildRaidGame({ raidId: 'recordsVault', humanCharacter: 'streetBaller', seed: 1, level }),
      );
      expect(s.config.nightSight).toEqual(NIGHT_SIGHT_LEVELS[level]);
    }
  });
});

describe("the fighter's own beam", () => {
  it('lengthens the torch cone by exactly one tile, never through a wall', () => {
    // 5 ahead: beyond the torch's 4 unless the warden sees the fighter's beam
    const dark = vault();
    post(dark.s, dark.g, 3, 6, 'right');
    // the fighter faces a wall (three tiles wide, his first row of light): his beam lights no floor
    for (const y of [5, 6, 7]) dark.s.tiles[y * dark.s.width + 9] = Tile.Hard;
    fighter(dark.s, 8, 6, 'right');
    expect(nightNotice(dark.s, dark.g, dark.s.players[0]!)!.beamSeen).toBe(false);
    expect(watch(dark.s, dark.g, 120)).toBeNull();

    const lit = vault();
    post(lit.s, lit.g, 3, 6, 'right');
    fighter(lit.s, 8, 6, 'up'); // his beam lights the floor north of him, in the warden's view
    const n = nightNotice(lit.s, lit.g, lit.s.players[0]!)!;
    expect(n.beamSeen).toBe(true);
    expect(n.reach).toBe(LIGHT_TUNING.guard.range + 1);
    expect(watch(lit.s, lit.g, 120)).not.toBeNull();

    // 6 ahead: never, beam or not
    const six = vault();
    post(six.s, six.g, 3, 6, 'right');
    fighter(six.s, 9, 6, 'up');
    expect(nightNotice(six.s, six.g, six.s.players[0]!)!.reach).toBe(LIGHT_TUNING.guard.range + 1);
    expect(watch(six.s, six.g, 200)).toBeNull();

    // the beam behind a wall is not seen
    const walled = vault();
    post(walled.s, walled.g, 3, 6, 'right');
    for (let y = 1; y < walled.s.height - 1; y++) walled.s.tiles[y * walled.s.width + 6] = Tile.Hard;
    fighter(walled.s, 8, 6, 'up');
    expect(nightNotice(walled.s, walled.g, walled.s.players[0]!)!.beamSeen).toBe(false);
  });
});

describe('in the dark', () => {
  it('an adjacent fighter beside the warden is noticed at once; touching his back or two tiles behind him is not (decision CV1)', () => {
    const { s, g } = vault();
    post(s, g, 6, 6, 'right');
    fighter(s, 6, 7, 'up'); // at his side
    expect(watch(s, g, 1)).toBe(1);
    const back = vault();
    post(back.s, back.g, 6, 6, 'right');
    fighter(back.s, 5, 6, 'left'); // touching his back: a calm warden does not feel a quiet fighter behind him
    expect(watch(back.s, back.g, 120)).toBeNull();
    const two = vault();
    post(two.s, two.g, 6, 6, 'right');
    fighter(two.s, 4, 6, 'left'); // the lit raid's `closeTiles` (2) would alert; the dark does not
    expect(watch(two.s, two.g, 120)).toBeNull();
  });

  it('an enemy without a torch never sees the fighter in the dark, only at contact', () => {
    const { s, g } = vault();
    const thrower = s.players.find((p) => p.isBot && p.enemyKind === 'thrower')!;
    const t = { ...thrower, alive: true, x: 4, y: 6, facing: 'right' as Dir };
    expect(g.enemyKind).toBe('guard');
    expect(nightNotice(s, t, fighter(s, 6, 6, 'up'))!.sees).toBe(false);
    expect(nightNotice(s, t, fighter(s, 5, 6, 'up'))!.close).toBe(true);
  });

  it('engaged guards keep the raid AI rules: a pursuing warden is not asked', () => {
    const { s, g } = vault();
    post(s, g, 6, 6, 'right');
    s.territory!.minds[g.id]!.state = 'pursue';
    fighter(s, 3, 6, 'left'); // three behind it: beyond `closeTiles`, so only all-round sight sees him
    const before = s.territory!.minds[g.id]!.lastSeenTick;
    watch(s, g, 1);
    // all-round sight: it still sees him behind it and updates its memory
    expect(s.territory!.minds[g.id]!.lastSeenTick).toBeGreaterThan(before);
  });
});

describe('isolation', () => {
  it('only the night raid carries the night config; the sim has no quality input', () => {
    for (const id of [
      'warehouseDispatchDepot',
      'partsStoreroom',
      'junctionToolShed',
      'railYardGoods',
      'standbyPlant',
    ])
      expect(newRaid(id as RaidId).config.nightSight, id).toBeUndefined();
    expect(newRaid('recordsVault').config.nightSight).toEqual(N);
  });

  it(
    'the lit raids play byte-for-byte as recorded (scripted full raid, every level; re-recorded for AM1-AM6, CV1-CV7, CV8 and, on Easy / Normal only, PI7; Hard is the production recording)',
    { timeout: 180_000 },
    () => {
      const out: Record<string, string> = {};
      for (const raidId of ['warehouseDispatchDepot', 'partsStoreroom', 'standbyPlant'] as RaidId[])
        for (const level of ['easy', 'normal', 'hard'] as CampaignLevel[]) {
          let last: unknown = null;
          const r = playRaidFight({
            raidId,
            seed: 1,
            difficulty: campaignEnemyLevel(level),
            level,
            onTick: (s) => (last = s),
          });
          // decision PI7 added `revealGraceTicks` to the raid config (and two optional mind fields where it is on): a
          // Hard run must equal the production recording once that one key is taken out
          const g = last as GameState;
          delete (g.config.campaignTactics!.classicRaid as { revealGraceTicks?: number }).revealGraceTicks;
          for (const m of Object.values(g.territory?.minds ?? {})) {
            delete m.facingSeen;
            delete m.graceUntil;
          }
          out[`${raidId}/${level}`] = `${hashOf(last)}/${r.outcome}`;
        }
      expect(out).toEqual({
        'warehouseDispatchDepot/easy': 'a16c010:32249/completed',
        'warehouseDispatchDepot/normal': 'e9175201:32541/completed',
        'warehouseDispatchDepot/hard': '5933b59b:32715/completed',
        'partsStoreroom/easy': 'fe7929c3:27547/completed',
        'partsStoreroom/normal': 'c4db15d9:27654/completed',
        'partsStoreroom/hard': 'a65e024a:28120/completed',
        'standbyPlant/easy': 'c0f1594b:26769/completed',
        'standbyPlant/normal': '8f6a8fc7:27645/completed',
        'standbyPlant/hard': 'cec315f1:27293/completed',
      });
    },
  );
});
