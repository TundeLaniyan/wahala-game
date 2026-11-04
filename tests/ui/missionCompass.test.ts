/**
 * The mission objective compass and the mission layer of the minimap (pure models): what the pointer points at, where
 * it sits on the screen edge (never over the centre, never over another HUD block), and what the map draws.
 */
import { describe, expect, it } from 'vitest';
import type { MissionNodeView, MissionView } from '../../src/sim';
import { missionView } from '../../src/sim';
import { candidateNodes, compassTarget, placeCompass, tilesLabel } from '../../src/ui/missionCompassModel';
import type { Rect } from '../../src/ui/missionCompassModel';
import { minimapLayers, minimapMission, MINIMAP_URGENT_TICKS } from '../../src/ui/minimapModel';
import { getArena } from '../../src/sim';
import { advance, newMission } from '../mission-helpers';

const node = (id: string, x: number, y: number, state: MissionNodeView['state']): MissionNodeView => ({
  id,
  x,
  y,
  label: id,
  state,
  fraction: 0,
});

const view = (nodes: MissionNodeView[], over: Partial<MissionView> = {}): MissionView =>
  ({
    missionId: 'oshodi',
    objective: 'dispatchRelays',
    phase: 0,
    phaseCount: 3,
    phaseState: 'active',
    progress: { done: 0, goal: 2, label: 'relays jammed' },
    nodes,
    warnings: [],
    boss: { playerId: 1, shielded: true, exposed: false, exposedRemainingTicks: 0, defeated: false },
    lives: { used: 0, max: 3 },
    timeRemainingSec: 400,
    callout: null,
    crewAlive: 5,
    outcome: null,
    ...over,
  }) as MissionView;

describe('compass target', () => {
  const me = { x: 10, y: 10 };

  it('points at the nearest live node and ignores done and locked ones', () => {
    const v = view([
      node('far', 40, 10, 'live'),
      node('near', 14, 13, 'live'),
      node('done', 11, 10, 'done'),
      node('locked', 10, 11, 'locked'),
    ]);
    expect(compassTarget(v, me, null)).toMatchObject({ id: 'near', kind: 'node', tiles: 5 });
  });

  it('a node being worked counts; live and progress beat idle ones', () => {
    const v = view([node('idle', 11, 10, 'idle'), node('work', 30, 10, 'progress')]);
    expect(compassTarget(v, me, null)?.id).toBe('work');
  });

  it('with nothing live, idle nodes are the way (junctions, ledgers) but never the press drop', () => {
    const v = view([node('press', 11, 10, 'idle'), node('j2', 25, 10, 'idle'), node('j1', 12, 10, 'done')]);
    expect(compassTarget(v, me, null)?.id).toBe('j2');
    expect(candidateNodes([node('press', 1, 1, 'idle')])).toEqual([]);
    expect(compassTarget(view([node('press', 11, 10, 'live')]), me, null)?.id).toBe('press');
  });

  it('during the boss window it points at the boss; nowhere when there is nothing to do or the mission is over', () => {
    const exposed = view([node('a', 12, 10, 'live')], {
      boss: { playerId: 1, shielded: false, exposed: true, exposedRemainingTicks: 600, defeated: false },
    });
    expect(compassTarget(exposed, me, { x: 30, y: 25 })).toMatchObject({
      id: 'boss',
      kind: 'boss',
      tiles: 25,
    });
    expect(compassTarget(exposed, me, null)).toBeNull();
    expect(compassTarget(view([node('a', 12, 10, 'done')]), me, null)).toBeNull();
    expect(
      compassTarget(
        view([node('a', 12, 10, 'live')], {
          outcome: { result: 'won' } as MissionView['outcome'],
        }),
        me,
        null,
      ),
    ).toBeNull();
  });

  it('reads a real mission', () => {
    const state = newMission({ id: 'oshodi' });
    const v = missionView(state)!;
    const t = compassTarget(v, state.players[0]!, null)!;
    expect(v.nodes.some((n) => n.id === t.id)).toBe(true);
    expect(t.tiles).toBe(Math.round(Math.hypot(t.x - state.players[0]!.x, t.y - state.players[0]!.y)));
  });

  it('labels the distance', () => {
    expect(tilesLabel(1)).toBe('1 tile');
    expect(tilesLabel(12)).toBe('12 tiles');
  });
});

