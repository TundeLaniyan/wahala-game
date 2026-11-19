/**
 * The campaign camera (docs/CAMPAIGN_CAMERA.md, decisions CF1-CF6): a campaign mission opens framed on the fighter and the
 * few tiles round them (no whole-district or whole-sector establishing view), follows them through the sector with a
 * soft edge (no jump, never past the sector box + margin), keeps at least about 5 tiles visible on every side in open
 * ground, and a classic raid follows only when its board does not fit the screen as well as a standard board.
 * Standalone Classic keeps the fixed whole-arena camera and City Rumble its stadium camera (also
 * tests/render/camera.test.ts, tests/rumble-camera.test.ts). The skeleton release that stops the per-match bone texture
 * leak is checked here; the GPU counts across restarts are measured in e2e/campaign-camera.spec.ts and
 * scripts/campaign-perf.mjs.
 */
import { describe, expect, it } from 'vitest';
import { Bone, BoxGeometry, MeshBasicMaterial, Skeleton, SkinnedMesh, Vector3 } from 'three';
import { CameraRig, softClamp } from '../../src/render/cameraRig';
import { CAMPAIGN_FRAMING, campaignShot, directShot, sectorBounds } from '../../src/render/cameraDirector';
import { cameraModeFor, cameraModeForMatch, selectShot } from '../../src/render/cameraModes';
import { createLayout } from '../../src/render/coords';
import type { Layout } from '../../src/render/coords';
import { releaseSkeletons } from '../../src/render/assets/library';
import {
  DEFAULT_ARENA_ID,
  DIR_VEC,
  FIELD_MISSION_DEFS,
  getArena,
  Tile,
  buildMissionGame,
  buildRaidGame,
  createGame,
  tick,
} from '../../src/sim';
import type { Dir, GameState, Intents, RaidId } from '../../src/sim';
import { RUMBLE_FIXTURE, sandbox } from '../helpers';

const PHONE = { name: 'phone 740x360', w: 740, h: 360, insets: { top: 0.13, bottom: 0.03 } };
const PHONE2 = { name: 'phone 844x390', w: 844, h: 390, insets: { top: 0.13, bottom: 0.03 } };
const DESKTOP = { name: 'desktop 1280x720', w: 1280, h: 720, insets: { top: 0.1, bottom: 0.05 } };
const OPTS = { preferOverview: false, choosingEntry: false, attract: false };

function field(id: string, seed = 3): GameState {
  const def = FIELD_MISSION_DEFS[id]!;
  return createGame(
    buildMissionGame({ spec: { id: def.districtId, fieldId: id }, humanCharacter: 'streetBaller', seed }),
  );
}
const boss = (id: 'oshodi' | 'mushin'): GameState =>
  createGame(buildMissionGame({ spec: { id }, humanCharacter: 'streetBaller', seed: 3 }));
const raid = (id: RaidId): GameState =>
  createGame(buildRaidGame({ raidId: id, humanCharacter: 'streetBaller', seed: 3 }));

function rigFor(s: GameState, vp: typeof PHONE): { rig: CameraRig; layout: Layout } {
  const layout = createLayout(s.width, s.height);
  const rig = new CameraRig(layout);
  rig.fit(vp.w / vp.h, vp.insets, vp.h);
  return { rig, layout };
}

/** World point of the floor under NDC (nx, ny) of the rig's camera. */
function ground(rig: CameraRig, nx: number, ny: number): Vector3 {
  const a = new Vector3(nx, ny, -1).unproject(rig.camera);
  const b = new Vector3(nx, ny, 1).unproject(rig.camera);
  return a.lerp(b, a.y / (a.y - b.y));
}

