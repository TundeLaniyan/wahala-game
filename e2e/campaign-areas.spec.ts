/**
 * Oshodi's campaign areas in a real browser (docs/CAMPAIGN_WORLD.md, decisions WX1-WX8), on the desktop and the landscape
 * phone projects: each field mission loads its own campaign-only board (not the City Rumble map), the scene is built (the
 * area's cover, its gate, a drawn frame) with no page error, and the mission can be completed:
 *
 *   Terminal Approach   through the real campaign flow: the checkpoints (the depot gate opens), the door hold starts the
 *                       warehouse raid, the raid's end (staged outcome, as e2e/campaign-expansion-smoke.spec.ts does)
 *                       brings the field back, the walk to the Orita gate wins it and the result screen shows
 *   Rail Edge           through the debug start path: each leg staged in the sim state (the legs' rules have their own
 *                       unit tests), the station barrier lifts after the plaza, the footbridge and the park gate win it
 *
 * Time moves only with `stepTicks` (sim ticks; the controller is frozen while staging).
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { inMatch, open } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Puts the human on (x, y) and runs `ticks` sim ticks (staging only: protected from the wardens). */
async function stage(page: Page, x: number, y: number, ticks: number): Promise<void> {
  await page.evaluate(
    ({ x, y, ticks }) => {
      const w = (window as any).__WAHALA__;
      const s = w.getState();
      const p = s.players[0];
      p.x = p.stepFromX = x;
      p.y = p.stepFromY = y;
      p.stepRemaining = 0;
      p.protectedUntil = s.tick + 100000;
      w.stepTicks(ticks);
    },
    { x, y, ticks },
  );
}

/** The scene as built: the arena, the sector and its gates, and the renderer's counters. */
async function scene(page: Page): Promise<any> {
  return page.evaluate(() => {
    const w = (window as any).__WAHALA__;
    const s = w.getState();
    return {
      arenaId: s.arenaId,
      game: s.settings.game,
      sector: s.sector?.id ?? null,
      gates: (s.sector?.gates ?? []).map((g: any) => ({ id: g.id, open: g.open })),
      drawn: w.sector(),
      stats: w.stats(),
      width: s.width,
    };
  });
}

async function playing(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = (window as any).__WAHALA__;
    w.controller().frozen = true;
    const s = w.getState();
    while (s.match.phase !== 'playing') w.stepTicks(10);
    w.stepTicks(2);
  });
}

test('Terminal Approach: the Orita Gate area loads through the campaign and is completed through the raid', async ({
  page,
}) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page, '&noattract');
  await page.evaluate(() => {
    const c = (window as any).__WAHALA__.campaign();
    c.load();
    c.startNew();
    c.storyDone();
    if (!c.startSectionMission('oshodi.approach')) throw new Error('mission did not start');
  });
  await inMatch(page);
  await playing(page);
  const at = await scene(page);
  expect(at.arenaId).toBe('campaignOshodiOrita');
  expect(at.sector).toBe('oshodi.orita');
  expect(at.gates).toEqual([{ id: 'depotGate', open: false }]);
  expect(at.drawn.barricades).toBe(1);
  await expect.poll(async () => (await scene(page)).stats?.triangles ?? 0).toBeGreaterThan(10_000);
  await expect(page.getByTestId('minimap')).toBeVisible();

  const def = await page.evaluate(() => (window as any).__WAHALA__.fieldMissionDef('oshodi.approach'));
  for (const m of def.legs[0].markers) await stage(page, m.x, m.y, 2);
  // the checkpoints are walked: the depot's steel gate opens (a sector transition)
  expect((await scene(page)).gates).toEqual([{ id: 'depotGate', open: true }]);
  await stage(page, def.doors[0].x, def.doors[0].y, 150);
  await page.waitForFunction(() => (window as any).__WAHALA__.getState().settings.game === 'raid', null, {
    timeout: 120_000,
  });
  await inMatch(page);
  await page.evaluate(() => {
    const s = (window as any).__WAHALA__.getState();
    s.raid.outcome = {
      raidId: s.raid.raidId,
      result: 'completed',
      seconds: 60,
      optionalRoomsOpened: 1,
      optionalRoomsTotal: 2,
      cargoDestroyed: 3,
      cargoTotal: 3,
      hpLeft: 3,
      livesUsed: 0,
      stars: 3,
    };
  });
  await page.waitForFunction(() => (window as any).__WAHALA__.getState().settings.game === 'mission', null, {
    timeout: 120_000,
  });
  await inMatch(page);
  const back = await scene(page);
  expect(back.arenaId).toBe('campaignOshodiOrita');
  await page.evaluate(() => ((window as any).__WAHALA__.controller().frozen = true));
  await stage(page, def.returnMarker.x, def.returnMarker.y, 4);
  const out = await page.evaluate(() => (window as any).__WAHALA__.getState().mission.outcome);
  expect(out).toMatchObject({ result: 'won', sectionMissionId: 'oshodi.approach' });
  await page.evaluate(() => ((window as any).__WAHALA__.controller().frozen = false));
  await expect(page.getByTestId('menu-campaignResult')).toBeVisible({ timeout: 120_000 });
  expect(errors).toEqual([]);
});

