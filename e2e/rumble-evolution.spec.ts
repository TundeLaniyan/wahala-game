import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mutate, open, stepTicks, toRumbleSetup } from './helpers';

/**
 * City Rumble Evolution (docs/RUMBLE_EVOLUTION.md) in the real game: the five-district Ojuelegba stage starts
 * from the menu, Rumble blasts are radial (a diagonal neighbour is hit) with two starting generators, the
 * Blast shape switch plays the cross, and the signalled Danfo pull-out is telegraphed on the board.
 */

type Live = {
  arenaId: string;
  blastMode: string;
  capacities: number[];
  width: number;
  height: number;
};

const live = (page: Page): Promise<Live> =>
  page.evaluate(() => {
    const s = (window as never as { __WAHALA__: { getState(): never } }).__WAHALA__.getState() as {
      arenaId: string;
      config: { generator: { blastMode: string } };
      players: { capacity: number }[];
      width: number;
      height: number;
    };
    return {
      arenaId: s.arenaId,
      blastMode: s.config.generator.blastMode,
      capacities: s.players.map((p) => p.capacity),
      width: s.width,
      height: s.height,
    };
  });

/** Home -> City Rumble Survival -> 8 fighters on Ojuelegba with the chosen blast shape -> play. */
async function startOjuelegba(page: Page, blast: 'radial' | 'cross'): Promise<void> {
  await toRumbleSetup(page, 'survival');
  await page.getByTestId('rumble-8').click();
  await expect(page.getByTestId('blast-radial')).toBeVisible();
  await page.getByTestId(`blast-${blast}`).click();
  await expect(page.getByTestId(`blast-${blast}`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('blast-note')).toContainText(blast === 'cross' ? 'Classic cross' : 'circle');
  await page.getByTestId('setup-arena').click();
  await page.getByTestId('rumble-stage-rumbleOjuelegba').click();
  await page.getByTestId('arena-confirm').click();
  await expect(page.getByTestId('setup-arena')).toContainText('Ojuelegba');
  await page.getByTestId('menu-continue').click();
  await page.getByTestId('menu-continue').click();
  await expect(page.getByTestId('ready-rules')).toContainText(blast === 'cross' ? 'Cross blasts' : 'Radial blasts');
  await page.getByTestId('start-button').click();
  await expect(page.getByTestId('hud')).toBeVisible();
  await stepTicks(page, 170); // past the countdown
}

/**
 * Finds an open 5 x 5 patch, parks the local player diagonally next to its centre (no protection) and drops
 * an opponent's generator on the centre with a short fuse. Returns nothing; read the outcome from the state.
 */
async function diagonalSetup(page: Page): Promise<void> {
  await mutate(
    page,
    `const me = s.players[0];
     const open = (x, y) => x >= 0 && y >= 0 && x < s.width && y < s.height && s.tiles[y * s.width + x] === 0;
     let cx = -1, cy = -1;
     for (let y = 2; y < s.height - 2 && cx < 0; y++)
       for (let x = 2; x < s.width - 2 && cx < 0; x++) {
         let ok = true;
         for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -2; dx <= 2 && ok; dx++) ok = open(x + dx, y + dy);
         if (ok && !s.players.some((p, i) => i > 0 && p.alive && Math.abs(p.x - x) <= 3 && Math.abs(p.y - y) <= 3)) { cx = x; cy = y; }
       }
     if (cx < 0) throw new Error('no open 5 x 5 patch');
     me.x = me.stepFromX = cx + 1; me.y = me.stepFromY = cy + 1; me.stepRemaining = 0;
     me.protectedUntil = 0; me.armour = 0; me.mounted = false;
     s.generators.push({ id: s.nextId++, ownerId: 1, x: cx, y: cy, stepFromX: cx, stepFromY: cy, range: 2, pierce: false,
       square: 0, fromSpectator: false, mode: 'timed', timer: 30, carriedBy: null, carryBonusUsed: false, slide: null,
       flight: null, triggered: false, placedTick: s.tick });`,
  );
}

const meAlive = (page: Page): Promise<boolean> =>
  page.evaluate(
    () =>
      ((window as never as { __WAHALA__: { getState(): never } }).__WAHALA__.getState() as { players: { alive: boolean }[] })
        .players[0]!.alive,
  );

test.describe('City Rumble Evolution', () => {
  test('Ojuelegba five districts: radial blasts hit the diagonal, two generators, the danger footprint shows it', async ({
    page,
  }, info) => {
    test.setTimeout(600_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page, '&nobots&noattract');
    await startOjuelegba(page, 'radial');
    const s = await live(page);
    expect(s.arenaId).toBe('rumbleOjuelegba');
    expect(s.blastMode).toBe('radial');
    expect(s.capacities.every((c) => c === 2)).toBe(true);
    expect([s.width, s.height]).toEqual([45, 33]);

    await diagonalSetup(page);
    // the live danger footprint: let a few frames render while the fuse burns, then capture it
    await page.evaluate(() => ((window as never as { __WAHALA__: { controller(): { frozen: boolean } } }).__WAHALA__.controller().frozen = true));
    await page.waitForTimeout(800);
    await page.screenshot({ path: `e2e-shots/${info.project.name}-radial-footprint.png` });
    await stepTicks(page, 40);
    expect(await meAlive(page)).toBe(false);
    expect(errors).toEqual([]);
  });

  test('Blast shape "Cross" plays City Rumble with the Classic plus: the diagonal is safe', async ({ page }) => {
    test.setTimeout(600_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page, '&nobots&noattract');
    await startOjuelegba(page, 'cross');
    const s = await live(page);
    expect(s.blastMode).toBe('plus');
    expect(s.capacities.every((c) => c === 2)).toBe(true);
    await diagonalSetup(page);
    await stepTicks(page, 40);
    expect(await meAlive(page)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('the Danfo pull-out is telegraphed on the departure strip before it turns lethal', async ({ page }, info) => {
    test.setTimeout(600_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page, '&nobots&noattract');
    await startOjuelegba(page, 'radial');
    // keep the local player out of every hazard while the stage clock runs
    await mutate(page, `s.players[0].protectedUntil = 1e9;`);
    let warned: { startTick: number; tick: number } | null = null;
    for (let i = 0; i < 60 && !warned; i++) {
      await stepTicks(page, 30);
      warned = await page.evaluate(() => {
        const s = (window as never as { __WAHALA__: { getState(): never } }).__WAHALA__.getState() as {
          tick: number;
          stage: { events: { depart?: boolean; startTick: number; kind: string }[] };
        };
        const e = s.stage.events.find((ev) => ev.depart);
        return e ? { startTick: e.startTick, tick: s.tick } : null;
      });
    }
    expect(warned).not.toBeNull();
    // still in its telegraph (lethal from startTick, at least the minimum warning ahead)
    expect(warned!.startTick).toBeGreaterThan(warned!.tick);
    // follow the warned lane with the camera and capture the parked bus + the lit lane
    await mutate(
      page,
      `const e = s.stage.events.find((ev) => ev.depart); const t = e.tiles[0];
       const me = s.players[0]; const bx = t % s.width, by = Math.floor(t / s.width);
       for (let r = 1; r < 6; r++) { let done = false;
         for (const [dx, dy] of [[-r, 0], [-r, -1], [-r, 1], [0, -r]]) {
           const x = bx + dx, y = by + dy;
           if (x >= 0 && y >= 0 && x < s.width && y < s.height && s.tiles[y * s.width + x] === 0 && !e.tiles.includes(y * s.width + x)) {
             me.x = me.stepFromX = x; me.y = me.stepFromY = y; me.stepRemaining = 0; done = true; break; }
         }
         if (done) break; }`,
    );
    await page.waitForTimeout(800);
    await page.screenshot({ path: `e2e-shots/${info.project.name}-danfo-departure-warning.png` });
    expect(errors).toEqual([]);
  });
});
