/**
 * Procedural canvas textures. Everything the game draws is generated at runtime, so the
 * site ships no image files and every asset can be replaced later by loaded textures.
 */
import { CanvasTexture, NearestFilter, RepeatWrapping, SRGBColorSpace } from 'three';

/** Small deterministic PRNG so generated art (and screenshots) are stable. */
export function artRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, opts: { repeat?: boolean; pixel?: boolean } = {}): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  if (opts.repeat) t.wrapS = t.wrapT = RepeatWrapping;
  if (opts.pixel) t.magFilter = NearestFilter;
  return t;
}

const cache = new Map<string, CanvasTexture>();
function cached(key: string, make: () => CanvasTexture): CanvasTexture {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

export function disposeTextures(): void {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}

/** Whole-arena floor: concrete slabs with a readable grid, oil stains, cracks and painted bay lines. */
export function floorTexture(cols: number, rows: number): CanvasTexture {
  return cached(`floor:${cols}x${rows}`, () => {
    const T = 64;
    const [c, g] = canvas(cols * T, rows * T);
    const r = artRng(77);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const light = 164 + ((x + y) % 2) * 10 + Math.floor(r() * 10);
        g.fillStyle = `rgb(${light + 6},${light},${light - 14})`;
        g.fillRect(x * T, y * T, T, T);
        // speckle
        for (let i = 0; i < 40; i++) {
          g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '60,50,40'},${0.04 + r() * 0.06})`;
          g.fillRect(x * T + r() * T, y * T + r() * T, 2 + r() * 3, 2 + r() * 3);
        }
        // slab edge
        g.strokeStyle = 'rgba(70,58,44,0.55)';
        g.lineWidth = 3;
        g.strokeRect(x * T + 1.5, y * T + 1.5, T - 3, T - 3);
        g.strokeStyle = 'rgba(255,245,225,0.18)';
        g.lineWidth = 1.5;
        g.strokeRect(x * T + 4.5, y * T + 4.5, T - 9, T - 9);
      }
    }
    // oil stains and cracks
    for (let i = 0; i < cols * rows * 0.35; i++) {
      const x = r() * cols * T;
      const y = r() * rows * T;
      const grad = g.createRadialGradient(x, y, 2, x, y, 10 + r() * 22);
      grad.addColorStop(0, 'rgba(40,34,30,0.22)');
      grad.addColorStop(1, 'rgba(40,34,30,0)');
      g.fillStyle = grad;
      g.fillRect(x - 40, y - 40, 80, 80);
    }
    g.strokeStyle = 'rgba(50,42,34,0.45)';
    g.lineWidth = 1.5;
    for (let i = 0; i < cols * rows * 0.25; i++) {
      let x = r() * cols * T;
      let y = r() * rows * T;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        x += (r() - 0.5) * 22;
        y += (r() - 0.5) * 22;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    return tex(c);
  });
}

/** Yellow/black diagonal hazard stripes. */
export function hazardStripes(): CanvasTexture {
  return cached('stripes', () => {
    const [c, g] = canvas(64, 64);
    g.fillStyle = '#ffc21a';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#1c1a17';
    for (let i = -2; i < 6; i++) {
      g.beginPath();
      g.moveTo(i * 24, 64);
      g.lineTo(i * 24 + 12, 64);
      g.lineTo(i * 24 + 12 + 64, 0);
      g.lineTo(i * 24 + 64, 0);
      g.fill();
    }
    return tex(c, { repeat: true });
  });
}

/** Rough concrete used for pillars and walls. */
export function concreteTexture(): CanvasTexture {
  return cached('concrete', () => {
    const [c, g] = canvas(128, 128);
    const r = artRng(5);
    g.fillStyle = '#b8b2a6';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 700; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '70,60,50'},${0.05 + r() * 0.08})`;
      g.fillRect(r() * 128, r() * 128, 1 + r() * 4, 1 + r() * 4);
    }
    g.strokeStyle = 'rgba(80,70,60,0.4)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, 126, 126);
    return tex(c, { repeat: true });
  });
}

