/**
 * A field mission's follow camera stays on its district sector (docs/CAMPAIGN_SECTOR_AI.md, "Camera and minimap"): the
 * HUD-free band shows at most the sector's margin of scenery beyond its playable box (never less than the rig's own HUD
 * margin, so the player at the box's edge is still clear of the HUD), a box narrower than the view is centred, and the
 * overview / establishing shot frames the sector, not the city. City Rumble without a sector is unchanged
 * (tests/rumble-camera.test.ts). The minimap crops to the sector's clip and draws its barricades as walls.
 */
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { CameraRig } from '../../src/render/cameraRig';
import { directShot, sectorBounds } from '../../src/render/cameraDirector';
import { createLayout } from '../../src/render/coords';
import { FIELD_MISSION_DEFS, buildMissionGame, createGame, getArena } from '../../src/sim';
import type { GameState } from '../../src/sim';
import {
  minimapCrop,
  minimapGeometry,
  minimapLayers,
  onMinimap,
  tileToMinimap,
} from '../../src/ui/minimapModel';
import { renderClip } from '../../src/render/sectorClip';

const VIEWPORTS = [
  { name: 'desktop', aspect: 1280 / 720, insets: { top: 0.1, bottom: 0.05 } },
  { name: 'phone landscape 740x360', aspect: 740 / 360, insets: { top: 0.13, bottom: 0.03 } },
];

function field(id: string, o: { noSector?: boolean; archivedPilot?: boolean } = {}): GameState {
  const def = FIELD_MISSION_DEFS[id]!;
  const s = createGame(
    buildMissionGame({
      spec: {
        id: def.districtId,
        fieldId: id,
        ...(o.noSector ? { noSector: true } : {}),
        ...(o.archivedPilot ? { archivedPilot: true } : {}),
      },
      humanCharacter: 'streetBaller',
      seed: 3,
    }),
  );
  s.match.phase = 'playing';
  s.match.countdownRemaining = 0;
  return s;
}

/** World point of the floor under NDC (nx, ny) of the rig's camera. */
function ground(rig: CameraRig, nx: number, ny: number): Vector3 {
  const cam = rig.camera;
  const a = new Vector3(nx, ny, -1).unproject(cam);
  const b = new Vector3(nx, ny, 1).unproject(cam);
  const t = a.y / (a.y - b.y);
  return a.lerp(b, t);
}

