import type { BufferGeometry } from 'three';
import {
  AdditiveBlending,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  SphereGeometry,
} from 'three';
import { missionView } from '../../sim';
import type { MissionNodeView, MissionView } from '../../sim';
import { ringTexture, tileGlowTexture } from '../textures';
import { buildIcon, iconFor } from './missionIcons';
import type { IconKind } from './missionIcons';
import {
  ARC_STEPS,
  MARKER_COLORS,
  ROLE_COLORS,
  arcStep,
  bossLook,
  nodeLook,
  warningKey,
  warningLook,
} from './missionStyle';
import {
  beamTexture,
  disposeMissionTextures,
  frameTexture,
  hatchTexture,
  haloTexture,
  padTexture,
  tickTexture,
  zoneTexture,
} from './missionTextures';
import { playerGridPos } from './motion';
import { TileOverlay } from './TileOverlay';
import type { FrameContext, View } from './types';

/** Pad (dark disc with a bright rim) side in tiles: its rim is about one tile wide around the node. */
const PAD_SIZE = 2.2;
const BEAM_HEIGHT = 3;
/** The icons are drawn about a tile wide and a tile and a half tall, so they read from the follow camera. */
const ICON_SCALE = 1.4;

interface NodeMarker {
  group: Group;
  pad: Mesh;
  arc: Mesh;
  icon: Mesh;
  beam: Mesh;
  tick: Mesh;
  padMat: MeshBasicMaterial;
  arcMat: MeshBasicMaterial;
  iconMat: MeshStandardMaterial;
  beamMat: MeshBasicMaterial;
  tickMat: MeshBasicMaterial;
  kind: IconKind;
  zone: boolean;
}

interface BossMarker {
  group: Group;
  ring: Mesh;
  halo: Mesh;
  bubble: Mesh;
  arc: Mesh;
  beam: Mesh;
  ringMat: MeshBasicMaterial;
  haloMat: MeshBasicMaterial;
  bubbleMat: MeshBasicMaterial;
  arcMat: MeshBasicMaterial;
  beamMat: MeshBasicMaterial;
}

const additive = (map: MeshBasicMaterial['map']): MeshBasicMaterial =>
  new MeshBasicMaterial({
    map,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });

/**
 * Campaign mission markers in the world (docs/MISSION_PRESENTATION.md): a pad, icon, beam and progress ring on every
 * objective node (gold = do this, green = done, grey = not yet), a hatched countdown on every tile a telegraphed strike,
 * convoy or rail lane will burn (red) / a railcar will cross (amber) / a reinforcement arrives on (blue), a ring and
 * bubble on the boss (blue = shielded, flashing red and gold with a countdown arc = exposed) and a small role-coloured
 * ring under each crew fighter. No text. A no-op without `state.mission`: the group stays hidden and nothing is built.
 * It only READS the state (through `missionView`); the sim's flames are drawn by FlameViews as ever.
 */
export class MissionViews implements View {
  readonly group = new Group();
  private readonly nodes = new Map<string, NodeMarker>();
  private boss: BossMarker | null = null;
  private defeatedAt: number | null = null;
  private readonly seen = new Map<string, number>();
  private readonly arcs: (BufferGeometry | null)[] = new Array<BufferGeometry | null>(ARC_STEPS + 1).fill(
    null,
  );
  private readonly icons = new Map<IconKind, BufferGeometry>();
  private readonly plane = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private readonly sphere = new SphereGeometry(0.85, 18, 12);
  private readonly beamGeo = new CylinderGeometry(0.14, 0.2, BEAM_HEIGHT, 14, 1, true);
  private readonly warnGlow = new TileOverlay(tileGlowTexture(), 256, 10, 0.05);
  private readonly warnHatch = new TileOverlay(hatchTexture(), 256, 11, 0.055, false);
  private readonly warnEdge = new TileOverlay(frameTexture(), 256, 12, 0.06);
  private readonly pips = new TileOverlay(ringTexture(), 16, 6, 0.035);

  constructor() {
    this.group.visible = false;
    this.group.add(this.warnGlow.mesh, this.warnHatch.mesh, this.warnEdge.mesh, this.pips.mesh);
  }

