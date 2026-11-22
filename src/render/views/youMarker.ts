/**
 * The local player's identification marker (decision PI1, docs/PLAYER_MARKER.md): a small "YOU" tag over the head and,
 * in the experimental `indicatorGround` mode, a faint floor-contact tint. Render-only: it reads the frame's state and
 * the style from `playerMarker.ts`; the tag is drawn over bodies (no depth test, a render order above every sprite
 * of the figures), grows and brightens when rivals crowd the player and is hidden while the player is down.
 */
import { Mesh, MeshBasicMaterial, PlaneGeometry, Sprite, SpriteMaterial } from 'three';
import type { Group } from 'three';
import type { Player } from '../../sim';
import { groundMarkTexture, youTagTexture } from '../textures';
import type { PlayerMarkerMode } from '../playerMarker';
import { easeProminence, markerProminence, rivalProximity, tagOpacity, tagScale } from '../playerMarker';
import { playerGridPos } from './motion';

/** Above the name tags (31), stars and badges (33), the original chevron (32). */
export const YOU_RENDER_ORDER = 40;
/** Sprite size in tiles at prominence 0 (the plate is about 72% of the width). */
const TAG_W = 1.3;
const TAG_H = 0.65;
/** Height of the pointer's tip over the floor (a figure's head top is about 1.95), so the tag points at the head. */
const TIP_Y = 2.04;
/** The pointer tip sits this fraction of the sprite height below the sprite's centre (texture layout). */
const TIP_DROP = 0.3;

const flat = new PlaneGeometry(1, 1);

export class YouMarker {
  readonly tag: Sprite;
  readonly ground: Mesh;
  /** The eased prominence (0 = nobody near, 1 = crowded). */
  prominence = 0;

  constructor(parent: Group, color: number) {
    this.tag = new Sprite(
      new SpriteMaterial({
        map: youTagTexture(color),
        transparent: true,
        depthTest: false,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      }),
    );
    this.tag.scale.set(TAG_W, TAG_H, 1);
    this.tag.renderOrder = YOU_RENDER_ORDER;
    this.tag.visible = false;
    this.ground = new Mesh(
      flat,
      new MeshBasicMaterial({
        map: groundMarkTexture(),
        color,
        transparent: true,
        depthWrite: false,
        fog: false,
        opacity: 0.4,
      }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.scale.setScalar(1.32);
    this.ground.renderOrder = 3;
    this.ground.visible = false;
    parent.add(this.tag, this.ground);
  }

  /** Summed proximity of every living rival of `me` (tile offsets, interpolated like the figures). */
  static crowding(players: readonly Player[], me: Player, alpha: number): number {
    const a = playerGridPos(me, alpha);
    let sum = 0;
    for (const o of players) {
      if (o === me || !o.alive || o.spectator) continue;
      if (me.team >= 0 && o.team === me.team) continue;
      const b = playerGridPos(o, alpha);
      sum += rivalProximity(b.x - a.x, b.y - a.y);
    }
    return sum;
  }

  /** Placed at the player's world position (`x`, `z`), `lift` raising it over a mounted rider or a tall figure. */
  update(
    mode: PlayerMarkerMode,
    x: number,
    z: number,
    lift: number,
    crowding: number,
    dt: number,
    time: number,
    protect: boolean,
  ): void {
    if (mode === 'original') {
      this.hide();
      return;
    }
    this.prominence = easeProminence(this.prominence, markerProminence(crowding), dt);
    const p = this.prominence;
    const bob = Math.sin(time * 2.6) * 0.025;
    const s = tagScale(p);
    this.tag.visible = true;
    this.tag.scale.set(TAG_W * s, TAG_H * s, 1);
    // the pointer tip rests just over the head, whatever the size
    this.tag.position.set(x, TIP_Y + lift + TAG_H * s * TIP_DROP + bob, z);
    // a respawn-protected fighter blinks its body; the tag stays steady so the player still finds themselves
    (this.tag.material as SpriteMaterial).opacity = protect ? Math.max(tagOpacity(p), 0.85) : tagOpacity(p);
    const g = mode === 'indicatorGround';
    this.ground.visible = g;
    if (g) {
      this.ground.position.set(x, 0.025, z);
      (this.ground.material as MeshBasicMaterial).opacity = 0.34 + 0.2 * p;
    }
  }

  hide(): void {
    this.tag.visible = false;
    this.ground.visible = false;
  }
}
