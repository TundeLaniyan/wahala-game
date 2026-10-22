/**
 * Vector icons for pickups and abilities, drawn with the 2D canvas. Used by BOTH the 3D renderer
 * (pickup tokens) and the React HUD, hence they live outside render/ and ui/. Pure browser canvas.
 */
import type { PickupKind } from '../sim';
import { PICKUP_DEFS } from '../sim';

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
const urlCache = new Map<string, string>();

type Painter = (g: CanvasRenderingContext2D) => void;

const W = '#ffffff';

const painters: Record<PickupKind, Painter> = {
  petrol: (g) => {
    // Fiery explosion burst + red dynamite bundle (+1 blast range, matches reference!)
    const glow = g.createRadialGradient(32, 30, 3, 32, 30, 22);
    glow.addColorStop(0, '#fff8a8');
    glow.addColorStop(0.55, '#ff7818');
    glow.addColorStop(1, 'rgba(255,60,16,0)');
    g.fillStyle = glow;
    g.beginPath();
    g.arc(32, 30, 22, 0, Math.PI * 2);
    g.fill();
    for (const dx of [-8, 0, 8]) {
      g.fillStyle = '#e02820';
      g.strokeStyle = '#181210';
      g.lineWidth = 2;
      g.beginPath();
      g.roundRect(28 + dx, 15, 8, 30, 3);
      g.fill();
      g.stroke();
    }
    g.fillStyle = '#16181c';
    g.fillRect(19, 22, 26, 4);
    g.fillRect(19, 35, 26, 4);
    g.fillStyle = '#ffea48';
    g.beginPath();
    g.arc(32, 12, 5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = W;
    g.font = 'bold 13px system-ui';
    g.textAlign = 'center';
    g.fillText('+1', 32, 56);
  },
  diesel: (g) => {
    // Super starburst + red dynamite bundle (MAX blast range)
    g.fillStyle = '#ffea48';
    g.strokeStyle = '#b81c14';
    g.lineWidth = 1.8;
    g.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      const r = i % 2 === 0 ? 25 : 14;
      const x = 32 + Math.cos(a) * r;
      const y = 30 + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.fill();
    g.stroke();
    for (const dx of [-7, 0, 7]) {
      g.fillStyle = '#d8221c';
      g.fillRect(28.5 + dx, 16, 7, 26);
    }
    g.fillStyle = '#14161a';
    g.fillRect(20, 24, 24, 11);
    g.fillStyle = '#ffe838';
    g.font = 'bold 9px system-ui';
    g.textAlign = 'center';
    g.fillText('MAX', 32, 33);
  },
  socket: (g) => {
    // Yellow portable generator in black roll-cage with electric lightning arcs (matches reference!)
    g.strokeStyle = '#48e8ff';
    g.lineWidth = 2.2;
    for (const sgn of [-1, 1]) {
      g.beginPath();
      g.moveTo(32 + sgn * 14, 16);
      g.lineTo(32 + sgn * 23, 11);
      g.lineTo(32 + sgn * 18, 22);
      g.lineTo(32 + sgn * 25, 26);
      g.stroke();
    }
    g.fillStyle = '#f6c418';
    g.strokeStyle = '#16181c';
    g.lineWidth = 2.5;
    g.beginPath();
    g.roundRect(15, 18, 34, 25, 4);
    g.fill();
    g.stroke();
    g.fillStyle = '#ffdf38';
    g.fillRect(18, 14, 28, 6);
    g.strokeRect(18, 14, 28, 6);
    g.fillStyle = '#1c2026';
    g.fillRect(19, 23, 14, 15);
    g.beginPath();
    g.arc(40, 30, 6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff8b0';
    g.beginPath();
    g.moveTo(27, 22);
    g.lineTo(22, 31);
    g.lineTo(26, 31);
    g.lineTo(24, 38);
    g.lineTo(31, 29);
    g.lineTo(27, 29);
    g.closePath();
    g.fill();
    g.fillStyle = W;
    g.font = 'bold 13px system-ui';
    g.textAlign = 'center';
    g.fillText('+1', 32, 56);
  },
  skates: (g) => {
    // Winged green & yellow high-top sneaker (matches reference speed token!)
    g.fillStyle = '#ffd018';
    g.strokeStyle = '#181408';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(23, 27);
    g.lineTo(9, 15);
    g.lineTo(17, 17);
    g.lineTo(12, 10);
    g.lineTo(28, 15);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = '#189a48';
    g.beginPath();
    g.moveTo(19, 17);
    g.lineTo(35, 17);
    g.lineTo(38, 30);
    g.lineTo(52, 35);
    g.lineTo(52, 43);
    g.lineTo(17, 43);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = '#ffd018';
    g.fillRect(20, 31, 24, 4);
    g.fillStyle = W;
    g.fillRect(16, 42, 37, 5);
    g.strokeRect(16, 42, 37, 5);
  },
  boots: (g) => {
    g.fillStyle = '#ffea48';
    g.beginPath();
    g.arc(47, 36, 9, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e03424';
    g.strokeStyle = '#18120c';
    g.lineWidth = 2.2;
    g.beginPath();
    g.moveTo(18, 15);
    g.lineTo(33, 15);
    g.lineTo(36, 30);
    g.lineTo(50, 36);
    g.lineTo(50, 46);
    g.lineTo(16, 46);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = '#ffd018';
    for (const x of [20, 28, 36, 44]) g.fillRect(x, 46, 4, 5);
  },
  gloves: (g) => {
    g.fillStyle = '#ffd018';
    g.strokeStyle = '#181408';
    g.lineWidth = 2;
    g.beginPath();
    g.roundRect(16, 26, 32, 26, 8);
    g.fill();
    g.stroke();
    for (const [x, y] of [
      [18, 12],
      [27, 8],
      [36, 10],
      [44, 16],
    ] as const) {
      g.beginPath();
      g.roundRect(x, y, 8, 22, 4);
      g.fill();
      g.stroke();
    }
    g.fillStyle = '#e02820';
    g.fillRect(16, 45, 32, 6);
  },
  grip: (g) => {
    g.strokeStyle = '#ffd018';
    g.lineWidth = 6;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(16, 40);
    g.lineTo(16, 22);
    g.quadraticCurveTo(32, 8, 48, 22);
    g.lineTo(48, 40);
    g.stroke();
    g.fillStyle = W;
    g.strokeStyle = '#16181c';
    g.lineWidth = 2;
    g.fillRect(12, 36, 40, 15);
    g.strokeRect(12, 36, 40, 15);
  },
  remote: (g) => {
    g.strokeStyle = '#48f0ff';
    g.lineWidth = 2.4;
    for (const r of [10, 16]) {
      g.beginPath();
      g.arc(32, 16, r, Math.PI * 1.18, Math.PI * 1.82);
      g.stroke();
    }
    g.fillStyle = '#181c24';
    g.strokeStyle = '#ffd018';
    g.lineWidth = 2.4;
    g.beginPath();
    g.roundRect(19, 22, 26, 32, 5);
    g.fill();
    g.stroke();
    g.fillStyle = '#ff2e22';
    g.beginPath();
    g.arc(32, 37, 7, 0, Math.PI * 2);
    g.fill();
  },
  killswitch: (g) => {
    g.fillStyle = '#ffd018';
    g.strokeStyle = '#16181c';
    g.lineWidth = 2.4;
    g.beginPath();
    g.arc(32, 34, 20, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.strokeStyle = '#d8221c';
    g.lineWidth = 5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(32, 18);
    g.lineTo(32, 35);
    g.stroke();
    g.beginPath();
    g.arc(32, 36, 11, -Math.PI * 0.35, Math.PI * 1.35, true);
    g.stroke();
  },
  okada: (g) => {
    // Glowing blue/orange hexagonal shield crest with red Okada motorcycle (matches reference!)
    g.fillStyle = '#146ee0';
    g.strokeStyle = '#ff9c18';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(32, 9);
    g.lineTo(52, 18);
    g.lineTo(48, 42);
    g.lineTo(32, 54);
    g.lineTo(16, 42);
    g.lineTo(12, 18);
    g.closePath();
    g.fill();
    g.stroke();
    g.strokeStyle = W;
    g.lineWidth = 3;
    for (const x of [21, 43]) {
      g.beginPath();
      g.arc(x, 37, 6.5, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = '#ff3022';
    g.beginPath();
    g.moveTo(21, 37);
    g.lineTo(29, 26);
    g.lineTo(40, 26);
    g.lineTo(43, 37);
    g.lineTo(33, 37);
    g.closePath();
    g.fill();
    g.fillStyle = '#ffd018';
    g.fillRect(36, 20, 8, 3.5);
  },
  voucher: (g) => {
    g.fillStyle = '#ffd018';
    g.strokeStyle = '#16181c';
    g.lineWidth = 2.2;
    g.beginPath();
    g.roundRect(10, 22, 44, 24, 5);
    g.fill();
    g.stroke();
    g.fillStyle = '#16181c';
    g.fillRect(14, 27, 22, 3);
    g.fillRect(14, 33, 15, 3);
    g.font = 'bold 12px system-ui';
    g.textAlign = 'center';
    g.fillText('VIP', 44, 39);
  },
  curse: (g) => {
    g.fillStyle = W;
    g.strokeStyle = '#16181c';
    g.lineWidth = 2.2;
    g.beginPath();
    g.arc(32, 27, 17, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillRect(22, 39, 20, 12);
    g.fillStyle = '#d8221c';
    for (const x of [25, 39]) {
      g.beginPath();
      g.arc(x, 27, 4.5, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#16181c';
    g.fillRect(28, 39, 2.5, 7);
    g.fillRect(33.5, 39, 2.5, 7);
  },
  sneakers: (g) => {
    // Winged sneaker dash token
    g.fillStyle = '#ffd018';
    g.beginPath();
    g.moveTo(22, 26);
    g.lineTo(10, 16);
    g.lineTo(26, 16);
    g.closePath();
    g.fill();
    g.fillStyle = W;
    g.strokeStyle = '#16181c';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(14, 24);
    g.lineTo(30, 19);
    g.lineTo(35, 29);
    g.lineTo(52, 36);
    g.lineTo(52, 45);
    g.lineTo(14, 45);
    g.closePath();
    g.fill();
    g.stroke();
    g.strokeStyle = '#ffd018';
    g.lineWidth = 3.5;
    g.beginPath();
    g.moveTo(20, 52);
    g.lineTo(32, 56);
    g.lineTo(44, 52);
    g.stroke();
  },
  hotfuel: (g) => {
    g.fillStyle = '#ffd018';
    g.strokeStyle = '#16181c';
    g.lineWidth = 2.2;
    g.beginPath();
    g.roundRect(16, 19, 32, 34, 5);
    g.fill();
    g.stroke();
    g.fillRect(24, 11, 16, 9);
    g.fillStyle = '#e0241c';
    g.beginPath();
    g.moveTo(32, 24);
    g.bezierCurveTo(42, 34, 40, 45, 32, 49);
    g.bezierCurveTo(24, 45, 22, 34, 32, 24);
    g.fill();
  },
};

/** Draws a badge for `kind` onto a fresh canvas of `size` px. */
export function drawPickupIcon(kind: PickupKind, size = 128, withBackground = true): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.scale(size / 64, size / 64);
  const def = PICKUP_DEFS[kind];
  if (withBackground) {
    g.fillStyle = hex(def.color);
    g.beginPath();
    g.arc(32, 32, 30, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(0,0,0,0.45)';
    g.stroke();
  }
  painters[kind](g);
  return c;
}

/** Cached data URL for use in <img> / CSS. */
export function pickupIconUrl(kind: PickupKind, size = 96): string {
  const key = `${kind}:${size}`;
  let url = urlCache.get(key);
  if (!url) {
    url = drawPickupIcon(kind, size).toDataURL('image/png');
    urlCache.set(key, url);
  }
  return url;
}
