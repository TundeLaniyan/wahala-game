/**
 * Night raid light (src/sim/raid/light.ts, docs/CLASSIC_LIGHTING.md, decisions NL4-NL8): the lit tile sets the darkness
 * mask draws and the later light-based detection will read. The fighter's cone follows his facing and stops at walls,
 * the personal radius is always lit, a guard's torch lights where he looks (never his own tile), the fixed lamps light
 * their room, enemies outside every light are hidden, and only the Records Vault is a night raid.
 */
import { describe, expect, it } from 'vitest';
import { RAID_DEFS, RAID_IDS, Tile, getArena } from '../src/sim';
import type { Dir, GameState, Player } from '../src/sim';
import {
  LIGHT_TUNING,
  lightAt,
  lineOfLight,
  raidLightMap,
  raidLighting,
  tileRevealed,
} from '../src/sim/raid/light';
import { newRaid } from './raid-helpers';

const LIT = LIGHT_TUNING.lit;

/** The night raid with an open floor inside the border (walls only where a test puts them) and no live enemy. */
function openVault(): GameState {
  const s = newRaid('recordsVault');
  for (let y = 1; y < s.height - 1; y++)
    for (let x = 1; x < s.width - 1; x++) s.tiles[y * s.width + x] = Tile.Empty;
  for (const p of s.players) if (p.isBot) p.alive = false;
  return s;
}
const me = (s: GameState): Player => s.players.find((p) => !p.isBot)!;
function place(p: Player, x: number, y: number, facing: Dir): void {
  p.x = p.stepFromX = x;
  p.y = p.stepFromY = y;
  p.facing = facing;
  p.stepRemaining = 0;
}
const playerLit = (s: GameState, x: number, y: number): boolean =>
  raidLightMap(s)!.player[y * s.width + x]! >= LIT;

describe('which raids are dark', () => {
  it('only the Records Vault is a night raid; every other raid has no light map', () => {
    const night = RAID_IDS.filter((id) => RAID_DEFS[id].lighting?.mode === 'night');
    expect(night).toEqual(['recordsVault']);
    for (const id of RAID_IDS) {
      const s = newRaid(id);
      expect(raidLighting(s) !== null, id).toBe(id === 'recordsVault');
      expect(raidLightMap(s) !== null, id).toBe(id === 'recordsVault');
    }
  });

  it("the vault's lamps stand on open floor of its board", () => {
    const def = RAID_DEFS.recordsVault;
    const arena = getArena(def.arenaId);
    for (const l of def.lighting!.practicals) expect(arena.layout[l.y]![l.x], `${l.x},${l.y}`).not.toBe('#');
  });
});

