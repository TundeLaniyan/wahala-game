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
