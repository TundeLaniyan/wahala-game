import {
  BoxGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
} from 'three';
import type { BufferGeometry } from 'three';
import type { EnemyAttackKind, GameState, SimEvent } from '../../sim';
import { glowTexture, ringTexture } from '../textures';
import type { Effects } from '../fx/Effects';
import type { Layout } from '../coords';
import {
  PROJECTILE_STYLES,
  cueColor,
  impactFor,
  moveStartTick,
  pathProgress,
  pointAlong,
} from './damageModel';
import { TileOverlay } from './TileOverlay';
import type { FrameContext, View } from './types';

interface Flight {
  id: number;
  kind: EnemyAttackKind;
  strong: boolean;
  from: { x: number; y: number };
  path: number[];
  stepTicks: number;
  /** The tick it starts to move (the telegraph comes first). */
  start: number;
  warnTicks: number;
  body: Group;
  shadow: Mesh;
  /** Set when `projectileHit` lands: where, and the render time it lands (the body is gone after a beat). */
  landed: { x: number; y: number; at: number } | null;
  /** Fallback removal: far past the end of the path with no `projectileHit` seen. */
  doneAt: number;
}

/** How long the preview of the path stays brighter at the start (the telegraph) than for the rest of the flight. */
const PREVIEW_CAP = 192;

/**
 * Thrown objects (bottles, bricks, stones, thrown tools) from events only: `projectileLaunched` raises a LAUNCH CUE (the
 * thrower's wind-up flash, the object held overhead, and a faint path preview along `path` for `warnTicks`), then the
 * object travels the path at `stepTicks` per tile with a spin and a small shadow, and `projectileHit` shows the collision
 * result (glass or stone shattering on a wall, a cold spark on a shield, an impact flash on a body, a thud on a miss).
 * Low-poly shapes, shared geometry and materials; the preview is one instanced overlay. Nothing here decides a hit.
 */