describe("the fighter's flashlight", () => {
  it('is a cone in the facing direction: range ahead, widening, nothing behind', () => {
    const s = openVault();
    place(me(s), 2, 6, 'right');
    const r = LIGHT_TUNING.player.range;
    for (let a = 0; a <= r; a++) expect(playerLit(s, 2 + a, 6), `ahead ${a}`).toBe(true);
    expect(playerLit(s, 2 + r + 1, 6)).toBe(false);
    // wider further out: three tiles across at 2 ahead, five at 4 ahead
    expect(playerLit(s, 4, 5) && playerLit(s, 4, 7)).toBe(true);
    expect(playerLit(s, 6, 4) && playerLit(s, 6, 8)).toBe(true);
    expect(playerLit(s, 4, 4)).toBe(false);
    // behind (beyond the personal radius) stays dark
    const behind = openVault();
    place(me(behind), 6, 6, 'right');
    expect(playerLit(behind, 4, 6)).toBe(false);
    expect(playerLit(behind, 3, 6)).toBe(false);
  });

  it('follows the facing: turning lights the new direction and darkens the old one', () => {
    const s = openVault();
    const p = me(s);
    place(p, 7, 6, 'right');
    expect(playerLit(s, 10, 6)).toBe(true);
    expect(playerLit(s, 7, 9)).toBe(false);
    for (const [dir, x, y] of [
      ['down', 7, 9],
      ['left', 4, 6],
      ['up', 7, 3],
    ] as const) {
      p.facing = dir;
      expect(playerLit(s, x, y), dir).toBe(true);
      expect(playerLit(s, 10, 6), dir).toBe(false);
    }
  });

  it('always lights the eight tiles around the fighter, whatever he faces (walls included)', () => {
    const s = openVault();
    const p = me(s);
    place(p, 5, 5, 'up');
    s.tiles[5 * s.width + 4] = Tile.Hard;
    for (const dir of ['up', 'right', 'down', 'left'] as const) {
      p.facing = dir;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          expect(playerLit(s, 5 + dx, 5 + dy), `${dir} ${dx},${dy}`).toBe(true);
    }
  });

  it('stops at walls and crates: the solid tile is lit, nothing behind it', () => {
    const s = openVault();
    place(me(s), 2, 6, 'right');
    s.tiles[6 * s.width + 4] = Tile.Hard;
    expect(playerLit(s, 3, 6)).toBe(true);
    expect(playerLit(s, 4, 6)).toBe(true); // the wall's face
    expect(playerLit(s, 5, 6)).toBe(false);
    expect(playerLit(s, 6, 6)).toBe(false);
    // the cone's outer rows still reach past it
    expect(playerLit(s, 6, 4)).toBe(true);
    // a crate blocks too
    const c = openVault();
    place(me(c), 2, 6, 'right');
    c.tiles[6 * c.width + 5] = Tile.Soft;
    expect(playerLit(c, 5, 6)).toBe(true);
    expect(playerLit(c, 6, 6)).toBe(false);
    expect(lineOfLight(c, 2, 6, 7, 6)).toBe(false);
    expect(lineOfLight(c, 2, 6, 4, 6)).toBe(true);
  });

  it('on the real vault, the entrance hall is lit along the corridor and the registry behind the wall is not', () => {
    const s = newRaid('recordsVault');
    for (const p of s.players) if (p.isBot) p.alive = false;
    place(me(s), 1, 11, 'right');
    expect(playerLit(s, 5, 11)).toBe(true);
    // the registry (row 7) is behind the wall row 9 and the closed door
    for (let x = 1; x < 14; x++) expect(playerLit(s, x, 7), `registry ${x}`).toBe(false);
  });
});

describe('guard torches', () => {
  function withGuard(facing: Dir): { s: GameState; g: Player } {
    const s = openVault();
    place(me(s), 1, 1, 'up');
    const g = s.players.find((p) => p.isBot && p.enemyKind === 'guard')!;
    g.alive = true;
    place(g, 7, 6, facing);
    return { s, g };
  }
  const guardLit = (s: GameState, x: number, y: number): boolean =>
    raidLightMap(s)!.guard[y * s.width + x]! >= LIT;

  it('light a narrower cone where the guard looks, never his own tile', () => {
    const { s } = withGuard('left');
    const r = LIGHT_TUNING.guard.range;
    for (let a = 1; a <= r; a++) expect(guardLit(s, 7 - a, 6), `ahead ${a}`).toBe(true);
    expect(guardLit(s, 7 - r - 1, 6)).toBe(false);
    expect(guardLit(s, 7, 6)).toBe(false);
    expect(guardLit(s, 8, 6)).toBe(false);
    // narrower than the fighter's: at 4 ahead the fighter's is 5 wide, the guard's 3
    expect(guardLit(s, 3, 5) && guardLit(s, 3, 7)).toBe(true);
    expect(guardLit(s, 3, 4)).toBe(false);
  });

  it('follow his facing', () => {
    const { s, g } = withGuard('left');
    expect(guardLit(s, 5, 6)).toBe(true);
    g.facing = 'down';
    expect(guardLit(s, 5, 6)).toBe(false);
    expect(guardLit(s, 7, 8)).toBe(true);
    g.facing = 'up';
    expect(guardLit(s, 7, 4)).toBe(true);
    expect(guardLit(s, 7, 8)).toBe(false);
  });

  it('are clipped by walls', () => {
    const { s } = withGuard('left');
    s.tiles[6 * s.width + 5] = Tile.Hard;
    expect(guardLit(s, 6, 6)).toBe(true);
    expect(guardLit(s, 5, 6)).toBe(true); // the wall's face
    expect(guardLit(s, 4, 6)).toBe(false);
    expect(guardLit(s, 3, 6)).toBe(false);
  });

  it('only torch kinds carry one, and a dead guard carries none', () => {
    const { s, g } = withGuard('left');
    const thrower = s.players.find((p) => p.isBot && p.enemyKind === 'thrower')!;
    expect(RAID_DEFS.recordsVault.lighting!.torchKinds).not.toContain('thrower');
    thrower.alive = true;
    place(thrower, 7, 2, 'left');
    expect(guardLit(s, 5, 2)).toBe(false);
    g.alive = false;
    expect(guardLit(s, 5, 6)).toBe(false);
  });
});