test('Rail Edge: the Railside area loads its own board and the mission is completed (debug start path)', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page, '&noattract');
  expect(await page.evaluate(() => (window as any).__WAHALA__.startFieldMission('oshodi.railEdge'))).toBe(
    true,
  );
  await inMatch(page);
  await playing(page);
  const at = await scene(page);
  expect(at.arenaId).toBe('campaignOshodiRailside');
  expect(at.sector).toBe('oshodi.railside');
  expect(at.gates).toEqual([{ id: 'stationBarrier', open: false }]);
  await expect.poll(async () => (await scene(page)).stats?.triangles ?? 0).toBeGreaterThan(10_000);

  // the legs, staged in the sim state one at a time (their rules have unit tests): the hawkers, the boxes, the plaza
  const leg = (): Promise<number> =>
    page.evaluate(() => (window as any).__WAHALA__.getState().mission.field.leg);
  await page.evaluate(() => {
    const w = (window as any).__WAHALA__;
    const s = w.getState();
    for (const seat of s.mission.seats.filter((x: any) => x.group === 'hawkers'))
      s.players[seat.playerId].alive = false;
    w.stepTicks(2);
  });
  expect(await leg()).toBe(1);
  await page.evaluate(() => {
    const w = (window as any).__WAHALA__;
    const s = w.getState();
    for (const t of s.mission.field.targets) {
      t.hp = 0;
      t.destroyed = true;
    }
    w.stepTicks(2);
  });
  expect(await leg()).toBe(2);
  await page.evaluate(() => {
    const w = (window as any).__WAHALA__;
    const s = w.getState();
    for (const seat of s.mission.seats.filter((x: any) => x.group !== 'pursuers' && x.role !== 'player'))
      s.players[seat.playerId].alive = false;
    s.mission.field.hold.ticks = 25 * 60;
    w.stepTicks(2);
  });
  expect(await leg()).toBe(3);
  // the plaza is held: the station barrier lifts for the escape
  expect((await scene(page)).gates).toEqual([{ id: 'stationBarrier', open: true }]);
  const def = await page.evaluate(() => (window as any).__WAHALA__.fieldMissionDef('oshodi.railEdge'));
  const escape = def.legs.find((l: any) => l.kind === 'escapeRoute');
  await stage(page, escape.exit.x, escape.exit.y, 2);
  expect(await leg()).toBe(4);
  await stage(page, def.returnMarker.x, def.returnMarker.y, 4);
  const out = await page.evaluate(() => (window as any).__WAHALA__.getState().mission.outcome);
  expect(out).toMatchObject({ result: 'won', sectionMissionId: 'oshodi.railEdge' });
  expect(errors).toEqual([]);
});

// ------------------------------------------------------------------------------- the community districts' areas

/** A won outcome the campaign controller accepts (as e2e/campaign.spec.ts builds them): a boss, or a section mission. */
const won = (missionId: string, sectionMissionId?: string): Record<string, unknown> => ({
  result: 'won',
  missionId,
  modifiers: [],
  seconds: 118,
  livesUsed: 1,
  phasesCleared: 3,
  defeat: sectionMissionId ? null : 'eliminated',
  stars: 2,
  creditedKills: 3,
  ...(sectionMissionId ? { sectionMissionId, raidBonus: 0 } : {}),
});

