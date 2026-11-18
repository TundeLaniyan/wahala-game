/**
 * Ring equipment of a field mission's `destroyTargets` leg (docs/CAMPAIGN_SECTOR_AI.md, decision DS7). The pieces are
 * soft tiles of the board (they block walking and stop a flame arm, like a crate) with hit points:
 *
 *   - `explosions.ts` asks `fieldOnSoftHit` for every soft tile a blast reaches (the hook raid cargo uses too). A piece
 *     loses one hit point per SEPARATE blast set off by the human (a chain counts once); at zero it is wrecked and its
 *     tile is open floor. An enemy's blast only scorches it (the objective stays in the player's hands);
 *   - a vehicle, the closing city or anything else that clears crates leaves it standing (absorbed, no damage), and the
 *     stage hazards never touch soft tiles; melee never damages tiles at all.
 *
 * Pure, deterministic; a no-op without `state.mission.field.targets`.
 */
import { tileIndex } from '../grid';
import { Tile } from '../types';
import type { GameState, SimEvent } from '../types';

/** The human's seat: only its blasts wreck equipment. */
const HUMAN = 0;

/**
 * `explosions.ts` hook (`destroySoftBlocks`): something reached the soft tile `idx`. Returns true when the tile is a
 * piece of field equipment (handled here: damaged, scorched or absorbed); false for an ordinary crate.
 */
export function fieldOnSoftHit(
  state: GameState,
  idx: number,
  by: 'flame' | 'vehicle' | 'crush',
  eventId: number,
  events: SimEvent[],
): boolean {
  const targets = state.mission?.field?.targets;
  if (!targets) return false;
  const x = idx % state.width;
  const y = Math.floor(idx / state.width);
  const t = targets.find((o) => !o.destroyed && o.x === x && o.y === y);
  if (!t) return false;
  if (by !== 'flame') return true;
  const byId = state.blasts.find((b) => b.id === eventId)?.instigatorId ?? null;
  if (byId !== HUMAN) return true;
  t.hp = Math.max(0, t.hp - 1);
  if (t.hp === 0) {
    t.destroyed = true;
    state.tiles[tileIndex(state, x, y)] = Tile.Empty;
  }
  const left = targets.filter((o) => o.leg === t.leg && !o.destroyed).length;
  events.push({
    type: 'fieldTargetHit',
    targetId: t.id,
    label: t.label,
    x,
    y,
    hpAfter: t.hp,
    maxHp: t.maxHp,
    left,
    byId,
  });
  return true;
}
