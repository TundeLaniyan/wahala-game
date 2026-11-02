/** Data-driven character roster. Each character has one close skill; vehicles are public and never tied to a character (decision VG1). */
import type { CharacterId, SkillKind } from '../types';

export interface CharacterDef {
  id: CharacterId;
  name: string;
  tagline: string;
  skill: SkillKind;
  /** Primary jersey colour for rendering / HUD. */
  color: number;
  accent: number;
}

export const CHARACTERS: Readonly<Record<CharacterId, CharacterDef>> = {
  streetBaller: {
    id: 'streetBaller',
    name: 'Street Baller',
    tagline: 'Punch',
    skill: 'push',
    color: 0x1fa64a,
    accent: 0xffffff,
  },
  lekkiBoy: {
    id: 'lekkiBoy',
    name: 'Lekki Boy',
    tagline: 'Daze Punch',
    skill: 'daze',
    color: 0x2f8cff,
    accent: 0xff5ec4,
  },
  campusQueen: {
    id: 'campusQueen',
    name: 'Campus Queen',
    tagline: 'Shove',
    skill: 'shove',
    color: 0xa23cff,
    accent: 0xffd23c,
  },
};

export const CHARACTER_IDS = Object.keys(CHARACTERS) as CharacterId[];
