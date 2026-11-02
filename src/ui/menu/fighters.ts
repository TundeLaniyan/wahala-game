/**
 * What the fighter screens say about each character, derived from the simulation's own data (character
 * registry, vehicle registry and the skill config), so the menu can never advertise a power the game
 * does not have. Pure: unit-tested.
 */
import { CHARACTERS, CHARACTER_IDS, DEFAULT_CONFIG, SKILL_DEFS, TICK_RATE } from '../../sim';
import type { CharacterId } from '../../sim';

type Skill = (typeof CHARACTERS)[CharacterId]['skill'];

const secs = (ticks: number): string => `${Math.round((ticks / TICK_RATE) * 10) / 10}`;

/** What the fighter screens say about each attack: its name from the registry, its numbers from the sim config. */
function skillText(skill: Skill): { name: string; text: string } {
  const a = DEFAULT_CONFIG.skills.attacks[skill];
  const name = SKILL_DEFS[skill].name;
  switch (skill) {
    case 'push':
      return {
        name,
        text: `A very fast jab: a ${secs(a.dazeTicks)} s daze.`,
      };
    case 'shove':
      return {
        name,
        text: `A slower shove: pushes a rival ${a.displacementTiles} tiles.`,
      };
    case 'daze':
      return { name, text: `A slow, heavy punch: the longest daze (${secs(a.dazeTicks)} s).` };
  }
}

export interface FighterInfo {
  id: CharacterId;
  name: string;
  /** The one-line description from the character data ("Danfo + Push"). */
  tagline: string;
  skillName: string;
  skillText: string;
  /** Seconds before the melee can be used again (from the sim config). */
  skillCooldown: number;
  /** The melee's effect in one phrase, from the sim config. */
  skillEffect: string;
}

export function fighterInfo(id: CharacterId): FighterInfo {
  const c = CHARACTERS[id];
  const a = DEFAULT_CONFIG.skills.attacks[c.skill];
  return {
    id,
    name: c.name,
    tagline: c.tagline,
    skillName: skillText(c.skill).name,
    skillText: skillText(c.skill).text,
    skillCooldown: DEFAULT_CONFIG.skills.attacks[c.skill].hitRecoveryTicks / TICK_RATE,
    skillEffect:
      a.displacementTiles > 0 ? `pushes ${a.displacementTiles} tiles` : `${secs(a.dazeTicks)} s daze`,
  };
}

/** Every playable fighter, in registry order (new characters appear here automatically). */
export const ROSTER: readonly CharacterId[] = CHARACTER_IDS;