/** The floor the HUD-free band shows (world units): the bounding box of its four corners. */
function visible(rig: CameraRig, vp: typeof PHONE): { x0: number; z0: number; x1: number; z1: number } {
  const yTop = 1 - vp.insets.top * 2;
  const yBottom = -1 + vp.insets.bottom * 2;
  const pts = [
    ground(rig, -1, yTop),
    ground(rig, 1, yTop),
    ground(rig, -1, yBottom),
    ground(rig, 1, yBottom),
  ];
  return {
    x0: Math.min(...pts.map((p) => p.x)),
    x1: Math.max(...pts.map((p) => p.x)),
    z0: Math.min(...pts.map((p) => p.z)),
    z1: Math.max(...pts.map((p) => p.z)),
  };
}

const MISSIONS: [string, () => GameState][] = [
  ['oshodi.approach', () => field('oshodi.approach')],
  ['oshodi.railEdge', () => field('oshodi.railEdge')],
  ['the Oshodi boss', () => boss('oshodi')],
  ['mushin.approach', () => field('mushin.approach')],
  ['ojuelegba.return (finale)', () => field('ojuelegba.return')],
];

describe('which matches use the campaign camera', () => {
  it('campaign field, boss and finale missions and raids: campaign; Classic: arena; City Rumble: stadium', () => {
    for (const [name, make] of MISSIONS) expect(cameraModeForMatch(make()), name).toBe('campaign');
    expect(cameraModeForMatch(raid('warehouseDispatchDepot'))).toBe('campaign');
    const classic = sandbox({ arenaId: DEFAULT_ARENA_ID });
    expect(cameraModeForMatch(classic)).toBe('arena');
    expect(cameraModeFor(classic.arenaId)).toBe('arena');
    const rumble = sandbox({ players: 8, arenaId: RUMBLE_FIXTURE });
    expect(cameraModeForMatch(rumble)).toBe('stadium');
    // the debug override still wins
    expect(cameraModeForMatch(field('oshodi.approach'), 'stadium')).toBe('stadium');
  });

  it('standalone Classic: no shot (the fixed whole-arena framing), and the whole arena is framed', () => {
    const s = sandbox({ arenaId: DEFAULT_ARENA_ID });
    const { rig, layout } = rigFor(s, PHONE);
    expect(selectShot('arena', s, layout, 0, 0, OPTS)).toBeNull();
    rig.update(0, 0, 0, null);
    expect(rig.framesWholeArena()).toBe(true);
    expect(rig.framing).toBe('fixed');
  });

  it('City Rumble: the stadium shot is the director’s, unchanged', () => {
    const s = sandbox({ players: 8, arenaId: RUMBLE_FIXTURE });
    const layout = createLayout(s.width, s.height);
    expect(selectShot('stadium', s, layout, 0, 0, OPTS)).toEqual(directShot(s, layout, 0, 0, false));
  });
});

