import type { CharacterId } from '../sim';

/** Colours that define each character's appearance, shared by the 3D model and the HUD portraits. */
export interface Look {
  skin: number;
  hair: number;
  top: number;
  topAccent: number;
  shorts: number;
  shoes: number;
}

export const LOOKS: Record<CharacterId, Look> = {
  streetBaller: {
    skin: 0x7a4a2e,
    hair: 0x15110e,
    top: 0x1fa64a,
    topAccent: 0xffffff,
    shorts: 0xf4f4f4,
    shoes: 0xffffff,
  },
  lekkiBoy: {
    skin: 0x5a3622,
    hair: 0x0e0b09,
    top: 0x2f8cff,
    topAccent: 0xff5ec4,
    shorts: 0x1c2740,
    shoes: 0xff5ec4,
  },
  campusQueen: {
    skin: 0x9a6340,
    hair: 0x120d0a,
    top: 0xa23cff,
    topAccent: 0xffd23c,
    shorts: 0x2a1740,
    shoes: 0xffd23c,
  },
};
