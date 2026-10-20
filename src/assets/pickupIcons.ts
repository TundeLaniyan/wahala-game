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
    g.fillStyle = W;
    g.beginPath();
    g.moveTo(32, 10);
    g.bezierCurveTo(50, 28, 52, 42, 40, 52);
    g.bezierCurveTo(32, 58, 24, 56, 20, 50);
    g.bezierCurveTo(12, 40, 20, 28, 32, 10);
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath();
    g.ellipse(32, 44, 8, 9, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = W;
    g.font = 'bold 18px system-ui';
    g.textAlign = 'center';
    g.fillText('+', 49, 20);
  },
  diesel: (g) => {
    g.fillStyle = W;
    g.beginPath();
    g.moveTo(32, 8);
    g.bezierCurveTo(52, 28, 54, 44, 40, 54);
    g.bezierCurveTo(32, 60, 22, 58, 18, 50);
    g.bezierCurveTo(10, 38, 20, 26, 32, 8);
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.font = 'bold 15px system-ui';
    g.textAlign = 'center';
    g.fillText('MAX', 32, 46);
  },
  socket: (g) => {
    g.fillStyle = W;
    g.fillRect(14, 18, 36, 28);
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(22, 24, 4, 12);
    g.fillRect(38, 24, 4, 12);
    g.fillRect(29, 38, 6, 4);
    g.fillStyle = W;
    g.font = 'bold 18px system-ui';
    g.textAlign = 'center';
    g.fillText('+1', 32, 58);
  },
  skates: (g) => {
    g.fillStyle = W;
    g.beginPath();
    g.moveTo(18, 14);
    g.lineTo(34, 14);
    g.lineTo(34, 32);
    g.lineTo(50, 40);
    g.lineTo(50, 46);
    g.lineTo(18, 46);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.6)';
    for (const x of [24, 44]) {
      g.beginPath();
      g.arc(x, 52, 5, 0, Math.PI * 2);
      g.fill();
    }
  },
  boots: (g) => {
    g.fillStyle = W;
    g.beginPath();
    g.moveTo(20, 14);
    g.lineTo(34, 14);
    g.lineTo(36, 32);
    g.lineTo(52, 40);
    g.lineTo(52, 50);
    g.lineTo(18, 50);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.55)';
    for (const x of [24, 32, 40, 48]) g.fillRect(x, 50, 3, 6);
  },
  gloves: (g) => {
    g.fillStyle = W;
    g.beginPath();
    g.roundRect(16, 26, 32, 28, 8);
    g.fill();
    for (const [x, y] of [
      [18, 12],
      [27, 8],
      [36, 10],
      [44, 16],
    ] as const) {
      g.beginPath();
      g.roundRect(x, y, 8, 24, 4);
      g.fill();
    }
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(16, 48, 32, 5);
  },
  grip: (g) => {
    g.strokeStyle = W;
    g.lineWidth = 7;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(16, 40);
    g.lineTo(16, 22);
    g.quadraticCurveTo(32, 8, 48, 22);
    g.lineTo(48, 40);
    g.stroke();
    g.fillStyle = W;
    g.fillRect(12, 38, 40, 14);
  },
  remote: (g) => {
    g.fillStyle = W;
    g.beginPath();
    g.roundRect(20, 18, 24, 38, 6);
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.beginPath();
    g.arc(32, 32, 6, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = W;
    g.lineWidth = 3;
    for (const r of [12, 18, 24]) {
      g.beginPath();
      g.arc(32, 18, r, Math.PI * 1.2, Math.PI * 1.8);
      g.stroke();
    }
  },
  killswitch: (g) => {
    g.fillStyle = W;
    g.beginPath();
    g.arc(32, 34, 20, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.lineWidth = 6;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(32, 18);
    g.lineTo(32, 36);
    g.stroke();
    g.beginPath();
    g.arc(32, 36, 12, -Math.PI * 0.35, Math.PI * 1.35, true);
    g.stroke();
  },
  okada: (g) => {
    g.strokeStyle = W;
    g.lineWidth = 5;
    for (const x of [16, 48]) {
      g.beginPath();
      g.arc(x, 44, 9, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = W;
    g.beginPath();
    g.moveTo(16, 44);
    g.lineTo(28, 30);
    g.lineTo(42, 30);
    g.lineTo(48, 44);
    g.lineTo(42, 44);
    g.lineTo(36, 36);
    g.lineTo(30, 44);
    g.closePath();
    g.fill();
    g.fillRect(40, 20, 10, 4);
    g.fillRect(24, 24, 14, 5);
  },
  voucher: (g) => {
    g.fillStyle = W;
    g.beginPath();
    g.roundRect(10, 24, 44, 22, 5);
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(14, 29, 24, 3);
    g.fillRect(14, 35, 16, 3);
    g.font = 'bold 12px system-ui';
    g.textAlign = 'center';
    g.fillText('VIP', 45, 40);
    g.fillStyle = W;
    g.fillRect(14, 12, 36, 8);
    g.beginPath();
    g.arc(22, 20, 5, 0, Math.PI * 2);
    g.arc(42, 20, 5, 0, Math.PI * 2);
    g.fill();
  },
  curse: (g) => {
    g.fillStyle = W;
    g.beginPath();
    g.arc(32, 28, 18, 0, Math.PI * 2);
    g.fill();
    g.fillRect(22, 40, 20, 12);
    g.fillStyle = 'rgba(0,0,0,0.65)';
    for (const x of [25, 39]) {
      g.beginPath();
      g.arc(x, 28, 5, 0, Math.PI * 2);
      g.fill();
    }
    g.fillRect(28, 38, 3, 6);
    g.fillRect(34, 38, 3, 6);
  },
  sneakers: (g) => {
    g.fillStyle = W;
    g.beginPath();
    g.moveTo(14, 26);
    g.lineTo(30, 20);
    g.lineTo(34, 30);
    g.lineTo(52, 38);
    g.lineTo(52, 46);
    g.lineTo(14, 46);
    g.closePath();
    g.fill();
    g.strokeStyle = W;
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(22, 54);
    g.lineTo(32, 58);
    g.lineTo(42, 54);
    g.stroke();
  },
  hotfuel: (g) => {
    g.fillStyle = W;
    g.beginPath();
    g.roundRect(16, 20, 32, 34, 5);
    g.fill();
    g.fillRect(24, 12, 16, 10);
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.beginPath();
    g.moveTo(32, 26);
    g.bezierCurveTo(42, 36, 40, 46, 32, 50);
    g.bezierCurveTo(24, 46, 22, 36, 32, 26);
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
