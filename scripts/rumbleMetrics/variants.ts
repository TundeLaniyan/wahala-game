/**
 * Named config variants for the Rumble measurement harness (workstream C). A variant is a plain config
 * override applied on top of the ruleset (createGame's `config` option), so any number can be A/B tested
 * without touching the defaults. Add a tuning candidate here, never as an `if` in the harness.
 */
import type { DeepPartial, GameConfig } from '../../src/sim';

export interface Variant {
  name: string;
  description: string;
  config: DeepPartial<GameConfig>;
}

export const VARIANTS: Record<string, Variant> = {
  legacy: {
    name: 'legacy',
    description: 'before City Rumble Evolution: plus blast, 1 starting generator, flame reach cap 10',
    config: { generator: { blastMode: 'plus', baseCapacity: 1, maxRange: 10 } },
  },
  evolution: {
    name: 'evolution',
    description: 'the current defaults (radial blast radius <= 5, 2 starting generators)',
    config: {},
  },
  nosupply: {
    name: 'nosupply',
    description:
      'evolution with the marked supply crates left empty (plain crates): isolates what the supplies change',
    config: { supply: { kinds: [] } },
  },
  sq6: {
    name: 'sq6',
    description:
      'evolution + Square Blast squares up to radius 6 (13 x 13), so tier 2 still widens a radius-5 blast',
    config: { generator: { radialMaxSquareRadius: 6 } },
  },
};

/** Registers (or replaces) a variant; tests and the CLI's --config use it. */
export function defineVariant(v: Variant): Variant {
  VARIANTS[v.name] = v;
  return v;
}

export function variantByName(name: string): Variant {
  const v = VARIANTS[name];
  if (!v) throw new Error(`unknown variant "${name}" (known: ${Object.keys(VARIANTS).join(', ')})`);
  return v;
}

/** `a` with `b` merged over it (nested objects merge, arrays and numbers replace); `b` may be absent. */
export function mergeConfigs(
  a: DeepPartial<GameConfig>,
  b?: DeepPartial<GameConfig>,
): DeepPartial<GameConfig> {
  if (!b) return a;
  const out: Record<string, unknown> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const cur = out[k];
    out[k] =
      cur && v && typeof cur === 'object' && typeof v === 'object' && !Array.isArray(v)
        ? mergeConfigs(cur as DeepPartial<GameConfig>, v as DeepPartial<GameConfig>)
        : v;
  }
  return out as DeepPartial<GameConfig>;
}
