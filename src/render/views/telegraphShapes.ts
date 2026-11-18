/**
 * Flat floor glyphs of the enemy telegraphs (decision SV2), built once and shared by every match. Each glyph is ONE
 * geometry with a dark outline baked in as vertex colour (black) under a white body: an instanced colour tints the body
 * and leaves the outline dark, so a glyph reads on a pale yard by day and on dark asphalt at night in a single draw.
 *
 * Shapes carry the meaning (colour-blind safe): a solid ring and an arrow = a punch is coming; a sight (ring with four
 * ticks) and chevrons = something is about to be thrown along that line; a broken (dashed) ring = the enemy is open.
 * Geometry lies in the XZ plane (y = 0); arrows and chevrons point along +X.
 */
import {
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  NormalBlending,
  Quaternion,
  Vector3,
} from 'three';

type P2 = readonly [number, number];

/** Collects triangles in the floor plane with a colour per triangle (0 = outline black, 1 = body white). */
class GlyphBuilder {
  private readonly pos: number[] = [];
  private readonly col: number[] = [];

  private tri(a: P2, b: P2, c: P2, shade: number): void {
    for (const p of [a, b, c]) {
      this.pos.push(p[0], 0, p[1]);
      this.col.push(shade, shade, shade);
    }
  }

  /** A convex polygon (fan). */
  poly(points: readonly P2[], shade: number): this {
    for (let i = 1; i + 1 < points.length; i++) this.tri(points[0]!, points[i]!, points[i + 1]!, shade);
    return this;
  }

  /** An annulus sector from angle a0 to a1 (radians, about +Y, 0 = +X). */
  arc(r0: number, r1: number, a0: number, a1: number, shade: number, segments = 32): this {
    const n = Math.max(2, Math.ceil((segments * (a1 - a0)) / (Math.PI * 2)));
    for (let i = 0; i < n; i++) {
      const t0 = a0 + ((a1 - a0) * i) / n;
      const t1 = a0 + ((a1 - a0) * (i + 1)) / n;
      const p = (r: number, t: number): P2 => [Math.cos(t) * r, Math.sin(t) * r];
      this.poly([p(r0, t0), p(r1, t0), p(r1, t1), p(r0, t1)], shade);
    }
    return this;
  }

  ring(r0: number, r1: number, shade: number, segments = 40): this {
    return this.arc(r0, r1, 0, Math.PI * 2, shade, segments);
  }

  /** A bar from (x0, z0) to (x1, z1) of the given width. */
  bar(x0: number, z0: number, x1: number, z1: number, width: number, shade: number): this {
    const len = Math.hypot(x1 - x0, z1 - z0) || 1;
    const nx = (-(z1 - z0) / len) * (width / 2);
    const nz = ((x1 - x0) / len) * (width / 2);
    return this.poly(
      [
        [x0 + nx, z0 + nz],
        [x1 + nx, z1 + nz],
        [x1 - nx, z1 - nz],
        [x0 - nx, z0 - nz],
      ],
      shade,
    );
  }

