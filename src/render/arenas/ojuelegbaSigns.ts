/**
 * Ojuelegba Underbridge - one painted atlas for every sign board on the board's cover: shop fascias,
 * container and kiosk boards, the bus stop board, the generator house warning, bill posters and the
 * Danfos' windscreen route cards. Presentation only. Every name and slogan is FICTIONAL (no real brand,
 * bank, telco or transport operator); place names are only Lagos places and routes.
 *
 * Boards are packed into a 2048 x 1024 canvas as they are requested (a shelf packer) and the texture is
 * built once at the end. Without a DOM (tests) only the UV rectangles are produced and `texture()` is null.
 */
import { CanvasTexture, SRGBColorSpace } from 'three';
import { artRng } from '../textures';

/** UV rectangle [u0, v0, u1, v1] of a board in the atlas (v up). */
export type UvRect = [number, number, number, number];

export interface BoardSpec {
  bg: string;
  fg: string;
  lines: [string, number][];
  border?: string;
  /** a coloured band across the top (danger boards) */
  band?: { color: string; text: string; fg: string };
  /** rust and grime (1 = normal) */
  wear?: number;
  /** hand-painted lettering jitter */
  hand?: boolean;
}

const SIZE_W = 2048;
const SIZE = 1024;

export class SignAtlas {
  private readonly g: CanvasRenderingContext2D | null;
  private readonly canvas: HTMLCanvasElement | null;
  private x = 0;
  private y = 0;
  private shelf = 0;
  private readonly cache = new Map<string, UvRect>();
  private tex: CanvasTexture | null = null;

  constructor(private readonly seed = 7) {
    if (typeof document === 'undefined') {
      this.canvas = null;
      this.g = null;
    } else {
      this.canvas = document.createElement('canvas');
      this.canvas.width = SIZE_W;
      this.canvas.height = SIZE;
      this.g = this.canvas.getContext('2d');
      if (this.g) {
        this.g.fillStyle = '#6a6258';
        this.g.fillRect(0, 0, SIZE_W, SIZE);
      }
    }
  }

  /** Reserves a w x h pixel cell and paints `spec` into it (cached by key). */
  board(key: string, w: number, h: number, spec: BoardSpec): UvRect {
    const hit = this.cache.get(key);
    if (hit) return hit;
    if (this.x + w > SIZE_W) {
      this.x = 0;
      this.y += this.shelf + 2;
      this.shelf = 0;
    }
    if (this.y + h > SIZE) throw new Error('sign atlas full');
    const px = this.x;
    const py = this.y;
    this.x += w + 2;
    this.shelf = Math.max(this.shelf, h);
    if (this.g) paintBoard(this.g, px, py, w, h, spec, artRng(this.seed + this.cache.size * 31));
    const uv: UvRect = [px / SIZE_W, 1 - (py + h) / SIZE, (px + w) / SIZE_W, 1 - py / SIZE];
    this.cache.set(key, uv);
    return uv;
  }

  /** The atlas texture (built on first call, after every board is painted); null without a DOM. */
  texture(): CanvasTexture | null {
    if (!this.canvas) return null;
    if (!this.tex) {
      this.tex = new CanvasTexture(this.canvas);
      this.tex.colorSpace = SRGBColorSpace;
      this.tex.anisotropy = 4;
    }
    return this.tex;
  }
}