export class ProjectileViews implements View {
  readonly group = new Group();
  private readonly flights = new Map<number, Flight>();
  private readonly preview = new TileOverlay(ringTexture(), PREVIEW_CAP, 8, 0.05);
  private readonly shadowGeo = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private readonly shadowMat = new MeshBasicMaterial({
    map: glowTexture(),
    color: 0x000000,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  private readonly geo: Record<'bottle' | 'neck' | 'brick' | 'stone' | 'handle' | 'head', BufferGeometry> = {
    bottle: new CylinderGeometry(0.075, 0.085, 0.26, 8),
    neck: new CylinderGeometry(0.03, 0.05, 0.14, 8),
    brick: new BoxGeometry(0.26, 0.11, 0.13),
    stone: new DodecahedronGeometry(0.13, 0),
    handle: new BoxGeometry(0.34, 0.05, 0.05),
    head: new BoxGeometry(0.1, 0.14, 0.07),
  };
  private readonly mats = {
    glass: new MeshStandardMaterial({
      color: 0x4ea05f,
      roughness: 0.25,
      metalness: 0.1,
      transparent: true,
      opacity: 0.85,
    }),
    brick: new MeshStandardMaterial({ color: 0xa24a34, roughness: 0.95, flatShading: true }),
    stone: new MeshStandardMaterial({ color: 0x8b8b88, roughness: 1, flatShading: true }),
    steel: new MeshStandardMaterial({ color: 0xb9bcc2, roughness: 0.4, metalness: 0.7 }),
    grip: new MeshStandardMaterial({ color: 0xe0a21c, roughness: 0.7 }),
  };
  private now = 0;

  constructor() {
    this.group.add(this.preview.mesh);
  }

  /** In-flight projectiles (tests / the debug handle). */
  get active(): number {
    return this.flights.size;
  }

  // ------------------------------------------------------------------------------------------ events

  handleEvents(events: readonly SimEvent[], state: GameState, fx: Effects, layout: Layout): void {
    for (const e of events) {
      if (e.type === 'projectileLaunched') {
        if (this.flights.has(e.id)) continue;
        const cue = cueColor(e.kind, e.strong);
        // the launch cue: the thrower flashes (wind-up) and a ring marks the hand
        fx.flash(
          layout.wx(e.fromX),
          1.35,
          layout.wz(e.fromY),
          e.strong ? 1.5 : 1.0,
          cue,
          e.strong ? 0.45 : 0.3,
        );
        fx.shockwave(layout.wx(e.fromX), layout.wz(e.fromY), e.strong ? 1.2 : 0.7, cue);
        const body = this.buildBody(e.kind);
        const shadow = new Mesh(this.shadowGeo, this.shadowMat);
        shadow.renderOrder = 4;
        shadow.scale.setScalar(0.38);
        this.group.add(body, shadow);
        this.flights.set(e.id, {
          id: e.id,
          kind: e.kind,
          strong: e.strong,
          from: { x: e.fromX, y: e.fromY },
          path: e.path,
          stepTicks: e.stepTicks,
          start: moveStartTick(state.tick, e.launchTick, e.warnTicks),
          warnTicks: e.warnTicks,
          body,
          shadow,
          landed: null,
          doneAt: Infinity,
        });
      } else if (e.type === 'projectileHit') {
        const f = this.flights.get(e.id);
        const style = PROJECTILE_STYLES[e.kind];
        const x = layout.wx(e.x);
        const z = layout.wz(e.y);
        switch (impactFor(e.result)) {
          case 'shatter':
            // glass or stone on a wall: a spray of pieces and a puff
            fx.sparkle(e.x, e.y, style.shatter);
            if (e.kind !== 'bottle') fx.blockDebris(e.x, e.y, 'concrete');
            fx.dust(e.x, e.y, e.kind === 'bottle' ? 3 : 6, 0.4);
            break;
          case 'spark':
            // Armour / Okada: the cold white-blue spark (DamageViews draws the ring on the victim)
            fx.flash(x, 1.0, z, 1.5, 0xbfe6ff, 0.28);
            fx.sparkle(e.x, e.y, 0xbfe6ff);
            break;
          case 'flash':
            fx.flash(x, 1.0, z, 1.4, 0xfff1c0, 0.2);
            fx.dust(e.x, e.y, 3, 0.35);
            break;
          case 'puff':
            fx.dust(e.x, e.y, 4, 0.4);
            break;
          case 'thud':
            // it landed on the floor and missed: a low thud ring and a little dust
            fx.shockwave(x, z, 0.55, 0xbdb6a6);
            fx.dust(e.x, e.y, 4, 0.4);
            break;
        }
        if (f) {
          f.landed = { x: e.x, y: e.y, at: this.now };
          // a shattering bottle is gone at once; anything else lingers a beat so the landing reads
          f.body.visible = false;
        }
      }
    }
  }

  private buildBody(kind: EnemyAttackKind): Group {
    const g = new Group();
    const add = (geo: BufferGeometry, m: MeshStandardMaterial, x = 0, y = 0, z = 0): Mesh => {
      const mesh = new Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      g.add(mesh);
      return mesh;
    };
    switch (kind) {
      case 'bottle':
        add(this.geo.bottle, this.mats.glass);
        add(this.geo.neck, this.mats.glass, 0, 0.2, 0);
        break;
      case 'brick':
        add(this.geo.brick, this.mats.brick);
        break;
      case 'stone':
        add(this.geo.stone, this.mats.stone);
        break;
      case 'tool':
        add(this.geo.handle, this.mats.grip);
        add(this.geo.head, this.mats.steel, 0.2, 0.04, 0);
        break;
      case 'punch':
        break;
    }
    return g;
  }

  // ------------------------------------------------------------------------------------------ frame

  update(ctx: FrameContext): void {
    this.now = ctx.time;
    const { layout, state } = ctx;
    this.preview.begin();
    const gone: number[] = [];
    for (const f of this.flights.values()) {
      const elapsed = state.tick + ctx.alpha - f.start;
      const idx = pathProgress(elapsed, f.stepTicks, f.path.length);
      if (f.landed && ctx.time - f.landed.at > 0.35) {
        gone.push(f.id);
        continue;
      }
      if (!f.landed && f.doneAt === Infinity && idx >= f.path.length && f.path.length > 0)
        f.doneAt = ctx.time + 0.6; // reached its end with no hit event: fade out shortly
      if (ctx.time > f.doneAt) {
        gone.push(f.id);
        continue;
      }
      this.placeBody(f, ctx, layout, idx, elapsed);
      this.drawPreview(f, ctx, layout, idx, elapsed);
    }
    for (const id of gone) this.dispose1(id);
    this.preview.end();
  }

  private placeBody(f: Flight, ctx: FrameContext, layout: Layout, idx: number, elapsed: number): void {
    if (f.landed) return;
    const style = PROJECTILE_STYLES[f.kind];
    const state = ctx.state;
    const pos = pointAlong(f.from, f.path, state.width, idx);
    const wx = layout.wx(pos.x);
    const wz = layout.wz(pos.y);
    const flying = elapsed > 0;
    // held overhead during the telegraph, then a shallow arc over the whole path
    const total = Math.max(1, f.path.length);
    const k = flying ? Math.min(1, idx / total) : 0;
    const y = flying ? 0.75 + style.arc * Math.sin(Math.PI * k) : 1.45 + 0.06 * Math.sin(ctx.time * 12);
    f.body.visible = true;
    f.body.position.set(wx, y, wz);
    const spin = flying ? ctx.time * style.spin : ctx.time * 3;
    f.body.rotation.set(spin * 0.6, spin * 0.3, spin);
    f.body.scale.setScalar(f.strong ? 1.5 : 1);
    f.shadow.visible = flying;
    f.shadow.position.set(wx, 0.04, wz);
    f.shadow.scale.setScalar(0.34 + 0.12 * (1 - Math.min(1, y)));
  }

  /** The faint path: bright and pulsing while the cue lasts, a quiet trail ahead of the object afterwards. */
  private drawPreview(f: Flight, ctx: FrameContext, layout: Layout, idx: number, elapsed: number): void {
    if (f.landed) return;
    const warning = elapsed <= 0;
    const color = cueColor(f.kind, f.strong);
    const w = ctx.state.width;
    const fromTile = Math.floor(idx);
    for (let i = warning ? 0 : fromTile; i < f.path.length; i++) {
      const tile = f.path[i]!;
      const urgency = warning ? 1 - Math.max(0, -elapsed) / Math.max(1, f.warnTicks) : 0;
      this.preview.push({
        x: layout.wx(tile % w),
        z: layout.wz(Math.floor(tile / w)),
        color,
        intensity: warning ? 0.45 + 0.4 * urgency + 0.12 * Math.sin(ctx.time * 16) : 0.28,
        scale: warning ? 0.44 + 0.16 * urgency : 0.3,
      });
    }
  }

  private dispose1(id: number): void {
    const f = this.flights.get(id);
    if (!f) return;
    this.group.remove(f.body, f.shadow);
    this.flights.delete(id);
  }

  dispose(): void {
    for (const id of [...this.flights.keys()]) this.dispose1(id);
    this.preview.dispose();
    this.shadowGeo.dispose();
    this.shadowMat.dispose();
    for (const g of Object.values(this.geo)) g.dispose();
    for (const m of Object.values(this.mats)) m.dispose();
  }
}
