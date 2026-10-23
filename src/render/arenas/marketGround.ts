/**
 * The market lanes' ground (presentation only): trodden red laterite with remnants of broken
 * concrete pavement, wet patches, tyre and truck ruts, sachet litter and scattered refuse. Laid
 * just above the shared street plane around the arena slab, one draw call.
 */
import {
  CanvasTexture,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';
import { artRng } from '../textures';
import type { SetContext } from './common';
import { STREET } from './common';

const PX = 28; // texels per metre

function laneTexture(wm: number, dm: number): CanvasTexture {
  const w = Math.round(wm * PX);
  const h = Math.round(dm * PX);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const r = artRng(7707);
  // packed laterite base with per-texel grain
  const img = g.createImageData(w, h);
  const d = img.data;
  for (let i = 0; i < w * h; i++) {
    const v = (r() - 0.5) * 22;
    d[i * 4] = 134 + v;
    d[i * 4 + 1] = 100 + v * 0.9;
    d[i * 4 + 2] = 76 + v * 0.8;
    d[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const blot = (x: number, y: number, rad: number, rgba: string): void => {
    const grad = g.createRadialGradient(x, y, rad * 0.15, x, y, rad);
    grad.addColorStop(0, rgba);
    grad.addColorStop(1, rgba.replace(/[\d.]+\)$/, '0)'));
    g.fillStyle = grad;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  };
  // darker trodden earth and grey dust drifts
  for (let i = 0; i < 160; i++)
    blot(
      r() * w,
      r() * h,
      20 + r() * 90,
      r() < 0.5 ? `rgba(70,50,38,${0.2 + r() * 0.2})` : `rgba(150,130,110,${0.12 + r() * 0.12})`,
    );
  // remnants of the old concrete pavement: broken slabs
  for (let i = 0; i < 90; i++) {
    const x = r() * w;
    const y = r() * h;
    const s = 10 + r() * 24;
    g.save();
    g.translate(x, y);
    g.rotate((r() - 0.5) * 0.5);
    const v = 112 + r() * 30;
    g.fillStyle = `rgba(${v},${v * 0.94},${v * 0.86},0.55)`;
    g.beginPath();
    g.moveTo(-s, -s * 0.6);
    g.lineTo(s * (0.6 + r() * 0.4), -s * 0.7);
    g.lineTo(s, s * (0.3 + r() * 0.5));
    g.lineTo(-s * 0.7, s * 0.7);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(40,30,24,0.45)';
    g.lineWidth = 1.5;
    g.stroke();
    g.restore();
  }
  // ruts from push-trucks and kekes
  for (let i = 0; i < 14; i++) {
    const horizontal = r() < 0.5;
    g.strokeStyle = `rgba(56,40,30,${0.18 + r() * 0.12})`;
    g.lineWidth = 3 + r() * 4;
    g.beginPath();
    if (horizontal) {
      const y = r() * h;
      g.moveTo(0, y);
      g.bezierCurveTo(w * 0.3, y + (r() - 0.5) * 60, w * 0.7, y + (r() - 0.5) * 60, w, y + (r() - 0.5) * 40);
    } else {
      const x = r() * w;
      g.moveTo(x, 0);
      g.bezierCurveTo(x + (r() - 0.5) * 60, h * 0.3, x + (r() - 0.5) * 60, h * 0.7, x + (r() - 0.5) * 40, h);
    }
    g.stroke();
  }
  // wet patches (dark), spilt palm oil
  for (let i = 0; i < 40; i++)
    blot(r() * w, r() * h, 8 + r() * 26, r() < 0.7 ? 'rgba(34,26,22,0.5)' : 'rgba(110,46,16,0.4)');
  // litter: sachet-water bags, paper, nylon, corn husks
  for (let i = 0; i < 1400; i++) {
    const k = r();
    g.fillStyle =
      k < 0.4
        ? `rgba(196,192,178,${0.3 + r() * 0.3})`
        : k < 0.6
          ? `rgba(70,84,100,${0.3 + r() * 0.3})`
          : k < 0.8
            ? `rgba(150,128,70,${0.3 + r() * 0.3})`
            : `rgba(30,26,22,${0.3 + r() * 0.3})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 4, 1 + r() * 3);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Lays the lane ground around the arena slab (wm x dm metres centred on the origin). */
export function marketGround(ctx: SetContext, wm = 34, dm = 24): void {
  if (typeof document === 'undefined') return;
  const map = laneTexture(wm, dm);
  const m = new MeshStandardMaterial({ map, roughness: 0.97, metalness: 0 });
  ctx.own(map);
  ctx.own(m);
  const ground = new Mesh(new PlaneGeometry(wm, dm), m);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, STREET + 0.004, -1);
  ground.receiveShadow = true;
  ctx.statics.add(ground);
}