function paintBoard(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  s: BoardSpec,
  r: () => number,
): void {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.translate(x, y);
  g.fillStyle = s.bg;
  g.fillRect(0, 0, w, h);
  let top = 0;
  if (s.band) {
    const bh = Math.round(h * 0.32);
    g.fillStyle = s.band.color;
    g.fillRect(0, 0, w, bh);
    g.fillStyle = s.band.fg;
    g.font = `bold ${Math.round(bh * 0.7)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(s.band.text, w / 2, bh / 2 + 1, w * 0.94);
    top = bh;
  }
  g.fillStyle = s.fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const total = s.lines.reduce((n, [, size]) => n + size * 1.2, 0);
  let ty = top + (h - top - total) / 2;
  for (const [text, size] of s.lines) {
    g.font = `bold ${size}px ${s.hand ? '"Trebuchet MS", system-ui, sans-serif' : 'system-ui, sans-serif'}`;
    const jx = s.hand ? (r() - 0.5) * 4 : 0;
    g.save();
    if (s.hand) g.rotate((r() - 0.5) * 0.03);
    g.fillText(text, w / 2 + jx, ty + size * 0.62, w * 0.92);
    g.restore();
    ty += size * 1.2;
  }
  if (s.border) {
    g.strokeStyle = s.border;
    g.lineWidth = Math.max(3, Math.min(w, h) * 0.05);
    g.strokeRect(3, 3, w - 6, h - 6);
  }
  // weathering: rust runs from the top edge, sun-bleach, grime, chipped paint
  const wear = s.wear ?? 1;
  for (let i = 0; i < 14 * wear; i++) {
    const rx = r() * w;
    const grad = g.createLinearGradient(rx, 0, rx, h);
    grad.addColorStop(0, `rgba(104,52,24,${0.2 + r() * 0.3})`);
    grad.addColorStop(1, 'rgba(104,52,24,0)');
    g.fillStyle = grad;
    g.fillRect(rx, 0, 1.5 + r() * 3, h * (0.3 + r() * 0.6));
  }
  for (let i = 0; i < ((w * h) / 140) * wear; i++) {
    g.fillStyle = r() < 0.7 ? `rgba(26,22,18,${r() * 0.18})` : `rgba(220,210,190,${r() * 0.2})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 7, 1 + r() * 4);
  }
  g.fillStyle = `rgba(255,240,210,${0.06 * wear})`;
  g.fillRect(0, 0, w, h);
  g.restore();
}

// --------------------------------------------------------------------------- the stage's boards

/** Fictional shop fascias for the Shopfront Lane (and the shophouses beyond the edges). */
export const SHOP_NAMES: BoardSpec[] = [
  { bg: '#e8dcc0', fg: '#a8241c', lines: [['MAMA TOLU PROVISIONS', 40]], border: '#a8241c' },
  {
    bg: '#1f4f8a',
    fg: '#f2efe6',
    lines: [
      ['BLESSED HANDS', 34],
      ['PHONE REPAIRS & ACCESSORIES', 20],
    ],
  },
  { bg: '#2f6e3c', fg: '#f4f0e0', lines: [["GOD'S TIME CHEMIST", 40]], border: '#f4f0e0' },
  {
    bg: '#16140f',
    fg: '#f2c21a',
    lines: [
      ['NO WAHALA', 38],
      ['BARBING SALON', 22],
    ],
  },
  {
    bg: '#f0c428',
    fg: '#b01e18',
    lines: [
      ['IYA BASIRAT BUKA', 36],
      ['AMALA - EWEDU - GBEGIRI', 18],
    ],
    hand: true,
  },
  {
    bg: '#f2f0ea',
    fg: '#1d3c8c',
    lines: [
      ['ADE & SONS', 34],
      ['PHOTOCOPY - BINDING - PRINTS', 18],
    ],
  },
  { bg: '#d8829a', fg: '#1a1414', lines: [['DIVINE FAVOUR TAILORING', 34]], hand: true },
  { bg: '#a82a20', fg: '#f6f0e4', lines: [['OLUWASEUN ELECTRICALS', 36]] },
  {
    bg: '#3a3a3e',
    fg: '#f0e6c8',
    lines: [
      ['EKO SPARE PARTS', 36],
      ['BRAKE PAD - BEARING - FAN BELT', 16],
    ],
  },
  {
    bg: '#f6f2e6',
    fg: '#2a6a34',
    lines: [
      ['FRESH BREAD', 34],
      ['HOT HOT DAILY', 18],
    ],
    hand: true,
  },
];

