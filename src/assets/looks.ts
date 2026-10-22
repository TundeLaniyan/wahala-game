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
    top: 0x168a44,
    topAccent: 0xf4f2ea,
    shorts: 0x3b3e44,
    shoes: 0x168a44,
  },
  lekkiBoy: {
    skin: 0x5a3622,
    hair: 0x0e0b09,
    top: 0x1d56c4,
    topAccent: 0xf2b718,
    shorts: 0x1c2230,
    shoes: 0x1d56c4,
  },
  campusQueen: {
    skin: 0x9a6340,
    hair: 0x120d0a,
    top: 0xe23228,
    topAccent: 0xf6c218,
    shorts: 0x167c42,
    shoes: 0xf6c218,
  },
};
