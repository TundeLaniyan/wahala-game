import { Color, Group, MathUtils, MeshStandardMaterial } from 'three';
import type { Material, Mesh, Object3D } from 'three';
import { RiggedCharacter } from '../assets/rigged';
import type { ClipName } from '../assets/rigged';

/**
 * Living Lagos street activity OUTSIDE the playable grid (presentation only; these people are
 * never competitors and never stand on the board). Each actor is a real skinned, animated
 * character (the same rigs as the cast) dressed in its own worn, muted clothes, acting out a small
 * scripted scene whose timings are randomised per actor so nothing loops in sync:
 *
 * - fight: two men trading shoves and kicks, stumbling, circling, one backing off then returning;
 * - argue: two traders squaring up, gesturing and shoving;
 * - conductor: a danfo conductor waving and calling passengers, pacing beside his bus;
 * - seller / buyer: a trader handing goods over while a customer bargains;
 * - worker: a site labourer digging, stamping and carrying;
 * - onlooker: watching (a fight, the match), cheering when things get loud;
 * - walker: walking a path along the street and back.
 *
 * The number of actors is capped by the quality profile; extra requests are ignored.
 *
 * Bystander reactions (City Rumble living environments): `reactInRect` makes the actors standing in a
 * protected zone duck, flinch, scatter a few steps, cheer or look at something the simulation did. It
 * only moves the actors' drawn offset (bounded by their zone) and picks clips; actors are presentation
 * only and never exist in the simulation.
 */
export type VignetteKind = 'fight' | 'argue' | 'conductor' | 'seller' | 'worker' | 'onlooker' | 'walker';

/** How background people differ from the cast (smaller, darker, no shadows if asked). */
export interface NpcStyle {
  /** Uniform scale range of the rigs (the cast is drawn at 1). Default 0.86..0.98. */
  scale?: readonly [number, number];
  /** Colour multiplier on clothes and skin (1 = as dressed). Default 1. */
  darken?: number;
  /** Rigs cast shadows (default true; the double draw is what a tight budget turns off). */
  castShadow?: boolean;
}

/** World-space rectangle (x / z, metres) an actor must stay inside while it reacts. */
export interface WorldBounds {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export type BystanderReaction = 'duck' | 'flinch' | 'scatter' | 'cheer' | 'look';

export interface Vignette {
  kind: VignetteKind;
  x: number;
  z: number;
  /** Facing (radians, 0 = +Z). For pairs: the axis between the two actors. */
  yaw: number;
  /** Optional ground height (platforms). */
  y?: number;
  /** walker / conductor pacing: second point of the path. */
  toX?: number;
  toZ?: number;
  /** Protected zone: the actor never leaves it, whatever it reacts to. */
  bounds?: WorldBounds;
}

/** The cast rigs NPCs are built from (outfits are re-coloured so nobody looks like a player). */
const RIGS = ['streetBaller', 'lekkiBoy', 'areaBoss', 'campusQueen'] as const;
/** Worn, muted clothing: faded navy, khaki, rust, olive, grey, dirty white, brown, maroon. */
const CLOTH = [0x3a4252, 0x7a6e56, 0x7a4a34, 0x4e5236, 0x5c5c5a, 0xa8a08e, 0x5a4232, 0x5c2e30, 0x2e3a36];
const HIVIS = 0xc45a18;

interface Actor {
  rc: RiggedCharacter;
  root: Group;
  kind: VignetteKind;
  role: 0 | 1;
  baseX: number;
  baseZ: number;
  baseYaw: number;
  /** path end (walker / pacing) */
  toX: number;
  toZ: number;
  next: number;
  speed: number;
  /** walkers: position along the path 0..1 and direction */
  t: number;
  dir: 1 | -1;
  partner: Actor | null;
  /** fight: current circling offset */
  circle: number;
  retreatUntil: number;
  bounds: WorldBounds | null;
  /** Current bystander reaction (null = none) and the drawn offset it causes. */
  react: { kind: BystanderReaction; until: number; ox: number; oz: number; lookYaw: number } | null;
  offX: number;
  offZ: number;
  baseScaleY: number;
  /** Where the actor stood when it started reacting (a path walker's point on its path). */
  holdX: number;
  holdZ: number;
}

/** Re-dresses a rig: own cloned materials, muted / worn clothing, slightly varied skin. */
function dress(body: Object3D, rnd: () => number, hiVis: boolean, darken = 1): Material[] {
  const owned: Material[] = [];
  const cloth = new Color(hiVis ? HIVIS : CLOTH[Math.floor(rnd() * CLOTH.length)]!);
  body.traverse((o) => {
    const m = (o as Mesh).material as Material | Material[] | undefined;
    if (!m || Array.isArray(m)) return;
    if (!(m instanceof MeshStandardMaterial)) return;
    const c = m.clone();
    const name = m.name.toLowerCase();
    if (name.includes('cloth') && hiVis) {
      // fluorescent coveralls: a flat vivid colour (the outfit atlas would tint it), kept unweathered
      c.map = null;
      c.color.setHex(rnd() < 0.5 ? HIVIS : 0xa8ae26);
      c.roughness = 0.75;
      c.userData.noGrit = true;
    } else if (name.includes('cloth')) {
      // keep the outfit's own pattern/shading from the atlas but pull it to a worn tone
      c.color.copy(cloth).multiplyScalar(1.5);
      c.roughness = Math.min(1, c.roughness + 0.15);
    } else if (name.includes('skin')) {
      c.color.multiplyScalar(0.82 + rnd() * 0.22);
    }
    if (darken !== 1) c.color.multiplyScalar(darken);
    (o as Mesh).material = c;
    owned.push(c);
  });
  return owned;
}

export class StreetLife {
  readonly group = new Group();
  private readonly actors: Actor[] = [];
  private readonly owned: Material[] = [];
  private seed: number;
  /** How many of the actors (in the order they were added: most important first) are live. */
  private active = Number.POSITIVE_INFINITY;

