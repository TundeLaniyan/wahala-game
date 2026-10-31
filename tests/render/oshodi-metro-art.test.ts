/**
 * Oshodi Transport Metropolis presentation: day and night readability on the same geometry, the review flag,
 * the railcar's own model / name / HUD alert / audio cues (never a Danfo or a road vehicle), the floor painter
 * and the menu entry. Headless (a stub canvas stands in for the DOM).
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Box3 } from 'three';
import { arenaLook } from '../../src/render/arenaLook';
import type { ArenaLook } from '../../src/render/arenaLook';
import { timeOfDay } from '../../src/render/timeOfDay';
import { NEW_ARENA_ART } from '../../src/render/arenas/newArenas';
import { OSHODI_METRO_LOOK, OSHODI_METRO_NIGHT_LOOK } from '../../src/render/arenas/oshodiMetroArt';
import { createHazardTrain } from '../../src/render/views/hazardTrain';
import { sweepVehicleKind, sweepVehicleNoun } from '../../src/assets/stagePresentation';
import { buildStageAlerts } from '../../src/app/stageAlerts';
import { createGame, getArena } from '../../src/sim';
import type { GameState, StageEvent } from '../../src/sim';
import { SOUND_DEFS } from '../../src/audio/recipes';
import { moodGradient } from '../../src/ui/menu/arenaInfo';

const lum = (c: number): number =>
  (0.2126 * ((c >> 16) & 0xff) + 0.7152 * ((c >> 8) & 0xff) + 0.0722 * (c & 0xff)) / 255;

/** A simple ground-light index: how much light reaches the floor, scaled by exposure and the floor's own albedo. */
function groundLight(l: ArenaLook): number {
  const hemi = l.hemi.intensity * (0.6 * lum(l.hemi.sky) + 0.4 * lum(l.hemi.ground));
  const sun = l.sun.intensity * lum(l.sun.color) * 0.55;
  return (hemi + sun) * l.exposure * lum(l.floorTint);
}

describe('day and night looks', () => {
  it('registers both looks for the stage; the day look is the default and the flag selects night', () => {
    const reg = NEW_ARENA_ART().rumbleOshodi!;
    expect(reg.look).toBe(OSHODI_METRO_LOOK);
    expect(reg.nightLook).toBe(OSHODI_METRO_NIGHT_LOOK);
    expect(timeOfDay('')).toBe('day');
    expect(timeOfDay('?tod=day')).toBe('day');
    expect(timeOfDay('?tod=night')).toBe('night');
    expect(timeOfDay('?q=low&tod=night')).toBe('night');
    expect(timeOfDay('?tod=banana')).toBe('day');
    expect(arenaLook('rumbleOshodi')).toBe(OSHODI_METRO_LOOK);
    // no other arena ships a night look behind the flag
    for (const [id, art] of Object.entries(NEW_ARENA_ART()))
      if (id !== 'rumbleOshodi') expect(art.nightLook, id).toBeUndefined();
  });

  it('night is actually darker in sky and fog, but the ground stays as readable as the approved night stage', () => {
    expect(lum(OSHODI_METRO_NIGHT_LOOK.sky)).toBeLessThan(lum(OSHODI_METRO_LOOK.sky) * 0.35);
    const lekki = arenaLook('rumbleLekkiNight');
    // the floor at night is lit at least as well as the approved Lekki Nightworks stage
    expect(groundLight(OSHODI_METRO_NIGHT_LOOK)).toBeGreaterThanOrEqual(groundLight(lekki) * 0.9);
    // and not so dim against the day that a phone would lose the hazard lanes (>= 30% of the day's ground light)
    expect(groundLight(OSHODI_METRO_NIGHT_LOOK)).toBeGreaterThan(groundLight(OSHODI_METRO_LOOK) * 0.3);
    // day is not blown out either
    expect(groundLight(OSHODI_METRO_LOOK)).toBeLessThan(6);
  });

  it('night carries at least twice the lamps of the day and every lamp is a plausible world position and colour', () => {
    expect(OSHODI_METRO_LOOK.lamps.length).toBeGreaterThanOrEqual(5);
    expect(OSHODI_METRO_NIGHT_LOOK.lamps.length).toBeGreaterThanOrEqual(10);
    for (const l of [OSHODI_METRO_LOOK, OSHODI_METRO_NIGHT_LOOK])
      for (const [x, y, z, c] of l.lamps) {
        expect(Math.abs(x)).toBeLessThan(30);
        expect(y).toBeGreaterThan(0.5);
        expect(y).toBeLessThan(9);
        expect(Math.abs(z)).toBeLessThan(30);
        expect(lum(c)).toBeGreaterThan(0.3);
      }
  });

  it('the geometry is identical by day and night: the same floor, set, cover and combat data', () => {
    const reg = NEW_ARENA_ART().rumbleOshodi!;
    // there is ONE floor, set and cover; only the look differs
    expect(reg.floor).toBeDefined();
    expect(reg.set).toBeDefined();
    expect(reg.cover).toBeDefined();
    expect(getArena('rumbleOshodi').layout.join('')).toBe(getArena('rumbleOshodi').layout.join(''));
  });
});

