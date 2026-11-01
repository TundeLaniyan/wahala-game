/**
 * Corner movement in a real browser (decision MV1): a turn tapped a tile or two before a corner is taken at the
 * corner (keyboard on desktop, thumb on phones), holding into a wall does not keep bumping it, a thumb held up a
 * one-tile corridor follows its bend, and a short tap is still exactly one tile.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { getState, holdKey, mutate, open as openTitle, startMatch, stepTicks, thumb } from './helpers';

async function open(page: Page): Promise<void> {
  await openTitle(page, '&nobots');
  // these specs drive Classic Battle, the quick match
  await page.evaluate(() => {
    const st = (
      window as unknown as {
        __WAHALA__: { store: { getState(): { settings: object }; setState(p: object): void } };
      }
    ).__WAHALA__.store;
    st.setState({ settings: { ...st.getState().settings, play: 'classic' } });
  });
}

/** Everything concrete except the given ASCII rows ('.' floor), the local player at `at`, the rival parked in the wall. */
async function carve(page: Page, rows: string[], at: [number, number]): Promise<void> {
  await mutate(
    page,
    `const rows = ${JSON.stringify(rows)};
     s.tiles = s.tiles.map(() => 1);
     rows.forEach((row, y) => [...row].forEach((c, x) => { if (c === '.') s.tiles[y * s.width + x] = 0; }));
     s.hidden = {}; s.pickups = [];
     const p = s.players[0];
     p.x = p.stepFromX = ${at[0]}; p.y = p.stepFromY = ${at[1]}; p.stepRemaining = 0;
     const r = s.players[1]; r.x = r.stepFromX = 14; r.y = r.stepFromY = 10; r.stepRemaining = 0;`,
  );
}

const pos = async (page: Page): Promise<[number, number]> => {
  const p = (await getState(page)).players[0]!;
  return [p.x, p.y];
};

/** A corridor along y = 1 with a side street down at x = 6. */
const STREET = [
  '###########',
  '#.........#', //
  '######.####',
  '######.####',
  '###########',
];
/** A one-tile corridor that goes up from (1,5), bends right at (1,1) and dead-ends at (7,1). */
const BEND = ['#########', '#.......#', '#.#######', '#.#######', '#.#######', '#.#######', '#########'];

test.describe('corner movement: desktop keyboard', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop project only');

  test('a turn tapped two tiles before the corner is carried and taken at the corner', async ({ page }) => {
    await open(page);
    await startMatch(page, { competitors: 2 });
    await carve(page, STREET, [1, 1]);
    await page.keyboard.down('ArrowRight');
    for (let i = 0; i < 60 && (await pos(page))[0] < 4; i++) await stepTicks(page, 1);
    expect((await pos(page))[0]).toBe(4);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.down('ArrowDown'); // two tiles before the side street at x = 6
    await stepTicks(page, 3);
    await page.keyboard.up('ArrowDown'); // a tap: the finger is off before the corner
    await stepTicks(page, 150);
    expect(await pos(page)).toEqual([6, 2]); // along the street to the opening, then ONE tile down
  });

  test('holding into a wall does not bump it every step, and a short tap is exactly one tile', async ({
    page,
  }) => {
    await open(page);
    await startMatch(page, { competitors: 2 });
    await carve(page, STREET, [3, 1]);
    await holdKey(page, 'ArrowUp', 200); // pressed against the wall
    expect(await pos(page)).toEqual([3, 1]);
    await page.keyboard.down('ArrowRight'); // a tap: one tile
    await stepTicks(page, 3);
    await page.keyboard.up('ArrowRight');
    await stepTicks(page, 60);
    expect(await pos(page)).toEqual([4, 1]);
  });

  test('keyboard keeps its precision: no sliding round a corridor bend', async ({ page }) => {
    await open(page);
    await startMatch(page, { competitors: 2 });
    await carve(page, BEND, [1, 5]);
    await holdKey(page, 'ArrowUp', 400);
    expect(await pos(page)).toEqual([1, 1]); // stops at the corner; the player turns it
  });
});

test.describe('corner movement: phone thumb', () => {
  test.slow();
  test.skip(({ isMobile }) => !isMobile, 'mobile project only');

  test('a thumb held up a one-tile corridor follows its bend to the end, one clean tile at a time', async ({
    page,
  }) => {
    await open(page);
    await startMatch(page, { competitors: 2 });
    await carve(page, BEND, [1, 5]);
    await thumb(page, 'up', 400);
    expect(await pos(page)).toEqual([7, 1]);
  });

  test('a flick toward a turn a tile or two early is taken at the corner; a plain flick is one tile', async ({
    page,
  }) => {
    await open(page);
    await startMatch(page, { competitors: 2 });
    await carve(page, STREET, [1, 1]);
    // the thumb walks right along the street, then swings down two tiles before the side street and stays there
    const zone = (await page.getByTestId('stick-zone').boundingBox())!;
    const x = zone.x + zone.width * 0.4;
    const y = zone.y + zone.height * 0.65;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 46, y, { steps: 4 });
    for (let i = 0; i < 80 && (await pos(page))[0] < 4; i++) await stepTicks(page, 1);
    expect((await pos(page))[0]).toBe(4);
    await page.mouse.move(x, y + 46, { steps: 4 });
    await stepTicks(page, 150);
    await page.mouse.up();
    const [px, py] = await pos(page);
    expect(px).toBe(6); // carried along the street to the opening
    expect(py).toBeGreaterThanOrEqual(2); // and turned down it
    await carve(page, STREET, [2, 1]);
    await thumb(page, 'right', 3, { settle: 60 }); // a short flick: exactly one tile
    expect(await pos(page)).toEqual([3, 1]);
  });
});
