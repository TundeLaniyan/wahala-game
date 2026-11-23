/**
 * Which glTF models a start needs (docs/MOBILE_PERFORMANCE.md, "On-demand models"). Before this, the boot preloaded every
 * eager model (13.6 MB over the wire) before the menu was even used; now only the hero cast (`BOOT_MODELS`, needed for
 * the portraits in the menus) loads at boot, and a match loads its arena's set. The set per arena is derived from a real
 * browser recording (scripts/perf/asset-access.mjs -> modelNeeds.generated.ts) and re-verified by e2e/model-loading.spec.ts
 * (no model the renderer asked for may be missing, and the scene must equal the fully preloaded one).
 *
 * Anything this table does not know (campaign districts, raids, the training academy's own arena) loads EVERYTHING, which
 * is exactly what the boot used to do: a conservative default, never a missing model.
 */
import { GENERATED_ARENA_MODELS } from './modelNeeds.generated';

/** Needed by the menus (HUD / title portraits) and by every Classic match's fighter slots: loaded at boot. */
export const BOOT_MODELS: readonly string[] = [
  'char_streetBaller',
  'char_campusQueen',
  'char_lekkiBoy',
  'char_areaBoss',
];

/**
 * Prefix groups whose consumers index into the LOADED list (`n++ % ids.length`), so the whole group must be loaded for
 * the layout to stay identical. Pillars and soft props intersect with the arena's own style list, so a subset is stable.
 */
export const FULL_GROUP_PREFIXES: readonly string[] = ['env_building_', 'env_wall'];

/** The models one arena needs on top of the boot set; null = unknown arena (the caller loads everything). */
export function arenaModels(arenaId: string | undefined | null): readonly string[] | null {
  if (!arenaId) return null;
  return GENERATED_ARENA_MODELS[arenaId] ?? null;
}

/** Arena ids with a recorded model set. */
export const MODEL_ARENA_IDS: readonly string[] = Object.keys(GENERATED_ARENA_MODELS);
