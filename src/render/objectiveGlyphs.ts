/**
 * The objective glyphs (docs/MISSION_GUIDANCE.md, decision MG4): ONE small icon per kind of thing a campaign mission
 * asks about, drawn the same everywhere it appears: the briefing card and its legend, the HUD rail's objective block and
 * the world pin hung above every live target (`render/views/ObjectiveMarkers.ts`). A target is never told apart by colour
 * alone: the glyph's SHAPE says what it is (a crate with a target cross, a crate with plain planks, a cabinet with a bolt,
 * a door, an exit arrow, a flag ...).
 *
 * Pure data: SVG path strings in a 24 x 24 box, stroked (2 units, round) unless `fill`. The UI renders them as inline SVG,
 * the renderer as `Path2D` on a canvas texture. No artwork is invented: each glyph is a plain pictogram of the in-game
 * object it labels.
 */

export type GlyphId =
  /** Raid marked cargo (the objective): a crate with the target cross it carries in the world. */
  | 'cargo'
  /** An ordinary crate / barrel: only an obstacle. Planks, no cross. */
  | 'crate'
  /** Field equipment (relay box, toll box, switch cabinet, parts cage, control point): a cabinet with a power bolt. */
  | 'equipment'
  /** A door to stand on (field) or a locked raid door. */
  | 'door'
  /** The way out: a raid's exit, a field escape exit or the return marker. */
  | 'exit'
  /** A walk-through checkpoint. */
  | 'checkpoint'
  /** An area to keep clear. */
  | 'area'
  /** An enemy group to defeat. */
  | 'enemies'
  /** A raid floor switch (step on it). */
  | 'switch'
  /** The district boss (boss missions). */
  | 'boss';

export interface GlyphPart {
  d: string;
  fill?: boolean;
}

export interface Glyph {
  id: GlyphId;
  /** What the shape stands for, in two words (the briefing legend, aria labels). */
  name: string;
  parts: readonly GlyphPart[];
}

export const GLYPHS: Readonly<Record<GlyphId, Glyph>> = {
  cargo: {
    id: 'cargo',
    name: 'Marked cargo',
    parts: [{ d: 'M4 5h16v14H4z' }, { d: 'M4 5l16 14M20 5L4 19' }, { d: 'M12 9.4a2.6 2.6 0 1 0 0.01 0z', fill: true }],
  },
  crate: {
    id: 'crate',
    name: 'Plain crate',
    parts: [{ d: 'M4 5h16v14H4z' }, { d: 'M4 9.7h16M4 14.3h16' }, { d: 'M8 5v14M16 5v14' }],
  },
  equipment: {
    id: 'equipment',
    name: 'Ring equipment',
    parts: [{ d: 'M6.5 3h11v18h-11z' }, { d: 'M13.2 6l-4.2 7h3.2l-1.4 5 4.4-7.2h-3.3z', fill: true }],
  },
  door: {
    id: 'door',
    name: 'Door',
    parts: [{ d: 'M6 21V3h12v18' }, { d: 'M3 21h18' }, { d: 'M14.8 11.2a1.3 1.3 0 1 0 0.01 0z', fill: true }],
  },
  exit: {
    id: 'exit',
    name: 'Exit',
    parts: [{ d: 'M10 4H5v16h5' }, { d: 'M9.5 12H20' }, { d: 'M16 8l4 4-4 4' }],
  },
  checkpoint: {
    id: 'checkpoint',
    name: 'Checkpoint',
    parts: [{ d: 'M6.5 21V3' }, { d: 'M6.5 4H18l-3 4 3 4H6.5z', fill: true }],
  },
  area: {
    id: 'area',
    name: 'Area to hold',
    parts: [{ d: 'M4 4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M4 8V4' }, { d: 'M12 8.6a3.4 3.4 0 1 0 0.01 0z', fill: true }],
  },
  enemies: {
    id: 'enemies',
    name: 'Enemy group',
    parts: [
      { d: 'M8.5 6.2a2.7 2.7 0 1 0 0.01 0z', fill: true },
      { d: 'M15.5 6.2a2.7 2.7 0 1 0 0.01 0z', fill: true },
      { d: 'M3.5 20v-3.2a5 5 0 0 1 10 0V20M10.5 20v-3.2a5 5 0 0 1 10 0V20' },
    ],
  },
  switch: {
    id: 'switch',
    name: 'Floor switch',
    parts: [{ d: 'M3 17h18v3H3z' }, { d: 'M12 17L16 6' }, { d: 'M16 3.6a2.4 2.4 0 1 0 0.01 0z', fill: true }],
  },
  boss: {
    id: 'boss',
    name: 'The boss',
    parts: [{ d: 'M3 18h18' }, { d: 'M3.5 16l1.5-10 4.5 5L12 4l2.5 7 4.5-5 1.5 10z', fill: true }],
  },
};
