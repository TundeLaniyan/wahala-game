/**
 * Combat HUD in a real browser (decisions HC1-HC5): the kill feed, the shield chip, QUICK HANDS stored, the SUDDEN
 * DEATH status and the mission panel sit in the HUD rail (a standard arena) or the City Rumble left panel, never over
 * the board, the timer, the portraits, the inventory or the controls, on the desktop and on a phone. The kills are
 * written into the live game state (the simulation rules are covered by the unit tests); everything after that is the
 * real game loop and the real HUD.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { chooseArena, mutate, open, startMatch } from './helpers';

type Debug = {
  __WAHALA__: {
    advance(n: number): void;
    controller(): { frozen: boolean };
    store: { getState(): Record<string, unknown>; setState(p: Record<string, unknown>): void };
  };
};

const shot = (page: Page, project: string, name: string) =>
  page.screenshot({ path: `e2e-shots/${project}-${name}.png`, timeout: 180_000 });

/** The HUD is published from a rendered frame at most every ~100 ms: wait, then advance one tick. */
async function publish(page: Page): Promise<void> {
  await page.waitForTimeout(160);
  await page.evaluate(() => (window as unknown as Debug).__WAHALA__.advance(1));
}

/** Local player takes out P1; the city takes P2 (one more credited kill is P3's against P2 on a 4-player board). */
const STAGE = `
  const me = s.players[0];
  me.protectedUntil = 0;
  me.armour = 2;
  me.streakRewards.quickHandsBank = 11 * 60;
  const down = (v, by, cause) => {
    const p = s.players[v];
    if (!p) return;
    p.alive = false; p.eliminatedTick = s.tick; p.eliminatedBy = by; p.elimination = cause;
    p.respawnAt = null;
  };
  down(1, 0, { kind: 'flame', ownerId: 0, eventId: 1 });
  down(2, 3, { kind: 'vehicle', ownerId: 3, vehicleKind: 'danfo', eventId: 1 });
  down(3, null, { kind: 'crush', eventId: 1 });
`;

type Rect = { left: number; right: number; top: number; bottom: number };

const rectsOf = (page: Page, selector: string): Promise<Rect[]> =>
  page.evaluate(
    (q) =>
      [...document.querySelectorAll(q)]
        .map((e) => e.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom })),
    selector,
  );

const hits = (a: Rect, b: Rect): boolean =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

/** Things the combat text must never cover. */
const KEEP_CLEAR = [
  '.timer',
  '.portrait',
  '.round-btn',
  '[data-testid="inventory"]',
  '.abtn',
  '[data-testid="stick-pad"]',
  '[data-testid="minimap"]',
];

async function clearOf(page: Page, selector: string): Promise<void> {
  for (const q of KEEP_CLEAR) {
    const others = await rectsOf(page, q);
    for (const r of await rectsOf(page, selector))
      for (const o of others) expect(hits(r, o), `${selector} covers ${q}`).toBe(false);
  }
}

/** X of the board's left edge at screen height y (it widens towards the near row). */
function leftEdgeAt(b: { x: number; y: number }[], y: number): number {
  const far = b[0]!;
  const near = b[3]!;
  const t = Math.min(1, Math.max(0, (y - far.y) / (near.y - far.y)));
  return far.x + (near.x - far.x) * t;
}

