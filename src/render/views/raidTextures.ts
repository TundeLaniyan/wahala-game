/**
 * Small canvas textures of the classic-raid world markers (docs/RAID_PRESENTATION.md): crate faces and stencils, crack
 * decals, belt chevrons, the hazard-stripe barrel band, the hatch/frame of a shipment telegraph, the lock icon and the
 * extraction chevrons. Built lazily, cached, disposed with the view (`disposeRaidTextures`). Fictional lettering only
 * (no real brand): "DISPATCH", "DD" and stencil marks.
 */
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { artRng } from '../textures';

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

export function disposeRaidTextures(): void {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}

/** Weathered planks / board with straps: an unmarked crate face (tinted by the material colour). */
export function crateFaceTexture(): CanvasTexture {
  return make('crate', 128, 128, (g) => {
    const r = artRng(31);
    g.fillStyle = '#c9a26a';
    g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 32) {
      g.fillStyle = `rgba(60,36,12,${0.1 + r() * 0.12})`;
      g.fillRect(0, y, 128, 3);
      g.fillStyle = `rgba(255,230,180,${0.06 + r() * 0.08})`;
      g.fillRect(0, y + 3, 128, 8);
    }
    g.strokeStyle = 'rgba(52,34,16,0.8)';
    g.lineWidth = 8;
    g.strokeRect(4, 4, 120, 120);
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(8, 8);
    g.lineTo(120, 120);
    g.moveTo(120, 8);
    g.lineTo(8, 120);
    g.stroke();
    for (let i = 0; i < 160; i++) {
      g.fillStyle = r() < 0.6 ? `rgba(40,28,14,${r() * 0.25})` : `rgba(240,220,180,${r() * 0.2})`;
      g.fillRect(r() * 128, r() * 128, 1 + r() * 5, 1 + r() * 2);
    }
  });
}

/**
 * The MARKED cargo face: a yellow dispatch crate with a heavy black target cross and a "DD" stencil, so it reads as
 * the objective from across the board without a word of text over the board.
 */
export function markedFaceTexture(): CanvasTexture {
  return make('marked', 128, 128, (g) => {
    const r = artRng(32);
    g.fillStyle = '#e9b520';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = 0; y < 128; y += 32) g.fillRect(0, y, 128, 3);
    g.strokeStyle = '#1a1612';
    g.lineWidth = 9;
    g.strokeRect(5, 5, 118, 118);
    // target cross
    g.lineWidth = 11;
    g.lineCap = 'butt';
    g.beginPath();
    g.moveTo(26, 26);
    g.lineTo(102, 102);
    g.moveTo(102, 26);
    g.lineTo(26, 102);
    g.stroke();
    g.lineWidth = 7;
    g.beginPath();
    g.arc(64, 64, 40, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#1a1612';
    g.font = 'bold 22px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText('DD', 64, 20);
    for (let i = 0; i < 140; i++) {
      g.fillStyle = r() < 0.6 ? `rgba(40,28,10,${r() * 0.25})` : `rgba(255,240,190,${r() * 0.22})`;
      g.fillRect(r() * 128, r() * 128, 1 + r() * 5, 1 + r() * 2);
    }
  });
}

/** A steel drum side with a yellow/black hazard-stripe band across the middle. */
export function barrelTexture(): CanvasTexture {
  const t = make('barrel', 128, 128, (g) => {
    const r = artRng(33);
    g.fillStyle = '#b8352a';
    g.fillRect(0, 0, 128, 128);
    for (let y = 8; y < 128; y += 40) {
      g.fillStyle = 'rgba(30,10,8,0.5)';
      g.fillRect(0, y, 128, 5);
    }
    // hazard band
    g.fillStyle = '#e8bf1c';
    g.fillRect(0, 44, 128, 40);
    g.fillStyle = '#17130e';
    for (let x = -40; x < 168; x += 28) {
      g.beginPath();
      g.moveTo(x, 84);
      g.lineTo(x + 14, 84);
      g.lineTo(x + 14 + 40, 44);
      g.lineTo(x + 40, 44);
      g.closePath();
      g.fill();
    }
    for (let i = 0; i < 120; i++) {
      g.fillStyle = r() < 0.6 ? `rgba(30,16,10,${r() * 0.3})` : `rgba(230,200,170,${r() * 0.15})`;
      g.fillRect(r() * 128, r() * 128, 1 + r() * 6, 1 + r() * 3);
    }
  });
  t.wrapS = RepeatWrapping;
  return t;
}

