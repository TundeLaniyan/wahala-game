/**
 * Small canvas textures of the campaign mission markers (pad, hold zone, hazard hatch, edge frame, beam, tick).
 * White-on-transparent so one material per layer can be tinted per instance / per state. Built lazily and
 * disposed with the view (`disposeMissionTextures`).
 */
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

const cache = new Map<string, CanvasTexture>();

function make(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): CanvasTexture {
  let t = cache.get(key);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d')!);
    t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    cache.set(key, t);
  }
  return t;
}

export function disposeMissionTextures(): void {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}

/** A dark disc with a bright (white, tintable) double rim: readable on a pale or a dark floor. */
export function padTexture(): CanvasTexture {
  return make('pad', 128, 128, (g) => {
    g.fillStyle = 'rgba(0,0,0,0.42)';
    g.beginPath();
    g.arc(64, 64, 60, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#fff';
    g.lineWidth = 9;
    g.beginPath();
    g.arc(64, 64, 55, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.lineWidth = 3;
    g.setLineDash([9, 7]);
    g.beginPath();
    g.arc(64, 64, 42, 0, Math.PI * 2);
    g.stroke();
  });
}

/** The same for a square hold zone (a 3 x 3 junction): corner brackets and a thin edge. */
export function zoneTexture(): CanvasTexture {
  return make('zone', 128, 128, (g) => {
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(6, 6, 116, 116);
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = 4;
    g.strokeRect(8, 8, 112, 112);
    g.strokeStyle = '#fff';
    g.lineWidth = 12;
    g.lineCap = 'round';
    for (const [x, y, dx, dy] of [
      [10, 10, 1, 1],
      [118, 10, -1, 1],
      [10, 118, 1, -1],
      [118, 118, -1, -1],
    ] as const) {
      g.beginPath();
      g.moveTo(x + dx * 30, y);
      g.lineTo(x, y);
      g.lineTo(x, y + dy * 30);
      g.stroke();
    }
  });
}

/** Diagonal hazard hatch (white stripes, transparent gaps) that repeats seamlessly tile to tile. */
export function hatchTexture(): CanvasTexture {
  const t = make('hatch', 64, 64, (g) => {
    g.strokeStyle = 'rgba(255,255,255,0.92)';
    g.lineWidth = 13;
    for (let i = -2; i <= 4; i++) {
      g.beginPath();
      g.moveTo(i * 32 - 8, 72);
      g.lineTo(i * 32 + 72, -8);
      g.stroke();
    }
  });
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/** The outline of a tile (the countdown edge). */
export function frameTexture(): CanvasTexture {
  return make('frame', 128, 128, (g) => {
    g.strokeStyle = '#fff';
    g.lineWidth = 11;
    g.lineJoin = 'round';
    g.strokeRect(7, 7, 114, 114);
  });
}

/** Alpha fades from strong at the floor (canvas bottom = uv 0) to nothing at the top: a beam of light. */
export function beamTexture(): CanvasTexture {
  return make('beam', 16, 128, (g) => {
    const grad = g.createLinearGradient(0, 128, 0, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0.7)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.22)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 16, 128);
  });
}

/** A heavy check mark in a ring: "done". */
export function tickTexture(): CanvasTexture {
  return make('tick', 128, 128, (g) => {
    g.strokeStyle = '#fff';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = 8;
    g.beginPath();
    g.arc(64, 64, 52, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 16;
    g.beginPath();
    g.moveTo(36, 66);
    g.lineTo(56, 87);
    g.lineTo(94, 42);
    g.stroke();
  });
}

/** A soft round glow (the exposed boss's halo). */
export function haloTexture(): CanvasTexture {
  return make('halo', 128, 128, (g) => {
    const grad = g.createRadialGradient(64, 64, 20, 64, 64, 62);
    grad.addColorStop(0, 'rgba(255,255,255,0.05)');
    grad.addColorStop(0.7, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  });
}