/** The districts before the finale, won (their field missions then replay from the map). */
const BEFORE_FINALE = ['oshodi', 'mushin', 'fadeyiSomolu', 'ebuteMetta', 'lagosIsland', 'lekki'].map((d) =>
  won(d),
);

/**
 * Every other district's campaign areas (docs/CAMPAIGN_WORLD.md, decisions WM1, WF, WE, WL): each field mission is started
 * through the real campaign flow (a save in which the earlier districts and sections are cleared through the real
 * controller), loads its own campaign-only board with the human on the mission's start, builds the scene with its gates
 * closed, and every gate opens once the legs before it are done (staged in the sim state; the legs' rules have their own
 * unit tests). One entry per area; extend this list.
 */
const COMMUNITY_AREAS: readonly {
  fieldId: string;
  arenaId: string;
  sector: string;
  /** The sector's gates, closed at the start (an area may have none). */
  gates: string[];
  /** Outcomes finished before the start: the districts and sections the mission needs. */
  before: Record<string, unknown>[];
}[] = [
  {
    fieldId: 'mushin.approach',
    arenaId: 'campaignMushinPartsRow',
    sector: 'mushin.partsRow',
    gates: ['yardGate'],
    before: [won('oshodi')],
  },
  {
    fieldId: 'mushin.market',
    arenaId: 'campaignMushinMarketHall',
    sector: 'mushin.marketHall',
    gates: ['hallGate'],
    before: [won('oshodi'), won('mushin', 'mushin.approach')],
  },
  {
    fieldId: 'fadeyiSomolu.approach',
    arenaId: 'campaignFadeyiTollCorridor',
    sector: 'fadeyiSomolu.tollCorridor',
    gates: ['yardTollBar'],
    before: [won('oshodi'), won('mushin')],
  },
  {
    fieldId: 'fadeyiSomolu.junctions',
    arenaId: 'campaignFadeyiSideRoutes',
    sector: 'fadeyiSomolu.sideRoutes',
    gates: ['routeCheckpoint'],
    before: [won('oshodi'), won('mushin'), won('fadeyiSomolu', 'fadeyiSomolu.approach')],
  },
  {
    fieldId: 'lekki.approach',
    arenaId: 'campaignLekkiEstateGate',
    sector: 'lekki.estateGate',
    gates: ['gateBoom'],
    before: BEFORE_FINALE,
  },
  {
    fieldId: 'lekki.estate',
    arenaId: 'campaignLekkiInnerEstate',
    sector: 'lekki.innerEstate',
    gates: ['lawnGate'],
    before: BEFORE_FINALE,
  },
  {
    fieldId: 'ojuelegba.return',
    arenaId: 'campaignOjuelegbaSouthStreets',
    sector: 'ojuelegba.southStreets',
    gates: ['laneBarrier', 'cornerGate'],
    before: BEFORE_FINALE,
  },
  {
    fieldId: 'ojuelegba.junction',
    arenaId: 'campaignOjuelegbaBusInterchange',
    sector: 'ojuelegba.busInterchange',
    gates: [],
    before: [...BEFORE_FINALE, won('ojuelegba', 'ojuelegba.return')],
  },
];