describe('follow camera inside a sector', () => {
  for (const id of ['oshodi.approach', 'lagosIsland.press', 'lekki.estate']) {
    for (const vp of VIEWPORTS) {
      it(`${id}, ${vp.name}: from every corner of the play area the band never leaves the sector box + margin`, () => {
        const s = field(id);
        const layout = createLayout(s.width, s.height);
        const b = sectorBounds(s, layout)!;
        const rig = new CameraRig(layout);
        rig.fit(vp.aspect, vp.insets);
        const compact = vp.insets.top >= 0.12;
        const side = Math.max(b.margin, compact ? 3.4 : 1.8);
        const south = Math.max(b.margin, compact ? 2.2 : 1.1);
        const tiles: [number, number][] = [];
        for (const r of s.sector!.rects)
          tiles.push(
            [r[0], r[1]],
            [r[2], r[1]],
            [r[0], r[3]],
            [r[2], r[3]],
            [(r[0] + r[2]) >> 1, (r[1] + r[3]) >> 1],
          );
        for (const [x, y] of tiles) {
          const p = s.players[0]!;
          p.x = p.stepFromX = x;
          p.y = p.stepFromY = y;
          rig.cut();
          const shot = directShot(s, layout, 0, 0, false);
          expect(shot.bounds).toEqual(b);
          rig.update(0, 0, 0, shot);
          const yTop = 1 - vp.insets.top * 2;
          const yBottom = -1 + vp.insets.bottom * 2;
          const w = b.play.x1 - b.play.x0;
          const h = b.play.z1 - b.play.z0;
          const eps = 0.05;
          // the far edge of the band: never more than the margin north of the box (unless the box is shorter than
          // the view: then the view is centred on it)
          const far = ground(rig, 0, yTop);
          const near = ground(rig, 0, yBottom);
          if (near.z - far.z <= h + south + b.margin) {
            expect(far.z, `${id} ${x},${y} far edge`).toBeGreaterThanOrEqual(b.play.z0 - b.margin - eps);
            expect(near.z, `${id} ${x},${y} near edge`).toBeLessThanOrEqual(b.play.z1 + south + eps);
          }
          const left = ground(rig, -0.97, 0);
          const right = ground(rig, 0.97, 0);
          if (right.x - left.x <= w + 2 * side) {
            expect(left.x, `${id} ${x},${y} left edge`).toBeGreaterThanOrEqual(b.play.x0 - side - eps);
            expect(right.x, `${id} ${x},${y} right edge`).toBeLessThanOrEqual(b.play.x1 + side + eps);
          } else {
            expect((left.x + right.x) / 2).toBeCloseTo((b.play.x0 + b.play.x1) / 2, 1);
          }
          // the followed player stays inside the HUD-free band
          const v = new Vector3(layout.wx(x), 0.9, layout.wz(y)).project(rig.camera);
          expect(Math.abs(v.x), `${id} ${x},${y} on screen`).toBeLessThan(0.97);
          expect(v.y).toBeLessThan(yTop);
          expect(v.y).toBeGreaterThan(yBottom);
        }
      });
    }
  }

  it('the establishing / overview shot frames the sector, much closer than the whole city', () => {
    // a sector of a district's City Rumble map: the archived pilot's frozen Terminal Approach sector (the district field
    // missions moved to their own campaign boards, whose sector is the whole board: decisions WX5, WE1-WE8)
    const s = field('oshodi.approach', { archivedPilot: true });
    const layout = createLayout(s.width, s.height);
    const rig = new CameraRig(layout);
    rig.fit(VIEWPORTS[1]!.aspect, VIEWPORTS[1]!.insets);
    rig.update(0, 0, 0, null);
    const city = rig.currentPose().distance;
    const shot = directShot(s, layout, 0, 0, true);
    expect(shot.kind).toBe('overview');
    expect(shot.bounds).toBeDefined();
    rig.cut();
    rig.update(0, 0, 0, shot);
    const pose = rig.currentPose();
    expect(pose.distance).toBeLessThan(city);
    // every corner of the playable box is inside the frame
    const b = shot.bounds!.play;
    for (const [x, z] of [
      [b.x0, b.z0],
      [b.x1, b.z0],
      [b.x0, b.z1],
      [b.x1, b.z1],
    ] as const) {
      const v = new Vector3(x, 0, z).project(rig.camera);
      expect(Math.abs(v.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(v.y)).toBeLessThanOrEqual(1);
    }
  });

  it('without a sector nothing changes: no bounds, the free follow shot of the city', () => {
    const s = field('oshodi.approach', { noSector: true });
    const layout = createLayout(s.width, s.height);
    const shot = directShot(s, layout, 0, 0, false);
    expect(shot.bounds).toBeUndefined();
    expect(shot.free).toBe(true);
    expect(directShot(s, layout, 0, 0, true).bounds).toBeUndefined();
    expect(renderClip(s)).toBeNull();
  });
});

describe('minimap crop', () => {
  it('shows the sector clip only, maps its corner to the top-left and draws barricades as walls', () => {
    // a district sector of a City Rumble map: the archived pilot's replay of Terminal Approach (decision WX8; Lekki's missions
    // play on their own campaign areas now, WL1)
    const s = field('oshodi.approach', { archivedPilot: true });
    const crop = minimapCrop(s);
    const clip = s.sector!.clip;
    expect(crop).toEqual({
      x0: clip.x0,
      y0: clip.y0,
      cols: clip.x1 - clip.x0 + 1,
      rows: clip.y1 - clip.y0 + 1,
    });
    expect(crop.cols).toBeLessThan(s.width);
    expect(crop.rows).toBeLessThan(s.height);
    const geo = minimapGeometry(crop.cols, crop.rows, 130, 64, crop);
    expect(tileToMinimap(geo, clip.x0, clip.y0)).toEqual({ x: geo.cell / 2, y: geo.cell / 2 });
    expect(onMinimap(geo, clip.x0 - 1, clip.y0)).toBe(false);
    expect(onMinimap(geo, s.players[0]!.x, s.players[0]!.y)).toBe(true);
    // the cell is larger than the whole district's would be in the same box
    expect(geo.cell).toBeGreaterThan(minimapGeometry(s.width, s.height, 130, 64).cell);
    const layers = minimapLayers(s, getArena(s.arenaId).layout, 0, 0);
    expect(layers.barricade.sort((a, b) => a - b)).toEqual([...s.sector!.blocked].sort((a, b) => a - b));
    for (const i of s.sector!.blocked) expect(layers.crushed).not.toContain(i);
  });

  it('a match without a sector shows the whole board as before', () => {
    const s = field('lekki.approach', { noSector: true });
    expect(minimapCrop(s)).toEqual({ x0: 0, y0: 0, cols: s.width, rows: s.height });
    expect(minimapLayers(s, getArena(s.arenaId).layout, 0, 0).barricade).toEqual([]);
  });
});
