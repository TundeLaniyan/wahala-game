/**
 * What the fighter screens say about each character, derived from the simulation's own data (character
 * registry, vehicle registry and the skill config), so the menu can never advertise a power the game
 * does not have. Pure: unit-tested.
 */
import { CHARACTERS, CHARACTER_IDS, DEFAULT_CONFIG, TICK_RATE, VEHICLE_DEFS } from '../../sim';
import type { CharacterId } from '../../sim';

type Skill = (typeof CHARACTERS)[CharacterId]['skill'];

const SKILL: Readonly<Record<Skill, { name: string; text: string }>> = {
  push: { name: 'Push', text: 'Shoves an adjacent rival one tile - straight into a blast line or a vehicle path.' },
  shove: { name: 'Quick Shove', text: 'Shoves an adjacent rival one tile, with the quickest recovery.' },
  daze: { name: 'Daze Punch', text: 'Freezes an adjacent rival on the spot for a moment.' },
};

export interface FighterInfo {
  id: CharacterId;
  name: string;
  /** The one-line description from the character data ("Danfo + Push"). */
  tagline: string;
  skillName: string;
  skillText: string;
  /** Seconds before the melee can be used again (from the sim config). */
  skillCooldown: number;
  vehicleName: string;
  vehicleText: string;
}

export function fighterInfo(id: CharacterId): FighterInfo {
  const c = CHARACTERS[id];
  const v = VEHICLE_DEFS[c.vehicle];
  return {
    id,
    name: c.name,
    tagline: c.tagline,
    skillName: SKILL[c.skill].name,
    skillText: SKILL[c.skill].text,
    skillCooldown: DEFAULT_CONFIG.skills.cooldownTicks[c.skill] / TICK_RATE,
    vehicleName: v.name,
    vehicleText: v.description,
  };
}

/** Every playable fighter, in registry order (new characters appear here automatically). */
export const ROSTER: readonly CharacterId[] = CHARACTER_IDS;
