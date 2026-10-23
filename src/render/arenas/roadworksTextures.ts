/**
 * Canvas textures for the Lekki Roadworks set (presentation only, generated at runtime and
 * cached): sandcrete blockwork, torn debris netting (alpha), and the weathered site safety board.
 */
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { artRng } from '../textures';

const cache = new Map<string, CanvasTexture>();

function make(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = true) {
  let t = cache.get(key);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d')!);
    t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
    cache.set(key, t);
  }
  return t;
}

/** Hollow sandcrete blocks in stretcher bond, grey mortar squeezed out of the joints (1 repeat = 1 m). */
export function blockworkTexture(): CanvasTexture {
  return make('rw:block', 128, 128, (g) => {
    const r = artRng(71);
    g.fillStyle = '#8a867e';
    g.fillRect(0, 0, 128, 128);
    const bh = 128 / 5; // 0.2 m courses
    const bw = 128 / 2.2; // 0.45 m blocks
    for (let row = 0; row < 5; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let x = -off; x < 128; x += bw) {
        const v = 150 + (r() - 0.5) * 30;
        g.fillStyle = `rgb(${v},${v - 3},${v - 9})`;
        g.fillRect(x + 1.5, row * bh + 1.5, bw - 3, bh - 3);
        for (let k = 0; k < 10; k++) {
          g.fillStyle = `rgba(60,56,50,${r() * 0.25})`;
          g.fillRect(x + r() * bw, row * bh + r() * bh, 2, 2);
        }
      }
    }
    // mortar smears and rain streaks
    for (let i = 0; i < 12; i++) {
      g.fillStyle = `rgba(70,64,56,${0.08 + r() * 0.1})`;
      g.fillRect(r() * 128, r() * 60, 3 + r() * 5, 30 + r() * 70);
    }
  });
}

/** Torn green debris netting: a fine mesh with holes and rips (use with alphaTest, DoubleSide). */
export function nettingTexture(): CanvasTexture {
  return make('rw:net', 256, 256, (g) => {
    const r = artRng(83);
    g.clearRect(0, 0, 256, 256);
    g.fillStyle = 'rgb(62,96,70)';
    g.fillRect(0, 0, 256, 256);
    // the weave (colour only: alpha holes this fine would shimmer)
    g.fillStyle = 'rgba(20,34,24,0.16)';
    for (let y = 0; y < 256; y += 6) g.fillRect(0, y, 256, 2);
    for (let x = 0; x < 256; x += 6) g.fillRect(x, 0, 2, 256);
    // rips and torn-away patches
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = 'rgba(0,0,0,1)';
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      const x = r() * 256;
      const y = r() * 256;
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) g.lineTo(x + (r() - 0.3) * 70, y + (r() - 0.2) * 60);
      g.closePath();
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    // grime and sun-bleach
    for (let i = 0; i < 40; i++) {
      g.fillStyle = r() < 0.5 ? `rgba(30,30,24,${r() * 0.3})` : `rgba(150,160,130,${r() * 0.2})`;
      g.fillRect(r() * 256, r() * 256, 10 + r() * 40, 20 + r() * 60);
    }
  });
}

/** The contractor's weathered safety board: hazard header, plain lettering, rust and grime. */
export function siteBoardTexture(): CanvasTexture {
  return make(
    'rw:board',
    512,
    256,
    (g) => {
      const r = artRng(97);
      g.fillStyle = '#c9c4b6';
      g.fillRect(0, 0, 512, 256);
      g.fillStyle = '#7a2420';
      g.fillRect(0, 0, 512, 62);
      g.fillStyle = '#e2dccb';
      g.font = 'bold 44px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('DANGER', 256, 33);
      g.fillStyle = '#1e1c1a';
      g.font = 'bold 30px system-ui, sans-serif';
      g.fillText('DEEP EXCAVATION', 256, 96);
      g.fillText('HEAVY PLANT AT WORK', 256, 134);
      g.font = '22px system-ui, sans-serif';
      g.fillText('HARD HATS AND BOOTS MUST BE WORN', 256, 176);
      g.fillText('NO UNAUTHORISED ENTRY', 256, 208);
      for (let i = 0; i < 30; i++) {
        const x = r() * 512;
        const grad = g.createLinearGradient(x, 0, x, 256);
        grad.addColorStop(0, `rgba(110,52,24,${0.2 + r() * 0.3})`);
        grad.addColorStop(1, 'rgba(110,52,24,0)');
        g.fillStyle = grad;
        g.fillRect(x, r() * 80, 2 + r() * 5, 60 + r() * 180);
      }
      for (let i = 0; i < 300; i++) {
        g.fillStyle = `rgba(30,26,20,${r() * 0.18})`;
        g.fillRect(r() * 512, r() * 256, 2 + r() * 12, 2 + r() * 8);
      }
    },
    false,
  );
}

/**
 * The site's open ground (tiles every 4 m): compacted grey Lekki sand over red laterite fill,
 * tyre and track ruts, stones, cement spills and dark wet hollows.
 */
export function siteGroundTexture(): CanvasTexture {
  return make('rw:ground', 512, 512, (g) => {
    const r = artRng(131);
    g.fillStyle = '#5c564c';
    g.fillRect(0, 0, 512, 512);
    const blot = (x: number, y: number, rad: number, c: string): void => {
      for (const [dx, dy] of [
        [0, 0],
        [512, 0],
        [-512, 0],
        [0, 512],
        [0, -512],
      ] as const) {
        const grad = g.createRadialGradient(x + dx, y + dy, rad * 0.1, x + dx, y + dy, rad);
        grad.addColorStop(0, c);
        grad.addColorStop(1, c.replace(/[\d.]+\)$/, '0)'));
        g.fillStyle = grad;
        g.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2);
      }
    };
    for (let i = 0; i < 18; i++)
      blot(r() * 512, r() * 512, 60 + r() * 120, `rgba(122,62,34,${0.25 + r() * 0.2})`);
    for (let i = 0; i < 16; i++)
      blot(r() * 512, r() * 512, 50 + r() * 110, `rgba(140,128,108,${0.2 + r() * 0.2})`);
    for (let i = 0; i < 14; i++)
      blot(r() * 512, r() * 512, 30 + r() * 70, `rgba(18,18,20,${0.35 + r() * 0.3})`);
    // ruts: pairs of dark bands with tread chevrons
    for (let k = 0; k < 3; k++) {
      const y0 = r() * 512;
      for (const off of [0, 70]) {
        g.strokeStyle = 'rgba(30,26,22,0.4)';
        g.lineWidth = 18;
        g.beginPath();
        g.moveTo(-10, y0 + off);
        g.bezierCurveTo(170, y0 + off + 30, 340, y0 + off - 30, 522, y0 + off);
        g.stroke();
      }
    }
    // stones and gravel
    for (let i = 0; i < 2600; i++) {
      const v = r() < 0.6 ? 120 + r() * 70 : 40 + r() * 30;
      g.fillStyle = `rgba(${v},${v - 4},${v - 10},${0.4 + r() * 0.4})`;
      g.fillRect(r() * 512, r() * 512, 1 + r() * 3, 1 + r() * 3);
    }
    // cement spills
    for (let i = 0; i < 5; i++)
      blot(r() * 512, r() * 512, 20 + r() * 30, `rgba(160,158,150,${0.3 + r() * 0.2})`);
  });
}
