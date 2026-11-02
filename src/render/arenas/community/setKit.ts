/**
 * Surroundings kit of the researched communities (presentation only; everything stands OFF the board, tall things
 * north and on the far sides, the camera (south) side low): window-grid blocks and skyline rows, rail viaducts with
 * a static train, sign boards, lamp posts. Static pieces go to `ctx.statics` (baked into a few merged meshes); the
 * painted textures are cached canvases and are left out without a DOM (tests).
 */
import { DoubleSide, PlaneGeometry } from 'three';
import type { CanvasTexture } from 'three';
import { box, cyl, mat, mesh, uniqueMat } from '../../assets/helpers';
import type { SetContext } from '../common';
import { STREET } from '../common';
import { painted } from '../oshodiKit';
import type { TimeOfDay } from '../../timeOfDay';

export const hasDom = (): boolean => typeof document !== 'undefined';

/** A grid of lit and dark windows on a plain facade (night lights more of them). */
export function facadeTexture(
  key: string,
  tod: TimeOfDay,
  seed: number,
  tint: string,
  cols = 8,
): CanvasTexture {
  return painted(
    `cr:${key}:${tod}`,
    128,
    256,
    (g, r) => {
      g.fillStyle = tint;
      g.fillRect(0, 0, 128, 256);
      const lit = tod === 'night' ? 0.5 : 0.14;
      const step = 128 / cols;
      for (let y = 8; y < 248; y += 16)
        for (let x = 4; x < 124; x += step) {
          const on = r() < lit;
          g.fillStyle = on ? (r() < 0.5 ? '#f6dc9a' : '#cfe4f4') : 'rgba(18,28,40,0.78)';
          g.fillRect(x, y, step * 0.55, 10);
        }
      for (let i = 0; i < 140; i++) {
        g.fillStyle = r() < 0.6 ? `rgba(20,18,14,${r() * 0.16})` : `rgba(235,226,200,${r() * 0.1})`;
        g.fillRect(r() * 128, r() * 256, 2 + r() * 8, 2 + r() * 14);
      }
    },
    true,
    seed,
  );
}

/** A window-grid block on the street. `h` metres tall; the grid repeats every ~3 m. */
export function block(
  ctx: SetContext,
  tod: TimeOfDay,
  o: {
    x: number;
    z: number;
    w: number;
    d: number;
    h: number;
    tint: string;
    color?: number;
    seed?: number;
    cols?: number;
  },
): void {
  const map = hasDom()
    ? facadeTexture(`b${o.tint}${o.cols ?? 8}`, tod, o.seed ?? 3, o.tint, o.cols ?? 8).clone()
    : undefined;
  if (map) {
    map.needsUpdate = true;
    map.repeat.set(Math.max(1, o.w / 3.2), Math.max(1, o.h / 3.6));
  }
  const m = uniqueMat(o.color ?? 0xffffff, { map, roughness: 0.9, flat: false });
  ctx.own(m);
  ctx.statics.add(box(o.w, o.h, o.d, m, o.x, STREET + o.h / 2, o.z));
  ctx.statics.add(box(o.w + 0.2, 0.25, o.d + 0.2, mat(0x6a665e), o.x, STREET + o.h + 0.12, o.z));
}

/** A painted board (canvas text) as a plane facing `ry` (0 = south, towards the camera). */
export function plaque(
  ctx: SetContext,
  key: string,
  w: number,
  h: number,
  x: number,
  y: number,
  z: number,
  ry: number,
  draw: Parameters<typeof painted>[3],
): void {
  if (!hasDom()) return;
  const map = painted(key, Math.round(w * 96), Math.round(h * 96), draw, false, 17);
  const m = uniqueMat(0xffffff, { map, roughness: 0.82, flat: false });
  m.side = DoubleSide;
  ctx.own(m);
  const p = mesh(new PlaneGeometry(w, h), m, x, y, z);
  p.rotation.y = ry;
  ctx.statics.add(p);
}