describe('a campaign mission opens on the fighter, not the district', () => {
  for (const [name, make] of MISSIONS) {
    for (const vp of [PHONE, DESKTOP]) {
      it(`${name}, ${vp.name}: the first frame is centred on the fighter and shows a small part of the map`, () => {
        const s = make();
        expect(s.match.phase).toBe('countdown');
        const { rig, layout } = rigFor(s, vp);
        const me = s.players[0]!;
        const shot = selectShot('campaign', s, layout, 0, 0, OPTS)!;
        expect(shot.kind).toBe('action');
        // the camera target is the fighter (exactly: no establishing overview, no other focus)
        expect(
          Math.hypot(shot.focus.x - layout.wx(me.x), shot.focus.z - layout.wz(me.y)),
        ).toBeLessThanOrEqual(1);
        // the old start shot was the overview of the sector (or the whole district for a boss)
        const before = directShot(s, layout, 0, 0, false);
        expect(before.kind).toBe('overview');
        rig.cut();
        rig.update(0, 0, 0, shot);
        expect(rig.framing).toBe('follow');
        // the fighter is on screen, inside the HUD-free band
        const v = new Vector3(layout.wx(me.x), 0.9, layout.wz(me.y)).project(rig.camera);
        const yTop = 1 - vp.insets.top * 2;
        const yBottom = -1 + vp.insets.bottom * 2;
        expect(Math.abs(v.x), 'fighter on screen').toBeLessThan(0.9);
        expect(v.y).toBeLessThan(yTop);
        expect(v.y).toBeGreaterThan(yBottom);
        // the visible floor is a small part of the map: at most 34 x 22 tiles, and at most 40 % of a district board. A
        // campaign-only area (WX1) is the mission's own, smaller board (46 x 26 for the Oshodi approach): its view's
        // bounding box may reach half of it, never most of its width
        const r = visible(rig, vp);
        const area = (r.x1 - r.x0) * (r.z1 - r.z0);
        const ownArea = getArena(s.arenaId).campaignOnly === true;
        expect(area / (s.width * s.height), `${name} share of the board`).toBeLessThan(ownArea ? 0.5 : 0.4);
        if (ownArea) expect((r.x1 - r.x0) / s.width, `${name} share of the width`).toBeLessThan(0.75);
        expect(r.x1 - r.x0).toBeLessThan(34);
        expect(r.z1 - r.z0).toBeLessThan(22);
        // and it is smaller than what the old establishing shot showed
        const old = rigFor(s, vp).rig;
        old.cut();
        old.update(0, 0, 0, before);
        const o = visible(old, vp);
        expect(area).toBeLessThan((o.x1 - o.x0) * (o.z1 - o.z0));
      });
    }
  }

  it('the countdown glides in: further back at the start, the play framing by mid-countdown, no jump', () => {
    const s = boss('oshodi');
    const { rig, layout } = rigFor(s, PHONE);
    const total = s.config.match.countdownTicks;
    const zooms: number[] = [];
    rig.cut();
    let last: number | null = null;
    let maxStep = 0;
    for (let t = total; t >= 0; t--) {
      s.match.countdownRemaining = t;
      const shot = campaignShot(s, layout, 0, 0, false);
      zooms.push(shot.zoom);
      rig.update(1 / 60, 0, 0, shot);
      const d = rig.currentPose().distance;
      if (last !== null) maxStep = Math.max(maxStep, Math.abs(d - last));
      last = d;
    }
    expect(zooms[0]).toBeCloseTo(CAMPAIGN_FRAMING.zoom * CAMPAIGN_FRAMING.establishLift, 5);
    expect(zooms[Math.ceil(total / 2) + 1]).toBeCloseTo(CAMPAIGN_FRAMING.zoom, 5);
    for (let i = 1; i < zooms.length; i++) expect(zooms[i]!).toBeLessThanOrEqual(zooms[i - 1]! + 1e-9);
    // the smoothed distance changes by a few centimetres a frame
    expect(maxStep).toBeLessThan(0.12);
  });

  it('the player’s whole-view setting is respected: the overview stays on the sector, never the city', () => {
    const s = field('oshodi.railEdge');
    const layout = createLayout(s.width, s.height);
    const shot = selectShot('campaign', s, layout, 0, 0, { ...OPTS, preferOverview: true })!;
    expect(shot.kind).toBe('overview');
    expect(shot.bounds).toEqual(sectorBounds(s, layout));
  });
});

