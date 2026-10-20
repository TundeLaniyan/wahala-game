/**
 * Near-miss detection from SimEvents + GameState (pure; no audio).
 *
 * A near miss is something dangerous passing within one tile of a LIVING player without killing
 * them:
 *  - flame:   a blast (generatorExploded this batch) whose flames cover a tile adjacent to the
 *             player (Chebyshev distance exactly 1) but not the player's own tile;
 *  - okada:   `okadaBroken`: the Okada absorbed a lethal hit, the player survived by a hair;
 *  - vehicle: a driving vehicle is adjacent to the player (not on their tile, not their own vehicle,
 *             not already hit them). Reported once per vehicle+player pass.
 */
import type { GameState, SimEvent, VehicleKind } from '../sim';

export type NearMiss =
  | { kind: 'flame'; playerId: number; x: number; y: number; human: boolean }
  | { kind: 'okada'; playerId: number; x: number; y: number; human: boolean }
  | { kind: 'vehicle'; playerId: number; vehicleKind: VehicleKind; x: number; y: number; human: boolean };

export interface NearMissDetector {
  detect(events: readonly SimEvent[], state: Readonly<GameState>): NearMiss[];
  reset(): void;
}

export function createNearMissDetector(): NearMissDetector {
  /** `vehicleId:playerId` pairs already reported while the vehicle is still around. */
  const reported = new Set<string>();
  const seenBlast = new Set<string>();

  return {
    detect(events, state) {
      const out: NearMiss[] = [];
      const players = state.players;
      const human = (id: number): boolean => players[id]?.isBot === false;

      // flames of blasts that went off in this batch
      const blasts = new Set<number>();
      for (const e of events) if (e.type === 'generatorExploded') blasts.add(e.eventId);
      if (blasts.size > 0) {
        for (const p of players) {
          if (!p.alive) continue;
          let near = false;
          let nx = 0;
          let ny = 0;
          let onTile = false;
          for (const f of state.flames) {
            if (!blasts.has(f.eventId)) continue;
            const d = Math.max(Math.abs(f.x - p.x), Math.abs(f.y - p.y));
            if (d === 0) onTile = true;
            else if (d === 1 && !near) {
              near = true;
              nx = f.x;
              ny = f.y;
            }
          }
          if (!near || onTile) continue;
          const key = `${[...blasts].sort().join(',')}:${p.id}`;
          if (seenBlast.has(key)) continue;
          seenBlast.add(key);
          out.push({ kind: 'flame', playerId: p.id, x: nx, y: ny, human: human(p.id) });
        }
        if (seenBlast.size > 64) seenBlast.clear();
      }

      for (const e of events) {
        if (e.type === 'okadaBroken' && players[e.playerId]?.alive) {
          out.push({ kind: 'okada', playerId: e.playerId, x: e.x, y: e.y, human: human(e.playerId) });
        }
      }

      // driving vehicles brushing past a player
      const liveVehicles = new Set<number>();
      for (const v of state.vehicles) {
        liveVehicles.add(v.id);
        if (v.phase !== 'driving') continue;
        const at = v.route[Math.min(v.index, v.route.length - 1)];
        if (!at) continue;
        for (const p of players) {
          if (!p.alive || p.id === v.ownerId || v.hitPlayerIds.includes(p.id)) continue;
          const d = Math.max(Math.abs(at.x - p.x), Math.abs(at.y - p.y));
          if (d !== 1) continue;
          const key = `${v.id}:${p.id}`;
          if (reported.has(key)) continue;
          reported.add(key);
          out.push({
            kind: 'vehicle',
            playerId: p.id,
            vehicleKind: v.kind,
            x: at.x,
            y: at.y,
            human: human(p.id),
          });
        }
      }
      if (reported.size > 0) {
        for (const key of reported) if (!liveVehicles.has(Number(key.split(':')[0]))) reported.delete(key);
      }
      return out;
    },
    reset() {
      reported.clear();
      seenBlast.clear();
    },
  };
}
