/**
 * Forgiving navigation in a real browser (integrated release Task 4, decisions NV1-NV3): on desktop, a turn asked
 * for five tiles before a one-tile market passage while the walk key is still held keeps the fighter walking and is
 * taken at the gap; on a phone, the thumb's 2-tile early turn into the same passage, and Settings > Control size
 * Large making the on-screen controls bigger. The sim is frozen and moved only by `stepTicks`.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { getState, mutate, open as openTitle, startMatch, stepTicks, thumb } from './helpers';

// software WebGL on a shared machine: a long thumb drag across many frames needs more than the default budget
test.setTimeout(240_000);

async function open(page: Page): Promise<void> {
  await openTitle(page, '&nobots');
  await page.evaluate(() => {
    const st = (
      window as unknown as {
        __WAHALA__: { store: { getState(): { settings: object }; setState(p: object): void } };
      }
    ).__WAHALA__.store;
    st.setState({ settings: { ...st.getState().settings, play: 'classic' } });
  });
}

/** Everything concrete except the given rows ('.' floor), the local player at `at`, the rival parked in the wall. */
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

/** A corridor up x = 1 from y = 8; the only way right is the one-tile gap at y = 2. */
const PASSAGE = [
  '#########',
  '#.#######',
  '#.......#',
  '#.#######',
  '#.#######',
  '#.#######',
  '#.#######',
  '#.#######',
  '#.#######',
  '#########',
];

test('desktop: RIGHT held five tiles early with UP still held walks on and turns into the passage', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'desktop project only');
  await open(page);
  await startMatch(page, { competitors: 2 });
  await carve(page, PASSAGE, [1, 8]);
  await page.keyboard.down('ArrowUp');
  for (let i = 0; i < 60 && (await pos(page))[1] > 7; i++) await stepTicks(page, 1);
  await page.keyboard.down('ArrowRight'); // five tiles before the gap, UP still held
  await stepTicks(page, 120);
  const at = await pos(page);
  expect(at[1], 'turned at the gap row').toBe(2);
  expect(at[0], 'and walked into the passage').toBeGreaterThan(2);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('ArrowUp');
});

test('phone: the thumb turned two tiles early takes the passage; Large controls are bigger', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'phone project only');
  await open(page);
  await startMatch(page, { competitors: 2 });
  const size = async (): Promise<number> => (await page.getByTestId('btn-place').boundingBox())!.width;
  const normal = await size();
  await carve(page, PASSAGE, [1, 8]);
  await thumb(page, 'up', 40); // three tiles up: from y = 8 to about y = 4
  const mid = await pos(page);
  expect(mid[0]).toBe(1);
  // two tiles (or less) before the gap: point right; the turn is carried along the corridor to the gap
  await thumb(page, 'right', 70);
  const at = await pos(page);
  expect(at[1]).toBe(2);
  expect(at[0]).toBeGreaterThan(1);
  // Settings > Control size: Large (the setting the menu writes), the buttons grow
  await page.evaluate(() => {
    const st = (
      window as unknown as {
        __WAHALA__: { store: { getState(): { settings: object }; setState(p: object): void } };
      }
    ).__WAHALA__.store;
    st.setState({ settings: { ...st.getState().settings, controlSize: 'large' } });
  });
  await expect(page.getByTestId('touch-controls')).toHaveAttribute('data-size', 'large');
  await expect.poll(size).toBeGreaterThan(normal * 1.08);
});