describe('the follow framing keeps about 5 tiles on every side', () => {
  for (const vp of [PHONE, PHONE2, DESKTOP]) {
    it(`${vp.name}: in open ground at least 4.8 tiles south, 6 north, 6 east and west of the fighter`, () => {
      const s = boss('oshodi');
      s.match.phase = 'playing';
      s.match.countdownRemaining = 0;
      const me = s.players[0]!;
      // the middle of the play area: the boss's corridor (WX9) when it has one, else the board
      const rs = s.sector?.rects ?? [[0, 0, s.width - 1, s.height - 1]];
      const x0 = Math.min(...rs.map((r) => r[0]));
      const x1 = Math.max(...rs.map((r) => r[2]));
      const y0 = Math.min(...rs.map((r) => r[1]));
      const y1 = Math.max(...rs.map((r) => r[3]));
      me.x = me.stepFromX = Math.floor((x0 + x1) / 2);
      me.y = me.stepFromY = Math.floor((y0 + y1) / 2);
      const { rig, layout } = rigFor(s, vp);
      const shot = campaignShot(s, layout, 0, 0, false);
      shot.keep = [];
      rig.cut();
      rig.update(0, 0, 0, shot);
      const px = layout.wx(me.x);
      const pz = layout.wz(me.y);
      const v = new Vector3(px, 0, pz).project(rig.camera);
      const yTop = 1 - vp.insets.top * 2;
      const yBottom = -1 + vp.insets.bottom * 2;
      const north = pz - ground(rig, v.x, yTop).z;
      const south = ground(rig, v.x, yBottom).z - pz;
      const west = px - ground(rig, -0.97, v.y).x;
      const east = ground(rig, 0.97, v.y).x - px;
      expect(south, 'south').toBeGreaterThanOrEqual(4.8);
      expect(north, 'north').toBeGreaterThanOrEqual(6);
      expect(west, 'west').toBeGreaterThanOrEqual(6);
      expect(east, 'east').toBeGreaterThanOrEqual(6);
      // and it is not a district view: at most 9 tiles north, 6 south
      expect(north).toBeLessThan(9);
      expect(south).toBeLessThan(6);
    });
  }
});

/** One step of a breadth-first walk on open floor from the human to `goal` (null when unreachable). */
function nextStep(s: GameState, goal: (x: number, y: number) => boolean): Dir | null {
  const me = s.players[0]!;
  const w = s.width;
  const start = me.y * w + me.x;
  const from = new Map<number, number>([[start, -1]]);
  const queue = [start];
  const dirs: Dir[] = ['up', 'right', 'down', 'left'];
  while (queue.length > 0) {
    const i = queue.shift()!;
    const x = i % w;
    const y = Math.floor(i / w);
    if (i !== start && goal(x, y)) {
      let j = i;
      while (from.get(j) !== start) j = from.get(j)!;
      const jx = j % w;
      const jy = Math.floor(j / w);
      return dirs.find((d) => me.x + DIR_VEC[d].dx === jx && me.y + DIR_VEC[d].dy === jy) ?? null;
    }
    for (const d of dirs) {
      const nx = x + DIR_VEC[d].dx;
      const ny = y + DIR_VEC[d].dy;
      const n = ny * w + nx;
      if (nx < 0 || ny < 0 || nx >= w || ny >= s.height || from.has(n)) continue;
      if (s.tiles[n] !== Tile.Empty) continue;
      from.set(n, i);
      queue.push(n);
    }
  }
  return null;
}

/** The largest x of an open tile reachable from the human. */
function reachableMaxX(s: GameState): number {
  let best = -1;
  nextStep(s, (x) => {
    best = Math.max(best, x);
    return false;
  });
  return best;
}

