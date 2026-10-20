/** Data-driven character roster. Each character has a FIXED signature vehicle and one close skill. */
import type { CharacterId, SkillKind, VehicleKind } from '../types';

export interface CharacterDef {
  id: CharacterId;
  name: string;
  tagline: string;
  vehicle: VehicleKind;
  skill: SkillKind;
  /** Primary jersey colour for rendering / HUD. */
  color: number;
  accent: number;
}

export const CHARACTERS: Readonly<Record<CharacterId, CharacterDef>> = {
  streetBaller: {
    id: 'streetBaller',
    name: 'Street Baller',
    tagline: 'Danfo + Push',
    vehicle: 'danfo',
    skill: 'push',
    color: 0x1fa64a,
    accent: 0xffffff,
  },
  lekkiBoy: {
    id: 'lekkiBoy',
    name: 'Lekki Boy',
    tagline: 'Taxi + Daze Punch',
    vehicle: 'taxi',
    skill: 'daze',
    color: 0x2f8cff,
    accent: 0xff5ec4,
  },
  campusQueen: {
    id: 'campusQueen',
    name: 'Campus Queen',
    tagline: 'Keke + Shove',
    vehicle: 'keke',
    skill: 'shove',
    color: 0xa23cff,
    accent: 0xffd23c,
  },
};

export const CHARACTER_IDS = Object.keys(CHARACTERS) as CharacterId[];