  constructor(
    private readonly budget: number,
    seed = 0x51ee7,
    private readonly style: NpcStyle = {},
  ) {
    this.seed = seed;
    this.group.userData.grit = 'crowd';
  }

  private rand(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  get count(): number {
    return this.actors.length;
  }

  /**
   * Keeps the first `share` (0..1) of the actors alive and hides the rest (adaptive quality): no rebuild,
   * the tail is neither drawn nor animated. A pair (fight, argument) is kept or dropped together.
   */
  setShare(share: number): void {
    const n = this.actors.length;
    let k = Math.max(0, Math.min(n, Math.ceil(n * Math.max(0, Math.min(1, share)))));
    while (k > 0 && k < n && this.actors[k - 1]!.partner === this.actors[k]) k++;
    this.active = k;
    for (let i = 0; i < n; i++) this.actors[i]!.root.visible = i < k;
  }

  /** Room for `n` more actors? */
  hasRoom(n = 1): boolean {
    return this.actors.length + n <= this.budget;
  }

  private spawn(
    kind: VignetteKind,
    role: 0 | 1,
    x: number,
    z: number,
    yaw: number,
    y = 0,
    bounds: WorldBounds | null = null,
  ): Actor | null {
    if (!this.hasRoom()) return null;
    const rig = RIGS[Math.floor(this.rand() * RIGS.length)]!;
    const rc = RiggedCharacter.create(rig, this.rand() * 5);
    if (!rc) return null;
    this.owned.push(...dress(rc.body, () => this.rand(), kind === 'worker', this.style.darken ?? 1));
    if (this.style.castShadow === false)
      rc.body.traverse((o) => {
        (o as Mesh).castShadow = false;
      });
    const root = new Group();
    root.add(rc.holder);
    // adults of varied build; background people a touch smaller than the cast (depth cue)
    const [lo, hi] = this.style.scale ?? [0.86, 0.98];
    root.scale.setScalar(lo + this.rand() * (hi - lo));
    root.position.set(x, y, z);
    root.rotation.y = yaw;
    this.group.add(root);
    const a: Actor = {
      rc,
      root,
      kind,
      role,
      baseX: x,
      baseZ: z,
      baseYaw: yaw,
      toX: x,
      toZ: z,
      next: this.rand() * 2.5,
      speed: 0.7 + this.rand() * 0.6,
      t: this.rand(),
      dir: this.rand() < 0.5 ? 1 : -1,
      partner: null,
      circle: 0,
      retreatUntil: 0,
      bounds,
      react: null,
      offX: 0,
      offZ: 0,
      baseScaleY: root.scale.y,
      holdX: x,
      holdZ: z,
    };
    this.actors.push(a);
    return a;
  }

  /** Adds a scene. Returns false when the quality budget is exhausted. */
  add(v: Vignette): boolean {
    const y = v.y ?? 0;
    if (v.kind === 'fight' || v.kind === 'argue' || v.kind === 'seller') {
      if (!this.hasRoom(2)) return false;
      const gap = v.kind === 'fight' ? 0.42 : 0.5;
      const dx = Math.sin(v.yaw) * gap;
      const dz = Math.cos(v.yaw) * gap;
      const a = this.spawn(v.kind, 0, v.x - dx, v.z - dz, v.yaw, y, v.bounds);
      const b = this.spawn(
        v.kind === 'seller' ? 'seller' : v.kind,
        1,
        v.x + dx,
        v.z + dz,
        v.yaw + Math.PI,
        y,
        v.bounds,
      );
      if (a && b) {
        a.partner = b;
        b.partner = a;
      }
      return true;
    }
    const a = this.spawn(v.kind, 0, v.x, v.z, v.yaw, y, v.bounds);
    if (!a) return false;
    if (v.toX !== undefined && v.toZ !== undefined) {
      a.toX = v.toX;
      a.toZ = v.toZ;
    }
    return true;
  }

  update(dt: number, time: number, excitement: number, visible?: (x: number, z: number) => boolean): void {
    for (let i = 0, n = Math.min(this.active, this.actors.length); i < n; i++) {
      const a = this.actors[i]!;
      // follow camera: people out of view are neither drawn nor animated (their clip resumes where it stopped)
      if (visible) {
        const seen = visible(a.root.position.x, a.root.position.z);
        a.root.visible = seen;
        if (!seen) continue;
      }
      if (a.react || a.offX !== 0 || a.offZ !== 0) {
        this.bystander(a, dt, time); // reacting, or walking back to the scene: the script waits
      } else {
        this.think(a, time, excitement);
        this.move(a, dt, time);
      }
      a.rc.update(dt);
    }
  }

  /**
   * Makes the actors whose home lies inside `rect` (world metres) react to something that happened at
   * `from`: each one answers with probability `chance`. Returns how many reacted. Fighters and arguers
   * (the arena sets' scripted pairs) are left alone.
   */
  reactInRect(
    rect: WorldBounds,
    reaction: BystanderReaction,
    time: number,
    seconds: number,
    from: { x: number; z: number },
    chance: number,
    distance = 0.9,
  ): number {
    let n = 0;
    for (const a of this.actors) {
      if (a.kind === 'fight' || a.kind === 'argue') continue;
      if (a.baseX < rect.x0 || a.baseX > rect.x1 || a.baseZ < rect.z0 || a.baseZ > rect.z1) continue;
      if (this.rand() >= chance) continue;
      if (a.react && a.react.until > time + seconds) continue; // already reacting for longer
      if (!a.react && a.offX === 0 && a.offZ === 0) {
        a.holdX = a.root.position.x;
        a.holdZ = a.root.position.z;
      }
      const dx = a.holdX - from.x;
      const dz = a.holdZ - from.z;
      const len = Math.hypot(dx, dz) || 1;
      let ox = reaction === 'scatter' ? (dx / len) * distance : 0;
      let oz = reaction === 'scatter' ? (dz / len) * distance : 0;
      const b = a.bounds ?? rect;
      // never leave the protected zone
      ox = MathUtils.clamp(a.holdX + ox, b.x0 + 0.2, b.x1 - 0.2) - a.holdX;
      oz = MathUtils.clamp(a.holdZ + oz, b.z0 + 0.2, b.z1 - 0.2) - a.holdZ;
      a.react = {
        kind: reaction,
        until: time + seconds,
        ox,
        oz,
        lookYaw: Math.atan2(from.x - a.holdX, from.z - a.holdZ),
      };
      switch (reaction) {
        case 'duck':
          a.rc.setLoop('Dazed', 0.1, 0.6);
          break;
        case 'flinch':
          this.once(a, 'Stumble', 1.5);
          break;
        case 'cheer':
          this.once(a, 'Cheer', 1.2);
          break;
        case 'scatter':
          a.rc.setLoop('Run', 0.1, 0.9);
          break;
        case 'look':
          a.rc.setLoop('Idle', 0.2);
          break;
      }
      n++;
    }
    return n;
  }

  /** Current position of every actor (world metres): tests check they stay inside their zones. */
  positions(): { x: number; z: number; bounds: WorldBounds | null }[] {
    return this.actors.map((a) => ({ x: a.root.position.x, z: a.root.position.z, bounds: a.bounds }));
  }

  /** One frame of a bystander reaction: ease the drawn offset out, hold it, and ease back home. */
  private bystander(a: Actor, dt: number, time: number): void {
    const r = a.react;
    const k = Math.min(1, dt * (r ? 7 : 3));
    a.offX += ((r ? r.ox : 0) - a.offX) * k;
    a.offZ += ((r ? r.oz : 0) - a.offZ) * k;
    if (!r) {
      // walking home
      a.root.scale.y += (a.baseScaleY - a.root.scale.y) * Math.min(1, dt * 8);
      if (Math.hypot(a.offX, a.offZ) < 0.03) {
        a.offX = a.offZ = 0;
        a.root.scale.y = a.baseScaleY;
        this.applyOffset(a);
        a.rc.setLoop('Idle', 0.2);
      } else {
        a.rc.setLoop('Run', 0.15, 0.7);
        this.applyOffset(a);
        a.root.rotation.y = MathUtils.lerp(
          a.root.rotation.y,
          Math.atan2(-a.offX, -a.offZ),
          Math.min(1, dt * 8),
        );
      }
      return;
    }
    if (time >= r.until) {
      a.react = null;
      return;
    }
    this.applyOffset(a);
    const left = r.until - time;
    switch (r.kind) {
      case 'duck':
        a.root.scale.y += (a.baseScaleY * 0.74 - a.root.scale.y) * Math.min(1, dt * 12);
        break;
      case 'scatter':
        a.root.rotation.y = MathUtils.lerp(a.root.rotation.y, Math.atan2(r.ox, r.oz), Math.min(1, dt * 10));
        if (left < 0.5) a.rc.setLoop('Idle', 0.2);
        break;
      case 'look':
        a.root.rotation.y = MathUtils.lerp(a.root.rotation.y, r.lookYaw, Math.min(1, dt * 6));
        break;
      default:
        break;
    }
  }

  /** The drawn position while reacting: where the actor stood plus the reaction offset. */
  private applyOffset(a: Actor): void {
    a.root.position.x = a.holdX + a.offX;
    a.root.position.z = a.holdZ + a.offZ;
  }

  private once(a: Actor, clip: ClipName, speed = 1): void {
    a.rc.playOnce(clip, 0.08, speed);
  }

  /** Decides the next beat of an actor's scene when its timer runs out. */
  private think(a: Actor, time: number, excitement: number): void {
    if (time < a.next) return;
    const r = this.rand();
    const wait = (lo: number, hi: number): number => (a.next = time + lo + this.rand() * (hi - lo));
    switch (a.kind) {
      case 'fight': {
        a.rc.setLoop('Idle', 0.2, 1.4); // a fighter's bouncing guard
        if (time < a.retreatUntil) {
          wait(0.4, 0.8);
          break;
        }
        if (r < 0.36) {
          this.once(a, 'Push', 1.1 + this.rand() * 0.3);
          const p = a.partner;
          if (p && this.rand() < 0.75) {
            p.next = time + 0.35;
            p.rc.playOnce(this.rand() < 0.5 ? 'Stumble' : 'Dazed', 0.06, 1.2);
          }
          wait(1.0, 2.0);
        } else if (r < 0.58) {
          this.once(a, 'Kick', 1.15);
          wait(1.0, 1.8);
        } else if (r < 0.68) {
          // back off a few steps, then square up again
          a.retreatUntil = time + 1.2 + this.rand();
          wait(0.2, 0.4);
        } else {
          wait(0.5, 1.3);
        }
        break;
      }
      case 'argue': {
        a.rc.setLoop('Idle', 0.25, 1.1);
        if (r < 0.32)
          this.once(a, 'Throw', 0.8); // a big dismissive arm swing
        else if (r < 0.48) this.once(a, 'Push', 0.9);
        else if (r < 0.6) this.once(a, 'Cheer', 1.3); // both hands up: "see this man!"
        wait(1.2, 3.2);
        break;
      }
      case 'conductor': {
        if (r < 0.45) {
          a.rc.setLoop('Idle', 0.2);
          this.once(a, r < 0.25 ? 'Cheer' : 'Throw', 0.9); // waving passengers in, calling the route
          wait(1.5, 3.5);
        } else {
          a.dir = a.dir === 1 ? -1 : 1; // pace along the bus
          wait(2.0, 4.0);
        }
        break;
      }
      case 'seller': {
        a.rc.setLoop('Idle', 0.3);
        if (a.role === 0 && r < 0.4) this.once(a, 'Place', 0.8);
        else if (a.role === 1 && r < 0.3)
          this.once(a, 'Push', 0.7); // haggling gesture
        else if (r < 0.45) this.once(a, 'Throw', 0.7);
        wait(2.0, 4.5);
        break;
      }
      case 'worker': {
        if (r < 0.4) {
          a.rc.setLoop('Idle', 0.2);
          this.once(a, 'Place', 0.75); // digging / laying
          wait(1.4, 2.6);
        } else if (r < 0.55) {
          this.once(a, 'Kick', 0.7); // stamping the shovel in
          wait(1.2, 2.0);
        } else {
          a.dir = a.dir === 1 ? -1 : 1;
          wait(3.0, 6.0);
        }
        break;
      }
      case 'onlooker': {
        a.rc.setLoop('Idle', 0.3);
        if (this.rand() < 0.08 + excitement * 0.7) this.once(a, 'Cheer', 1 + excitement * 0.4);
        wait(1.0, 3.0);
        break;
      }
      case 'walker':
        wait(5, 10);
        break;
    }
  }

  /** Positions an actor for this frame: walking paths, pacing, circling fighters. */
  private move(a: Actor, dt: number, time: number): void {
    const root = a.root;
    if (a.kind === 'walker' || a.kind === 'conductor' || a.kind === 'worker') {
      const len = Math.hypot(a.toX - a.baseX, a.toZ - a.baseZ);
      if (len < 0.01) return;
      const pacing = a.kind !== 'walker';
      // conductors and workers stop between pacing legs; walkers keep going
      const stand = pacing && time < a.next - 1.6;
      if (stand) {
        a.rc.setLoop(a.kind === 'worker' ? 'IdleCarry' : 'Idle', 0.25);
        return;
      }
      const v = (a.kind === 'walker' ? 1.05 : 0.8) * a.speed;
      a.t += (a.dir * v * dt) / len;
      if (a.t >= 1 || a.t <= 0) {
        a.t = MathUtils.clamp(a.t, 0, 1);
        a.dir = a.t >= 1 ? -1 : 1;
      }
      const x = a.baseX + (a.toX - a.baseX) * a.t;
      const z = a.baseZ + (a.toZ - a.baseZ) * a.t;
      root.position.x = x;
      root.position.z = z;
      const yaw = Math.atan2((a.toX - a.baseX) * a.dir, (a.toZ - a.baseZ) * a.dir);
      root.rotation.y = MathUtils.lerp(root.rotation.y, yaw, Math.min(1, dt * 8));
      // the run clip slowed down reads as a brisk walk
      a.rc.setLoop(a.kind === 'worker' ? 'RunCarry' : 'Run', 0.2, 0.55 * a.speed);
      return;
    }
    if (a.kind === 'fight' && a.partner) {
      // the pair slowly circles its centre; a retreating fighter backs away along the axis
      const cx = (a.baseX + a.partner.baseX) / 2;
      const cz = (a.baseZ + a.partner.baseZ) / 2;
      a.circle += dt * 0.35 * (a.role === 0 ? 1 : 1);
      const angle = a.baseYaw + Math.sin(time * 0.3 + a.circle) * 0.9;
      const back = time < a.retreatUntil ? 0.55 : 0;
      const gap = 0.42 + back;
      const s = a.role === 0 ? -1 : 1;
      const x = cx + Math.sin(angle) * gap * s;
      const z = cz + Math.cos(angle) * gap * s;
      root.position.x += (x - root.position.x) * Math.min(1, dt * 4);
      root.position.z += (z - root.position.z) * Math.min(1, dt * 4);
      root.rotation.y = Math.atan2(cx - root.position.x, cz - root.position.z);
    }
  }

  dispose(): void {
    for (const m of this.owned) m.dispose();
    this.actors.length = 0;
  }
}
