import type { TilePos } from '../types';

export interface ArenaDef {
  id: string;
  name: string;
  /** Rows of the layout: '#' = indestructible concrete, anything else = open floor. */
  layout: string[];
  /** Spawn tiles in slot order. */
  spawns: TilePos[];
  /** Tiles kept clear of soft blocks around each spawn (relative offsets). */
  spawnClearance: TilePos[];
  /** Optional floor hazards, only used when the "floor traps" option is on: 'o' pothole, '~' oil in this grid. */
  hazardLayout?: string[];
  mirrorSoftBlocks: boolean;
}