for (const area of COMMUNITY_AREAS) {
  test(`${area.fieldId}: its campaign area loads through the campaign, is drawn, and its gates open on their legs`, async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page, '&noattract');
    const started = await page.evaluate(
      ({ fieldId, before }) => {
        const c = (window as any).__WAHALA__.campaign();
        c.load();
        c.startNew();
        c.storyDone();
        for (const o of before) c.finishMission(o);
        c.toMap();
        return c.startSectionMission(fieldId);
      },
      { fieldId: area.fieldId, before: area.before },
    );
    expect(started).toBe(true);
    await inMatch(page);
    await playing(page);
    const at = await scene(page);
    expect(at.arenaId).toBe(area.arenaId);
    expect(at.game).toBe('mission');
    expect(at.sector).toBe(area.sector);
    expect(at.gates).toEqual(area.gates.map((id) => ({ id, open: false })));
    expect(at.drawn?.barricades ?? 0).toBe(area.gates.length);
    await expect.poll(async () => (await scene(page)).stats?.triangles ?? 0).toBeGreaterThan(10_000);
    await expect(page.getByTestId('minimap')).toBeVisible();
    // the human stands on the mission's start, on the area's own board
    const def = await page.evaluate((id) => (window as any).__WAHALA__.fieldMissionDef(id), area.fieldId);
    const me = await page.evaluate(() => {
      const s = (window as any).__WAHALA__.getState();
      return [s.players[0].x, s.players[0].y, s.mission.field.fieldId];
    });
    expect(me).toEqual([def.start[0], def.start[1], area.fieldId]);

    // the legs before the last gate, staged one at a time in the sim state
    const sector = await page.evaluate(() => (window as any).__WAHALA__.getState().sector);
    const opensAfter: number = Math.max(-1, ...(sector.gates ?? []).map((g: any) => g.opensAfterLeg));
    for (let k = 0; k <= opensAfter; k++) {
      const leg = def.legs[k];
      if (leg.kind === 'reachMarkers') for (const m of leg.markers) await stage(page, m.x, m.y, 2);
      else
        await page.evaluate(
          ({ l, k }) => {
            const w = (window as any).__WAHALA__;
            const s = w.getState();
            if (l.kind === 'clearGroup')
              for (const seat of s.mission.seats.filter((x: any) => x.group === l.group))
                s.players[seat.playerId].alive = false;
            // only this leg's pieces: a piece wrecked before its leg counts when the leg comes (`legTargets`)
            if (l.kind === 'destroyTargets')
              for (const t of s.mission.field.targets.filter((x: any) => x.leg === k)) {
                t.hp = 0;
                t.destroyed = true;
              }
            if (l.kind === 'holdArea') {
              for (const seat of s.mission.seats.filter(
                (x: any) => x.group !== 'pursuers' && x.role !== 'player',
              ))
                s.players[seat.playerId].alive = false;
              s.mission.field.hold.ticks = l.holdSec * 60;
            }
            w.stepTicks(2);
          },
          { l: leg, k },
        );
      expect(await page.evaluate(() => (window as any).__WAHALA__.getState().mission.field.leg)).toBe(k + 1);
    }
    expect((await scene(page)).gates).toEqual(area.gates.map((id) => ({ id, open: true })));
    expect(errors).toEqual([]);
  });
}

// ------------------------------------------------------------- Ebute Metta and Lagos Island, played to the end

/**
 * The community districts' campaign areas (Ebute Metta and Lagos Island, decisions WE1-WE8): each field mission starts
 * through the real campaign flow (a save with the earlier districts cleared, `startSectionMission`), loads its own
 * campaign-only board with its sector gate closed, builds the scene and the minimap with no page error, and is completed:
 * each leg staged in the sim state (their rules have unit tests), the gate open after its leg, a door's raid handed over
 * and back (staged outcome), the escape exit and the return marker.
 */
const COMPLETED_AREAS: readonly {
  fieldId: string;
  arena: string;
  sector: string;
  gate: string;
  through: string[];
}[] = [
  {
    fieldId: 'ebuteMetta.approach',
    arena: 'campaignEbuteFreightYard',
    sector: 'ebuteMetta.freightYard',
    gate: 'sidingsGate',
    through: ['oshodi', 'mushin', 'fadeyiSomolu', 'ebuteMetta'],
  },
  {
    fieldId: 'lagosIsland.approach',
    arena: 'campaignLagosLedgerLanes',
    sector: 'lagosIsland.ledgerLanes',
    gate: 'recordsGate',
    through: ['oshodi', 'mushin', 'fadeyiSomolu', 'ebuteMetta', 'lagosIsland'],
  },
  {
    fieldId: 'lagosIsland.press',
    arena: 'campaignLagosPressYards',
    sector: 'lagosIsland.pressYards',
    gate: 'laneCheckpoint',
    through: ['oshodi', 'mushin', 'fadeyiSomolu', 'ebuteMetta', 'lagosIsland'],
  },
];

const bossWin = (missionId: string): Record<string, unknown> => ({
  result: 'won',
  missionId,
  modifiers: [],
  seconds: 150,
  livesUsed: 0,
  phasesCleared: 3,
  defeat: 'eliminated',
  stars: 2,
  creditedKills: 3,
});