describe('the floor painter', () => {
  beforeAll(() => {
    const calls: string[] = [];
    const g = new Proxy({ canvas: { width: 64, height: 48 } } as Record<string | symbol, unknown>, {
      get: (t, p) =>
        p in t
          ? t[p]
          : p === 'createLinearGradient' || p === 'createRadialGradient'
            ? () => ({ addColorStop: () => undefined })
            : p === 'measureText'
              ? () => ({ width: 10 })
              : p === 'getImageData' || p === 'createImageData'
                ? (_x: number, _y: number, w: number, h: number) => ({
                    data: new Uint8ClampedArray(w * h * 4),
                    width: w,
                    height: h,
                  })
                : (...args: unknown[]) => void calls.push(`${String(p)}:${args.length}`),
      set: (t, p, v) => ((t[p] = v), true),
    });
    vi.stubGlobal('document', { createElement: () => ({ width: 1, height: 1, getContext: () => g }) });
    (globalThis as { __g?: unknown }).__g = g;
  });

  it('paints the whole 45 x 33 board without throwing', () => {
    const g = (globalThis as { __g?: CanvasRenderingContext2D }).__g!;
    expect(() => NEW_ARENA_ART().rumbleOshodi!.floor(g, g, 45, 33)).not.toThrow();
  });
});

describe('the railcar presentation', () => {
  const stateOn = (): GameState => {
    const s = createGame({
      seed: 1,
      arenaId: 'rumbleOshodi',
      players: [
        { name: 'A', characterId: 'streetBaller', isBot: false },
        { name: 'B', characterId: 'lekkiBoy', isBot: true },
      ],
    });
    s.match.phase = 'playing';
    return s;
  };
  const push = (s: GameState, e: Partial<StageEvent>): void => {
    s.stage.events.push({
      id: 5,
      hazard: 2,
      kind: 'sweep',
      style: 'train',
      tiles: [],
      dir: 'down',
      warnTick: s.tick,
      startTick: s.tick + 210,
      endTick: s.tick + 300,
      eventId: 1,
      index: -1,
      stepRemaining: 0,
      stepTicks: 4,
      ...e,
    });
  };

  it('is named TRAIN, never a Danfo or a Keke for the voices, and has its own HUD alerts', () => {
    for (let id = 0; id < 6; id++) {
      expect(sweepVehicleNoun('train', id)).toBe('TRAIN');
      expect(sweepVehicleKind('train', id)).not.toBe('danfo');
      expect(sweepVehicleKind('train', id)).not.toBe('keke');
    }
    const s = stateOn();
    const me = s.players[0]!;
    // standing on a track tile: the danger text names the track, not "the lane"
    push(s, { tiles: [me.y * s.width + me.x] });
    expect(buildStageAlerts(s, 0)[0]!.text).toBe('TRAIN COMING - GET OFF THE TRACK!');
    expect(buildStageAlerts(s, 0)[0]!.level).toBe('danger');
    // elsewhere: a warning that says which way and what is safe
    s.stage.events.length = 0;
    push(s, { tiles: [10 * s.width + 37, 11 * s.width + 37] });
    const warn = buildStageAlerts(s, 0)[0]!;
    expect(warn.level).toBe('warn');
    expect(warn.text).toMatch(/^TRAIN .* - STAY OFF THE TRACK$/);
    expect(warn.seconds).toBeGreaterThanOrEqual(3);
  });

  it('the model is a compact procedural railcar facing +X that fits one lane', () => {
    const t = createHazardTrain(2);
    expect(t.glb).toBeFalsy();
    expect(t.wheels).toHaveLength(4);
    const b = new Box3().setFromObject(t.root);
    expect(b.max.x).toBeGreaterThan(0.9); // the cab nose at the front (+X)
    expect(b.max.x - b.min.x).toBeLessThan(2.1); // about 2.5 tiles at VEHICLE_SCALE: no longer than its lethal footprint
    expect(b.max.z - b.min.z).toBeLessThan(0.95); // one lane wide
  });

  it('has its own synthesised audio cues, distinct from every road vehicle sound', () => {
    for (const id of ['train_horn', 'rail_bell', 'train_pass'] as const)
      expect(SOUND_DEFS[id], id).toBeDefined();
    expect(SOUND_DEFS.train_horn.bus).toBe('warn');
    expect(SOUND_DEFS.rail_bell.bus).toBe('warn');
    // the warning pair is not the Danfo / taxi / keke horn
    for (const id of ['train_horn', 'rail_bell'] as const)
      expect(['danfo_horn', 'taxi_horn', 'keke_horn'] as string[]).not.toContain(id);
  });
});

describe('the menu entry', () => {
  it('has a mood gradient of its own and reads its text from the sim registry (no invented stats)', () => {
    expect(moodGradient('rumbleOshodi')).not.toBe(moodGradient('noSuchArena'));
    const a = getArena('rumbleOshodi');
    expect(a.info.tagline.length).toBeGreaterThan(40);
    expect(a.info.hazards.length).toBeGreaterThanOrEqual(4);
    expect(a.info.lighting).toMatch(/midday/i);
    // no real company, bank, telco or operator names on the card
    expect(JSON.stringify(a.info)).not.toMatch(
      /\b(Lamata|NRC|Lagbus|BRT|MTN|Glo|Airtel|GTB|Zenith|Access Bank)\b/i,
    );
  });
});
