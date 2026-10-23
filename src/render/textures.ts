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

/** Bold wax-print (Ankara) cloth with a scalloped hem (alpha) for market stall wraps. */
export function ankaraTexture(): CanvasTexture {
  return cached('ankara', () => {
    const [c, g] = canvas(256, 128);
    const r = artRng(31);
    const bands = ['#e63946', '#ffbe0b', '#1d6fe0', '#12964f', '#8338ec', '#fb5607', '#ff4f9a'];
    for (let i = 0; i < 4; i++) {
      const x0 = i * 64;
      g.fillStyle = bands[(i * 3) % bands.length]!;
      g.fillRect(x0, 0, 64, 128);
      const ink = bands[(i * 3 + 2) % bands.length]!;
      const dot = bands[(i * 3 + 4) % bands.length]!;
      // concentric "Ankara" medallions and zig-zag borders
      for (let y = 18; y < 112; y += 34) {
        const cx = x0 + 32 + (r() - 0.5) * 6;
        g.fillStyle = ink;
        g.beginPath();
        g.arc(cx, y, 13, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = dot;
        g.beginPath();
        g.arc(cx, y, 7, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#fff6e0';
        g.beginPath();
        g.arc(cx, y, 2.5, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = '#1c140e';
      g.lineWidth = 3;
      g.beginPath();
      for (let y = 0; y <= 128; y += 8) g.lineTo(x0 + 3 + ((y / 8) % 2) * 5, y);
      g.stroke();
    }
    // scalloped hem: transparent below a wavy line (alphaTest cuts it)
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.moveTo(0, 128);
    for (let x = 0; x <= 256; x += 4) g.lineTo(x, 114 + Math.sin((x / 256) * Math.PI * 16) * 6);
    g.lineTo(256, 128);
    g.closePath();
    g.fill();
    g.globalCompositeOperation = 'source-over';
    return tex(c, { repeat: true });
  });
}

/** Red/white reflective chevron band (roadworks barrier markings). */
export function chevronBandTexture(): CanvasTexture {
  return cached('chevronBand', () => {
    const [c, g] = canvas(128, 32);
    g.fillStyle = '#f4f1ea';
    g.fillRect(0, 0, 128, 32);
    g.fillStyle = '#d8231f';
    for (let i = -1; i < 6; i++) {
      g.beginPath();
      g.moveTo(i * 32, 0);
      g.lineTo(i * 32 + 16, 0);
      g.lineTo(i * 32 + 32, 32);
      g.lineTo(i * 32 + 16, 32);
      g.fill();
    }
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, 0, 128, 2);
    g.fillRect(0, 30, 128, 2);
    return tex(c, { repeat: true });
  });
}

/**
 * Painted markings laid over an arena floor (transparent): bus-bay lines and a stencilled
 * "BUS STOP" for the park, faded lane lines and patched asphalt for the roadworks, paver joints
 * and swept-dust patches for the market. One texel row per tile is `T` pixels.
 */
export function floorMarkingsTexture(arenaId: string, cols: number, rows: number): CanvasTexture {
  return cached(`markings:${arenaId}:${cols}x${rows}`, () => {
    const T = 64;
    const [c, g] = canvas(cols * T, rows * T);
    const r = artRng(arenaId.length * 97 + cols);
    const W = cols * T;
    const H = rows * T;
    if (arenaId === 'lekkiRoadworks') {
      // asphalt patches and tar seams
      for (let i = 0; i < 14; i++) {
        g.fillStyle = `rgba(20,20,24,${0.18 + r() * 0.18})`;
        const w = T * (1 + r() * 2.5);
        const h = T * (0.6 + r() * 1.6);
        g.fillRect(r() * (W - w), r() * (H - h), w, h);
      }
      g.strokeStyle = 'rgba(15,15,18,0.55)';
      g.lineWidth = 3;
      for (let i = 0; i < 18; i++) {
        g.beginPath();
        let x = r() * W;
        let y = r() * H;
        g.moveTo(x, y);
        for (let k = 0; k < 5; k++) {
          x += (r() - 0.5) * 70;
          y += (r() - 0.5) * 70;
          g.lineTo(x, y);
        }
        g.stroke();
      }
      // faded lane lines (white dashes) along two corridors and a yellow centre line
      g.fillStyle = 'rgba(240,238,228,0.55)';
      for (const row of [2, rows - 3])
        for (let x = 0; x < W; x += T * 1.5) g.fillRect(x + 8, row * T + T / 2 - 4, T * 0.8, 8);
      g.fillStyle = 'rgba(255,196,30,0.6)';
      g.fillRect(0, Math.floor(rows / 2) * T + T / 2 - 9, W, 5);
      g.fillRect(0, Math.floor(rows / 2) * T + T / 2 + 4, W, 5);
    } else if (arenaId === 'balogunMarket') {
      // dust, spilled grain and crushed leaves between the stalls
      for (let i = 0; i < 260; i++) {
        g.fillStyle =
          r() < 0.5 ? `rgba(120,70,30,${0.08 + r() * 0.12})` : `rgba(255,236,190,${0.05 + r() * 0.1})`;
        g.beginPath();
        g.arc(r() * W, r() * H, 6 + r() * 26, 0, Math.PI * 2);
        g.fill();
      }
      for (let i = 0; i < 120; i++) {
        g.fillStyle = ['rgba(60,140,50,0.6)', 'rgba(230,180,40,0.55)', 'rgba(200,60,40,0.5)'][i % 3]!;
        g.fillRect(r() * W, r() * H, 3 + r() * 4, 2 + r() * 3);
      }
    } else {
      // bus park: yellow bay lines, a stencilled BUS STOP and oil drips
      g.fillStyle = 'rgba(255,200,40,0.7)';
      g.fillRect(T * 0.5, T * 0.15, W - T, 6);
      g.fillRect(T * 0.5, H - T * 0.15 - 6, W - T, 6);
      for (let x = 1; x < cols; x += 2) {
        g.fillRect(x * T - 3, 0, 6, T * 0.6);
        g.fillRect(x * T - 3, H - T * 0.6, 6, T * 0.6);
      }
      g.save();
      g.font = `bold ${T * 0.55}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = 'rgba(255,214,60,0.55)';
      g.fillText('BUS STOP', W / 2, H / 2 + T * 0.02);
      g.restore();
      for (let i = 0; i < 26; i++) {
        g.fillStyle = `rgba(30,24,18,${0.12 + r() * 0.16})`;
        g.beginPath();
        g.ellipse(r() * W, r() * H, 8 + r() * 22, 5 + r() * 14, r() * 3, 0, Math.PI * 2);
        g.fill();
      }
    }
    const t = tex(c);
    t.anisotropy = 8;
    return t;
  });
}

/** Night-time glass tower facade: dark blue curtain wall with a scatter of lit offices (emissive map). */
export function towerWindowsTexture(seed: number): CanvasTexture {
  return cached(`tower:${seed}`, () => {
    const [c, g] = canvas(64, 128);
    const r = artRng(500 + seed);
    g.fillStyle = '#121a2c';
    g.fillRect(0, 0, 64, 128);
    for (let y = 2; y < 128; y += 6) {
      for (let x = 2; x < 64; x += 5) {
        const lit = r();
        g.fillStyle = lit < 0.34 ? (r() < 0.6 ? '#ffd796' : '#cfe6ff') : lit < 0.5 ? '#2c3b5c' : '#18223a';
        g.fillRect(x, y, 3, 4);
      }
    }
    return tex(c, { repeat: true });
  });
}

/** A broken-tarmac pothole seen from above: jagged dark crater, crumbled edge, loose gravel (RGBA). */
export function potholeTexture(): CanvasTexture {
  return cached('pothole', () => {
    const S = 256;
    const [c, g] = canvas(S, S);
    const r = artRng(5150);
    const ring = (radius: number, jag: number): [number, number][] => {
      const pts: [number, number][] = [];
      for (let k = 0; k < 28; k++) {
        const a = (k / 28) * Math.PI * 2;
        const rr = radius * (1 - jag + r() * jag * 2);
        pts.push([S / 2 + Math.cos(a) * rr, S / 2 + Math.sin(a) * rr * 0.92]);
      }
      return pts;
    };
    const poly = (pts: [number, number][], fill: string | CanvasGradient): void => {
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      g.fillStyle = fill;
      g.fill();
    };
    // crumbled, lifted edge
    poly(ring(118, 0.12), 'rgba(58,54,50,0.95)');
    poly(ring(104, 0.14), 'rgba(38,35,32,1)');
    // the hole: deep, wet-dark centre
    const deep = g.createRadialGradient(S / 2 + 6, S / 2 + 8, 6, S / 2, S / 2, 92);
    deep.addColorStop(0, 'rgba(6,5,5,1)');
    deep.addColorStop(0.6, 'rgba(18,15,13,1)');
    deep.addColorStop(1, 'rgba(32,28,25,1)');
    poly(ring(88, 0.16), deep);
    // standing muddy water with a cold highlight
    g.fillStyle = 'rgba(52,48,40,0.55)';
    g.beginPath();
    g.ellipse(S / 2 + 10, S / 2 + 14, 44, 28, 0.4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(170,180,190,0.12)';
    g.beginPath();
    g.ellipse(S / 2 - 6, S / 2 + 4, 20, 7, 0.4, 0, Math.PI * 2);
    g.fill();
    // gravel and asphalt crumbs
    for (let i = 0; i < 260; i++) {
      const a = r() * Math.PI * 2;
      const d = 60 + r() * 62;
      const v = 40 + Math.floor(r() * 70);
      g.fillStyle = `rgba(${v + 8},${v + 4},${v},${0.6 + r() * 0.4})`;
      g.fillRect(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, 1 + r() * 4, 1 + r() * 4);
    }
    // radiating cracks into the surrounding tarmac
    g.strokeStyle = 'rgba(14,12,10,0.8)';
    g.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      let a = r() * Math.PI * 2;
      let x = S / 2 + Math.cos(a) * 96;
      let y = S / 2 + Math.sin(a) * 90;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        a += (r() - 0.5) * 0.8;
        x += Math.cos(a) * 9;
        y += Math.sin(a) * 9;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    return tex(c);
  });
}

/** A spreading black oil / diesel slick with a thin petrol rainbow sheen and splatter (RGBA). */
export function oilSlickTexture(): CanvasTexture {
  return cached('oilslick', () => {
    const S = 256;
    const [c, g] = canvas(S, S);
    const r = artRng(2718);
    const blob = (cx: number, cy: number, rad: number, fill: string): void => {
      g.beginPath();
      for (let k = 0; k <= 32; k++) {
        const a = (k / 32) * Math.PI * 2;
        const rr = rad * (0.78 + 0.22 * Math.sin(a * 3 + cx) + r() * 0.12);
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr * 0.86;
        if (k) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.closePath();
      g.fillStyle = fill;
      g.fill();
    };
    blob(S / 2, S / 2, 104, 'rgba(10,9,10,0.9)');
    for (let i = 0; i < 7; i++) {
      const a = r() * Math.PI * 2;
      blob(S / 2 + Math.cos(a) * 92, S / 2 + Math.sin(a) * 80, 12 + r() * 22, 'rgba(12,10,11,0.85)');
    }
    // the sheen: a few soft iridescent bands, very restrained
    const sheen = g.createRadialGradient(S / 2 - 18, S / 2 - 10, 10, S / 2 - 10, S / 2, 80);
    sheen.addColorStop(0, 'rgba(0,0,0,0)');
    sheen.addColorStop(0.45, 'rgba(60,110,140,0.22)');
    sheen.addColorStop(0.6, 'rgba(150,80,150,0.18)');
    sheen.addColorStop(0.75, 'rgba(150,130,60,0.16)');
    sheen.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sheen;
    g.fillRect(0, 0, S, S);
    // tyre track through it
    g.strokeStyle = 'rgba(40,38,36,0.55)';
    g.lineWidth = 16;
    g.beginPath();
    g.moveTo(20, S * 0.7);
    g.bezierCurveTo(S * 0.4, S * 0.55, S * 0.6, S * 0.6, S - 20, S * 0.35);
    g.stroke();
    // splatter
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2;
      const d = 100 + r() * 24;
      g.fillStyle = 'rgba(8,8,8,0.8)';
      g.beginPath();
      g.arc(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d * 0.86, 1 + r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    return tex(c);
  });
}
