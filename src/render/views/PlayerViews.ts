import {
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Sprite,
  SpriteMaterial,
  AdditiveBlending,
  MathUtils,
  Vector3,
} from 'three';
import type { Player, SimEvent } from '../../sim';
import { SLOT_COLORS } from '../../assets/palette';
import { drawPickupIcon } from '../../assets/pickupIcons';
import { OKADA_SCALE, createPlayerModel, createRiggedPlayerModel } from '../assets/characters';
import { assets } from '../assets/library';
import { createShieldBubble, updateShieldBubble } from './okadaShield';
import { addXray } from '../assets/xray';
import type { PlayerModel } from '../assets/characters';
import { CanvasTexture } from 'three';
import { chevronTexture, glowTexture, labelTexture, ringTexture, starTexture } from '../textures';
import type { ClipName } from '../assets/rigged';
import { lerpAngle, playerGridPos, toWorld, yawForDir } from './motion';
import type { FrameContext, View } from './types';

const DEATH_TIME = 1.7;
/** Characters are drawn tall and heroic so they read as active 3D characters, not board tokens. */
const SCALE = 1.85;
/** The seated Okada rider sits on the (enlarged) bike's seat: offsets in model metres. */
const RIDER_LIFT = -0.05;
const RIDER_BACK = -0.25;
/** Mount: the bike pops in under a hopping rider; dismount (shield spent): the rider hops clear. */
const MOUNT_TIME = 0.32;
const DISMOUNT_TIME = 0.42;

function easeOutBack(t: number): number {
  const c = 1.9;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}

interface Visual {
  model: PlayerModel;
  ring: Mesh;
  shadow: Mesh;
  name: Sprite;
  marker: Sprite | null;
  stars: Sprite[];
  curse: Sprite;
  voucher: Sprite;
  yaw: number;
  phase: number;
  deadAt: number | null;
  deathDir: Vector3;
  wasMounted: boolean;
  shield: Mesh;
  badge: Sprite;
  mountedAt: number;
  dismountedAt: number;
  dustAt: number;
  /** Last facing, so a sharp turn while running can kick up a puff of dust. */
  facing: Player['facing'];
}

const flat = new PlaneGeometry(1, 1);
let voucherTex: CanvasTexture | null = null;
let okadaTex: CanvasTexture | null = null;

export class PlayerViews implements View {
  readonly group = new Group();
  private readonly visuals = new Map<number, Visual>();

  /** Triggers one-shot animations from simulation events. */
  onEvents(events: readonly SimEvent[]): void {
    const play = (id: number, clip: ClipName): void => this.visuals.get(id)?.model.rigged?.playOnce(clip);
    for (const e of events) {
      if (e.type === 'generatorPlaced') play(e.ownerId, 'Place');
      else if (e.type === 'generatorThrown') play(e.playerId, 'Throw');
      else if (e.type === 'skillUsed') play(e.playerId, e.skill === 'daze' ? 'Kick' : 'Push');
      else if (e.type === 'playerPushed') play(e.playerId, 'Stumble');
      else if (e.type === 'matchEnded') {
        for (const [id, v] of this.visuals) {
          if (e.result.kind === 'win') v.model.rigged?.setLoop(id === e.result.winnerId ? 'Win' : 'Lose');
          else v.model.rigged?.setLoop('Lose');
        }
      }
    }
  }

  update(ctx: FrameContext): void {
    for (const p of ctx.state.players) {
      let v = this.visuals.get(p.id);
      if (!v) {
        v = this.create(p, ctx);
        this.visuals.set(p.id, v);
      }
      this.pose(ctx, p, v);
    }
  }

