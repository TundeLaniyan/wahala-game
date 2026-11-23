/**
 * Team Rumble blast warnings in the REAL renderer (decisions TB1-TB4, docs/TEST_LAB.md): what the scene actually draws
 * for the local fighter. A safe (spared) blast is emerald dashed tiles, a dangerous one is the red glow with the hazard
 * hatch, a tile is never both, and nothing stays after the blast. Run on a landscape phone through the Test Lab's Team
 * Blast scenes (real Team Rumble, real `place` intents, real damage) and through a normal bot-filled Team Rumble.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { inMatch } from './helpers';

const LAB = './?debug&q=low&seed=7&noattract&testlab=1';

interface Drawn {
  safe: string[];
  hatch: string[];
  fill: string[];
  tag: number;
  ground: number;
  chevron: number;
}

/** What the live three.js scene draws: the instanced overlay tiles ("x,z") and the local fighter's marker parts. */
const drawn = (page: Page): Promise<Drawn> =>
  page.evaluate(() => {
    const scene = (window as any).__WAHALA__.renderer().scene;
    const out: any = { safe: [], hatch: [], fill: [], tag: 0, ground: 0, chevron: 0 };
    scene.traverse((o: any) => {
      if (!o.visible) return;
      if (
        o.isInstancedMesh &&
        (o.name === 'blast-safe' || o.name === 'blast-hatch' || o.name === 'blast-fill')
      ) {
        const key = o.name === 'blast-safe' ? 'safe' : o.name === 'blast-hatch' ? 'hatch' : 'fill';
        for (let i = 0; i < o.count; i++) {
          const e = o.instanceMatrix.array;
          out[key].push(
            `${Math.round(e[i * 16 + 12] * 100) / 100},${Math.round(e[i * 16 + 14] * 100) / 100}`,
          );
        }
      }
      if (o.isSprite && o.renderOrder === 40) out.tag++;
      if (o.isSprite && o.renderOrder === 32) out.chevron++;
      if (o.isMesh && o.position.y === 0.025 && o.scale.x >= 1.5) out.ground++;
    });
    return out;
  });

/** Freezes the sim and renders at tick `target` (stepping the ticks before it without drawing them). */
const at = (page: Page, target: number) =>
  page.evaluate((t) => {
    const w = (window as any).__WAHALA__;
    w.controller().frozen = true;
    const n = t - w.getState().tick;
    if (n > 1) w.stepTicks(n - 1);
    w.advance(1);
  }, target);

async function startLab(page: Page, entry: string): Promise<void> {
  await page.goto(LAB);
  await expect(page.getByTestId('testlab-home')).toBeVisible();
  await page.getByTestId(`testlab-entry-${entry}`).tap();
  await page.getByTestId('testlab-start').tap();
  await inMatch(page);
}

const disjoint = (a: string[], b: string[]) => a.every((t) => !b.includes(t));