describe('what the dark hides', () => {
  it('an enemy in an unlit tile is hidden; lit or next to the fighter it shows', () => {
    const s = openVault();
    const p = me(s);
    place(p, 2, 6, 'right');
    const map = raidLightMap(s)!;
    // in the cone
    expect(tileRevealed(map, 5, 6, p)).toBe(true);
    // behind the fighter, two tiles away: dark
    const far = openVault();
    place(me(far), 6, 6, 'right');
    const m2 = raidLightMap(far)!;
    expect(tileRevealed(m2, 4, 6, me(far))).toBe(false);
    // right behind him: the personal radius
    expect(tileRevealed(m2, 5, 6, me(far))).toBe(true);
    // a lamp shows its tiles to everyone
    const vault = newRaid('recordsVault');
    const lamp = RAID_DEFS.recordsVault.lighting!.practicals[0]!;
    expect(lightAt(raidLightMap(vault)!, lamp.x, lamp.y)).toBeGreaterThanOrEqual(LIT);
  });

  it('a guard is not revealed by his own torch, but is by a fellow guard pointing at him', () => {
    const s = openVault();
    place(me(s), 1, 1, 'up');
    const [a, b] = s.players.filter((p) => p.isBot && p.enemyKind === 'guard');
    a!.alive = b!.alive = true;
    place(a!, 5, 4, 'left');
    place(b!, 12, 2, 'right');
    expect(tileRevealed(raidLightMap(s)!, 5, 4, me(s))).toBe(false);
    place(b!, 5, 7, 'up');
    expect(tileRevealed(raidLightMap(s)!, 5, 4, me(s))).toBe(true);
  });

  it('blast flames light their tile and its neighbours while they burn', () => {
    const s = openVault();
    place(me(s), 1, 1, 'up');
    expect(lightAt(raidLightMap(s)!, 6, 9)).toBeLessThan(LIT);
    s.flames.push({ x: 6, y: 9, eventId: 1, genId: 1, ownerId: 0, dir: null } as GameState['flames'][number]);
    const map = raidLightMap(s)!;
    expect(lightAt(map, 6, 9)).toBeGreaterThanOrEqual(LIT);
    expect(lightAt(map, 7, 9)).toBeGreaterThanOrEqual(LIT);
    expect(lightAt(map, 8, 9)).toBeLessThan(LIT);
  });

  it('is deterministic and reuses the buffer it is given', () => {
    const s = newRaid('recordsVault');
    const a = raidLightMap(s)!;
    const snap = [Array.from(a.player), Array.from(a.guard), Array.from(a.practical)];
    const b = raidLightMap(s, a)!;
    expect(b).toBe(a);
    expect([Array.from(b.player), Array.from(b.guard), Array.from(b.practical)]).toEqual(snap);
    expect(raidLightMap(newRaid('recordsVault'))!.player).toEqual(new Uint8Array(snap[0]!));
  });
});
