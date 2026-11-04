import { SKILL_DEFS, VEHICLE_DEFS } from '../sim';
import type { HudMe } from '../app/hud';

/** What button B does right now: its label (the position and look never change). */
export type SpecialIcon = 'voucher' | 'generator' | 'knockdown' | 'localChampion';

export function specialLabel(
  me: HudMe,
  skill: string,
): { text: string; icon: SpecialIcon | null; live: boolean; sub?: string } {
  if (me.special === 'vehicle')
    return { text: VEHICLE_DEFS[me.vehicle].name.toUpperCase(), icon: 'voucher', live: true };
  // the kill-streak rewards: the vehicle's own name (with the generator it carries), or the knockdown
  if (me.special === 'vehicleGenerator')
    return {
      text: VEHICLE_DEFS[me.vehicle].name.toUpperCase(),
      icon: 'generator',
      live: true,
      sub: '+ GENERATOR',
    };
  if (me.special === 'globalKnockdown') return { text: 'KNOCKDOWN', icon: 'knockdown', live: true };
  if (me.special === 'localChampion') return { text: 'LOCAL CHAMP', icon: 'localChampion', live: true };
  const label = SKILL_DEFS[skill as keyof typeof SKILL_DEFS]?.label ?? skill.toUpperCase();
  if (me.special === 'melee') return { text: label, icon: null, live: me.skillReady };
  return { text: label, icon: null, live: false };
}