test.describe('Team blast warnings', () => {
  test.beforeEach(async ({ browserName: _b }, info) => {
    void _b;
    test.skip(info.project.name !== 'mobile', 'the founder tests on a phone: one landscape run');
    test.setTimeout(420_000);
  });

  test("friendly fire OFF: a teammate's blast is safe, a rival's is dangerous, an overlap is dangerous, nothing is left behind", async ({
    page,
  }) => {
    await startLab(page, 'teamBlastFfOff');
    // wave 1 at tick 120 (the teammate's generator, 3 s fuse): its lane shows in the last 1.7 s
    await at(page, 260);
    let d = await drawn(page);
    expect(d.safe.length, 'the spared blast is drawn safe').toBeGreaterThan(0);
    expect(d.hatch, 'nothing dangerous in the picture').toHaveLength(0);
    expect(d.fill).toHaveLength(0);
    // the blast goes off and its flames burn (spared too): still safe, still no danger
    await at(page, 125 + 180 + 5);
    d = await drawn(page);
    expect(d.hatch).toHaveLength(0);
    // and afterwards nothing is left
    await at(page, 125 + 180 + 120);
    d = await drawn(page);
    expect(d.safe, 'no stale safe overlay').toHaveLength(0);
    expect(d.hatch).toHaveLength(0);

    // wave 2 (a rival's generator): dangerous, nothing safe
    await at(page, 800);
    d = await drawn(page);
    expect(d.hatch.length).toBeGreaterThan(0);
    expect(d.safe).toHaveLength(0);
    expect(new Set(d.hatch)).toEqual(new Set(d.fill)); // the hatch sits on the red glow, tile for tile

    // wave 3 (a teammate and a rival side by side): the shared tiles are dangerous; no tile is both
    await at(page, 1340);
    d = await drawn(page);
    expect(d.hatch.length).toBeGreaterThan(0);
    expect(d.safe.length, 'the teammate-only tiles stay safe').toBeGreaterThan(0);
    expect(disjoint(d.safe, d.hatch)).toBe(true);
  });

  test('friendly fire ON: the same teammate blast is dangerous', async ({ page }) => {
    await startLab(page, 'teamBlastFfOn');
    await at(page, 260);
    const d = await drawn(page);
    expect(d.hatch.length).toBeGreaterThan(0);
    expect(d.safe).toHaveLength(0);
    expect(new Set(d.hatch)).toEqual(new Set(d.fill));
  });

  test('overlap scene: three simultaneous generators never put a safe mark on a dangerous tile', async ({
    page,
  }) => {
    await startLab(page, 'teamBlastOverlap');
    for (const tick of [260, 800, 1340]) {
      await at(page, tick);
      const d = await drawn(page);
      expect(d.hatch.length, `tick ${tick}`).toBeGreaterThan(0);
      expect(disjoint(d.safe, d.hatch), `tick ${tick}`).toBe(true);
    }
  });

  test('the player marker is the combined Indicator + Ground in the scene, exactly one of each', async ({
    page,
  }) => {
    await startLab(page, 'teamBlastFfOff');
    await at(page, 200);
    await expect.poll(async () => (await drawn(page)).tag, { timeout: 60_000 }).toBe(1);
    const d = await drawn(page);
    expect(d.ground).toBe(1);
    expect(d.chevron).toBe(0);
  });

  test('a normal Team Rumble with bots: the marker is there and no frame ever shows a tile both safe and dangerous', async ({
    page,
  }) => {
    await page.goto(LAB);
    await expect(page.getByTestId('testlab-home')).toBeVisible();
    await page.getByTestId('testlab-completed-toggle').tap();
    await page.getByTestId('testlab-entry-roster').tap();
    await page.getByTestId('testlab-start').tap();
    await inMatch(page);
    const state = await page.evaluate(() => {
      const s = (window as any).__WAHALA__.getState();
      return { game: s.settings.game, ff: s.settings.friendlyFire, teamed: s.players[0].team >= 0 };
    });
    expect(state.game).toBe('team');
    expect(state.teamed).toBe(true);
    let seenSafe = 0;
    let seenDanger = 0;
    let last: Drawn | null = null;
    for (let t = 400; t <= 2600; t += 40) {
      await at(page, t);
      const d = await drawn(page);
      last = d;
      if (d.safe.length) seenSafe++;
      if (d.hatch.length) seenDanger++;
      expect(disjoint(d.safe, d.hatch), `tick ${t}`).toBe(true);
      for (const tile of d.hatch) expect(d.fill, `tick ${t}`).toContain(tile);
    }
    expect(seenDanger, 'bots laid dangerous blasts that were drawn dangerous').toBeGreaterThan(0);
    expect(last!.tag).toBe(1);
    expect(last!.ground).toBe(1);
    expect(last!.chevron).toBe(0);
    void seenSafe; // teammates' blasts (safe) depend on the bots' play: asserted deterministically in the Team Blast scenes
  });
});