describe('the follow camera moves smoothly and stays on the sector', () => {
  for (const vp of [PHONE, DESKTOP]) {
    it(`oshodi.approach, ${vp.name}: walking (real movement) to the sector's far end, no jump, never past its edge`, () => {
      const s = field('oshodi.approach');
      const { rig, layout } = rigFor(s, vp);
      const b = sectorBounds(s, layout)!;
      // the furthest east open tile the fighter can walk to (the far end of the sector, near its east edge)
      const goalX = reachableMaxX(s);
      expect(goalX).toBeGreaterThan(s.players[0]!.x + 20);
      // the countdown, then walk
      rig.cut();
      const poses: { x: number; z: number }[] = [];
      let reached = false;
      for (let t = 0; t < 60 * 40 && !reached; t++) {
        const intents: Intents = {};
        if (s.match.phase === 'playing' && s.players[0]!.stepRemaining === 0) {
          const dir = nextStep(s, (x) => x >= goalX);
          if (dir) intents[0] = { move: dir };
        }
        tick(s, intents);
        rig.update(1 / 60, 0, 0, campaignShot(s, layout, 0, 0, false));
        const p = rig.currentPose();
        if (s.match.phase === 'playing') poses.push({ x: p.x, z: p.z });
        reached = s.players[0]!.x >= goalX && s.players[0]!.stepRemaining === 0;
        // the HUD-free band never shows more than the margin beyond the sector box (sides: the HUD margin); 0.15 of
        // slack for the end of the countdown glide, while the wider opening distance is still easing in
        const compact = vp.insets.top >= 0.12;
        const side = Math.max(b.margin, compact ? 3.4 : 1.8);
        const left = ground(rig, -0.97, 0);
        const right = ground(rig, 0.97, 0);
        if (right.x - left.x <= b.play.x1 - b.play.x0 + 2 * side) {
          expect(left.x).toBeGreaterThanOrEqual(b.play.x0 - side - 0.15);
          expect(right.x).toBeLessThanOrEqual(b.play.x1 + side + 0.15);
        }
      }
      expect(reached, 'the walk reached the far end').toBe(true);
      expect(s.players[0]!.alive).toBe(true);
      let maxStep = 0;
      let maxJerk = 0;
      for (let i = 1; i < poses.length; i++) {
        const dx = poses[i]!.x - poses[i - 1]!.x;
        const dz = poses[i]!.z - poses[i - 1]!.z;
        maxStep = Math.max(maxStep, Math.hypot(dx, dz));
        if (i > 1) {
          const px = poses[i - 1]!.x - poses[i - 2]!.x;
          const pz = poses[i - 1]!.z - poses[i - 2]!.z;
          maxJerk = Math.max(maxJerk, Math.hypot(dx - px, dz - pz));
        }
      }
      // walking is about 6-7 tiles a second (0.11 a frame): the camera never moves faster, and its speed changes by
      // well under a frame's walk (the largest changes come from the look-ahead flipping when the fighter turns)
      expect(maxStep, 'largest move in one frame').toBeLessThan(0.15);
      expect(maxJerk, 'largest change of speed in one frame').toBeLessThan(0.07);
      // and it stopped against the soft edge rather than at the fighter (the far end is beyond the clamp)
      const last = poses[poses.length - 1]!;
      expect(last.x).toBeLessThan(layout.wx(s.players[0]!.x));
    });
  }

  it('softClamp: identity in the middle, never past a limit, continuous', () => {
    expect(softClamp(5, 0, 10, 1.6)).toBe(5);
    let prev = softClamp(-20, 0, 10, 1.6);
    for (let v = -20; v <= 30; v += 0.01) {
      const c = softClamp(v, 0, 10, 1.6);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(10);
      expect(Math.abs(c - prev)).toBeLessThanOrEqual(0.0101);
      prev = c;
    }
    expect(softClamp(3, 2, 2, 1.6)).toBe(2);
  });
});