/** Wall face with torn posters, grime and paint. */
export function wallTexture(): CanvasTexture {
  return cached('wall', () => {
    const [c, g] = canvas(512, 128);
    const r = artRng(13);
    g.fillStyle = '#b9b0a0';
    g.fillRect(0, 0, 512, 128);
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '80,66,52'},${0.04 + r() * 0.07})`;
      g.fillRect(r() * 512, r() * 128, 1 + r() * 5, 1 + r() * 5);
    }
    const colors = ['#e8453c', '#2f8cff', '#ffd23c', '#34c26a', '#f08a2c', '#f2f2f2'];
    for (let i = 0; i < 9; i++) {
      const x = 20 + r() * 460;
      const w = 28 + r() * 26;
      const h = 40 + r() * 38;
      const y = 14 + r() * (100 - h);
      g.save();
      g.translate(x + w / 2, y + h / 2);
      g.rotate((r() - 0.5) * 0.14);
      g.fillStyle = colors[Math.floor(r() * colors.length)]!;
      g.fillRect(-w / 2, -h / 2, w, h);
      g.fillStyle = 'rgba(0,0,0,0.55)';
      for (let k = 0; k < 4; k++) g.fillRect(-w / 2 + 4, -h / 2 + 6 + k * 9, w - 8 - r() * 10, 3);
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.beginPath();
      g.arc(0, -h / 2 + h * 0.3, w * 0.18, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    return tex(c);
  });
}

/** A small poster for pillar faces. */
export function posterTexture(variant: number): CanvasTexture {
  return cached(`poster:${variant}`, () => {
    const [c, g] = canvas(64, 96);
    const r = artRng(100 + variant);
    const colors = ['#e8453c', '#2f8cff', '#ffd23c', '#34c26a', '#f08a2c', '#f2f2f2'];
    g.fillStyle = colors[variant % colors.length]!;
    g.fillRect(0, 0, 64, 96);
    g.fillStyle = 'rgba(0,0,0,0.6)';
    for (let k = 0; k < 5; k++) g.fillRect(6, 50 + k * 8, 52 - r() * 22, 4);
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.beginPath();
    g.arc(32, 26, 14, 0, Math.PI * 2);
    g.fill();
    return tex(c);
  });
}

export function crateTexture(): CanvasTexture {
  return cached('crate', () => {
    const [c, g] = canvas(128, 128);
    const r = artRng(21);
    g.fillStyle = '#b97a3a';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 5; i++) {
      g.fillStyle = `rgba(${90 + r() * 40},${50 + r() * 25},20,0.35)`;
      g.fillRect(0, i * 25.6 + 1, 128, 22);
      g.strokeStyle = 'rgba(60,32,10,0.8)';
      g.lineWidth = 2;
      g.strokeRect(0, i * 25.6 + 1, 128, 23);
    }
    g.strokeStyle = 'rgba(70,38,12,0.9)';
    g.lineWidth = 10;
    g.strokeRect(5, 5, 118, 118);
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(8, 8);
    g.lineTo(120, 120);
    g.moveTo(120, 8);
    g.lineTo(8, 120);
    g.stroke();
    return tex(c);
  });
}

export function sackTexture(): CanvasTexture {
  return cached('sack', () => {
    const [c, g] = canvas(64, 64);
    const r = artRng(31);
    g.fillStyle = '#9a8a62';
    g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '60,45,20'},${0.08 + r() * 0.1})`;
      g.fillRect(r() * 64, r() * 64, 2, 1 + r() * 4);
    }
    return tex(c, { repeat: true });
  });
}

export function windowsTexture(seed: number): CanvasTexture {
  return cached(`windows:${seed}`, () => {
    const [c, g] = canvas(128, 128);
    const r = artRng(200 + seed);
    const walls = ['#d9a766', '#c98b5a', '#e0c07a', '#b9745c', '#9fb7a4', '#d6c2a0'];
    g.fillStyle = walls[seed % walls.length]!;
    g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const lit = r() < 0.35;
        g.fillStyle = lit ? '#ffd88a' : '#3a3f4a';
        g.fillRect(10 + x * 30, 10 + y * 30, 18, 20);
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(10 + x * 30, 32 + y * 30, 18, 3);
      }
    }
    return tex(c, { repeat: true });
  });
}

