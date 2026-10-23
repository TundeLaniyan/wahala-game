/**
 * Yaba After Dark playfield floor (presentation only): a busy commercial street at night. Old
 * charcoal asphalt, rain-wet and glossy in long patches (the roughness map makes them mirror the
 * neon and headlights), cut by resurfaced utility trenches; a faded zebra crossing, a yellow box
 * junction, kerb paint, gum, bottle caps and sachets. The arena's power-surge zones (the '=' tiles
 * of its layout) are worn diamond-plate steel service covers in hazard-painted frames with an 11KV
 * stencil: pale, hard-edged and readable under any colour of light. The hazard layer adds the
 * sparks and live glow on top.
 */
import { artRng } from '../textures';
import { YABA_AFTER_DARK } from '../../sim/arenas/yabaAfterDark';
import { T, crack, noiseFill, seams, stain, tyreTrack } from './floorKit';
import type { Ctx } from './floorKit';
import { roadTiles } from './ajegunleFloor';

/** One steel service plate filling tile (tx, ty), with its hazard frame. */
function servicePlate(g: Ctx, rg: Ctx, tx: number, ty: number, r: () => number, zone: Set<string>): void {
  const x0 = tx * T;
  const y0 = ty * T;
  const m = 7; // frame inset
  // hazard frame only on the outer edges of a zone strip, so a run of plates reads as one cover
  const open = (dx: number, dy: number): boolean => !zone.has(`${tx + dx},${ty + dy}`);
  g.fillStyle = 'rgb(32,30,30)';
  g.fillRect(x0, y0, T, T);
  // the plate: diamond tread, worn bright where feet and tyres pass
  g.fillStyle = 'rgb(118,118,116)';
  g.fillRect(x0 + m, y0 + m, T - 2 * m, T - 2 * m);
  g.save();
  g.beginPath();
  g.rect(x0 + m, y0 + m, T - 2 * m, T - 2 * m);
  g.clip();
  for (let y = y0; y < y0 + T; y += 10)
    for (let x = x0 + ((y / 10) % 2) * 5; x < x0 + T; x += 10) {
      g.save();
      g.translate(x, y);
      g.rotate((((x + y) / 10) % 2 ? 1 : -1) * 0.7);
      g.fillStyle = 'rgba(64,64,64,0.85)';
      g.fillRect(-4, -1.2, 8, 3);
      g.fillStyle = `rgba(190,190,186,${0.35 + r() * 0.4})`;
      g.fillRect(-4, -1.5, 8, 1.4);
      g.restore();
    }
  // rust and oil, a scuffed centre
  for (let i = 0; i < 6; i++)
    stain(g, x0 + r() * T, y0 + r() * T, 10 + r() * 20, `rgba(110,56,26,${0.2 + r() * 0.25})`);
  stain(g, x0 + T / 2, y0 + T / 2, T * 0.4, 'rgba(170,170,166,0.18)');
  g.restore();
  // countersunk bolts
  g.fillStyle = 'rgb(28,26,26)';
  for (const [bx, by] of [
    [m + 7, m + 7],
    [T - m - 11, m + 7],
    [m + 7, T - m - 11],
    [T - m - 11, T - m - 11],
  ] as const) {
    g.beginPath();
    g.arc(x0 + bx + 2, y0 + by + 2, 4, 0, Math.PI * 2);
    g.fill();
  }
  // hazard stripes on the open sides of the strip
  const stripe = (sx: number, sy: number, sw: number, sh: number): void => {
    g.save();
    g.beginPath();
    g.rect(sx, sy, sw, sh);
    g.clip();
    g.fillStyle = 'rgb(208,170,34)';
    g.fillRect(sx, sy, sw, sh);
    g.fillStyle = 'rgb(22,20,18)';
    for (let k = -T; k < T * 2; k += 22) {
      g.beginPath();
      g.moveTo(x0 + k, y0);
      g.lineTo(x0 + k + 11, y0);
      g.lineTo(x0 + k + 11 - T, y0 + T);
      g.lineTo(x0 + k - T, y0 + T);
      g.closePath();
      g.fill();
    }
    // worn paint
    for (let i = 0; i < 30; i++) {
      g.fillStyle = 'rgba(60,58,54,0.6)';
      g.fillRect(sx + r() * sw, sy + r() * sh, 2 + r() * 8, 2 + r() * 4);
    }
    g.restore();
  };
  const sw = 11;
  if (open(0, -1)) stripe(x0, y0, T, sw);
  if (open(0, 1)) stripe(x0, y0 + T - sw, T, sw);
  if (open(-1, 0)) stripe(x0, y0, sw, T);
  if (open(1, 0)) stripe(x0 + T - sw, y0, sw, T);
  // stencil
  g.save();
  g.translate(x0 + T / 2, y0 + T / 2);
  g.fillStyle = 'rgba(214,180,48,0.75)';
  g.beginPath();
  g.moveTo(4, -26);
  g.lineTo(-10, 3);
  g.lineTo(0, 3);
  g.lineTo(-5, 26);
  g.lineTo(11, -5);
  g.lineTo(1, -5);
  g.closePath();
  g.fill();
  g.font = 'bold 11px Impact, "Arial Narrow", sans-serif';
  g.textAlign = 'center';
  g.fillStyle = 'rgba(214,206,186,0.55)';
  g.fillText('11KV', 0, 42);
  g.restore();
  // roughness: steel is smoother than the asphalt, the worn tread smoother still
  rg.fillStyle = 'rgb(96,96,96)';
  rg.fillRect(x0 + m, y0 + m, T - 2 * m, T - 2 * m);
  rg.fillStyle = 'rgba(60,60,60,0.6)';
  rg.fillRect(x0 + T * 0.3, y0 + T * 0.3, T * 0.4, T * 0.4);
}

