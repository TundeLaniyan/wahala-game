import { describe, expect, it } from 'vitest';
import { buildHud } from '../../src/app/hud';
import { buildStageAlerts, MAX_STAGE_ALERTS, ruleBannerFor } from '../../src/app/stageAlerts';
import { createGame, getArena, tick } from '../../src/sim';
import type { GameState, StageEvent } from '../../src/sim';
import { put, sandbox } from '../helpers';

const W = 15;
const idx = (x: number, y: number): number => y * W + x;
const row = (y: number, from = 0, to = 14): number[] => {
  const out: number[] = [];
  for (let x = from; from <= to ? x <= to : x >= to; x += from <= to ? 1 : -1) out.push(idx(x, y));
  return out;
};

function event(
  state: GameState,
  e: Partial<StageEvent> & Pick<StageEvent, 'kind' | 'style' | 'tiles'>,
): StageEvent {
  const ev: StageEvent = {
    id: 3,
    hazard: 0,
    dir: null,
    warnTick: state.tick,
    startTick: state.tick + 120,
    endTick: state.tick + 200,
    eventId: 1,
    index: -1,
    stepRemaining: 0,
    stepTicks: 5,
    ...e,
  };
  state.stage.events.push(ev);
  return ev;
}

describe('stage alerts (HUD projection)', () => {
  it('a bus crossing a road the player is not on is a warning naming the road and direction', () => {
    const s = sandbox();
    put(s, 0, 0, 10);
    event(s, { kind: 'sweep', style: 'traffic', tiles: row(2), dir: 'right', id: 3 });
    const [a] = buildStageAlerts(s, 0);
    expect(a).toMatchObject({ level: 'warn', text: 'BUS CROSSING TOP ROAD →', seconds: 2, style: 'traffic' });
  });

  it('names a keke for the traffic events the renderer draws as kekes, and a car at the checkpoint', () => {
    const s = sandbox();
    put(s, 0, 0, 10);
    event(s, { kind: 'sweep', style: 'traffic', tiles: row(8, 14, 0), dir: 'left', id: 4 });
    expect(buildStageAlerts(s, 0)[0]!.text).toBe('KEKE CROSSING BOTTOM ROAD ←');
    s.stage.events = [];
    event(s, { kind: 'sweep', style: 'checkpoint', tiles: row(5), dir: 'right', id: 6 });
    expect(buildStageAlerts(s, 0)[0]!.text).toBe('CAR CROSSING MIDDLE ROAD →');
  });

  it('standing on the lane turns it into a danger alert, until the vehicle has passed you', () => {
    const s = sandbox();
    put(s, 0, 4, 2);
    const ev = event(s, { kind: 'sweep', style: 'traffic', tiles: row(2), dir: 'right', id: 3 });
    expect(buildStageAlerts(s, 0)[0]).toMatchObject({
      level: 'danger',
      text: 'BUS COMING - GET OFF THE LANE!',
    });
    // active: the vehicle is past the player's tile
    s.tick = ev.startTick + 40;
    ev.index = 8;
    expect(buildStageAlerts(s, 0)).toEqual([]);
    ev.index = 2;
    expect(buildStageAlerts(s, 0)[0]).toMatchObject({ level: 'danger', seconds: 0 });
  });

  it('a Danfo bay names its side', () => {
    const s = sandbox();
    put(s, 0, 0, 10);
    event(s, {
      kind: 'sweep',
      style: 'danfo',
      tiles: [...row(4, 14, 11), ...row(4, 12, 14)],
      dir: 'left',
      id: 9,
    });
    expect(buildStageAlerts(s, 0)[0]!.text).toBe('DANFO PULLING IN - RIGHT BAY');
  });

  it('crane debris only alerts the player it is falling on', () => {
    const s = sandbox();
    put(s, 0, 2, 2);
    event(s, { kind: 'strike', style: 'debris', tiles: [idx(2, 2)] });
    expect(buildStageAlerts(s, 0)[0]).toMatchObject({ level: 'danger', text: 'DEBRIS ON YOU - MOVE!' });
    put(s, 0, 3, 2);
    expect(buildStageAlerts(s, 0)).toEqual([]);
  });

  it('power surges warn everyone and shout at whoever stands on the plates', () => {
    const s = sandbox();
    put(s, 0, 0, 10);
    const ev = event(s, { kind: 'strike', style: 'power', tiles: [idx(6, 4), idx(7, 4), idx(8, 4)] });
    expect(buildStageAlerts(s, 0)[0]).toMatchObject({ level: 'warn', text: 'POWER SURGE' });
    put(s, 0, 7, 4);
    expect(buildStageAlerts(s, 0)[0]).toMatchObject({
      level: 'danger',
      text: 'POWER SURGE - GET OFF THE PLATES!',
    });
    s.tick = ev.startTick;
    expect(buildStageAlerts(s, 0)[0]).toMatchObject({
      level: 'danger',
      text: 'LIVE WIRE - MOVE!',
      seconds: 0,
    });
  });

  it('gusts show their direction; the lagoon wash is info unless you are on the edge row', () => {
    const s = sandbox();
    put(s, 0, 0, 10);
    event(s, { kind: 'push', style: 'gust', tiles: row(5), dir: 'left', startTick: s.tick + 90 });
    expect(buildStageAlerts(s, 0)[0]).toMatchObject({ level: 'warn', text: 'GUST ←', seconds: 2 });
    s.stage.events = [];
    event(s, { kind: 'push', style: 'wash', tiles: row(0), dir: 'down' });
    expect(buildStageAlerts(s, 0)[0]).toMatchObject({ level: 'info', text: 'WASH! TOP EDGE' });
    put(s, 0, 4, 0);
    expect(buildStageAlerts(s, 0)[0]).toMatchObject({ level: 'warn', text: 'WASH! GET OFF THE EDGE' });
  });

  it('keeps the most urgent alerts only, danger first', () => {
    const s = sandbox();
    put(s, 0, 2, 2);
    event(s, { kind: 'drop', style: 'merch', tiles: [idx(9, 9)], id: 20 });
    event(s, { kind: 'push', style: 'gust', tiles: row(5), dir: 'right', id: 21 });
    event(s, { kind: 'strike', style: 'debris', tiles: [idx(2, 2)], id: 22 });
    const alerts = buildStageAlerts(s, 0);
    expect(alerts).toHaveLength(MAX_STAGE_ALERTS);
    expect(alerts.map((a) => a.level)).toEqual(['danger', 'warn']);
  });

  it('shows nothing once the player is out or outside the playing phase', () => {
    const s = sandbox();
    event(s, { kind: 'push', style: 'gust', tiles: row(5), dir: 'right' });
    expect(buildStageAlerts(s, 0)).toHaveLength(1);
    s.players[0]!.alive = false;
    expect(buildStageAlerts(s, 0)).toEqual([]);
    s.players[0]!.alive = true;
    s.match.phase = 'ended';
    expect(buildStageAlerts(s, 0)).toEqual([]);
  });

  it('a real Oshodi match: the first traffic warning reaches the HUD snapshot', () => {
    const s = sandbox({ arenaId: 'oshodiInterchange', stage: true });
    let warned = false;
    for (let t = 0; t < 60 * 12 && !warned; t++) {
      warned = tick(s, {}).some((e) => e.type === 'stageWarning');
    }
    expect(warned).toBe(true);
    const hud = buildHud(s, 0, null);
    expect(hud.stageAlerts.length).toBeGreaterThan(0);
    expect(hud.stageAlerts[0]!.style).toBe('traffic');
    expect(hud.stageAlerts[0]!.seconds).toBeGreaterThan(0);
  });
});

describe('HUD: Generator Pass and the arena rule banner', () => {
  it('reports the Generator Pass in the local inventory', () => {
    const s = sandbox();
    expect(buildHud(s, 0, null).me!.contact).toBe(null);
    s.players[0]!.contact = 'pass';
    expect(buildHud(s, 0, null).me!.contact).toBe('pass');
  });

  it('shows the Power Yard rule during the countdown only, and no banner elsewhere', () => {
    const players = [
      { name: 'A', characterId: 'streetBaller' as const, isBot: false },
      { name: 'B', characterId: 'lekkiBoy' as const, isBot: true },
    ];
    const yard = createGame({ seed: 2, arenaId: 'surulerePowerYard', players });
    expect(yard.match.phase).toBe('countdown');
    expect(buildHud(yard, 0, null).ruleBanner).toBe(getArena('surulerePowerYard').info.ruleWarning);
    expect(ruleBannerFor(yard)).toMatch(/WHOLE row and column/);
    yard.match.phase = 'playing';
    expect(buildHud(yard, 0, null).ruleBanner).toBeNull();
    const park = createGame({ seed: 2, arenaId: 'danfoBusPark', players });
    expect(buildHud(park, 0, null).ruleBanner).toBeNull();
  });
});
