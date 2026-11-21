/**
 * The night raid's presentation (docs/CLASSIC_LIGHTING.md, decisions NL4-NL7), headless: the mask texture is written
 * from the sim's lit tile sets (and only from them: a lit tile is bright, a dark tile black), the quality preset changes
 * nothing of it, enemies in the dark are concealed by the same rule, the beam follows the facing and stops at the first
 * wall, warnings are drawn unlit and fog-free above the mask, and a lit raid builds none of it.
 */
import { describe, expect, it } from 'vitest';
import type { MeshBasicMaterial } from 'three';
import { Mesh, MeshStandardMaterial } from 'three';
import { LIGHT_TUNING, Tile, raidLightMap } from '../../src/sim';
import type { GameState, Player } from '../../src/sim';
import { createLayout } from '../../src/render/coords';
import { NightLightViews, nightLightingOf, reachAlong } from '../../src/render/views/NightLightViews';
import { nightWorld } from '../../src/render/nightMask';
import { applyGrit, patchMaterial } from '../../src/render/grit';
import { TileOverlay } from '../../src/render/views/TileOverlay';
import type { FrameContext } from '../../src/render/views/types';
import { newRaid } from '../raid-helpers';
import { arenaLook } from '../../src/render/arenaLook';
import { RAID_STOREROOM_LOOK, RAID_STOREROOM_NIGHT_LOOK } from '../../src/render/arenas/raidStoreroom';

const me = (s: GameState): Player => s.players.find((p) => !p.isBot)!;

function frame(state: GameState, dt = 1): FrameContext {
  return {
    state,
    alpha: 0,
    time: 0,
    dt,
    info: {} as FrameContext['info'],
    layout: createLayout(state.width, state.height),
    fx: {} as FrameContext['fx'],
  };
}

/** Runs the view long enough for the eased levels to settle on the sim's. */
function settle(v: NightLightViews, s: GameState): void {
  for (let i = 0; i < 30; i++) v.update(frame(s, 0.1));
}

const maskBytes = (v: NightLightViews): number[] =>
  Array.from((v as unknown as { texture: { image: { data: Uint8Array } } }).texture.image.data);

