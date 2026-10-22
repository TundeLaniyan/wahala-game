import type { CharacterId } from '../sim';
import { LOOKS } from './looks';
import { SLOT_CSS } from './palette';

const cache = new Map<string, string>();
/** Rendered 3D busts (set once the glTF cast has loaded); the drawn portrait below is the fallback. */
const busts = new Map<string, HTMLCanvasElement>();

export function registerBusts(map: Partial<Record<string, HTMLCanvasElement>>): void {
  for (const [id, c] of Object.entries(map)) if (c) busts.set(id, c);
  cache.clear();
}
const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

/** Small cartoon portrait on a slot-coloured background (HUD, character cards). Cached data URL. */
export function portraitUrl(id: CharacterId, slot: number, size = 96): string {
  const bustKey = slot === 3 && busts.has('areaBoss') ? 'areaBoss' : id;
  const key = `${id}:${slot}:${size}:${busts.has(bustKey) ? 'b' : 'd'}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.scale(size / 96, size / 96);
  const look = LOOKS[id];
  const slotCol = SLOT_CSS[slot % SLOT_CSS.length]!;
  const bg = g.createRadialGradient(48, 42, 8, 48, 48, 62);
  bg.addColorStop(0, slotCol);
  bg.addColorStop(0.65, '#241a10');
  bg.addColorStop(1, '#100c08');
  g.fillStyle = bg;
  g.fillRect(0, 0, 96, 96);
  const bust = busts.get(bustKey);
  if (bust) {
    g.drawImage(bust, 0, 0, 96, 96);
    const url = c.toDataURL('image/png');
    cache.set(key, url);
    return url;
  }
  // shoulders / top
  g.fillStyle = hex(look.top);
  g.beginPath();
  g.ellipse(48, 100, 40, 28, 0, Math.PI, 0);
  g.fill();
  g.fillStyle = hex(look.topAccent);
  g.fillRect(40, 74, 16, 22);
  // neck + head
  g.fillStyle = hex(look.skin);
  g.fillRect(41, 58, 14, 18);
  g.beginPath();
  g.ellipse(48, 42, 21, 24, 0, 0, Math.PI * 2);
  g.fill();
  // hair
  g.fillStyle = hex(look.hair);
  g.beginPath();
  g.ellipse(48, 28, 22, 14, 0, Math.PI, 0);
  g.fill();
  if (id === 'streetBaller') for (let i = 0; i < 6; i++) g.fillRect(28 + i * 7.5, 10, 5, 12);
  if (id === 'campusQueen') {
    g.beginPath();
    g.arc(22, 24, 9, 0, Math.PI * 2);
    g.arc(74, 24, 9, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = hex(look.topAccent);
    g.fillRect(27, 24, 42, 4);
  }
  // face
  g.fillStyle = '#120d0a';
  if (id === 'lekkiBoy') {
    g.fillRect(30, 38, 36, 8);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(33, 39, 10, 2);
  } else {
    g.beginPath();
    g.arc(40, 42, 2.8, 0, Math.PI * 2);
    g.arc(56, 42, 2.8, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = '#3a1a12';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(48, 52, 6, 0.15 * Math.PI, 0.85 * Math.PI);
  g.stroke();
  const url = c.toDataURL('image/png');
  cache.set(key, url);
  return url;
}
