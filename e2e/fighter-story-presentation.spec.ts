/**
 * Fighter select and story presentation in a real browser (docs/integrated-release/task6-presentation.md, PS1-PS4):
 *  - the fighter screen shows exactly the playable heroes, labelled "Playable fighters", each a comfortable tap target;
 *  - the prologue's Read more: the radio line is a radio card, and on wide screens and phone landscape the text
 *    column scrolls by itself while the picture stays in view (it used to scroll away, leaving an empty column).
 */
import { expect, test } from '@playwright/test';
import { open } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */

test('fighter select shows the three playable heroes; the story text scrolls beside its picture', async ({
  page,
  isMobile,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page, '&noattract');
  await page.waitForFunction(() => !document.querySelector('[data-testid=menu-loading]'), null, {
    timeout: 120_000,
  });

  // ---- fighter select
  await page.evaluate(() =>
    (window as any).__WAHALA__.store.setState({ menu: { stack: ['home', 'mode', 'setup', 'fighter'] } }),
  );
  await expect(page.getByTestId('roster')).toBeVisible();
  await expect(page.getByTestId('roster-count')).toHaveText(/Playable fighters · 3/i);
  const cards = page.locator('[data-testid^="char-"]');
  await expect(cards).toHaveCount(3);
  for (const id of ['streetBaller', 'lekkiBoy', 'campusQueen']) {
    const card = page.getByTestId(`char-${id}`);
    const box = (await card.boundingBox())!;
    expect(box.height, `${id} tap target`).toBeGreaterThanOrEqual(44);
    expect(box.width, `${id} tap target`).toBeGreaterThanOrEqual(44);
    if (isMobile) await card.tap();
    else await card.click();
    await expect(card).toHaveAttribute('aria-pressed', 'true');
  }

  // ---- prologue story card, Read more open
  await page.evaluate(() => {
    const c = (window as any).__WAHALA__.campaign();
    c.load();
    c.startNew();
  });
  await page.getByTestId('card-readmore').click();
  await expect(page.getByTestId('story-radio').first()).toBeVisible();
  await expect(page.getByTestId('story-radio').first()).toContainText('on the radio');

  const vp = page.viewportSize()!;
  const twoColumns = vp.width >= 900 || vp.height <= 520;
  const text = page.locator('.cp-story-card .cp-card-text');
  const hero = page.getByTestId('story-hero');
  await expect(hero).toBeVisible();
  // scroll the text the way a player does (wheel / drag over the text), to its end
  const tb = (await text.boundingBox())!;
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 250);
  await page.waitForTimeout(400);
  const last = page.locator('.cp-readmore-body .cp-line').last();
  if (twoColumns) {
    const m = await page.evaluate(() => {
      const t = document.querySelector('.cp-story-card .cp-card-text')!;
      return { scrolled: t.scrollTop, room: t.scrollHeight - t.clientHeight };
    });
    expect(m.room, 'the text column has more than fits').toBeGreaterThan(0);
    expect(m.scrolled, 'the text column scrolled to its end').toBeGreaterThanOrEqual(m.room - 2);
    // the picture is still in view beside the text
    const hb = (await hero.boundingBox())!;
    expect(hb.y + hb.height, 'picture bottom on screen').toBeGreaterThan(0);
    expect(hb.y, 'picture top on screen').toBeLessThan(vp.height);
    expect(hb.height).toBeGreaterThan(60);
  }
  // either way the last line of the scene can be read
  await expect(last).toBeInViewport();
  expect(errors).toEqual([]);
});
