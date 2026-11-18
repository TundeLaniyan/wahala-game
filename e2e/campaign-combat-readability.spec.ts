/**
 * Campaign combat readability in a real browser (docs/CAMPAIGN_SECTOR_AI.md "Enemy telegraphs and looks", decisions
 * SV1-SV8): Terminal Approach started through the debug handle (`startFieldMission`), the REAL enemy bots and the
 * territorial layer, time moved only by `advance` (every tick's events reach the renderer, as in play).
 *
 *  - a warden that notices the human shows the "!" awareness mark over its head (from its `enemyCue` / mind);
 *  - next to the human it winds up a punch and the melee telegraph is drawn (the probe the removed Oshodi pilot spec
 *    used to carry);
 *  - the armoured Lane Blocker gets the armour shield beside its pips, and at its punch floor the "needs a blast" state.
 * Nothing throws in the page. Desktop and phone.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { inMatch, open } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */

const tele = (page: Page) => page.evaluate(() => (window as any).__WAHALA__.renderer().telegraphStats());

/** The human at (x, y), a seat at (ex, ey), every other enemy parked out of the way. */
async function stage(
  page: Page,
  o: { x: number; y: number; seat: number; ex: number; ey: number; facing?: string },
): Promise<void> {
  await page.evaluate((o) => {
    const s = (window as any).__WAHALA__.getState();
    const put = (p: any, px: number, py: number) => {
      p.x = p.stepFromX = px;
      p.y = p.stepFromY = py;
      p.stepRemaining = 0;
    };
    put(s.players[0], o.x, o.y);
    s.players[0].protectedUntil = s.tick + 100000; // staging only: the probe must not end in a lost life
    put(s.players[o.seat], o.ex, o.ey);
    if (o.facing) s.players[o.seat].facing = o.facing;
    // the others leave the scene (parked as not alive, staging only); the staged seat is back if an earlier step parked it
    for (const p of s.players) if (p.id > 0) p.alive = p.id === o.seat;
  }, o);
}

test('field mission: an enemy that spots you shows "!", a wind-up is drawn, an armoured one shows its shield', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page, '&noattract');
  expect(await page.evaluate(() => (window as any).__WAHALA__.startFieldMission('oshodi.approach'))).toBe(
    true,
  );
  await inMatch(page);
  const seats = await page.evaluate(() => {
    const w = (window as any).__WAHALA__;
    w.controller().frozen = true;
    const s = w.getState();
    while (s.match.phase !== 'playing') w.stepTicks(10);
    return {
      tactics: !!s.config.campaignTactics,
      warden: s.players.findIndex((p: any) => p.enemyKind === 'agbero'),
      heavy: s.players.findIndex((p: any) => p.enemyKind === 'heavy'),
    };
  });
  expect(seats.tactics, 'field missions run the territorial layer').toBe(true);
  expect(await tele(page), 'the telegraph view is built').not.toBeNull();

  // 1. noticed: the warden on the open bus-park row, the human two tiles in front of it (always noticed that close)
  await stage(page, { x: 12, y: 39, seat: seats.warden, ex: 14, ey: 39, facing: 'left' });
  const noticed = await page.evaluate((id) => {
    const w = (window as any).__WAHALA__;
    const s = w.getState();
    for (let i = 0; i < 120; i++) {
      w.advance(1);
      const m = s.territory.minds[id].state;
      if (m === 'alert' || m === 'pursue') return m;
    }
    return s.territory.minds[id].state;
  }, seats.warden);
  expect(['alert', 'pursue']).toContain(noticed);
  await expect
    .poll(async () => (await tele(page))?.alert ?? 0, { timeout: 10_000 })
    .toBeGreaterThanOrEqual(1);
  expect((await tele(page)).marksStarted.alert).toBeGreaterThanOrEqual(1);

  // 2. the wind-up: next to the human it starts a punch; the telegraph (ring, arrow, aimed tile, clock) is drawn
  await stage(page, { x: 13, y: 39, seat: seats.warden, ex: 14, ey: 39, facing: 'left' });
  const wound = await page.evaluate((id) => {
    const w = (window as any).__WAHALA__;
    const s = w.getState();
    for (let i = 0; i < 300; i++) {
      if (s.players[id].attack) return true;
      w.advance(1);
    }
    return !!s.players[id].attack;
  }, seats.warden);
  expect(wound, 'the warden winds up a punch').toBe(true);
  await expect
    .poll(async () => (await tele(page))?.melee ?? 0, { timeout: 10_000 })
    .toBeGreaterThanOrEqual(1);
  // ring, fill, arrow, aimed tile and clock; the clock takes the awareness mark's place (never both over one head)
  const during = await tele(page);
  expect(during.instances).toBeGreaterThanOrEqual(5);
  expect(during.alert).toBe(0);

  // 3. the armoured Lane Blocker beside the human: a shield by its pips; punched to its floor it needs a blast
  await stage(page, { x: 19, y: 42, seat: seats.heavy, ex: 20, ey: 42, facing: 'left' });
  const damage = () => page.evaluate(() => (window as any).__WAHALA__.renderer().damageStats());
  await page.evaluate(() => (window as any).__WAHALA__.advance(1));
  await expect.poll(async () => (await damage())?.shields ?? 0, { timeout: 10_000 }).toBe(1);
  expect((await damage()).needsBlast).toBe(0);
  await page.evaluate((id) => {
    const w = (window as any).__WAHALA__;
    const s = w.getState();
    s.players[id].vitals.hp = 1; // staging: the floor a punch can never take it below
    w.advance(1);
  }, seats.heavy);
  await expect.poll(async () => (await damage())?.needsBlast ?? 0, { timeout: 10_000 }).toBe(1);
  expect(errors).toEqual([]);
});