for (const a of COMPLETED_AREAS)
  test(`${a.fieldId}: its campaign area loads through the campaign and the mission is completed`, async ({
    page,
  }) => {
    test.setTimeout(600_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page, '&noattract');
    await page.evaluate(
      ({ wins, fieldId }) => {
        const c = (window as any).__WAHALA__.campaign();
        c.load();
        c.startNew();
        c.storyDone();
        for (const w of wins) c.finishMission(w);
        c.toMap();
        if (!c.startSectionMission(fieldId)) throw new Error('mission did not start');
      },
      { wins: a.through.map(bossWin), fieldId: a.fieldId },
    );
    await inMatch(page);
    await playing(page);
    const at = await scene(page);
    expect(at.arenaId).toBe(a.arena);
    expect(at.sector).toBe(a.sector);
    expect(at.gates).toEqual([{ id: a.gate, open: false }]);
    expect(at.drawn.barricades).toBe(1);
    await expect.poll(async () => (await scene(page)).stats?.triangles ?? 0).toBeGreaterThan(10_000);
    await expect(page.getByTestId('minimap')).toBeVisible();

    const def = await page.evaluate((id) => (window as any).__WAHALA__.fieldMissionDef(id), a.fieldId);
    const sector = await page.evaluate(() => (window as any).__WAHALA__.getState().sector);
    const gateLeg: number = sector.gates[0].opensAfterLeg;
    const leg = (): Promise<number> =>
      page.evaluate(() => (window as any).__WAHALA__.getState().mission.field.leg);
    for (let i = 0; i < def.legs.length; i++) {
      const l = def.legs[i];
      expect(await leg()).toBe(i);
      if (l.kind === 'door') {
        const door = def.doors.find((d: any) => d.id === l.doorId);
        await stage(page, door.x, door.y, 150);
        await page.waitForFunction(
          () => (window as any).__WAHALA__.getState().settings.game === 'raid',
          null,
          { timeout: 120_000 },
        );
        await inMatch(page);
        await page.evaluate(() => {
          const s = (window as any).__WAHALA__.getState();
          s.raid.outcome = {
            raidId: s.raid.raidId,
            result: 'completed',
            seconds: 60,
            optionalRoomsOpened: 1,
            optionalRoomsTotal: 2,
            cargoDestroyed: 3,
            cargoTotal: 3,
            hpLeft: 3,
            livesUsed: 0,
            stars: 3,
          };
        });
        await page.waitForFunction(
          () => (window as any).__WAHALA__.getState().settings.game === 'mission',
          null,
          { timeout: 120_000 },
        );
        await inMatch(page);
        expect((await scene(page)).arenaId).toBe(a.arena);
        await page.evaluate(() => ((window as any).__WAHALA__.controller().frozen = true));
      } else if (l.kind === 'escapeRoute') {
        await stage(page, l.exit.x, l.exit.y, 2);
      } else {
        await page.evaluate((l) => {
          const w = (window as any).__WAHALA__;
          const s = w.getState();
          const down = (pred: (seat: any) => boolean): void => {
            for (const seat of s.mission.seats.filter((x: any) => x.role !== 'player' && pred(x)))
              s.players[seat.playerId].alive = false;
          };
          if (l.kind === 'clearGroup') down((x) => x.group === l.group);
          if (l.kind === 'destroyTargets')
            for (const t of s.mission.field.targets) {
              t.hp = 0;
              t.destroyed = true;
            }
          if (l.kind === 'holdArea') {
            down((x) => x.group !== 'pursuers');
            s.mission.field.hold.ticks = l.holdSec * 60;
          }
          w.stepTicks(2);
        }, l);
      }
      expect(await leg()).toBe(i + 1);
      // the sector gate opens after its leg (a sector transition)
      expect((await scene(page)).gates).toEqual([{ id: a.gate, open: i >= gateLeg }]);
    }
    await stage(page, def.returnMarker.x, def.returnMarker.y, 4);
    const out = await page.evaluate(() => (window as any).__WAHALA__.getState().mission.outcome);
    expect(out).toMatchObject({ result: 'won', sectionMissionId: a.fieldId });
    expect(errors).toEqual([]);
  });
