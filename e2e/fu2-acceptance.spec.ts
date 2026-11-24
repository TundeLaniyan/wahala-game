/**
 * FU2 acceptance automation (task FU2-B5, docs/FOUNDER_ACCEPTANCE_FU2.md items 2 and 4), on the landscape phone project through
 * the Test Lab the founder uses (`?testlab=1`, e2e/testlab.spec.ts has the helpers' originals). Software WebGL, no person:
 *
 *   - item 2: a real 16- and 32-fighter City Rumble (the "City Rumble parity" entry with its size chosen) builds the local
 *     fighter's crowd silhouette twins (decision PIV2) and only his: every one is shown at the Low rung of this run and no
 *     rival carries one;
 *   - item 4: the Oshodi boss entry on Easy / Normal / Hard starts the real mission with 0 / 1 / 2 relay guards in its tuning
 *     (decision PI8) and, with the sim run for 25 s and the player beside the first relay, exactly that many backup fighters
 *     stand at a relay far from their own posts.
 *
 * The sim is moved only by `stepTicks`, so nothing depends on the wall clock.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { inMatch, stepTicks } from './helpers';

const LAB = './?debug&q=low&seed=7&noattract&testlab=1';

async function openLab(page: Page): Promise<void> {
  await page.goto(LAB);
  await expect(page.getByTestId('testlab-home')).toBeVisible();
}

async function openEntry(page: Page, id: string): Promise<void> {
  if ((await page.getByTestId(`testlab-entry-${id}`).count()) === 0)
    await page.getByTestId('testlab-completed-toggle').tap();
  await page.getByTestId(`testlab-entry-${id}`).tap();
  await expect(page.getByTestId('testlab-entry')).toBeVisible();
}

async function returnToLab(page: Page): Promise<void> {
  await page.getByTestId('pause-button').tap();
  await expect(page.getByTestId('pause-overlay')).toBeVisible();
  await page.getByTestId('testlab-return').tap();
  await expect(page.getByTestId('testlab-confirm')).toBeVisible();
  await page.getByTestId('testlab-confirm-leave').tap();
  await expect(page.getByTestId('testlab-home')).toBeVisible({ timeout: 60_000 });
}

test.describe('FU2 acceptance (Test Lab, phone)', () => {
  test.beforeEach(async ({ browserName: _b }, info) => {
    void _b;
    test.skip(info.project.name !== 'mobile', 'the founder tests on a phone: one landscape run');
    test.setTimeout(900_000); // software WebGL on a busy shared machine
  });

  test('item 2: a 16- and a 32-fighter City Rumble carry the crowd silhouette for the local fighter only', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openLab(page);
    for (const size of [16, 32]) {
      await openEntry(page, 'cityRumble');
      await page.getByTestId(`rumble-size-${size}`).tap();
      await page.getByTestId('testlab-start').tap();
      await inMatch(page);
      await stepTicks(page, 30);
      await page.evaluate(() => (window as any).__WAHALA__.advance(1)); // one routed tick: a frame draws with the twins
      const s = await page.evaluate(() => {
        const w = (window as any).__WAHALA__;
        let twins = 0;
        w.renderer().scene.traverse((o: any) => o.name === 'crowdSilhouette' && twins++);
        return {
          players: w.getState().players.length as number,
          crowd: w.renderer().debugCrowdSilhouette() as { built: number; shown: number },
          twins,
        };
      });
      expect(s.players, `${size} fighters`).toBe(size);
      expect(s.crowd.built, `${size}: the local fighter's twins exist`).toBeGreaterThan(0);
      expect(s.crowd.shown, `${size}: shown at the Low rung`).toBe(s.crowd.built);
      expect(s.twins, `${size}: no rival carries one`).toBe(s.crowd.built);
      await returnToLab(page);
    }
    expect(errors).toEqual([]);
  });

  test('item 4: the Oshodi boss has 0 / 1 / 2 relay guards on Easy / Normal / Hard and they stand at a relay', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openLab(page);
    const want = { easy: 0, normal: 1, hard: 2 } as const;
    for (const level of ['easy', 'normal', 'hard'] as const) {
      await openEntry(page, 'boss');
      await page.getByTestId(`testlab-level-${level}`).tap();
      await page.getByTestId('testlab-start').tap();
      await inMatch(page);
      expect(
        await page.evaluate(() => (window as any).__WAHALA__.getState().mission.tuning.boss.relayGuards ?? 0),
        level,
      ).toBe(want[level]);
      // the player waits beside relay 1 (8, 14), healed between chunks: this scenario is about where the others stand
      await page.evaluate(() => {
        const s = (window as any).__WAHALA__.getState();
        const p = s.players[0];
        p.x = p.stepFromX = 8;
        p.y = p.stepFromY = 12;
        p.stepRemaining = 0;
      });
      for (let i = 0; i < 50; i++) {
        await stepTicks(page, 30);
        await page.evaluate(() => {
          const p = (window as any).__WAHALA__.getState().players[0];
          p.alive = true;
          p.vitals.hp = p.vitals.maxHp;
        });
      }
      const atRelay = await page.evaluate(() => {
        const s = (window as any).__WAHALA__.getState();
        const m = s.mission;
        const live = m.nodes.filter((n: any) => !n.done);
        return m.seats.filter((q: any) => {
          const p = s.players[q.playerId];
          if (!p.alive || !q.post || !['meleeGuard', 'blocker', 'escort'].includes(q.role)) return false;
          return live.some(
            (n: any) =>
              Math.abs(n.x - p.x) + Math.abs(n.y - p.y) <= 3 &&
              Math.abs(n.x - q.post.x) + Math.abs(n.y - q.post.y) >= 10,
          );
        }).length;
      });
      expect(atRelay, `${level}: backup fighters at a relay far from their posts`).toBe(want[level]);
      await returnToLab(page);
    }
    expect(errors).toEqual([]);
  });
});