/** Bold lettering on a plain board (a fictional name, a place name or station wording only). */
export function lettered(
  text: string,
  bg: string,
  fg: string,
  border = true,
): (g: CanvasRenderingContext2D) => void {
  return (g) => {
    const w = g.canvas.width;
    const h = g.canvas.height;
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    if (border) {
      g.strokeStyle = fg;
      g.lineWidth = Math.max(2, h * 0.06);
      g.strokeRect(g.lineWidth, g.lineWidth, w - 2 * g.lineWidth, h - 2 * g.lineWidth);
    }
    g.fillStyle = fg;
    g.font = `bold ${Math.round(h * 0.52)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2, w * 0.92);
  };
}

/**
 * A row of blocks along a board edge (`edge` north / east / west), beyond the street: heights vary, colours come
 * from `tints`, gaps are left where `gap(coordinate)` is true (road mouths, a landmark). Returns nothing; sets the
 * skyline's first layer.
 */
export function skyline(
  ctx: SetContext,
  tod: TimeOfDay,
  o: {
    edge: 'north' | 'east' | 'west';
    off: number;
    depth: number;
    hMin: number;
    hMax: number;
    tints: readonly string[];
    gap?: (c: number) => boolean;
    seed?: number;
    step?: number;
  },
): void {
  const { W, H, rng } = ctx;
  const step = o.step ?? 5.2;
  const n0 = o.seed ?? 1;
  let i = 0;
  const along = o.edge === 'north' ? W + 40 : H + 6;
  for (let c = -along / 2; c < along / 2; c += step, i++) {
    const w = step - 0.5 - rng() * 0.8;
    if (o.gap?.(c)) continue;
    const h = o.hMin + ((i * 7 + n0 * 3) % 6) * ((o.hMax - o.hMin) / 5) + rng() * 0.6;
    const tint = o.tints[(i * 5 + n0) % o.tints.length]!;
    if (o.edge === 'north')
      block(ctx, tod, { x: c, z: -H / 2 - o.off - o.depth / 2, w, d: o.depth, h, tint, seed: i + n0 });
    else
      block(ctx, tod, {
        x: (o.edge === 'east' ? 1 : -1) * (W / 2 + o.off + o.depth / 2),
        z: c,
        w: o.depth,
        d: w,
        h,
        tint,
        seed: i + n0,
      });
  }
}

/** An elevated viaduct along x at depth z: a deck, parapets, round piers every `pier` metres, a track pair. */
export function viaduct(
  ctx: SetContext,
  o: {
    z: number;
    x0: number;
    x1: number;
    deck: number;
    width: number;
    pier?: number;
    track?: boolean;
    color?: number;
  },
): void {
  const s = ctx.statics;
  const len = o.x1 - o.x0;
  const cx = (o.x0 + o.x1) / 2;
  const conc = mat(o.color ?? 0xa4a09a, { roughness: 1, flat: false });
  const dark = mat(0x6a6660, { roughness: 1, flat: false });
  s.add(box(len, 0.5, o.width, conc, cx, o.deck - 0.25, o.z));
  s.add(box(len, 0.9, 0.9, dark, cx, o.deck - 0.95, o.z));
  for (const sd of [-1, 1])
    s.add(
      box(
        len,
        0.7,
        0.3,
        mat(0xc2beb4, { roughness: 1 }),
        cx,
        o.deck + 0.35,
        o.z + (sd * (o.width - 0.3)) / 2,
      ),
    );
  for (let x = o.x0 + 2; x < o.x1; x += o.pier ?? 9) {
    s.add(cyl(0.7, 0.8, o.deck - STREET - 0.6, conc, x, STREET + (o.deck - STREET - 0.6) / 2, o.z, 8));
    s.add(box(1.4, 0.5, o.width - 0.6, dark, x, o.deck - 0.8, o.z));
  }
  if (o.track) {
    for (const dz of [-0.9, 0.9]) {
      s.add(
        box(
          len,
          0.08,
          0.08,
          mat(0x7a7e82, { metalness: 0.7, roughness: 0.4 }),
          cx,
          o.deck + 0.12,
          o.z + dz - 0.38,
        ),
      );
      s.add(
        box(
          len,
          0.08,
          0.08,
          mat(0x7a7e82, { metalness: 0.7, roughness: 0.4 }),
          cx,
          o.deck + 0.12,
          o.z + dz + 0.38,
        ),
      );
    }
    for (let x = o.x0; x < o.x1; x += 1.1)
      s.add(box(0.28, 0.07, o.width - 1.2, mat(0x5a5248), x, o.deck + 0.05, o.z));
  }
}

/** A static train of `cars` cars on a viaduct / track at (x, z), deck height `y`, body colour and stripe. */
export function railcars(
  ctx: SetContext,
  o: {
    x: number;
    z: number;
    y: number;
    cars: number;
    body: number;
    stripe: number;
    len?: number;
    dir?: 1 | -1;
  },
): void {
  const L = o.len ?? 7.6;
  for (let i = 0; i < o.cars; i++) {
    const x = o.x + i * (L + 0.25) * (o.dir ?? 1);
    ctx.statics.add(box(L, 2.3, 2.5, mat(o.body, { roughness: 0.5, metalness: 0.3 }), x, o.y + 1.45, o.z));
    ctx.statics.add(box(L + 0.02, 0.32, 2.52, mat(o.stripe, { roughness: 0.6 }), x, o.y + 1.1, o.z));
    ctx.statics.add(
      box(L - 0.8, 0.55, 2.52, mat(0x1c2a3a, { roughness: 0.2, metalness: 0.5 }), x, o.y + 1.95, o.z),
    );
    ctx.statics.add(
      box(L - 1.2, 0.18, 2.1, mat(0x8a8e92, { roughness: 0.6, metalness: 0.4 }), x, o.y + 2.7, o.z),
    );
  }
}

/** A street lamp post with a sodium or LED head, leaning over the street. */
export function lampPost(ctx: SetContext, x: number, z: number, ry: number, color = 0xffd9a0, h = 6.2): void {
  const m = mat(0x4a4a48, { roughness: 0.55, metalness: 0.6 });
  ctx.statics.add(cyl(0.07, 0.11, h, m, x, STREET + h / 2, z, 6));
  const dx = Math.sin(ry) * 1.1;
  const dz = Math.cos(ry) * 1.1;
  ctx.statics.add(box(0.12, 0.1, 1.2, m, x + dx / 2, STREET + h, z + dz / 2));
  ctx.statics.add(
    box(
      0.5,
      0.12,
      0.26,
      mat(color, { emissive: color, emissiveIntensity: 0.9, roughness: 0.4 }),
      x + dx,
      STREET + h - 0.06,
      z + dz,
    ),
  );
}
