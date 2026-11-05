import { tileIndex } from '../grid';
import type { GameState } from '../types';
import { RAID_TUNING } from './tuning';
import type { RaidCargoView, RaidView } from './types';
import { mainWaves } from './waves';

/** The read-only raid picture for the HUD, the renderer and the app; null when this is not a raid. */
export function raidView(state: GameState): RaidView | null {
  const r = state.raid;
  if (!r) return null;
  const marked = r.cargo.filter((c) => c.marked);
  const done = marked.filter((c) => c.destroyed).length;
  const main = mainWaves(r);

  const cargo: RaidCargoView[] = r.cargo.map((c) => ({
    id: c.id,
    kind: c.kind,
    x: c.x,
    y: c.y,
    hp: c.hp,
    maxHp: c.maxHp,
    marked: c.marked,
    state: c.destroyed ? 'destroyed' : c.hp < c.maxHp ? 'damaged' : 'intact',
  }));

  const warnings: RaidView['warnings'] = [];
  for (const s of r.shipments) {
    if (s.phase !== 'warn') continue;
    const belt = r.belts.find((b) => b.id === s.beltId)!;
    warnings.push({
      kind: 'shipment',
      tiles: belt.tiles.map((t) => tileIndex(state, t.x, t.y)),
      remainingTicks: Math.max(0, s.goTick - state.tick),
    });
  }
  for (const w of r.waves) {
    if (w.startedTick === null || w.activated) continue;
    warnings.push({
      kind: 'wave',
      tiles: w.seatIds.map((id) => {
        const spot = r.seats.find((q) => q.playerId === id)!.spot;
        return tileIndex(state, spot.x, spot.y);
      }),
      remainingTicks: Math.max(0, w.startedTick + RAID_TUNING.spawnWarnTicks - state.tick),
    });
  }

  const pending = main.find((w) => w.startedTick !== null && !w.activated);
  const timed = main.find((w) => w.startedTick === null && w.trigger.kind === 'ticks');
  const nextInTicks = pending
    ? Math.max(0, pending.startedTick! + RAID_TUNING.spawnWarnTicks - state.tick)
    : timed && timed.trigger.kind === 'ticks'
      ? Math.max(0, timed.trigger.after - state.match.playTicks)
      : null;

  return {
    raidId: r.raidId,
    objective: r.objective,
    progress: { done, goal: marked.length, label: `${done} of ${marked.length} destroyed` },
    cargo,
    conveyors: r.belts.map((b) => ({
      id: b.id,
      tiles: b.tiles.map((t) => ({ ...t })),
      stepTicks: b.stepTicks,
    })),
    shipments: r.shipments.map((s) => ({
      id: s.id,
      x: s.x,
      y: s.y,
      dir: s.dir,
      warnTicks: s.phase === 'warn' ? Math.max(0, s.goTick - state.tick) : 0,
    })),
    doors: r.doors.map((d) => ({
      id: d.id,
      x: d.x,
      y: d.y,
      locked: !d.open,
      optionalRoom: d.room !== null,
      opensWhen: d.hint,
    })),
    rooms: r.rooms.map((q) => ({
      id: q.id,
      name: q.name,
      opened: q.opened,
      completed: q.completed,
      optional: true,
    })),
    wave: {
      index: main.filter((w) => w.startedTick !== null).length,
      total: main.length,
      enemiesAlive: r.seats.filter((s) => s.active && state.players[s.playerId]!.alive).length,
      nextInTicks,
    },
    extraction: { open: r.extraction.open, x: r.extraction.x, y: r.extraction.y },
    stage: r.stage,
    lives: { used: r.livesUsed, max: r.livesMax },
    timeRemainingSec: Math.max(0, Math.ceil((r.timeLimitTicks - state.match.playTicks) / 60)),
    warnings,
    outcome: r.outcome,
    seats: r.seats.map((s) => ({
      playerId: s.playerId,
      kind: s.kind,
      wave: s.wave,
      active: s.active,
      spot: { ...s.spot },
    })),
    bonuses: r.rooms.map((q) => ({ roomId: q.id, ...q.bonus })),
    switches: r.switches.map((s) => ({ ...s })),
    hint: r.stage === 'cargo' ? r.objective : r.stage === 'extract' ? 'Reach the exit' : undefined,
  };
}