describe('raids: follow when the board does not fit the screen, fixed when it does (CF5)', () => {
  const settle = (s: GameState, vp: typeof PHONE) => {
    const { rig, layout } = rigFor(s, vp);
    s.match.phase = 'playing';
    s.match.countdownRemaining = 0;
    rig.cut();
    rig.update(0, 0, 0, selectShot('campaign', s, layout, 0, 0, OPTS));
    return { rig, layout };
  };

  it('a 17 x 13 raid follows on a 740 x 360 phone; the 13 x 9 raids keep the fixed framing', () => {
    const big = raid('warehouseDispatchDepot');
    expect([big.width, big.height]).toEqual([17, 13]);
    const { rig } = settle(big, PHONE);
    expect(rig.framing).toBe('follow');
    const r = visible(rig, PHONE);
    expect(r.z1 - r.z0, 'the view is shorter than the board').toBeLessThan(big.height + 2);
    for (const id of ['junctionToolShed', 'standbyPlant', 'partsStoreroom'] as const) {
      const small = raid(id);
      const { rig: fixedRig } = settle(small, PHONE);
      expect(fixedRig.framing, id).toBe('fixed');
      expect(fixedRig.framesWholeArena(), id).toBe(true);
    }
  });

  it('844 x 390 phone: the 17-wide raids fit as well as Classic does on the smallest phone (25 px): fixed', () => {
    for (const id of ['warehouseDispatchDepot', 'railYardGoods'] as const) {
      const { rig } = settle(raid(id), PHONE2);
      expect(rig.framing, id).toBe('fixed');
      expect(rig.framesWholeArena(), id).toBe(true);
    }
  });

  it('desktop 1280 x 720: every raid fits, so every raid keeps the fixed framing', () => {
    for (const id of [
      'warehouseDispatchDepot',
      'partsStoreroom',
      'junctionToolShed',
      'railYardGoods',
      'recordsVault',
      'standbyPlant',
    ] as const) {
      const { rig } = settle(raid(id), DESKTOP);
      expect(rig.framing, id).toBe('fixed');
      expect(rig.framesWholeArena(), id).toBe(true);
    }
  });

  for (const vp of [PHONE]) {
    it(`${vp.name}: following a raid, the fighter on any open tile is on screen, clear of the screen edges`, () => {
      for (const id of ['warehouseDispatchDepot', 'railYardGoods'] as const) {
        const s = raid(id);
        const { rig, layout } = settle(s, vp);
        expect(rig.framing, id).toBe('follow');
        const me = s.players[0]!;
        const yTop = 1 - vp.insets.top * 2;
        const yBottom = -1 + vp.insets.bottom * 2;
        for (let y = 0; y < s.height; y++)
          for (let x = 0; x < s.width; x++) {
            if (s.tiles[y * s.width + x] !== Tile.Empty) continue;
            me.x = me.stepFromX = x;
            me.y = me.stepFromY = y;
            rig.cut();
            rig.update(0, 0, 0, selectShot('campaign', s, layout, 0, 0, OPTS));
            const v = new Vector3(layout.wx(x), 0.4, layout.wz(y)).project(rig.camera);
            expect(Math.abs(v.x), `${id} ${x},${y}`).toBeLessThan(0.75);
            expect(v.y, `${id} ${x},${y}`).toBeLessThan(yTop);
            expect(v.y, `${id} ${x},${y}`).toBeGreaterThan(yBottom);
            // CF8: never under the HUD rail's top-left column (about 120 x 160 CSS px under the portraits at 740 x 360)
            const underRail = v.x < -1 + (2 * 120) / vp.w && v.y > 1 - (2 * 160) / vp.h;
            expect(underRail, `${id} ${x},${y} under the HUD rail`).toBe(false);
          }
      }
    });
  }
});

describe('asset lifecycle: the bone textures of rigged copies are released (CF6)', () => {
  it('releaseSkeletons disposes each skeleton once and leaves geometry and materials alone', () => {
    const bones = [new Bone(), new Bone()];
    bones[0]!.add(bones[1]!);
    const skeleton = new Skeleton(bones);
    skeleton.computeBoneTexture();
    const geo = new BoxGeometry();
    const mat = new MeshBasicMaterial();
    const a = new SkinnedMesh(geo, mat);
    const b = new SkinnedMesh(geo, mat);
    a.add(bones[0]!);
    a.bind(skeleton);
    b.bind(skeleton);
    a.add(b);
    let texDisposed = 0;
    let geoDisposed = 0;
    skeleton.boneTexture!.addEventListener('dispose', () => texDisposed++);
    geo.addEventListener('dispose', () => geoDisposed++);
    expect(releaseSkeletons(a)).toBe(1);
    expect(texDisposed).toBe(1);
    expect(skeleton.boneTexture).toBeNull();
    expect(geoDisposed).toBe(0);
    // drawn again later, a skeleton simply gets a new bone texture
    skeleton.computeBoneTexture();
    expect(skeleton.boneTexture).not.toBeNull();
  });
});