test.describe('combat HUD', () => {
  test.setTimeout(600_000); // software WebGL

  test('standard arena: kill feed, shield chip, stored QUICK HANDS and the mission panel sit in the rail, off the board and the bottom row', async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page, '&nobots&noattract');
    await chooseArena(page, 'danfoBusPark');
    await startMatch(page, { competitors: 4 });
    await page.evaluate(() => ((window as unknown as Debug).__WAHALA__.controller().frozen = true));
    await mutate(page, STAGE);
    await publish(page);

    const feed = page.getByTestId('kill-feed');
    await expect(feed).toBeVisible();
    const lines = page.getByTestId('kill-feed-line');
    await expect(lines).toHaveCount(3);
    await expect(feed).toContainText('YOU ELIMINATED P1');
    await expect(feed).toContainText('P3 ELIMINATED P2');
    await expect(feed).toContainText('P3 WAS ELIMINATED');
    await expect(feed).toContainText('CRUSH');
    expect(await feed.evaluate((e) => e.parentElement?.getAttribute('data-testid'))).toBe('hud-rail');

    const chip = page.getByTestId('shield-chip');
    await expect(chip).toBeVisible();
    await expect(chip).toContainText('SHIELD x2');
    await expect(chip).toHaveAttribute('data-layers', '2');

    // the mission panel, written into the HUD snapshot (a real mission is the mission-sim workstream's)
    await page.evaluate(() => {
      const st = (window as unknown as Debug).__WAHALA__.store;
      const hud = st.getState().hud as Record<string, unknown>;
      st.setState({
        hud: {
          ...hud,
          mission: {
            missionId: 'oshodi',
            objective: 'dispatchRelays',
            phase: 1,
            phaseCount: 3,
            phaseState: 'active',
            progress: { done: 1, goal: 3, label: 'relays jammed' },
            nodes: [],
            warnings: [
              { kind: 'convoy', x: 3, y: 3, tiles: [], remainingTicks: 240 },
              { kind: 'strike', x: 5, y: 5, tiles: [], remainingTicks: 90 },
            ],
            boss: { playerId: 1, shielded: true, exposed: false, exposedRemainingTicks: 0, defeated: false },
            lives: { used: 1, max: 3 },
            timeRemainingSec: 252,
            callout: 'Jam two relays before the next convoy',
            crewAlive: 3,
            outcome: null,
          },
        },
      });
    });
    const panel = page.getByTestId('mission-panel');
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('mission-boss')).toContainText('BOSS SHIELDED');
    await expect(page.getByTestId('mission-warnings')).toContainText('STRIKE 2s');
    expect(await panel.evaluate((e) => e.parentElement?.getAttribute('data-testid'))).toBe('hud-rail');

    // geometry: every rail block is left of the board edge at its lowest point and above the near row
    const board = (await page.evaluate(
      () => (window as unknown as Debug).__WAHALA__.store.getState().board,
    )) as { x: number; y: number }[];
    expect(board).not.toBeNull();
    const nearY = board[3]!.y;
    for (const r of await rectsOf(page, '[data-testid="hud-rail"] > *')) {
      expect(r.right, 'a rail block overlaps the board').toBeLessThanOrEqual(
        leftEdgeAt(board, r.bottom) + 0.5,
      );
      expect(r.bottom).toBeLessThan(nearY);
    }
    await clearOf(page, '[data-testid="hud-rail"] > *');
    // nothing with text covers the board's bottom row
    const rowTop = nearY - (nearY - board[0]!.y) / 10;
    const covering = await page.evaluate(
      ({ left, right, top, bottom }) =>
        [...document.querySelectorAll('.hud *')]
          .filter((e) => (e.textContent ?? '').trim().length > 0 && e.children.length === 0)
          .filter((e) => {
            const r = e.getBoundingClientRect();
            const style = getComputedStyle(e);
            if (style.visibility === 'hidden' || style.display === 'none' || r.width === 0) return false;
            return r.left < right && r.right > left && r.top < bottom && r.bottom > top;
          })
          .map((e) => `${e.className}: ${e.textContent}`),
      { left: board[3]!.x, right: board[2]!.x, top: rowTop, bottom: nearY },
    );
    expect(covering).toEqual([]);
    await shot(page, info.project.name, 'hud-combat-classic');
    expect(errors).toEqual([]);
  });

  test('City Rumble: the kill feed is in the left panel under the counter, clear of the camera centre, the timer and the controls', async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page, '&nobots&noattract');
    await startMatch(page, { game: 'rumble' });
    await page.evaluate(() => ((window as unknown as Debug).__WAHALA__.controller().frozen = true));
    await mutate(page, STAGE);
    await publish(page);

    const feed = page.getByTestId('kill-feed');
    await expect(feed).toBeVisible();
    await expect(feed).toContainText('YOU ELIMINATED P1');
    const vp = page.viewportSize()!;
    for (const r of await rectsOf(page, '[data-testid="kill-feed-line"]')) {
      // top-left column: well above the bottom row, left of the centre where the followed player stands
      expect(r.bottom, 'kill feed reaches the bottom rows').toBeLessThan(vp.height * 0.6);
      expect(r.right, 'kill feed reaches the camera centre').toBeLessThan(vp.width * 0.5);
    }
    await clearOf(page, '[data-testid="kill-feed-line"]');
    await clearOf(page, '[data-testid="hud-rail"] > *');
    for (const r of await rectsOf(page, '[data-testid="hud-rail"] > *'))
      expect(r.bottom).toBeLessThan(vp.height * 0.7);
    await shot(page, info.project.name, 'hud-combat-rumble');
    expect(errors).toEqual([]);
  });
});