/** Soft additive flame blob (fire tongues and the flash on the floor). */
export function flameTexture(): CanvasTexture {
  return cached('flame', () => {
    const [c, g] = canvas(128, 128);
    const r = artRng(31);
    g.globalCompositeOperation = 'lighter';
    // ragged tongues of fire: hot yellow-white at the base, orange body, red translucent tips
    const tongues = 7;
    for (let i = 0; i < tongues; i++) {
      const t = i / (tongues - 1);
      const cx = 64 + (t - 0.5) * 62 + (r() - 0.5) * 8;
      const h = 62 + (1 - Math.abs(t - 0.5) * 1.6) * 54 + r() * 10;
      const w = 15 + r() * 8;
      const baseY = 120;
      const lean = (r() - 0.5) * 26;
      const grad = g.createLinearGradient(cx, baseY, cx + lean, baseY - h);
      grad.addColorStop(0, 'rgba(255,238,170,0.95)');
      grad.addColorStop(0.35, 'rgba(255,150,40,0.85)');
      grad.addColorStop(0.75, 'rgba(230,60,10,0.45)');
      grad.addColorStop(1, 'rgba(160,20,0,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(cx - w, baseY);
      g.bezierCurveTo(
        cx - w * 1.1,
        baseY - h * 0.45,
        cx + lean * 0.4 - w * 0.4,
        baseY - h * 0.75,
        cx + lean,
        baseY - h,
      );
      g.bezierCurveTo(
        cx + lean * 0.4 + w * 0.5,
        baseY - h * 0.7,
        cx + w * 1.1,
        baseY - h * 0.4,
        cx + w,
        baseY,
      );
      g.closePath();
      g.fill();
    }
    const core = g.createRadialGradient(64, 104, 2, 64, 100, 38);
    core.addColorStop(0, 'rgba(255,255,220,0.9)');
    core.addColorStop(0.5, 'rgba(255,190,70,0.5)');
    core.addColorStop(1, 'rgba(255,100,20,0)');
    g.fillStyle = core;
    g.fillRect(0, 50, 128, 78);
    return tex(c);
  });
}

export function glowTexture(): CanvasTexture {
  return cached('glow', () => {
    const [c, g] = canvas(64, 64);
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return tex(c);
  });
}

export function smokeTexture(): CanvasTexture {
  return cached('smoke', () => {
    const [c, g] = canvas(64, 64);
    const r = artRng(9);
    for (let i = 0; i < 6; i++) {
      const x = 22 + r() * 20;
      const y = 22 + r() * 20;
      const grad = g.createRadialGradient(x, y, 1, x, y, 14 + r() * 8);
      grad.addColorStop(0, 'rgba(255,255,255,0.55)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
    }
    return tex(c);
  });
}

export function ringTexture(): CanvasTexture {
  return cached('ring', () => {
    const [c, g] = canvas(128, 128);
    const glow = g.createRadialGradient(64, 64, 28, 64, 64, 62);
    glow.addColorStop(0, 'rgba(255,255,255,0.18)');
    glow.addColorStop(0.7, 'rgba(255,255,255,0.35)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(255,255,255,1)';
    g.lineWidth = 12;
    g.beginPath();
    g.arc(64, 64, 52, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 4;
    g.beginPath();
    g.arc(64, 64, 38, 0, Math.PI * 2);
    g.stroke();
    return tex(c);
  });
}

export function starTexture(): CanvasTexture {
  return cached('star', () => {
    const [c, g] = canvas(64, 64);
    g.fillStyle = '#ffe14a';
    g.strokeStyle = '#a86a00';
    g.lineWidth = 3;
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rad = i % 2 ? 11 : 26;
      g.lineTo(32 + Math.cos(a) * rad, 32 + Math.sin(a) * rad);
    }
    g.closePath();
    g.fill();
    g.stroke();
    return tex(c);
  });
}

/** Chevron arrow used for vehicle lanes and entry markers (points up). */
export function chevronTexture(): CanvasTexture {
  return cached('chevron', () => {
    const [c, g] = canvas(128, 128);
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath();
    g.moveTo(64, 16);
    g.lineTo(112, 72);
    g.lineTo(88, 72);
    g.lineTo(64, 44);
    g.lineTo(40, 72);
    g.lineTo(16, 72);
    g.closePath();
    g.fill();
    return tex(c, { repeat: true });
  });
}

/** Text label (names, countdown numbers). */
export function labelTexture(
  text: string,
  color = '#ffffff',
  font = 'bold 44px system-ui, sans-serif',
  stroke = '#1a1208',
): CanvasTexture {
  return cached(`label:${text}:${color}:${font}`, () => {
    const [c, g] = canvas(256, 96);
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const w = Math.min(240, Math.max(84, g.measureText(text).width + 34));
    g.fillStyle = 'rgba(14, 10, 6, 0.52)';
    g.beginPath();
    g.roundRect(128 - w / 2, 18, w, 60, 28);
    g.fill();
    g.lineJoin = 'round';
    g.lineWidth = 10;
    g.strokeStyle = stroke;
    g.strokeText(text, 128, 50);
    g.fillStyle = color;
    g.fillText(text, 128, 50);
    return tex(c);
  });
}

/** Rounded tile highlight with a bright edge, used for danger lanes and selections. */
export function tileGlowTexture(): CanvasTexture {
  return cached('tileglow', () => {
    const [c, g] = canvas(128, 128);
    const grad = g.createRadialGradient(64, 64, 8, 64, 64, 80);
    grad.addColorStop(0, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0.8)');
    g.fillStyle = grad;
    g.beginPath();
    g.roundRect(8, 8, 112, 112, 18);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,1)';
    g.lineWidth = 8;
    g.beginPath();
    g.roundRect(8, 8, 112, 112, 18);
    g.stroke();
    return tex(c);
  });
}

/** Soft square contact shadow (ambient-occlusion stand-in) laid under pillars and props. */
export function contactShadowTexture(): CanvasTexture {
  return cached('contact', () => {
    const [c, g] = canvas(64, 64);
    const img = g.createImageData(64, 64);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        // distance outside an inner square, normalised: dark under the footprint, fading outwards
        const dx = Math.max(0, Math.abs(x - 31.5) - 16) / 16;
        const dy = Math.max(0, Math.abs(y - 31.5) - 16) / 16;
        const d = Math.min(1, Math.hypot(dx, dy));
        const a = (1 - d) * (1 - d);
        const i = (y * 64 + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 0;
        img.data[i + 3] = Math.round(a * 255);
      }
    }
    g.putImageData(img, 0, 0);
    return tex(c);
  });
}