export function drawYabaFloor(g: Ctx, rg: Ctx, cols: number, rows: number): void {
  const w = cols * T;
  const h = rows * T;
  const r = artRng(8803);
  noiseFill(g, w, h, [66, 64, 66], 20, 81);
  noiseFill(rg, w, h, [196, 196, 196], 26, 82);
  // aggregate showing through the worn binder
  for (let i = 0; i < 5200; i++) {
    const v = 80 + r() * 70;
    g.fillStyle = `rgba(${v},${v},${v + 4},0.45)`;
    g.fillRect(r() * w, r() * h, 2 + r() * 2, 2 + r() * 2);
  }
  // resurfaced utility trenches (newer, blacker tar in straight cuts) feeding the service plates
  for (const [x, y, tw, th] of [
    [0, 4.35, 15, 0.3],
    [6.35, 0, 0.3, 11],
    [2, 2.35, 3, 0.3],
    [10, 8.35, 3, 0.3],
    [2.35, 2, 0.3, 7],
  ] as const) {
    g.fillStyle = 'rgba(34,32,34,0.8)';
    g.fillRect(x * T, y * T, tw * T, th * T);
    g.strokeStyle = 'rgba(16,14,16,0.7)';
    g.lineWidth = 3;
    g.strokeRect(x * T, y * T, tw * T, th * T);
    rg.fillStyle = 'rgba(150,150,150,0.6)';
    rg.fillRect(x * T, y * T, tw * T, th * T);
  }
  // patches and potholes filled with cold tar
  for (let i = 0; i < 12; i++) {
    const x = r() * w;
    const y = r() * h;
    g.fillStyle = r() < 0.5 ? 'rgba(30,28,30,0.55)' : 'rgba(96,94,92,0.3)';
    g.beginPath();
    g.ellipse(x, y, 40 + r() * 90, 26 + r() * 50, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < cols * rows * 0.4; i++)
    crack(g, r, r() * w, r() * h, 4 + Math.floor(r() * 8), 'rgba(18,16,18,0.7)', 2);
  for (let i = 0; i < 8; i++) tyreTrack(g, r, w, h, 'rgba(20,18,20,0.3)');
  // a faded zebra crossing on the west side and a yellow box junction in the middle
  g.fillStyle = 'rgba(196,196,186,0.32)';
  for (let k = 0; k < 9; k++) g.fillRect(0.55 * T, 0.6 * T + k * T * 1.1, T * 0.9, T * 0.55);
  for (let k = 0; k < 9; k++) g.fillRect(13.55 * T, 0.6 * T + k * T * 1.1, T * 0.9, T * 0.55);
  g.strokeStyle = 'rgba(200,164,40,0.35)';
  g.lineWidth = 7;
  g.strokeRect(5.1 * T, 3.1 * T, 4.8 * T, 4.8 * T);
  g.save();
  g.beginPath();
  g.rect(5.1 * T, 3.1 * T, 4.8 * T, 4.8 * T);
  g.clip();
  g.lineWidth = 5;
  g.beginPath();
  for (let k = -6; k <= 6; k++) {
    const o = k * T * 0.8;
    g.moveTo(5.1 * T + o, 3.1 * T);
    g.lineTo(9.9 * T + o, 7.9 * T);
    g.moveTo(9.9 * T + o, 3.1 * T);
    g.lineTo(5.1 * T + o, 7.9 * T);
  }
  g.stroke();
  g.restore();
  // rain: long wet patches, dark in colour and mirror-glossy (they catch the neon)
  for (let i = 0; i < 24; i++) {
    const x = r() * w;
    const y = r() * h;
    const rx = 50 + r() * 170;
    const ry = 24 + r() * 70;
    const rot = r() * 3;
    g.fillStyle = 'rgba(20,20,26,0.4)';
    g.beginPath();
    g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    g.fill();
    rg.fillStyle = 'rgba(8,8,8,0.9)';
    rg.beginPath();
    rg.ellipse(x, y, rx * 0.9, ry * 0.9, rot, 0, Math.PI * 2);
    rg.fill();
  }
  // oil drips under where okadas and kekes wait
  for (let i = 0; i < 26; i++) stain(g, r() * w, r() * h, 12 + r() * 30, `rgba(12,10,12,${0.3 + r() * 0.3})`);
  // litter: bottle caps, pure-water sachets, flyers, roasted-corn husks
  for (let i = 0; i < 360; i++) {
    const k = r();
    g.fillStyle =
      k < 0.35
        ? `rgba(200,206,210,${0.2 + r() * 0.3})`
        : k < 0.55
          ? `rgba(170,140,60,${0.25 + r() * 0.3})`
          : k < 0.75
            ? `rgba(160,40,36,${0.2 + r() * 0.3})`
            : `rgba(40,90,150,${0.2 + r() * 0.25})`;
    g.save();
    g.translate(r() * w, r() * h);
    g.rotate(r() * 3);
    g.fillRect(-3, -2, 3 + r() * 8, 2 + r() * 5);
    g.restore();
  }
  // the power-surge service plates
  const tiles = roadTiles(YABA_AFTER_DARK.layout);
  const zone = new Set(tiles.map(([x, y]) => `${x},${y}`));
  for (const [x, y] of tiles) servicePlate(g, rg, x, y, r, zone);
  seams(g, cols, rows, 'rgba(12,12,14,0.4)', 3);
  g.translate(2, 2);
  seams(g, cols, rows, 'rgba(150,146,150,0.08)', 1);
  g.setTransform(1, 0, 0, 1, 0, 0);
}
