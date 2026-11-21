/**
 * The objective pins in the world (docs/MISSION_GUIDANCE.md, decision MG4): a small map pin floating above each live
 * target of the current objective, wearing the same glyph as the briefing and the HUD rail (a crate with a target cross
 * over marked cargo, a cabinet with a bolt over equipment, a door, an exit arrow, a floor switch). The SHAPE says what it
 * is; the colour only repeats it (gold = destroy, cyan = door, green = exit). Drawn over walls and roofs (no depth test)
 * so a target behind a wall is still found, small (about half a tile) and above the object, never on the floor where the
 * danger tiles are. A pin fades when the fighter is next to its target so it never hides the fighter. When a target goes
 * the pin pops (grows and fades) for a beat: the success feedback in the world (decision MG7).
 *
 * Positions come from `objectivePins(state)` (pure); one Sprite per pin (at most a dozen), one cached texture per glyph and
 * tone. A match without a field mission or a raid builds nothing (`hasObjectivePins`).
 */
import { CanvasTexture, Group, SRGBColorSpace, Sprite, SpriteMaterial } from 'three';
import type { GameState } from '../../sim';
import { GLYPHS } from '../objectiveGlyphs';
import type { GlyphId } from '../objectiveGlyphs';
import { objectivePins } from './objectivePins';
import type { ObjectivePin, PinTone } from './objectivePins';
import type { FrameContext, View } from './types';

const TONE_COLOR: Readonly<Record<PinTone, string>> = {
  target: '#ffd23a',
  door: '#6fd3ff',
  area: '#ffd23a',
  exit: '#4dff88',
  switch: '#f4ecdc',
};

/** World size of a pin (tiles); a switch pin is smaller. */
const PIN_SIZE = 0.62;
const SMALL_SIZE = 0.42;
/** A gone target's pin pops for this long (seconds). */
const POP_SECONDS = 0.45;

export const hasObjectivePins = (state: GameState): boolean => !!state.raid || !!state.mission?.field;

/** A pin texture: a rounded marker with a point at the bottom, a dark outline and the glyph inside. */
function pinTexture(glyph: GlyphId, tone: PinTone): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 160;
  const g = c.getContext('2d');
  if (g) {
    // the marker: a circle (centre 64,62, radius 52) running into a point at the bottom
    g.beginPath();
    g.moveTo(64, 154);
    g.lineTo(24, 98);
    g.arc(64, 62, 52, Math.PI * 0.79, Math.PI * 0.21);
    g.closePath();
    g.fillStyle = TONE_COLOR[tone];
    g.strokeStyle = '#0a0c10';
    g.lineWidth = 8;
    g.fill();
    g.stroke();
    // the glyph, dark on the tone, in the circle
    g.save();
    g.translate(64 - 36, 62 - 36);
    g.scale(3, 3);
    g.strokeStyle = '#0a0c10';
    g.fillStyle = '#0a0c10';
    g.lineWidth = 2.4;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const p of GLYPHS[glyph].parts) {
      if (typeof Path2D === 'undefined') break;
      const path = new Path2D(p.d);
      if (p.fill) g.fill(path);
      else g.stroke(path);
    }
    g.restore();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

interface Pin {
  sprite: Sprite;
  material: SpriteMaterial;
  data: ObjectivePin;
  /** Time the target went (the pop), null while it stands. */
  goneAt: number | null;
}

export interface ObjectiveMarkerStats {
  /** Pins standing now, by glyph. */
  pins: number;
  byGlyph: Partial<Record<GlyphId, number>>;
}

export class ObjectiveMarkers implements View {
  readonly group = new Group();
  private readonly textures = new Map<string, CanvasTexture>();
  private readonly pins = new Map<string, Pin>();
  private last: ObjectiveMarkerStats = { pins: 0, byGlyph: {} };

  constructor() {
    this.group.name = 'objectiveMarkers';
  }

  private texture(glyph: GlyphId, tone: PinTone): CanvasTexture {
    const key = `${glyph}:${tone}`;
    let t = this.textures.get(key);
    if (!t) {
      t = pinTexture(glyph, tone);
      this.textures.set(key, t);
    }
    return t;
  }

  private create(p: ObjectivePin): Pin {
    const material = new SpriteMaterial({
      map: this.texture(p.glyph, p.tone),
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const sprite = new Sprite(material);
    sprite.center.set(0.5, 0); // the point of the pin is its anchor
    sprite.renderOrder = 30;
    sprite.name = `pin:${p.key}`;
    this.group.add(sprite);
    return { sprite, material, data: p, goneAt: null };
  }

  update(ctx: FrameContext): void {
    const { state, layout, time } = ctx;
    const live = objectivePins(state);
    const seen = new Set<string>();
    const me = state.players[0];
    const byGlyph: Partial<Record<GlyphId, number>> = {};
    for (const p of live) {
      seen.add(p.key);
      let pin = this.pins.get(p.key);
      if (!pin) {
        pin = this.create(p);
        this.pins.set(p.key, pin);
      }
      pin.data = p;
      pin.goneAt = null;
      byGlyph[p.glyph] = (byGlyph[p.glyph] ?? 0) + 1;
      const size = p.small ? SMALL_SIZE : PIN_SIZE;
      const bob = 0.07 * Math.sin(time * 3 + p.x * 0.7 + p.y * 0.3);
      pin.sprite.position.set(layout.wx(p.x), p.height + bob, layout.wz(p.y));
      pin.sprite.scale.set(size, size * 1.25, 1);
      // never hide the fighter: next to the target the pin goes faint
      const near = !!me?.alive && Math.max(Math.abs(me.x - p.x), Math.abs(me.y - p.y)) <= 1;
      // a night raid: a pin over a dark target is fainter (still found: it is guidance), full once light reaches it (NL7)
      const dark = ctx.night ? 0.55 + 0.45 * Math.min(1, 2 * ctx.night.level(p.x, p.y)) : 1;
      pin.material.opacity = near ? 0.35 : dark;
      pin.sprite.visible = true;
    }
    for (const [key, pin] of this.pins) {
      if (seen.has(key)) continue;
      // the target went (wrecked, destroyed, stepped on, the leg moved on): a short pop, then the pin is gone
      pin.goneAt ??= time;
      const k = (time - pin.goneAt) / POP_SECONDS;
      if (k >= 1) {
        this.group.remove(pin.sprite);
        pin.material.dispose();
        this.pins.delete(key);
        continue;
      }
      const size = (pin.data.small ? SMALL_SIZE : PIN_SIZE) * (1 + 0.8 * k);
      pin.sprite.scale.set(size, size * 1.25, 1);
      pin.sprite.position.y = pin.data.height + 0.4 * k;
      pin.material.opacity = 1 - k;
    }
    this.last = { pins: live.length, byGlyph };
  }

  /** What stands now (tests, `__WAHALA__.objectivePins()`). */
  stats(): ObjectiveMarkerStats {
    return this.last;
  }

  dispose(): void {
    for (const pin of this.pins.values()) pin.material.dispose();
    this.pins.clear();
    for (const t of this.textures.values()) t.dispose();
    this.textures.clear();
  }
}