describe('compass placement', () => {
  const bounds: Rect = { left: 0, top: 0, right: 1280, bottom: 720 };
  const player = { x: 640, y: 380 };
  const base = { bounds, player, size: 46, pad: 8 };
  const inset = 46 / 2 + 8;

  it('is hidden while the target is on screen (its marker in the world is enough)', () => {
    expect(placeCompass({ ...base, target: { x: 900, y: 200 } })).toBeNull();
    expect(placeCompass({ ...base, target: { x: 1270, y: 200 } })).not.toBeNull(); // at the very edge it is not visible enough
  });

  it('sits on the inset screen edge along the line from the player, with the arrow pointing at the target', () => {
    const right = placeCompass({ ...base, target: { x: 2000, y: 380 } })!;
    expect(right.x).toBeCloseTo(1280 - inset);
    expect(right.y).toBeCloseTo(380);
    expect(right.angle).toBeCloseTo(0);
    const up = placeCompass({ ...base, target: { x: 640, y: -900 } })!;
    expect(up.y).toBeCloseTo(inset);
    expect(up.angle).toBeCloseTo(-Math.PI / 2);
    const diag = placeCompass({ ...base, target: { x: 2000, y: 1500 } })!;
    expect(diag.x).toBeGreaterThan(640);
    expect(diag.y).toBeGreaterThan(380);
    expect(diag.angle).toBeGreaterThan(0);
    expect(diag.angle).toBeLessThan(Math.PI / 2);
  });

  it('never sits over the centre of the screen: always within the outer band', () => {
    for (let a = 0; a < Math.PI * 2; a += 0.2) {
      const p = placeCompass({
        ...base,
        target: { x: 640 + Math.cos(a) * 3000, y: 380 + Math.sin(a) * 3000 },
      })!;
      const edge = Math.min(p.x - bounds.left, bounds.right - p.x, p.y - bounds.top, bounds.bottom - p.y);
      expect(edge, `angle ${a.toFixed(1)}`).toBeLessThanOrEqual(inset + 0.5);
      expect(p.x).toBeGreaterThanOrEqual(inset - 0.5);
      expect(p.y).toBeLessThanOrEqual(720 - inset + 0.5);
    }
  });

  it('slides along the edge past a HUD block and still points at the target', () => {
    // a left panel covers the top-left: a target up and to the left lands under it
    const panel: Rect = { left: 0, top: 0, right: 260, bottom: 330 };
    const target = { x: -900, y: -700 };
    const free = placeCompass({ ...base, target })!;
    const slid = placeCompass({ ...base, target, avoid: [panel] })!;
    expect(free.x).toBeLessThan(260); // would have covered the panel
    const badge: Rect = { left: slid.x - 23, top: slid.y - 23, right: slid.x + 23, bottom: slid.y + 23 };
    const overlaps =
      badge.left < panel.right &&
      badge.right > panel.left &&
      badge.top < panel.bottom &&
      badge.bottom > panel.top;
    expect(overlaps).toBe(false);
    expect(Math.hypot(slid.x - free.x, slid.y - free.y)).toBeGreaterThan(0);
    // the arrow points from the badge to the target
    expect(slid.angle).toBeCloseTo(Math.atan2(target.y - slid.y, target.x - slid.x));
  });

  it('gives up (null) when nothing at all is free, and flips the arrow for a point behind the camera', () => {
    const wall: Rect = { left: -10, top: -10, right: 1300, bottom: 740 };
    expect(placeCompass({ ...base, target: { x: 2000, y: 380 }, avoid: [wall] })).toBeNull();
    const behind = placeCompass({ ...base, target: { x: 900, y: 380, ahead: false } })!;
    expect(behind.x).toBeLessThan(640); // the target is mirrored: the pointer goes the other way
    expect(behind.angle).toBeCloseTo(Math.PI);
  });

  it('copes with the player on the edge or on top of the target', () => {
    const onEdge = placeCompass({ ...base, player: { x: 5, y: 5 }, target: { x: -400, y: -400 } })!;
    expect(Number.isFinite(onEdge.x + onEdge.y + onEdge.angle)).toBe(true);
    const same = placeCompass({ ...base, target: { x: 640, y: 380, ahead: false } })!;
    expect(Number.isFinite(same.x + same.y + same.angle)).toBe(true);
  });
});

describe('minimap mission layer', () => {
  it('is absent outside a mission', async () => {
    const { createGame } = await import('../../src/sim');
    const state = createGame({
      seed: 3,
      arenaId: 'danfoBusPark',
      players: [
        { name: 'A', characterId: 'streetBaller', isBot: false },
        { name: 'B', characterId: 'lekkiBoy', isBot: false },
      ],
    });
    expect(minimapMission(state)).toBeNull();
    expect(minimapLayers(state, getArena(state.arenaId).layout, 0, 0).mission).toBeNull();
  });

  it('shows the nodes with their states, the warning tiles and the boss', () => {
    const state = newMission({ id: 'oshodi' });
    const m = state.mission!;
    const layers = minimapLayers(state, getArena(state.arenaId).layout, 0, 0);
    expect(layers.mission).not.toBeNull();
    expect(layers.mission!.nodes.map((n) => n.id)).toEqual(m.nodes.map((n) => n.id));
    expect(layers.mission!.nodes.every((n) => n.state === 'live')).toBe(true);
    const boss = state.players[m.bossId]!;
    expect(layers.mission!.boss).toEqual({ x: boss.x, y: boss.y, mode: 'shielded' });

    m.strikes.push({
      id: 901,
      kind: 'convoy',
      tiles: [100, 101, 102],
      warnTick: state.tick,
      landTick: state.tick + MINIMAP_URGENT_TICKS + 50,
      endTick: state.tick + 400,
      eventId: 901,
      source: '',
      postponed: 0,
      landed: false,
    });
    let mm = minimapMission(state)!;
    expect(mm.warnings).toEqual([{ kind: 'convoy', tiles: [100, 101, 102], urgent: false }]);
    advance(state, 60);
    mm = minimapMission(state)!;
    expect(mm.warnings[0]?.urgent).toBe(true);

    // jam a relay: it turns done on the map
    const n0 = m.nodes[0]!;
    n0.done = true;
    expect(minimapMission(state)!.nodes[0]!.state).toBe('done');
    // the boss exposed, then defeated
    m.boss.shielded = false;
    m.boss.exposedUntil = state.tick + 600;
    expect(minimapMission(state)!.boss?.mode).toBe('exposed');
    m.boss.defeated = true;
    state.players[m.bossId]!.alive = false;
    expect(minimapMission(state)!.boss?.mode).toBe('defeated');
  });
});
