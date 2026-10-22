import { Group, Sprite, SpriteMaterial, AdditiveBlending } from 'three';
import { DIR_VEC, previewBlast } from '../../sim';
import type { Dir, TilePos, VehicleEntry } from '../../sim';
import { entryKey } from '../../sim';
import { chevronTexture, glowTexture, ringTexture, tileGlowTexture } from '../textures';
import type { EntryOverlayModel, EntryPick } from '../types';
import { TileOverlay } from './TileOverlay';
import type { FrameContext, View } from './types';

/** Rotation about Y that points the chevron texture (drawn pointing -Z) along a grid direction. */
export function chevronYaw(dir: Dir): number {
  return { up: 0, right: -Math.PI / 2, down: Math.PI, left: Math.PI / 2 }[dir];
}

function dirBetween(a: TilePos, b: TilePos): Dir {
  if (b.x > a.x) return 'right';
  if (b.x < a.x) return 'left';
  return b.y > a.y ? 'down' : 'up';
}

/**
 * Everything that WARNS the player or lets them choose: blast danger lanes, incoming vehicle
 * lanes, crush and spectator-throw telegraphs, and the vehicle-entry selection overlay.
 */
export class OverlayViews implements View {
  readonly group = new Group();
  private readonly fill = new TileOverlay(tileGlowTexture(), 700, 7);
  private readonly chevrons = new TileOverlay(chevronTexture(), 300, 8);
  private readonly rings = new TileOverlay(ringTexture(), 120, 9);
  private readonly gates: Sprite[] = [];
  private pickTargets: { key: string; kind: 'entry' | 'turn'; x: number; y: number }[] = [];
  private readonly projectiles = new Map<number, Sprite>();