  /** `plane: 'xy'` = a billboard glyph facing +Z (2D x -> X, 2D y -> Y); 'xz' = a floor glyph (2D y -> Z). */
  build(plane: 'xz' | 'xy' = 'xz'): BufferGeometry {
    const g = new BufferGeometry();
    // stored as (x, 0, z); a billboard takes (x, z, 0)
    const pos =
      plane === 'xz'
        ? this.pos
        : this.pos.map((v, i) => (i % 3 === 0 ? v : i % 3 === 1 ? this.pos[i + 1]! : 0));
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

const OUT = 0;
const BODY = 1;
const TAU = Math.PI * 2;

/** Solid wind-up ring under a puncher (outer radius 0.78 tile: wider than any body, so it shows round the legs). */
function halo(): BufferGeometry {
  return new GlyphBuilder().ring(0.44, 0.78, OUT).ring(0.49, 0.73, BODY).build();
}

/** A plain disc of radius 1 (the wind-up fill, scaled per instance). */
function disc(): BufferGeometry {
  return new GlyphBuilder().ring(0, 1, BODY, 32).build();
}

/** A fat arrow along +X from 0 to 0.8 (the punch direction). */
function arrow(): BufferGeometry {
  const b = new GlyphBuilder();
  const shape = (grow: number, shade: number): void => {
    b.poly(
      [
        [-grow, -0.1 - grow],
        [0.4, -0.1 - grow],
        [0.4, 0.1 + grow],
        [-grow, 0.1 + grow],
      ],
      shade,
    );
    b.poly(
      [
        [0.3 - grow, -0.3 - grow * 1.6],
        [0.8 + grow * 1.6, 0],
        [0.3 - grow, 0.3 + grow * 1.6],
      ],
      shade,
    );
  };
  shape(0.06, OUT);
  shape(0, BODY);
  return b.build();
}

/** A square frame filling most of a tile (the aimed tile). */
function frame(): BufferGeometry {
  const b = new GlyphBuilder();
  const sq = (o: number, i: number, shade: number): void => {
    b.poly(
      [
        [-o, -o],
        [o, -o],
        [o, -i],
        [-o, -i],
      ],
      shade,
    );
    b.poly(
      [
        [-o, i],
        [o, i],
        [o, o],
        [-o, o],
      ],
      shade,
    );
    b.poly(
      [
        [-o, -i],
        [-i, -i],
        [-i, i],
        [-o, i],
      ],
      shade,
    );
    b.poly(
      [
        [i, -i],
        [o, -i],
        [o, i],
        [i, i],
      ],
      shade,
    );
  };
  sq(0.48, 0.3, OUT);
  sq(0.44, 0.34, BODY);
  return b.build();
}

/** A unit square (the aimed tile's fill, scaled per instance). */
function square(): BufferGeometry {
  return new GlyphBuilder()
    .poly(
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ],
      BODY,
    )
    .build();
}

/** Four corner brackets of a tile (the rest of a punch's reach). */
function brackets(): BufferGeometry {
  const b = new GlyphBuilder();
  for (const [sx, sz] of [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ] as const) {
    for (const [w, shade] of [
      [0.12, OUT],
      [0.06, BODY],
    ] as const) {
      const g = shade === OUT ? 0.03 : 0;
      b.bar(sx * (0.44 + g), sz * 0.44, sx * (0.2 - g), sz * 0.44, w, shade);
      b.bar(sx * 0.44, sz * (0.44 + g), sx * 0.44, sz * (0.2 - g), w, shade);
    }
  }
  return b.build();
}

/** A sight: a ring with four diagonal ticks crossing it (a thrower taking aim). */
function sight(): BufferGeometry {
  const b = new GlyphBuilder().ring(0.44, 0.74, OUT);
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    b.bar(Math.cos(a) * 0.26, Math.sin(a) * 0.26, Math.cos(a) * 0.92, Math.sin(a) * 0.92, 0.2, OUT);
  }
  b.ring(0.49, 0.69, BODY);
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    b.bar(Math.cos(a) * 0.3, Math.sin(a) * 0.3, Math.cos(a) * 0.88, Math.sin(a) * 0.88, 0.1, BODY);
  }
  return b.build();
}

/** A chevron ">" pointing +X (the line a throw will take). */
function chevron(): BufferGeometry {
  const b = new GlyphBuilder();
  const arms = (s: number, shade: number): void => {
    const p = (x: number, z: number): P2 => [x * s, z * s];
    b.poly([p(-0.24, 0.32), p(-0.04, 0.32), p(0.26, 0), p(0.06, 0)], shade);
    b.poly([p(0.06, 0), p(0.26, 0), p(-0.04, -0.32), p(-0.24, -0.32)], shade);
  };
  arms(1.3, OUT);
  arms(1, BODY);
  return b.build();
}

/** An X (where a thrown object ends its path). */
function cross(): BufferGeometry {
  const b = new GlyphBuilder();
  for (const [w, r, shade] of [
    [0.24, 0.4, OUT],
    [0.13, 0.35, BODY],
  ] as const) {
    b.bar(-r, -r, r, r, w, shade);
    b.bar(-r, r, r, -r, w, shade);
  }
  return b.build();
}

/** A broken ring of eight dashes (the counter window: the enemy is open). */
function dashed(): BufferGeometry {
  const b = new GlyphBuilder();
  const step = TAU / 8;
  for (let k = 0; k < 8; k++) b.arc(0.45, 0.76, k * step - 0.06, k * step + step * 0.62 + 0.06, OUT, 48);
  for (let k = 0; k < 8; k++) b.arc(0.5, 0.71, k * step, k * step + step * 0.62, BODY, 48);
  return b.build();
}

/** A thin ring (the enemy reels from a punch; the dazed stars over its head are `PlayerViews`'). */
function thin(): BufferGeometry {
  return new GlyphBuilder().ring(0.46, 0.66, OUT).ring(0.5, 0.62, BODY).build();
}