  /** Debug / performance report: draw nothing (the update still runs) so a frame can be measured with and without. */
  private hidden = false;
  private updateMs = 0;
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    if (hidden) this.group.visible = false;
  }

  /** What is on the board right now (tests / the debug handle); `updateMs` is a running average of `update`. */
  stats(): { nodes: number; boss: boolean; visible: boolean; updateMs: number } {
    return {
      nodes: this.nodes.size,
      boss: this.boss !== null,
      visible: this.group.visible,
      updateMs: Math.round(this.updateMs * 1000) / 1000,
    };
  }

  update(ctx: FrameContext): void {
    const state = ctx.state;
    if (!state.mission) {
      if (this.group.visible) this.group.visible = false;
      return;
    }
    const t0 = performance.now();
    const view = missionView(state);
    if (!view) return;
    this.group.visible = !this.hidden;
    this.updateNodes(ctx, view);
    this.updateWarnings(ctx, view);
    this.updateBoss(ctx, view);
    this.updatePips(ctx, view);
    this.updateMs += (performance.now() - t0 - this.updateMs) * 0.1;
  }

  // ------------------------------------------------------------------------------------------- nodes

  private arcGeometry(step: number): BufferGeometry {
    let g = this.arcs[step];
    if (!g) {
      const f = step / ARC_STEPS;
      g = new RingGeometry(0.78, 1, Math.max(2, step), 1, Math.PI / 2 - f * Math.PI * 2, f * Math.PI * 2);
      g.rotateX(-Math.PI / 2);
      this.arcs[step] = g;
    }
    return g;
  }

  private iconGeometry(kind: IconKind): BufferGeometry {
    let g = this.icons.get(kind);
    if (!g) {
      g = buildIcon(kind);
      this.icons.set(kind, g);
    }
    return g;
  }

  private createNode(kind: IconKind, zone: boolean): NodeMarker {
    const padMat = new MeshBasicMaterial({
      map: zone ? zoneTexture() : padTexture(),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const arcMat = new MeshBasicMaterial({
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      side: DoubleSide,
    });
    const iconMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.15 });
    const beamMat = additive(beamTexture());
    const tickMat = new MeshBasicMaterial({ map: tickTexture(), transparent: true, depthWrite: false });
    const pad = new Mesh(this.plane, padMat);
    pad.renderOrder = 4;
    const arc = new Mesh(this.arcGeometry(1), arcMat);
    arc.renderOrder = 5;
    arc.position.y = 0.045;
    const icon = new Mesh(this.iconGeometry(kind), iconMat);
    icon.castShadow = true;
    const beam = new Mesh(this.beamGeo, beamMat);
    beam.position.y = BEAM_HEIGHT / 2 + 0.05;
    beam.renderOrder = 13;
    const tick = new Mesh(this.plane, tickMat);
    tick.position.y = 0.05;
    tick.scale.setScalar(0.9);
    tick.renderOrder = 6;
    pad.position.y = 0.03;
    const group = new Group();
    group.add(pad, arc, tick, icon, beam);
    this.group.add(group);
    return { group, pad, arc, icon, beam, tick, padMat, arcMat, iconMat, beamMat, tickMat, kind, zone };
  }

  private disposeNode(n: NodeMarker): void {
    this.group.remove(n.group);
    n.padMat.dispose();
    n.arcMat.dispose();
    n.iconMat.dispose();
    n.beamMat.dispose();
    n.tickMat.dispose();
  }

  private updateNodes(ctx: FrameContext, view: MissionView): void {
    const { layout, time } = ctx;
    const live = new Set<string>();
    for (const nv of view.nodes) {
      live.add(nv.id);
      this.placeNode(ctx, view, nv, time, layout);
    }
    for (const [id, n] of this.nodes) {
      if (live.has(id)) continue;
      this.disposeNode(n);
      this.nodes.delete(id);
    }
  }

  private placeNode(
    ctx: FrameContext,
    view: MissionView,
    nv: MissionNodeView,
    time: number,
    layout: FrameContext['layout'],
  ): void {
    const kind = iconFor(view.objective, nv.id);
    const radius = ctx.state.mission?.nodes.find((n) => n.id === nv.id)?.radius ?? 0;
    const zone = radius > 0;
    let n = this.nodes.get(nv.id);
    if (n && (n.kind !== kind || n.zone !== zone)) {
      this.disposeNode(n);
      n = undefined;
    }
    if (!n) {
      n = this.createNode(kind, zone);
      this.nodes.set(nv.id, n);
    }
    const x = layout.wx(nv.x);
    const z = layout.wz(nv.y);
    n.group.position.set(x, 0, z);
    n.group.visible = ctx.inView ? ctx.inView(x, z, 3 + radius) : true;
    if (!n.group.visible) return;
    const look = nodeLook(nv.state, nv.fraction, time);
    const side = zone ? radius * 2 + 1 : PAD_SIZE;
    n.pad.scale.setScalar(side);
    n.padMat.color.setHex(look.color);
    n.padMat.opacity = look.pad;
    // the progress ring sits just outside the pad's rim (a square zone: just outside its edge)
    const step = arcStep(look.arc);
    n.arc.visible = step > 0;
    if (step > 0) {
      n.arc.geometry = this.arcGeometry(step);
      n.arc.scale.setScalar(zone ? side * 0.56 : PAD_SIZE * 0.5);
      n.arcMat.color.setHex(MARKER_COLORS.progress);
    }
    n.tick.visible = look.tick;
    n.tickMat.color.setHex(MARKER_COLORS.done);
    n.icon.scale.setScalar(look.scale * ICON_SCALE);
    n.iconMat.color.setHex(nv.state === 'locked' ? 0x6f7680 : 0xffffff);
    n.iconMat.emissive.setHex(look.color);
    n.iconMat.emissiveIntensity = look.glow * 0.22;
    n.beam.visible = look.beam > 0;
    n.beamMat.color.setHex(look.color);
    n.beamMat.opacity = look.beam;
  }

  // ---------------------------------------------------------------------------------------- warnings

  private updateWarnings(ctx: FrameContext, view: MissionView): void {
    const { layout, time, alpha, state } = ctx;
    this.warnGlow.begin();
    this.warnHatch.begin();
    this.warnEdge.begin();
    const keys = new Set<string>();
    for (const w of view.warnings) {
      const key = warningKey(w);
      keys.add(key);
      const remaining = Math.max(0, w.remainingTicks - alpha);
      const total = Math.max(this.seen.get(key) ?? 0, w.remainingTicks, 1);
      this.seen.set(key, total);
      const look = warningLook(w.kind, 1 - remaining / total, time);
      for (const idx of w.tiles) {
        const x = layout.wx(idx % state.width);
        const z = layout.wz(Math.floor(idx / state.width));
        this.warnGlow.push({ x, z, color: look.color, intensity: look.glow, scale: 0.97 });
        this.warnHatch.push({
          x,
          z,
          color: look.color,
          intensity: look.urgent ? 0.8 + 0.2 * Math.sin(time * 22) : 1,
          scale: look.hatchScale,
          rotY: 0,
        });
        this.warnEdge.push({ x, z, color: look.color, intensity: look.edge, scale: 1 });
      }
    }
    for (const k of this.seen.keys()) if (!keys.has(k)) this.seen.delete(k);
    this.warnGlow.end();
    this.warnHatch.end();
    this.warnEdge.end();
  }

  // ------------------------------------------------------------------------------------------- boss

  private createBoss(): BossMarker {
    const ringMat = additive(ringTexture());
    const haloMat = additive(haloTexture());
    const bubbleMat = new MeshBasicMaterial({
      color: MARKER_COLORS.bossShield,
      transparent: true,
      opacity: 0.3,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const arcMat = new MeshBasicMaterial({ transparent: true, depthWrite: false, side: DoubleSide });
    const beamMat = additive(beamTexture());
    const ring = new Mesh(this.plane, ringMat);
    ring.position.y = 0.05;
    ring.renderOrder = 14;
    const halo = new Mesh(this.plane, haloMat);
    halo.position.y = 0.045;
    halo.renderOrder = 13;
    const bubble = new Mesh(this.sphere, bubbleMat);
    bubble.position.y = 0.8;
    bubble.renderOrder = 30;
    const arc = new Mesh(this.arcGeometry(ARC_STEPS), arcMat);
    arc.position.y = 0.06;
    arc.renderOrder = 15;
    const beam = new Mesh(this.beamGeo, beamMat);
    beam.position.y = BEAM_HEIGHT / 2 + 0.05;
    beam.renderOrder = 16;
    const group = new Group();
    group.add(halo, ring, arc, bubble, beam);
    this.group.add(group);
    return { group, ring, halo, bubble, arc, beam, ringMat, haloMat, bubbleMat, arcMat, beamMat };
  }

  private updateBoss(ctx: FrameContext, view: MissionView): void {
    const p = ctx.state.players[view.boss.playerId];
    const defeated = view.boss.defeated;
    if (defeated && this.defeatedAt === null) this.defeatedAt = ctx.time;
    if (!defeated) this.defeatedAt = null;
    const since = this.defeatedAt === null ? 0 : ctx.time - this.defeatedAt;
    if (!p || (!p.alive && !defeated) || since > 1.6) {
      if (this.boss) this.boss.group.visible = false;
      return;
    }
    if (!this.boss) this.boss = this.createBoss();
    const b = this.boss;
    b.group.visible = true;
    const pos = playerGridPos(p, ctx.alpha);
    b.group.position.set(ctx.layout.wx(pos.x), 0, ctx.layout.wz(pos.y));
    const look = bossLook(view.boss, ctx.state.mission?.tuning.exposeTicks ?? 0, ctx.time, since);
    b.ring.scale.setScalar(look.radius * 2.1);
    b.ringMat.color.setHex(look.ringColor);
    b.ringMat.opacity = look.ring;
    const exposed = view.boss.exposed;
    b.halo.visible = exposed;
    b.halo.scale.setScalar(look.radius * 2.6 * (1 + 0.08 * Math.sin(ctx.time * 9)));
    b.haloMat.opacity = 0.4;
    b.haloMat.color.setHex(look.ringColor);
    b.bubble.visible = look.bubble > 0;
    b.bubbleMat.opacity = look.bubble;
    const step = arcStep(look.arc);
    b.arc.visible = step > 0;
    if (step > 0) {
      b.arc.geometry = this.arcGeometry(step);
      b.arc.scale.setScalar(look.radius * 1.25);
      b.arcMat.color.setHex(MARKER_COLORS.bossExposedAlt);
    }
    b.beam.visible = look.beam > 0;
    b.beamMat.color.setHex(look.ringColor);
    b.beamMat.opacity = look.beam;
  }

  // ------------------------------------------------------------------------------------- crew pips

  private updatePips(ctx: FrameContext, view: MissionView): void {
    const m = ctx.state.mission;
    this.pips.begin();
    if (m && view.outcome === null) {
      for (const seat of m.seats) {
        if (seat.role === 'player' || seat.role === 'boss') continue;
        const p = ctx.state.players[seat.playerId];
        if (!p?.alive) continue;
        const pos = playerGridPos(p, ctx.alpha);
        this.pips.push({
          x: ctx.layout.wx(pos.x),
          z: ctx.layout.wz(pos.y),
          color: ROLE_COLORS[seat.role],
          intensity: 0.85,
          scale: 0.8,
        });
      }
    }
    this.pips.end();
  }

  dispose(): void {
    for (const n of this.nodes.values()) this.disposeNode(n);
    this.nodes.clear();
    if (this.boss) {
      this.boss.ringMat.dispose();
      this.boss.haloMat.dispose();
      this.boss.bubbleMat.dispose();
      this.boss.arcMat.dispose();
      this.boss.beamMat.dispose();
    }
    for (const g of this.arcs) g?.dispose();
    for (const g of this.icons.values()) g.dispose();
    this.plane.dispose();
    this.sphere.dispose();
    this.beamGeo.dispose();
    for (const o of [this.warnGlow, this.warnHatch, this.warnEdge, this.pips]) o.dispose();
    disposeMissionTextures();
  }
}