  constructor() {
    this.group.add(this.fill.mesh, this.chevrons.mesh, this.rings.mesh);
    for (let i = 0; i < 4; i++) {
      const s = new Sprite(
        new SpriteMaterial({
          map: glowTexture(),
          color: 0xffb300,
          transparent: true,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      );
      s.visible = false;
      s.renderOrder = 28;
      this.group.add(s);
      this.gates.push(s);
    }
  }

  update(ctx: FrameContext): void {
    const { state, time, alpha, layout, info } = ctx;
    this.fill.begin();
    this.chevrons.begin();
    this.rings.begin();
    const wx = layout.wx;
    const wz = layout.wz;

    // --- blast danger lanes (generators about to explode, and remote ones faintly)
    const danger = new Map<number, number>();
    for (const g of state.generators) {
      if (g.flight !== null || g.mode === 'disabled') continue;
      let intensity: number;
      if (g.mode === 'timed') {
        const left = g.timer - alpha;
        if (left > 100) continue;
        intensity = 0.16 + 0.5 * (1 - Math.max(0, left) / 100);
        intensity *= 0.8 + 0.2 * Math.sin(time * (10 + (1 - left / 100) * 20));
      } else {
        intensity = g.timer < 240 ? 0.3 + 0.25 * Math.sin(time * 14) : 0.1;
      }
      for (const idx of previewBlast(state, g)) danger.set(idx, Math.max(danger.get(idx) ?? 0, intensity));
    }
    for (const [idx, intensity] of danger) {
      this.fill.push({
        x: wx(idx % state.width),
        z: wz(Math.floor(idx / state.width)),
        color: 0xff3418,
        intensity,
        scale: 0.94,
      });
    }

    // --- incoming vehicle lanes
    let gateIdx = 0;
    for (const v of state.vehicles) {
      if (v.phase !== 'warning') continue;
      const total = state.config.vehicles.entryWarnTicks;
      const k = 1 - Math.max(0, v.warnRemaining - alpha) / total;
      const urgent = k > 0.65;
      const color = urgent ? 0xff4a1a : 0xffc21a;
      v.route.forEach((t, i) => {
        const pulse = 0.5 + 0.5 * Math.sin(time * (urgent ? 22 : 12) - i * 0.8);
        this.fill.push({ x: wx(t.x), z: wz(t.y), color, intensity: 0.2 + 0.32 * pulse, scale: 0.97 });
        const next = v.route[i + 1] ?? t;
        const prev = v.route[i - 1] ?? t;
        const dir = i < v.route.length - 1 ? dirBetween(t, next) : dirBetween(prev, t);
        this.chevrons.push({
          x: wx(t.x),
          z: wz(t.y),
          color,
          intensity: 0.35 + 0.65 * pulse,
          rotY: chevronYaw(dir),
          scale: 0.72,
        });
      });
      const first = v.route[0]!;
      const second = v.route[1] ?? first;
      const gd = dirBetween(first, second);
      const gv = DIR_VEC[gd];
      const gate = this.gates[gateIdx++];
      if (gate) {
        gate.visible = true;
        gate.position.set(wx(first.x) - gv.dx * 0.55, 0.9, wz(first.y) - gv.dy * 0.55);
        const flash = 0.6 + 0.4 * Math.sin(time * 18);
        gate.scale.setScalar(1.4 + flash * 0.6);
        gate.material.opacity = flash;
      }
      this.rings.push({
        x: wx(first.x),
        z: wz(first.y),
        color: 0xffffff,
        intensity: 0.6 + 0.4 * Math.sin(time * 16),
        scale: 1.0 + 0.25 * Math.sin(time * 8),
      });
    }
    for (let i = gateIdx; i < this.gates.length; i++) this.gates[i]!.visible = false;

    // --- Wahala Crush warnings
    if (state.crush) {
      for (const c of state.crush.pending) {
        const total = state.config.crush.warnTicks;
        const k = 1 - Math.max(0, c.landTick - state.tick - alpha) / total;
        const x = wx(c.index % state.width);
        const z = wz(Math.floor(c.index / state.width));
        this.fill.push({
          x,
          z,
          color: 0xff2a2a,
          intensity: 0.28 + 0.54 * k * (0.7 + 0.3 * Math.sin(time * 24)),
          scale: 0.98,
        });
        this.rings.push({ x, z, color: 0xffcc33, intensity: 0.45 + 0.55 * k, scale: 1.7 - k * 0.9 });
        this.rings.push({
          x,
          z,
          color: 0xff3b1f,
          intensity: 0.5 + 0.5 * k,
          scale: Math.max(0.32, 0.95 - k * 0.55),
        });
      }
    }

    // --- spectator throws
    const crowd = state.crowd;
    const seen = new Set<number>();
    if (crowd) {
      for (const t of crowd.throws) {
        seen.add(t.id);
        const total = state.config.crowd.warnTicks;
        const k = 1 - Math.max(0, t.landTick - state.tick - alpha) / total;
        const lethal = t.kind === 'firecracker';
        const color = lethal ? 0xff3030 : 0x40d0ff;
        const area = lethal
          ? [
              [0, 0],
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ]
          : [[0, 0]];
        for (const [ox, oy] of area) {
          this.fill.push({
            x: wx(t.x + ox!),
            z: wz(t.y + oy!),
            color,
            intensity: 0.18 + 0.45 * k,
            scale: 0.95,
          });
        }
        this.rings.push({ x: wx(t.x), z: wz(t.y), color, intensity: 0.9, scale: 1.8 - k * 1.0 });
        let s = this.projectiles.get(t.id);
        if (!s) {
          s = new Sprite(
            new SpriteMaterial({
              map: glowTexture(),
              color: lethal ? 0xff5030 : 0x80e0ff,
              transparent: true,
              blending: AdditiveBlending,
              depthWrite: false,
            }),
          );
          s.renderOrder = 29;
          this.group.add(s);
          this.projectiles.set(t.id, s);
        }
        const height = 7 * (1 - k) * (1 - k) + 0.2;
        s.position.set(wx(t.x), height, wz(t.y));
        s.scale.setScalar(lethal ? 0.55 : 0.4);
      }
    }
    for (const [id, s] of this.projectiles) {
      if (!seen.has(id)) {
        this.group.remove(s);
        s.material.dispose();
        this.projectiles.delete(id);
      }
    }

    this.drawEntry(ctx, info.entryOverlay);
    this.fill.end();
    this.chevrons.end();
    this.rings.end();
  }

  private drawEntry(ctx: FrameContext, model: EntryOverlayModel | null): void {
    this.pickTargets = [];
    if (!model) return;
    const { time, layout } = ctx;
    const wx = layout.wx;
    const wz = layout.wz;
    if (model.stage === 'entry') {
      for (const e of model.entries) this.drawEntryMarker(ctx, e, entryKey(e) === model.focusKey);
    }
    if (model.route) {
      model.route.forEach((t, i) => {
        const next = model.route![i + 1] ?? t;
        const prev = model.route![i - 1] ?? t;
        const dir = i < model.route!.length - 1 ? dirBetween(t, next) : dirBetween(prev, t);
        const pulse = 0.5 + 0.5 * Math.sin(time * 8 - i * 0.7);
        this.fill.push({
          x: wx(t.x),
          z: wz(t.y),
          color: 0xffe14a,
          intensity: 0.16 + 0.12 * pulse,
          scale: 0.97,
        });
        this.chevrons.push({
          x: wx(t.x),
          z: wz(t.y),
          color: 0xfff3a0,
          intensity: 0.5 + 0.5 * pulse,
          rotY: chevronYaw(dir),
          scale: 0.6,
        });
      });
    }
    if (model.stage === 'turn') {
      for (const t of model.turns) {
        const focus = t.key === model.focusTurnKey;
        const v = DIR_VEC[t.dir];
        const pulse = 0.5 + 0.5 * Math.sin(time * 9);
        this.fill.push({
          x: wx(t.pos.x),
          z: wz(t.pos.y),
          color: focus ? 0xffffff : 0x40d0ff,
          intensity: focus ? 0.6 : 0.25 + 0.15 * pulse,
          scale: 0.9,
        });
        this.chevrons.push({
          x: wx(t.pos.x) + v.dx * 0.1,
          z: wz(t.pos.y) + v.dy * 0.1,
          color: focus ? 0xffffff : 0x40d0ff,
          intensity: focus ? 1 : 0.7 + 0.3 * pulse,
          rotY: chevronYaw(t.dir),
          scale: focus ? 0.95 : 0.65,
        });
        this.pickTargets.push({ key: t.key, kind: 'turn', x: t.pos.x, y: t.pos.y });
      }
    }
  }

  private drawEntryMarker(ctx: FrameContext, e: VehicleEntry, focus: boolean): void {
    const { time, layout } = ctx;
    const v = DIR_VEC[e.dir];
    const pulse = 0.5 + 0.5 * Math.sin(time * 6 + e.x + e.y);
    // Sit the arrow on the edge of the border tile facing outward so corner tiles can hold two.
    const cx = layout.wx(e.x) - v.dx * 0.26;
    const cz = layout.wz(e.y) - v.dy * 0.26;
    this.chevrons.push({
      x: cx,
      z: cz,
      color: focus ? 0xffffff : 0xffb300,
      intensity: focus ? 1 : 0.55 + 0.35 * pulse,
      rotY: chevronYaw(e.dir),
      scale: focus ? 0.98 : 0.62,
    });
    if (focus)
      this.rings.push({
        x: layout.wx(e.x),
        z: layout.wz(e.y),
        color: 0xffffff,
        intensity: 0.9,
        scale: 1.0 + 0.2 * pulse,
      });
    this.pickTargets.push({ key: entryKey(e), kind: 'entry', x: e.x - v.dx * 0.26, y: e.y - v.dy * 0.26 });
  }

  /** Nearest selectable marker to a fractional grid position (for tap / click selection). */
  pick(gx: number, gy: number): EntryPick | null {
    let best: { key: string; kind: 'entry' | 'turn' } | null = null;
    let bestD = 0.75;
    for (const t of this.pickTargets) {
      const d = Math.hypot(t.x - gx, t.y - gy);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  dispose(): void {
    this.fill.dispose();
    this.chevrons.dispose();
    this.rings.dispose();
    for (const s of this.gates) s.material.dispose();
    for (const s of this.projectiles.values()) s.material.dispose();
  }
}