  private create(p: Player, ctx: FrameContext): Visual {
    const modelId = p.slot === 3 && assets.has('char_areaBoss') ? 'areaBoss' : p.characterId;
    const model = createRiggedPlayerModel(modelId, p.id * 0.37) ?? createPlayerModel(p.characterId);
    const slot = SLOT_COLORS[p.slot % SLOT_COLORS.length]!;
    if (model.rigged) addXray(model.rigged.body, slot);
    const ring = new Mesh(
      flat,
      new MeshBasicMaterial({
        map: ringTexture(),
        color: slot,
        transparent: true,
        depthWrite: false,
        opacity: 0.95,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.scale.setScalar(0.96);
    ring.renderOrder = 4;
    const shadow = new Mesh(
      flat,
      new MeshBasicMaterial({
        map: glowTexture(),
        color: 0x000000,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.setScalar(0.84);
    shadow.renderOrder = 3;
    const name = new Sprite(
      new SpriteMaterial({
        map: labelTexture(p.name, '#ffffff', 'bold 42px system-ui, sans-serif'),
        transparent: true,
        depthTest: false,
      }),
    );
    name.scale.set(1.22, 0.45, 1);
    name.renderOrder = 31;
    let marker: Sprite | null = null;
    if (p.id === ctx.info.localPlayerId) {
      marker = new Sprite(
        new SpriteMaterial({ map: chevronTexture(), color: slot, transparent: true, depthTest: false }),
      );
      marker.material.rotation = Math.PI;
      marker.scale.set(0.48, 0.48, 1);
      marker.renderOrder = 32;
      this.group.add(marker);
    }
    const stars = [0, 1, 2].map(() => {
      const s = new Sprite(new SpriteMaterial({ map: starTexture(), transparent: true, depthTest: false }));
      s.scale.set(0.2, 0.2, 1);
      s.renderOrder = 33;
      s.visible = false;
      this.group.add(s);
      return s;
    });
    const curse = new Sprite(
      new SpriteMaterial({
        map: glowTexture(),
        color: 0x9b30ff,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    curse.scale.set(1.3, 1.3, 1);
    curse.visible = false;
    voucherTex ??= new CanvasTexture(drawPickupIcon('voucher', 64));
    const voucher = new Sprite(new SpriteMaterial({ map: voucherTex, transparent: true, depthTest: false }));
    voucher.scale.set(0.38, 0.38, 1);
    voucher.renderOrder = 33;
    voucher.visible = false;
    const shield = createShieldBubble();
    okadaTex ??= new CanvasTexture(drawPickupIcon('okada', 64));
    const badge = new Sprite(new SpriteMaterial({ map: okadaTex, transparent: true, depthTest: false }));
    badge.scale.set(0.36, 0.36, 1);
    badge.renderOrder = 33;
    badge.visible = false;
    this.group.add(model.root, ring, shadow, name, curse, voucher, shield, badge);
    return {
      model,
      ring,
      shadow,
      name,
      marker,
      stars,
      curse,
      voucher,
      yaw: 0,
      phase: Math.random() * 6,
      deadAt: null,
      deathDir: new Vector3(0, 0, 1),
      wasMounted: false,
      shield,
      badge,
      mountedAt: -10,
      dismountedAt: -10,
      dustAt: 0,
      facing: p.facing,
    };
  }

  private pose(ctx: FrameContext, p: Player, v: Visual): void {
    const { state, time, alpha, layout, dt } = ctx;
    const pos = playerGridPos(p, alpha);
    const w = toWorld(layout, pos.x, pos.y);
    const m = v.model;

    if (!p.alive) {
      this.poseDead(ctx, p, v, w);
      return;
    }

    const face = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] }[p.facing];
    // a sharp turn while running plants the feet: a small scuff of dust sells the direction change
    if (p.facing !== v.facing && pos.moving && !p.mounted) ctx.fx.dust(pos.x, pos.y, 2, 0.32);
    v.facing = p.facing;
    v.yaw = lerpAngle(v.yaw, yawForDir(face[0]!, face[1]!), Math.min(1, dt * 16));
    m.root.position.set(w.x, 0, w.z);
    m.root.rotation.set(0, v.yaw, 0);
    m.root.scale.setScalar(m.rigged ? 1 : SCALE);
    m.root.visible = true;

    const moving = pos.moving && state.match.phase !== 'ended';
    const speed = moving ? 1 / Math.max(0.05, p.stepTotal / 60) : 0;
    v.phase += dt * (moving ? 7 + speed * 1.6 : 0);
    const swing = moving ? Math.sin(v.phase * 2) * 0.75 : Math.sin(time * 2 + p.id) * 0.03;
    const bob = moving ? Math.abs(Math.sin(v.phase * 2)) * 0.045 : Math.sin(time * 2.4 + p.id) * 0.012;
    m.bike.visible = p.mounted;
    // stamp mount/dismount before animating so the first mounted frame already starts the pop
    if (p.mounted && !v.wasMounted) v.mountedAt = time;
    if (!p.mounted && v.wasMounted) v.dismountedAt = time;
    if (m.rigged) this.animate(ctx, p, v, moving, speed);
    else this.poseProcedural(ctx, p, v, moving, swing, bob);
    this.decorate(ctx, p, v, w);
  }

  private animate(ctx: FrameContext, p: Player, v: Visual, moving: boolean, speed: number): void {
    const r = v.model.rigged!;
    const { state, dt } = ctx;
    const ended = state.match.phase === 'ended';
    const dazed = state.tick < p.dazedUntil;
    let clip: ClipName = 'Idle';
    if (p.mounted) clip = 'Ride';
    else if (dazed) clip = 'Dazed';
    else if (moving) clip = p.carrying ? 'RunCarry' : 'Run';
    else if (p.carrying) clip = 'IdleCarry';
    else if (state.match.phase === 'countdown') clip = 'Idle';
    if (!ended) r.setLoop(clip, 0.12, moving ? MathUtils.clamp(speed * 0.52, 0.8, 1.7) : 1);
    v.model.rig.position.y = 0;
    const tm = ctx.time - v.mountedAt;
    const td = ctx.time - v.dismountedAt;
    let hop = 0;
    if (p.mounted && tm < MOUNT_TIME) hop = Math.sin((Math.PI * tm) / MOUNT_TIME) * 0.32;
    else if (!p.mounted && td < DISMOUNT_TIME) hop = Math.sin((Math.PI * td) / DISMOUNT_TIME) * 0.42;
    r.body.position.y = (p.mounted ? RIDER_LIFT : 0) + hop;
    r.body.position.z = p.mounted ? RIDER_BACK * Math.min(1, tm / MOUNT_TIME) : 0;
    const bike = v.model.bike.children[0];
    if (bike && v.model.bikeWheels.length > 0)
      bike.scale.setScalar(OKADA_SCALE * (p.mounted ? 0.5 + 0.5 * easeOutBack(Math.min(1, tm / MOUNT_TIME)) : 1));
    if (p.mounted && moving) {
      for (const w of v.model.bikeWheels) w.rotation.x += dt * speed * 9;
      // kicked-up dust behind the bike sells the extra speed
      if (ctx.time > v.dustAt) {
        v.dustAt = ctx.time + 0.09;
        const pos = playerGridPos(p, ctx.alpha);
        const back = { right: [-1, 0], left: [1, 0], up: [0, 1], down: [0, -1] }[p.facing];
        ctx.fx.dust(pos.x + back[0]! * 0.45, pos.y + back[1]! * 0.45, 1, 0.42);
      }
    }
    r.update(dt);
  }

  private poseProcedural(
    ctx: FrameContext,
    p: Player,
    v: Visual,
    moving: boolean,
    swing: number,
    bob: number,
  ): void {
    const { time } = ctx;
    const m = v.model;
    const carrying = p.carrying !== null;
    const mounted = p.mounted;
    m.rig.position.y = mounted ? 0.2 + bob * 0.3 : bob;
    m.legL.rotation.x = mounted ? -1.15 : swing;
    m.legR.rotation.x = mounted ? -1.15 : -swing;
    m.armL.rotation.x = carrying ? -2.8 : mounted ? -1.2 : -swing * 0.8;
    m.armR.rotation.x = carrying ? -2.8 : mounted ? -1.2 : swing * 0.8;
    m.armL.rotation.z = carrying ? 0.15 : 0.04;
    m.armR.rotation.z = carrying ? -0.15 : -0.04;
    m.torso.rotation.x = moving ? 0.1 : 0;
    m.head.rotation.z = Math.sin(time * 1.7 + p.id) * 0.03;
  }

  private decorate(ctx: FrameContext, p: Player, v: Visual, w: Vector3): void {
    const { state, time, fx } = ctx;
    const mounted = p.mounted;

    // Okada breaks apart comically the moment protection is spent.
    if (v.wasMounted && !mounted) {
      fx.wreck(w.x, 0.4, w.z, [
        [0.83, 0.15, 0.17],
        [0.1, 0.1, 0.1],
        [0.8, 0.8, 0.82],
      ]);
      fx.shockwave(w.x, w.z, 1.6, 0xffd54a);
      v.dismountedAt = time;
    }
    if (!v.wasMounted && mounted) {
      v.mountedAt = time;
      fx.shockwave(w.x, w.z, 1.2, 0xffd54a);
    }
    v.wasMounted = mounted;
    const pop = Math.max(
      mounted ? 1 - (time - v.mountedAt) / 0.45 : 0,
      !mounted ? 1 - (time - v.dismountedAt) / 0.3 : 0,
    );
    v.shield.position.set(w.x, 0.88, w.z);
    v.shield.rotation.y = v.yaw;
    v.shield.scale.set(0.92, 1.08, 1.1).multiplyScalar(1 + (mounted ? 0 : (1 - pop) * 0.6));
    updateShieldBubble(v.shield, mounted, time, Math.max(0, pop));
    v.badge.visible = mounted;
    if (mounted) v.badge.position.set(w.x - 0.78, 2.08 + Math.sin(time * 4) * 0.03, w.z);

    v.ring.position.set(w.x, 0.03, w.z);
    (v.ring.material as MeshBasicMaterial).opacity =
      state.match.phase === 'countdown' ? 0.55 + 0.4 * Math.sin(time * 6) : 0.98;
    v.shadow.position.set(w.x, 0.02, w.z);
    v.name.position.set(w.x, 2.12, w.z);
    v.name.visible = true;
    if (v.marker) {
      v.marker.position.set(w.x, 2.52 + Math.sin(time * 5) * 0.08, w.z);
      v.marker.visible = true;
    }
    const dazed = state.tick < p.dazedUntil;
    v.stars.forEach((s, i) => {
      s.visible = dazed;
      if (dazed) {
        const a = time * 6 + (i * Math.PI * 2) / 3;
        s.position.set(w.x + Math.cos(a) * 0.32, 1.85 + (mounted ? 0.28 : 0), w.z + Math.sin(a) * 0.34);
      }
    });
    const cursed = p.curse !== null && state.tick < p.curse.until;
    v.curse.visible = cursed;
    if (cursed) {
      v.curse.position.set(w.x, 0.6, w.z);
      v.curse.material.opacity = 0.45 + 0.3 * Math.sin(time * 9);
    }
    const entering = p.entryUntil !== null;
    v.voucher.visible = entering;
    if (entering) {
      v.voucher.position.set(w.x, 2.48 + Math.sin(time * 8) * 0.06, w.z);
      v.ring.scale.setScalar(0.96 + 0.14 * Math.sin(time * 10));
    } else v.ring.scale.setScalar(0.96);
  }

  private poseDead(ctx: FrameContext, p: Player, v: Visual, base: Vector3): void {
    const { time, fx } = ctx;
    const m = v.model;
    const sc = m.rigged ? 1 : SCALE;
    v.ring.visible = false;
    v.name.visible = false;
    if (v.marker) v.marker.visible = false;
    v.curse.visible = false;
    v.voucher.visible = false;
    v.badge.visible = false;
    v.shield.visible = false;
    m.bike.visible = false;

    if (v.deadAt === null) {
      v.deadAt = time;
      const cause = p.elimination?.kind ?? 'flame';
      v.deathDir.set(((p.id * 37) % 7) / 7 - 0.43, 0, (((p.id * 53) % 5) / 5 - 0.5) * 1.4);
      if (cause === 'vehicle') {
        const veh = ctx.state.vehicles.find(
          (o) => p.elimination?.kind === 'vehicle' && o.eventId === p.elimination.eventId,
        );
        const cur = veh?.route[Math.max(0, veh.index)];
        const prev = veh ? veh.route[Math.max(0, veh.index - 1)] : null;
        if (cur && prev && (cur.x !== prev.x || cur.y !== prev.y))
          v.deathDir.set(cur.x - prev.x, 0, cur.y - prev.y).multiplyScalar(2.6);
      }
      fx.comicPuff(p.x, p.y);
      fx.shoes(p.x, p.y, 0xffffff);
    }
    const t = time - v.deadAt;
    const cause = p.elimination?.kind ?? 'flame';
    if (t > DEATH_TIME) {
      m.root.visible = false;
      v.shadow.visible = false;
      for (const s of v.stars) s.visible = false;
      return;
    }
    v.shadow.visible = true;
    m.root.visible = true;
    const k = t / DEATH_TIME;
    if (cause === 'crush' || cause === 'crowd') {
      // Comically squashed flat.
      m.root.position.set(base.x, 0, base.z);
      m.root.scale.set(
        sc * (1 + Math.min(1, t * 5) * 0.5),
        Math.max(0.12, 1 - t * 6) * sc,
        sc * (1 + Math.min(1, t * 5) * 0.5),
      );
      m.root.rotation.set(0, v.yaw, 0);
    } else {
      const air = 0.62;
      const h = t < air ? 3.4 * t * (1 - t / air) * 2 : 0;
      const slide = Math.min(t, 1.1);
      m.root.position.set(base.x + v.deathDir.x * slide * 1.4, h, base.z + v.deathDir.z * slide * 1.4);
      if (m.rigged)
        m.root.rotation.set(0, v.yaw, 0); // the clip does the tumbling
      else
        m.root.rotation.set(
          cause === 'vehicle' ? t * 9 : Math.min(t * 6, Math.PI / 2),
          v.yaw + t * (cause === 'vehicle' ? 0 : 8) * (t < air ? 1 : 0),
          cause === 'vehicle' ? t * 5 : 0,
        );
      m.root.scale.setScalar(sc * (k > 0.75 ? Math.max(0, 1 - (k - 0.75) * 4) : 1));
    }
    v.shadow.position.set(
      base.x + v.deathDir.x * Math.min(t, 1.1) * 1.4,
      0.02,
      base.z + v.deathDir.z * Math.min(t, 1.1) * 1.4,
    );
    v.stars.forEach((s, i) => {
      s.visible = t > 0.5 && t < DEATH_TIME;
      const a = time * 5 + (i * Math.PI * 2) / 3;
      s.position.set(
        m.root.position.x + Math.cos(a) * 0.3,
        0.5 + Math.sin(time * 3) * 0.05,
        m.root.position.z + Math.sin(a) * 0.3,
      );
    });
    if (m.rigged) {
      m.rigged.playFinal(cause === 'vehicle' ? 'DieVehicle' : 'DieBlast', 1.4);
      m.rigged.update(ctx.dt);
    } else {
      m.legL.rotation.x = Math.sin(time * 30) * 0.6;
      m.legR.rotation.x = -Math.sin(time * 30) * 0.6;
    }
  }

  dispose(): void {
    this.visuals.clear();
  }
}
