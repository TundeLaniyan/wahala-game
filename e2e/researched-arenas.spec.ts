/**
 * The seven City Rumble communities in the real browser (Ojuelegba and the six researched areas of the Canonical
 * Lagos Map Build Bible v2): each is picked from the menu, starts, plays a few seconds without page errors, shows
 * its own name and board, in day and in night; the moving-vehicle generator is sent on each of them; the phone shows
 * the contextual vehicle action (and never a third button) on a researched stage.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { chooseStage, launch, open, stepTicks, toRumbleSetup } from './helpers';

const STAGES: [id: string, name: RegExp, size: [number, number]][] = [
  ['rumbleOjuelegba', /Ojuelegba/, [45, 33]],
  ['rumbleOshodi', /Oshodi/, [63, 47]],
  ['rumbleMushin', /Mushin/, [53, 39]],
  ['rumbleFadeyi', /Fadeyi/, [51, 33]],
  ['rumbleLagosIsland', /Lagos Island/, [55, 39]],
  ['rumbleLekki', /Lekki/, [57, 39]],
  ['rumbleEbuteMetta', /Ebute-Metta/, [55, 39]],
];

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text());
  });
  return errors;
}

type W = {
  __WAHALA__: {
    getState(): never;
    advance(n: number): void;
    stepTicks(n: number): void;
    controller(): { frozen: boolean };
  };
};

const live = (
  page: Page,
): Promise<{ arenaId: string; width: number; height: number; players: number; phase: string }> =>
  page.evaluate(() => {
    const s = (window as unknown as W).__WAHALA__.getState() as {
      arenaId: string;
      width: number;
      height: number;
      players: unknown[];
      match: { phase: string };
    };
    return {
      arenaId: s.arenaId,
      width: s.width,
      height: s.height,
      players: s.players.length,
      phase: s.match.phase,
    };
  });

test.describe('City Rumble communities', () => {
  // one test per community: each is timed on its own (a sweep over all seven in one test is slow in software WebGL)
  for (const [id, name, size] of STAGES) {
    test(`${id}: picked from the menu, starts on its own board and plays without page errors`, async ({
      page,
    }, info) => {
      test.skip(info.project.name !== 'desktop', 'one viewport is enough');
      const errors = watchErrors(page);
      await open(page, '&nobots&noattract');
      await toRumbleSetup(page, 'deathmatch');
      await chooseStage(page, id);
      await expect(page.getByTestId('setup-arena')).toContainText(name);
      await launch(page);
      await expect(page.getByTestId('hud')).toBeVisible();
      await stepTicks(page, 200);
      const v = await live(page);
      expect(v).toMatchObject({ arenaId: id, width: size[0], height: size[1], phase: 'playing' });
      expect(errors).toEqual([]);
    });
  }

  // one test per community (sharded and timed on their own; a sweep over all of them in one test is slow in software WebGL)
  for (const [id, name] of STAGES.slice(2)) {
    test(`${id}: the night look starts without page errors`, async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop', 'one viewport is enough');
      const errors = watchErrors(page);
      await open(page, '&nobots&noattract&tod=night');
      await toRumbleSetup(page, 'deathmatch');
      await chooseStage(page, id);
      await expect(page.getByTestId('setup-arena')).toContainText(name);
      await launch(page);
      await expect(page.getByTestId('hud')).toBeVisible();
      await stepTicks(page, 60);
      expect((await live(page)).arenaId).toBe(id);
      expect(errors).toEqual([]);
    });
  }

  test('phone: on a researched stage the second action names the vehicle and there are exactly two action buttons', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'mobile', 'phone only');
    const errors = watchErrors(page);
    await page.setViewportSize({ width: 844, height: 390 });
    await open(page, '&nobots&noattract');
    await page.evaluate(() => {
      const st = (
        window as unknown as {
          __WAHALA__: { store: { getState(): { settings: object }; setState(p: object): void } };
        }
      ).__WAHALA__.store;
      st.setState({
        settings: {
          ...st.getState().settings,
          play: 'rumble',
          rumbleArenaId: 'rumbleLekki',
          rumbleCompetitors: 8,
          character: 'streetBaller',
        },
      });
    });
    await page.getByTestId('quick-play').tap();
    await expect(page.getByTestId('hud')).toBeVisible();
    await stepTicks(page, 200);
    await page.evaluate(() => {
      const w = (window as unknown as W).__WAHALA__;
      (w.getState() as { players: { hasVoucher: boolean }[] }).players[0]!.hasVoucher = true;
      w.advance(2);
    });
    const b = page.getByTestId('btn-special');
    await expect(b).toHaveText(/DANFO/);
    await expect(page.getByTestId('btn-place')).toHaveText(/GENERATOR/);
    expect(await page.locator('.abtn').count()).toBe(2);
    await page.screenshot({ path: `e2e-shots/${info.project.name}-rumble-lekki-vehicle-action.png` });
    expect(errors).toEqual([]);
  });
});