/** Above the head: a dark plate with a tinted rim (the wind-up clock's face). `ticks` adds the sight's four ticks. */
function dial(ticks: boolean): BufferGeometry {
  const b = new GlyphBuilder().ring(0, 0.58, OUT, 32);
  if (ticks)
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      b.bar(Math.cos(a) * 0.4, Math.sin(a) * 0.4, Math.cos(a) * 0.8, Math.sin(a) * 0.8, 0.22, OUT);
      b.bar(Math.cos(a) * 0.44, Math.sin(a) * 0.44, Math.cos(a) * 0.76, Math.sin(a) * 0.76, 0.1, BODY);
    }
  return b.ring(0.45, 0.54, BODY, 32).build('xy');
}

/** One twelfth of the clock's fill (0 to 30 degrees counter-clockwise from +X); the view turns 1..12 of them. */
function wedge(): BufferGeometry {
  return new GlyphBuilder().arc(0, 0.41, 0, Math.PI / 6, BODY, 12).build('xy');
}

/** The over-the-head wind-up clock: it fills clockwise from twelve o'clock as the blow (or the throw) comes. */
export const BILLBOARDS = {
  dialMelee: () => dial(false),
  dialRanged: () => dial(true),
  wedge,
} as const;
export type BillboardId = keyof typeof BILLBOARDS;

export const GLYPHS = {
  halo,
  disc,
  arrow,
  frame,
  square,
  brackets,
  sight,
  chevron,
  cross,
  dashed,
  thin,
} as const;
export type GlyphId = keyof typeof GLYPHS;

/**
 * One glyph drawn many times in one draw call: `begin`, `push` each instance, `end`. Hidden (no draw call) while empty.
 * Instance scale is separate along the glyph's X (its length) and Z.
 */
export class GlyphBatch {
  readonly mesh: InstancedMesh;
  private count = 0;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly p = new Vector3();
  private readonly s = new Vector3();
  private readonly c = new Color();
  private static readonly UP = new Vector3(0, 1, 0);
  private static readonly FRONT = new Vector3(0, 0, 1);

  constructor(
    geometry: BufferGeometry,
    capacity: number,
    opts: { renderOrder: number; opacity: number; depthTest: boolean; y: number },
  ) {
    const material = new MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: opts.opacity,
      blending: NormalBlending,
      depthWrite: false,
      depthTest: opts.depthTest,
      side: DoubleSide,
      // flat signal colours: no tone mapping or exposure, so a red is red on a bright day and at night
      toneMapped: false,
    });
    this.mesh = new InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.renderOrder = opts.renderOrder;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.setColorAt(0, this.c.setHex(0xffffff));
    this.y = opts.y;
  }

  private readonly y: number;

  get size(): number {
    return this.count;
  }

  get capacity(): number {
    return this.mesh.instanceMatrix.count;
  }

  begin(): void {
    this.count = 0;
  }

  /** One instance at world (x, z), turned `rotY` about +Y, scaled `sx` along its length and `sz` across. */
  push(x: number, z: number, rotY: number, sx: number, sz: number, color: Color | number): void {
    if (this.count >= this.capacity) return;
    this.p.set(x, this.y, z);
    this.q.setFromAxisAngle(GlyphBatch.UP, rotY);
    this.s.set(Math.max(1e-3, sx), 1, Math.max(1e-3, sz));
    this.m.compose(this.p, this.q, this.s);
    this.mesh.setMatrixAt(this.count, this.m);
    if (typeof color === 'number') this.c.setHex(color);
    else this.c.copy(color);
    this.mesh.setColorAt(this.count, this.c);
    this.count++;
  }

  /** One billboard instance at world (x, y, z) facing the camera (`cam`), turned `roll` in the screen plane. */
  pushFacing(
    x: number,
    y: number,
    z: number,
    cam: Quaternion,
    roll: number,
    scale: number,
    color: Color | number,
  ): void {
    if (this.count >= this.capacity) return;
    this.p.set(x, y, z);
    this.q.setFromAxisAngle(GlyphBatch.FRONT, roll).premultiply(cam);
    this.s.set(scale, scale, scale);
    this.m.compose(this.p, this.q, this.s);
    this.mesh.setMatrixAt(this.count, this.m);
    if (typeof color === 'number') this.c.setHex(color);
    else this.c.copy(color);
    this.mesh.setColorAt(this.count, this.c);
    this.count++;
  }

  end(): void {
    this.mesh.count = this.count;
    this.mesh.visible = this.count > 0;
    if (this.count === 0) return;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    (this.mesh.material as MeshBasicMaterial).dispose();
    this.mesh.dispose();
  }
}
