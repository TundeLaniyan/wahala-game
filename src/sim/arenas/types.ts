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
  /**
   * Floor traps present for the whole match when the "early traps" match option is on:
   * 'o' pothole, '~' oil in this grid.
   */
  hazardLayout?: string[];
  /**
   * MANDATORY endgame trap waves (same format). They are part of every standard match and cannot be
   * switched off: wave n becomes live at `config.hazards.endgameWaveRemainingTicks[n]` time left.
   */
  endgameTraps: string[][];
  /** The designated trap arena: the early-traps option defaults to on when it is picked. */
  trapArena?: boolean;
  mirrorSoftBlocks: boolean;
}
