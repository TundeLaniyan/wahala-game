/**
 * Where the objective pins hang (docs/MISSION_GUIDANCE.md, decision MG4): one small pin above every LIVE target of the
 * current objective, wearing the target's glyph (render/objectiveGlyphs.ts), so a target is told from an ordinary crate by
 * shape, not by colour alone. Pure: read straight from the state (no view object per frame), unit-tested.
 *
 *   field mission  the equipment of the current destroy leg (wrecked pieces drop theirs), the door of a door leg, the
 *                  area of a hold leg, the exit of an escape leg and the return marker of the way back
 *   raid           every marked cargo still standing, every floor switch not yet stepped on (smaller), the exit once
 *                  it is open
 *
 * Ordinary crates, barrels and later legs' targets get none. Checkpoints keep their own beacon and arrow
 * (CheckpointBeacons.ts).
 */
import { FIELD_MISSION_DEFS } from '../../sim';
import type { GameState } from '../../sim';
import type { GlyphId } from '../objectiveGlyphs';
import { equipmentHeight } from './FieldEquipmentViews';

export type PinTone = 'target' | 'door' | 'area' | 'exit' | 'switch';

export interface ObjectivePin {
  /** Stable per target ("tg:relayDepot", "cargo:cargo-0", "exit"). */
  key: string;
  x: number;
  y: number;
  glyph: GlyphId;
  tone: PinTone;
  /** Height of the pin's point above the floor (world units, one tile = 1). */
  height: number;
  /** Smaller (a raid floor switch: optional). */
  small: boolean;
}

/** The pin floats this far above the top of a piece of equipment. */
const ABOVE = 0.45;

function fieldPins(state: GameState): ObjectivePin[] {
  const m = state.mission;
  const f = m?.field;
  if (!m || !f || m.outcome || f.done) return [];
  const def = FIELD_MISSION_DEFS[f.fieldId];
  const leg = def?.legs[f.leg];
  const node = (id: string): { x: number; y: number } | undefined => m.nodes.find((n) => n.id === id);
  const pins: ObjectivePin[] = [];
  if (!leg) {
    // the way back: the return marker
    const r = node('return');
    if (r)
      pins.push({ key: 'return', x: r.x, y: r.y, glyph: 'exit', tone: 'exit', height: 1.6, small: false });
    return pins;
  }
  switch (leg.kind) {
    case 'destroyTargets':
      for (const t of f.targets ?? [])
        if (t.leg === f.leg && !t.destroyed)
          pins.push({
            key: `tg:${t.id}`,
            x: t.x,
            y: t.y,
            glyph: 'equipment',
            tone: 'target',
            height: equipmentHeight(t.kind) + ABOVE,
            small: false,
          });
      break;
    case 'door': {
      const d = f.doors.find((o) => o.id === leg.doorId);
      if (d && d.status !== 'done')
        pins.push({
          key: `door:${d.id}`,
          x: d.x,
          y: d.y,
          glyph: 'door',
          tone: 'door',
          height: 1.75,
          small: false,
        });
      break;
    }
    case 'holdArea':
      pins.push({
        key: 'area',
        x: leg.area.x,
        y: leg.area.y,
        glyph: 'area',
        tone: 'area',
        height: 1.3,
        small: false,
      });
      break;
    case 'escapeRoute': {
      const e = node('exit') ?? leg.exit;
      pins.push({ key: 'exit', x: e.x, y: e.y, glyph: 'exit', tone: 'exit', height: 1.6, small: false });
      break;
    }
    default:
      break;
  }
  return pins;
}

function raidPins(state: GameState): ObjectivePin[] {
  const r = state.raid;
  if (!r || r.outcome || r.stage === 'done' || r.stage === 'failed') return [];
  const pins: ObjectivePin[] = [];
  for (const c of r.cargo)
    if (c.marked && !c.destroyed)
      pins.push({
        key: `cargo:${c.id}`,
        x: c.x,
        y: c.y,
        glyph: 'cargo',
        tone: 'target',
        height: 1.25,
        small: false,
      });
  r.switches.forEach((s, i) => {
    if (!s.pressed)
      pins.push({
        key: `switch:${i}`,
        x: s.x,
        y: s.y,
        glyph: 'switch',
        tone: 'switch',
        height: 0.85,
        small: true,
      });
  });
  if (r.extraction.open)
    pins.push({
      key: 'exit',
      x: r.extraction.x,
      y: r.extraction.y,
      glyph: 'exit',
      tone: 'exit',
      height: 1.5,
      small: false,
    });
  return pins;
}

/** The pins of this moment (a match without a field mission or a raid has none). */
export function objectivePins(state: GameState): ObjectivePin[] {
  if (state.raid) return raidPins(state);
  if (state.mission?.field) return fieldPins(state);
  return [];
}