describe('night raid presentation', () => {
  it('only the night raid builds the dark; the look is the storeroom night look', () => {
    expect(nightLightingOf(newRaid('recordsVault'))).not.toBeNull();
    expect(nightLightingOf(newRaid('partsStoreroom'))).toBeNull();
    expect(nightLightingOf(newRaid('warehouseDispatchDepot'))).toBeNull();
    expect(arenaLook('raidRecordsVault')).toBe(RAID_STOREROOM_NIGHT_LOOK);
    expect(arenaLook('raidPartsStoreroom')).toBe(RAID_STOREROOM_LOOK);
    // the night look leaves the board out of the fog (camera about 20 units away) and needs no point lamps
    expect(RAID_STOREROOM_NIGHT_LOOK.fog.near).toBeGreaterThan(22);
    expect(RAID_STOREROOM_NIGHT_LOOK.lamps).toHaveLength(0);
  });

  it('writes the mask from the lit tile sets: lit tiles bright, dark tiles black', () => {
    const s = newRaid('recordsVault');
    const v = new NightLightViews(s, nightLightingOf(s)!);
    expect(nightWorld.on.value).toBe(1);
    settle(v, s);
    const map = raidLightMap(s)!;
    const bytes = maskBytes(v);
    for (let i = 0; i < s.width * s.height; i++) {
      expect(Math.abs(bytes[i * 4]! - map.player[i]!), `player ${i}`).toBeLessThanOrEqual(2);
      expect(Math.abs(bytes[i * 4 + 1]! - map.guard[i]!), `guard ${i}`).toBeLessThanOrEqual(2);
      expect(Math.abs(bytes[i * 4 + 2]! - map.practical[i]!), `lamp ${i}`).toBeLessThanOrEqual(2);
    }
    // most of the board is dark
    const dark = Array.from({ length: s.width * s.height }, (_, i) => i).filter(
      (i) => Math.max(bytes[i * 4]!, bytes[i * 4 + 1]!, bytes[i * 4 + 2]!) < LIGHT_TUNING.lit,
    );
    expect(dark.length).toBeGreaterThan(s.width * s.height * 0.6);
    v.dispose();
    expect(nightWorld.on.value).toBe(0);
  });

  it('Low and High (beam detail) write the same mask and hide the same enemies', () => {
    const s = newRaid('recordsVault');
    const low = new NightLightViews(s, nightLightingOf(s)!, 10);
    settle(low, s);
    const a = maskBytes(low);
    const hiddenLow = s.players.map((p) => low.concealed(p));
    low.dispose();
    const high = new NightLightViews(s, nightLightingOf(s)!, 16);
    settle(high, s);
    expect(maskBytes(high)).toEqual(a);
    expect(s.players.map((p) => high.concealed(p))).toEqual(hiddenLow);
    high.dispose();
  });

  it('conceals an enemy in the dark and shows it once the flashlight finds it', () => {
    const s = newRaid('recordsVault');
    const v = new NightLightViews(s, nightLightingOf(s)!);
    const p = me(s);
    p.x = p.stepFromX = 1;
    p.y = p.stepFromY = 11;
    p.facing = 'up';
    // a hall warden four tiles east, in the dark (the fighter looks north)
    const g = s.players.find((q) => q.isBot && q.enemyKind === 'thrower')!;
    g.alive = true;
    g.x = g.stepFromX = 5;
    g.y = g.stepFromY = 11;
    g.facing = 'up';
    settle(v, s);
    expect(v.concealed(g)).toBe(true);
    expect(v.concealed(p)).toBe(false); // the fighter is never hidden
    expect(v.stats().concealed).toBeGreaterThanOrEqual(1);
    p.facing = 'right';
    settle(v, s);
    expect(v.concealed(g)).toBe(false);
    // next to the fighter: always shown, whatever the light
    p.facing = 'left';
    g.x = g.stepFromX = 2;
    settle(v, s);
    expect(v.concealed(g)).toBe(false);
    v.dispose();
  });

  it('turns the beam smoothly towards the facing and clips it at the first wall', () => {
    const s = newRaid('recordsVault');
    const v = new NightLightViews(s, nightLightingOf(s)!);
    const p = me(s);
    p.x = p.stepFromX = 1;
    p.y = p.stepFromY = 11;
    p.facing = 'right';
    settle(v, s);
    expect(v.stats().playerYaw).toBeCloseTo(Math.PI / 2, 3);
    expect(v.stats().playerReach).toBe(LIGHT_TUNING.player.range);
    p.facing = 'up';
    v.update(frame(s, 1 / 60));
    const yaw = v.stats().playerYaw;
    // one frame later the beam is on its way, not there yet
    expect(yaw).toBeGreaterThan(Math.PI / 2);
    expect(yaw).toBeLessThan(Math.PI);
    settle(v, s);
    expect(v.stats().playerYaw).toBeCloseTo(Math.PI, 3);
    // north of the entrance: (1, 10) open, (1, 9) the wall
    expect(reachAlong(s, 1, 11, 'up', 5)).toBe(2);
    expect(s.tiles[9 * s.width + 1]).toBe(Tile.Hard);
    expect(v.stats().playerReach).toBe(2);
    v.dispose();
  });

  it('warnings are unlit and fog-free (drawn over the dark); lit materials carry the mask with a per-material share', () => {
    const o = new TileOverlay(null as never, 4, 7);
    const m = o.mesh.material as MeshBasicMaterial;
    expect(m.fog).toBe(false);
    expect(m.type).toBe('MeshBasicMaterial');
    // an unlit material is never patched, so the mask cannot touch it
    expect(patchMaterial(m, 'scenery')).toBe(false);
    // a lit material is, and its share of the mask follows the nearest `userData.nightK`
    const gen = new Mesh(undefined, new MeshStandardMaterial());
    gen.userData.grit = 'vehicle';
    gen.userData.nightK = 0.45;
    expect(applyGrit(gen)).toBe(1);
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: '#include <common>\n#include <project_vertex>',
      fragmentShader:
        '#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <opaque_fragment>',
    };
    (gen.material as MeshStandardMaterial).onBeforeCompile(shader as never, null as never);
    expect(shader.uniforms.uNightK!.value).toBe(0.45);
    expect(shader.uniforms.uNightOn).toBe(nightWorld.on);
    expect(shader.fragmentShader).toMatch(/uNightOn[\s\S]*#include <opaque_fragment>/);
  });
});
