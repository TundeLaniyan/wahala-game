/**
 * The local fighter's crowd silhouette (decision PIV2, docs/DECISIONS.md "PIV"): where the fighter you control is hidden
 * behind OTHER FIGHTERS, a translucent copy of it is drawn over them so a crowded fight never swallows you. It is NOT
 * "draw the fighter in front of everything": walls, buildings, crates and props never trigger it.
 *
 * How the GPU tells the cases apart (render/assets/xray.ts) is one small stencil buffer written by the fighters' own
 * bodies as they draw, so the three kinds of pixel are told apart without any extra pass over the screen:
 *   0  nothing of any fighter is the visible surface here (floor, walls, props, background people)
 *   1  a RIVAL fighter's body is the visible surface
 *   2  the LOCAL fighter's own body is the visible surface
 * A silhouette fragment of the local fighter is drawn only where the depth test says something is in front of it
 * (`GreaterDepth`) and the stencil says that something is a rival. This file is the pure statement of that rule (the
 * constants the materials use, the test of one pixel, the look), so it can be tested without a GPU.
 */

/** Stencil values a fighter's visible pixels leave (render-only; nothing in the simulation knows them). */
export const STENCIL_NONE = 0;
export const STENCIL_RIVAL = 1;
export const STENCIL_LOCAL = 2;

/** `wall`: the older "hidden by scenery" silhouette (every fighter); `crowd`: the local fighter hidden behind rivals. */
export type SilhouetteKind = 'wall' | 'crowd';

/** What the stencil must read for a silhouette of this kind to be drawn at a pixel. */
export const STENCIL_REQUIRED: Readonly<Record<SilhouetteKind, number>> = {
  wall: STENCIL_NONE,
  crowd: STENCIL_RIVAL,
};

export interface SilhouettePixel {
  /** The stencil value left by whatever fighter body is the visible surface here. */
  stencil: number;
  /** Depth of the fragment the silhouette would draw (the hidden fighter's own surface). */
  fighterDepth: number;
  /** Depth already in the buffer (the nearest opaque surface that was drawn). Smaller = nearer the camera. */
  bufferDepth: number;
}

/** One pixel of the rule: the depth test fails against the scene (`GreaterDepth`) AND the stencil is what the kind needs. */
export function silhouetteShows(kind: SilhouetteKind, px: SilhouettePixel): boolean {
  return px.fighterDepth > px.bufferDepth && px.stencil === STENCIL_REQUIRED[kind];
}

/** Opacity of the crowd silhouette: stronger than the wall one (0.55), it sits over a body, not over a dark gap. */
export const CROWD_OPACITY = 0.7;
/** How far the fighter's colour is lifted toward white so the copy reads over a rival's own palette. */
const CROWD_LIFT = 0.4;

/** The crowd silhouette's colour from the fighter's slot / team colour (24-bit): the same hue, lighter. */
export function crowdSilhouetteColor(color: number): number {
  const lift = (c: number): number => Math.round(c + (255 - c) * CROWD_LIFT);
  return (lift((color >> 16) & 255) << 16) | (lift((color >> 8) & 255) << 8) | lift(color & 255);
}
