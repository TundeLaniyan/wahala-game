import type { SkillKind } from '../types';

export interface SkillDef {
  kind: SkillKind;
  /** Player-facing name. */
  name: string;
  /** The word on the second action button (upper case, short enough for its round face). */
  label: string;
}

/**
 * The three close attacks. The ids are stable (`push`, `shove`, `daze`); the public names follow what each now does
 * (decision CB1): `push` is the Punch / Street Jab. Numbers live in `config.skills.attacks`.
 */
export const SKILL_DEFS: Readonly<Record<SkillKind, SkillDef>> = {
  push: { kind: 'push', name: 'Punch', label: 'PUNCH' },
  shove: { kind: 'shove', name: 'Shove', label: 'SHOVE' },
  daze: { kind: 'daze', name: 'Daze Punch', label: 'DAZE' },
};
