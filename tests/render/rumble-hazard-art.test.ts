import { Box3 } from 'three';
import { describe, expect, it } from 'vitest';
import { sweepVehicleKind, sweepVehicleNoun } from '../../src/assets/stagePresentation';
import { buildStageAlerts } from '../../src/app/stageAlerts';
import { createHazardTruck } from '../../src/render/views/hazardTruck';
import { createGame, getArena } from '../../src/sim';
import type { GameState, StageEvent } from '../../src/sim';

/**
 * The V2 stage hazard styles (Apapa `truck` sweeps and `cargo` drops, Lagos Island `goods`) read as what
 * they are: the HUD names the truck and the container, the truck model drives like the other sweep
 * vehicles (faces +X, wheels to spin) and is never voiced as a Danfo or Keke.
 */
function stateOn(arenaId: string): GameState {
  const s = createGame({
    seed: 1,
    arenaId,
    players: [
      { name: 'A', characterId: 'streetBaller', isBot: false },
      { name: 'B', characterId: 'lekkiBoy', isBot: true },
    ],
  });
  s.match.phase = 'playing';
  return s;
}

function push(s: GameState, e: Pick<StageEvent, 'kind' | 'style' | 'tiles'> & Partial<StageEvent>): void {
  s.stage.events.push({
    id: 5,
    hazard: 0,
    dir: 'right',
    warnTick: s.tick,
    startTick: s.tick + 120,
    endTick: s.tick + 300,
    eventId: 1,
    index: -1,
    stepRemaining: 0,
    stepTicks: 5,
    ...e,
  });
}

describe('V2 hazard presentation', () => {
  it('Apapa sweeps are container trucks: named TRUCK, never a Danfo or Keke for the voices', () => {
    expect(getArena('rumbleApapa').stageHazards.some((h) => h.kind === 'sweep' && h.style === 'truck')).toBe(true);
    for (let id = 0; id < 6; id++) {
      expect(sweepVehicleNoun('truck', id)).toBe('TRUCK');
      expect(sweepVehicleKind('truck', id)).not.toBe('danfo');
      expect(sweepVehicleKind('truck', id)).not.toBe('keke');
    }
    const s = stateOn('rumbleApapa');
    const me = s.players[0]!;
    push(s, { kind: 'sweep', style: 'truck', tiles: [me.y * s.width + me.x] });
    expect(buildStageAlerts(s, 0)[0]!.text).toBe('TRUCK COMING - GET OFF THE LANE!');
  });

  it('the truck model is a compact procedural vehicle facing +X with eight wheels', () => {
    const t = createHazardTruck(3);
    expect(t.glb).toBeFalsy();
    expect(t.wheels).toHaveLength(8);
    const b = new Box3().setFromObject(t.root);
    expect(b.max.x).toBeGreaterThan(1.0); // the cab at the front (+X)
    expect(b.max.x - b.min.x).toBeLessThan(2.8); // about 3.5 m at VEHICLE_SCALE: fits the one-tile lane telegraph
    expect(b.max.z - b.min.z).toBeLessThan(0.95);
  });

  it('a container being lowered and goods falling name themselves to whoever stands under them', () => {
    const s = stateOn('rumbleApapa');
    const me = s.players[0]!;
    const here = me.y * s.width + me.x;
    push(s, { kind: 'strike', style: 'cargo', tiles: [here, here + 1] });
    expect(buildStageAlerts(s, 0)[0]!.text).toBe('CONTAINER COMING DOWN - MOVE!');
    s.stage.events.length = 0;
    push(s, { kind: 'strike', style: 'cargo', tiles: [here + 3 * s.width] });
    expect(buildStageAlerts(s, 0)[0]!.level).toBe('info');
    const m = stateOn('rumbleLagosIsland');
    const p = m.players[0]!;
    push(m, { kind: 'strike', style: 'goods', tiles: [p.y * m.width + p.x] });
    expect(buildStageAlerts(m, 0)[0]!.text).toBe('GOODS FALLING ON YOU - MOVE!');
  });
});