export const CONTAINER_BOARDS: BoardSpec[] = [
  {
    bg: '#f4e44a',
    fg: '#18160f',
    lines: [
      ['RECHARGE CARD', 30],
      ['POS - TRANSFER', 20],
    ],
    hand: true,
  },
  {
    bg: '#f2f0ea',
    fg: '#1a52a0',
    lines: [
      ['PURE WATER', 32],
      ['SOLD HERE', 20],
    ],
    hand: true,
  },
  { bg: '#1c1c20', fg: '#f6d22a', lines: [['PHONE ACCESSORIES', 26]] },
  { bg: '#c8401e', fg: '#fff2d6', lines: [['BOLE & FISH', 32]], hand: true },
];

export const KIOSK_BOARDS: BoardSpec[] = [
  {
    bg: '#f6c21a',
    fg: '#16140f',
    lines: [
      ['TICKETS', 30],
      ['OSHODI - YABA - CMS', 18],
    ],
    border: '#16140f',
  },
  { bg: '#9a2a1e', fg: '#f6e8c8', lines: [['SUYA SPOT', 34]], hand: true },
  {
    bg: '#26508a',
    fg: '#ffffff',
    lines: [
      ['CHARGING POINT', 26],
      ['N100 PER HOUR', 18],
    ],
    hand: true,
  },
  {
    bg: '#ece6d6',
    fg: '#a01c16',
    lines: [
      ['LOADING', 30],
      ['IKEJA - BERGER', 18],
    ],
    hand: true,
  },
  { bg: '#2c6a3a', fg: '#ffffff', lines: [['MAMA PUT', 34]], hand: true },
];

export const SHED_BOARDS: BoardSpec[] = [
  {
    bg: '#ece8dc',
    fg: '#16140f',
    lines: [
      ['VULCANIZER', 32],
      ['TYRE - TUBE - GAUGE', 18],
    ],
    hand: true,
  },
  {
    bg: '#1e2a44',
    fg: '#f2d23a',
    lines: [
      ['AUTO MECHANIC', 30],
      ['WELDING & PANEL BEATING', 16],
    ],
    hand: true,
  },
];

export const BUS_STOP_BOARD: BoardSpec = {
  bg: '#e4b42a',
  fg: '#16140f',
  lines: [
    ['BUS STOP', 40],
    ['OJUELEGBA', 26],
  ],
  border: '#16140f',
};

export const GEN_HOUSE_BOARD: BoardSpec = {
  bg: '#f2efe6',
  fg: '#1a1a1a',
  band: { color: '#c0221a', text: 'DANGER!', fg: '#ffffff' },
  lines: [
    ['GENERATOR HOUSE', 24],
    ['NO SMOKING - NO NAKED LIGHT', 15],
  ],
};

export const POSTERS: BoardSpec[] = [
  {
    bg: '#f6e24a',
    fg: '#b0161a',
    lines: [
      ['MEGA', 34],
      ['CRUSADE', 26],
      ['FRI 6PM', 18],
    ],
  },
  {
    bg: '#1a1a1a',
    fg: '#f4f4f4',
    lines: [
      ['LIVE', 34],
      ['SHOW', 34],
      ['TONITE', 18],
    ],
  },
  {
    bg: '#e8e2d2',
    fg: '#1e3c86',
    lines: [
      ['LESSON', 26],
      ['WAEC / JAMB', 18],
      ['ENROL NOW', 16],
    ],
  },
  {
    bg: '#c82a2a',
    fg: '#fff4d8',
    lines: [
      ['HOT', 36],
      ['SALES', 28],
      ['!!!', 22],
    ],
  },
  {
    bg: '#ecebe4',
    fg: '#222',
    lines: [
      ['POST', 30],
      ['NO', 30],
      ['BILL', 30],
    ],
    wear: 2,
  },
];

/** Windscreen route cards of the parked Danfos (destinations only). */
export const ROUTE_CARDS: BoardSpec[] = [
  'YABA',
  'OSHODI',
  'CMS',
  'IKEJA',
  'OBALENDE',
  'MILE 2',
  'IDUMOTA',
].map((t) => ({
  bg: '#f4f0e2',
  fg: '#141414',
  lines: [[t, 30]] as [string, number][],
  wear: 0.6,
  hand: true,
}));