/** A transparent crack decal: `level` 1 = hairline cracks, 2 = broken planks (white-on-dark, multiplies as dark lines). */
export function crackDecal(level: 1 | 2): CanvasTexture {
  return make(`crack${level}`, 128, 128, (g) => {
    const r = artRng(40 + level);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const bolt = (x: number, y: number, len: number, w: number): void => {
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(x, y);
      for (let i = 0; i < len; i++) {
        x += (r() - 0.5) * 30;
        y += 8 + r() * 14;
        g.lineTo(x, y);
      }
      g.stroke();
    };
    g.strokeStyle = 'rgba(14,10,6,0.92)';
    bolt(34, 4, 8, level === 1 ? 3 : 5);
    bolt(92, 10, 7, level === 1 ? 2.5 : 5);
    if (level === 2) {
      bolt(64, 0, 9, 6);
      bolt(18, 60, 5, 4);
      bolt(110, 56, 5, 4);
      // a chipped corner
      g.fillStyle = 'rgba(14,10,6,0.85)';
      g.beginPath();
      g.moveTo(98, 128);
      g.lineTo(128, 96);
      g.lineTo(128, 128);
      g.closePath();
      g.fill();
    }
    g.strokeStyle = 'rgba(255,235,200,0.35)';
    g.lineWidth = 1.5;
    bolt(38, 6, 7, 1.5);
  });
}

/**
 * One tile of conveyor belt, travel along +u: dark rubber, steel side rails and amber chevrons. It repeats
 * every tile so the offset scrolls it seamlessly.
 */
export function beltTexture(): CanvasTexture {
  const t = make('belt', 128, 128, (g) => {
    const r = artRng(50);
    g.fillStyle = '#2a2b2e';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 220; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? '90,92,96' : '10,10,12'},${r() * 0.25})`;
      g.fillRect(r() * 128, 14 + r() * 100, 1 + r() * 4, 1 + r() * 2);
    }
    // two amber chevrons per tile pointing along +u
    g.strokeStyle = '#f2a81c';
    g.lineWidth = 11;
    g.lineJoin = 'miter';
    for (const x of [26, 90]) {
      g.beginPath();
      g.moveTo(x - 16, 36);
      g.lineTo(x + 10, 64);
      g.lineTo(x - 16, 92);
      g.stroke();
    }
    // steel rails
    g.fillStyle = '#9a9ea4';
    g.fillRect(0, 0, 128, 12);
    g.fillRect(0, 116, 128, 12);
    g.fillStyle = '#4c5056';
    g.fillRect(0, 12, 128, 3);
    g.fillRect(0, 113, 128, 3);
  });
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/** Diagonal hazard hatch (white stripes, transparent gaps): the telegraph of a shipment's next tiles. */
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

/** The outline of a tile. */
export function frameTexture(): CanvasTexture {
  return make('frame', 128, 128, (g) => {
    g.strokeStyle = '#fff';
    g.lineWidth = 11;
    g.lineJoin = 'round';
    g.strokeRect(7, 7, 114, 114);
  });
}

/** A fixed padlock icon (white on transparent; tinted by the material) for a locked door. */
export function lockTexture(): CanvasTexture {
  return make('lock', 128, 128, (g) => {
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.beginPath();
    g.arc(64, 64, 58, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#fff';
    g.lineWidth = 9;
    g.beginPath();
    g.arc(64, 54, 20, Math.PI, 0);
    g.lineTo(84, 66);
    g.moveTo(44, 54);
    g.lineTo(44, 66);
    g.stroke();
    g.fillStyle = '#fff';
    g.beginPath();
    g.roundRect(32, 62, 64, 46, 8);
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.7)';
    g.beginPath();
    g.arc(64, 82, 7, 0, Math.PI * 2);
    g.fill();
    g.fillRect(61, 84, 6, 14);
  });
}

/** An open-door arrow: three stacked chevrons pointing up (screen-far) for the extraction pad and open doors. */
export function chevronsTexture(): CanvasTexture {
  return make('chevrons', 128, 128, (g) => {
    g.strokeStyle = '#fff';
    g.lineWidth = 12;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const y of [92, 64, 36]) {
      g.beginPath();
      g.moveTo(34, y + 10);
      g.lineTo(64, y - 14);
      g.lineTo(94, y + 10);
      g.stroke();
    }
  });
}

/** A vertical fade of light (strong at the floor): the extraction beam. */
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

/** A dark disc with a bright double rim: the pad under the extraction marker. */
export function padTexture(): CanvasTexture {
  return make('pad', 128, 128, (g) => {
    g.fillStyle = 'rgba(0,0,0,0.4)';
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

/** A square steel plate with rivets: the roller-shutter panel of a locked door. */
export function shutterTexture(): CanvasTexture {
  const t = make('shutter', 64, 128, (g) => {
    const r = artRng(60);
    g.fillStyle = '#7d8288';
    g.fillRect(0, 0, 64, 128);
    for (let y = 0; y < 128; y += 12) {
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.fillRect(0, y, 64, 2);
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(0, y + 2, 64, 2);
    }
    for (let i = 0; i < 90; i++) {
      g.fillStyle = r() < 0.6 ? `rgba(80,40,14,${r() * 0.35})` : `rgba(20,20,20,${r() * 0.2})`;
      g.fillRect(r() * 64, r() * 128, 1 + r() * 3, 2 + r() * 8);
    }
  });
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}
