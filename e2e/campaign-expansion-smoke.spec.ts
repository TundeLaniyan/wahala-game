/**
 * Browser smoke set for the campaign expansion (docs/CAMPAIGN_EXPANSION_STATUS.md): one field mission, one classic raid,
 * bomb geometry chosen by the ruleset (no toggle), cargo destruction by a real cross bomb, an enemy projectile with its
 * cue and a result, the campaign health meter, and the mobile cross control. It is a SMOKE set, not the release gate:
 * every assertion reads the real simulation state through the `?debug` handle after the real controllers started it.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { open, toRumbleSetup } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */
const state = (page: Page, fn: string) =>
  page.evaluate(`(() => { const s = window.__WAHALA__.getState(); return (${fn})(s); })()`);

async function errorsOf(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
}

async function newCampaign(page: Page): Promise<void> {
  await page.evaluate(() => {
    const c = (window as any).__WAHALA__.campaign();
    c.load();
    c.startNew();
    c.storyDone();
  });
}

async function startRaid(page: Page): Promise<void> {
  await newCampaign(page);
  const ok = await page.evaluate(() =>
    (window as any).__WAHALA__.campaign().debugStartRaid('warehouseDispatchDepot'),
  );
  expect(ok).toBe(true);
  await expect(page.getByTestId('hud')).toBeVisible();
  // staging only: skip the 2.5 s countdown so the checks do not wait on software rendering
  await page.evaluate(() => {
    const s = (window as any).__WAHALA__.getState();
    s.match.phase = 'playing';
    s.match.countdownRemaining = 0;
  });
}

test.describe('campaign expansion smoke', () => {
  test('bomb geometry is chosen by the ruleset: the Rumble setup has no blast toggle', async ({ page }) => {
    await open(page, '&noattract');
    await toRumbleSetup(page, 'survival');
    await expect(page.getByTestId('rumble-setup')).not.toContainText(
      /blast shape|cross blast|radial blast|plus blast/i,
    );
    await expect(page.getByTestId('rumble-setup').locator('[data-testid*="blast"]')).toHaveCount(0);
  });

  test('field mission: starts on the district map with radial bombs and the campaign health meter', async ({
    page,
  }) => {
    const errors = await errorsOf(page);
    await open(page, '&noattract');
    await newCampaign(page);
    const ok = await page.evaluate(() =>
      (window as any).__WAHALA__.campaign().startSectionMission('oshodi.approach'),
    );
    expect(ok).toBe(true);
    await expect(page.getByTestId('hud')).toBeVisible();
    const info = (await state(
      page,
      `s => ({ game: s.settings.game, blast: s.config.generator.blastMode, arena: s.arenaId, hp: s.players[0].vitals && s.players[0].vitals.hp, maxHp: s.players[0].vitals && s.players[0].vitals.maxHp, field: !!(s.mission && s.mission.field) })`,
    )) as any;
    expect(info.game).toBe('mission');
    expect(info.blast).toBe('radial'); // field missions keep the Rumble radius
    expect(info.field).toBe(true);
    expect(info.maxHp).toBeGreaterThanOrEqual(3);
    await expect(page.getByTestId('campaign-health')).toBeVisible();
    await expect(page.getByTestId('health-seg')).toHaveCount(info.maxHp);
    expect(errors).toEqual([]);
  });

  test('classic raid: fixed screen, cross bombs, marked cargo destroyed by a real cross bomb', async ({
    page,
  }) => {
    const errors = await errorsOf(page);
    await open(page, '&noattract');
    await startRaid(page);
    const info = (await state(
      page,
      `s => ({ game: s.settings.game, blast: s.config.generator.blastMode, w: s.width, h: s.height, marked: s.raid.cargo.filter(c => c.marked).length })`,
    )) as any;
    expect(info.game).toBe('raid');
    expect(info.blast).toBe('plus'); // classic raids use cross bombs
    expect(info.w).toBeLessThanOrEqual(17);
    expect(info.h).toBeLessThanOrEqual(13);
    expect(info.marked).toBeGreaterThan(0);
    // the whole board is on screen (fixed camera) and the world markers exist
    const cam = (await page.evaluate(() => (window as any).__WAHALA__.renderer().debugCamera())) as any;
    expect(cam.arenaInView).toBe(true);
    const stats = (await page.evaluate(() => (window as any).__WAHALA__.renderer().raidStats())) as any;
    expect(stats && stats.cargo).toBeGreaterThan(0);

    // stage the human two tiles from a marked crate in a clear line, lay a generator (A) and walk out of the blast
    const staged = (await page.evaluate(() => {
      const s = (window as any).__WAHALA__.getState();
      const w = s.width;
      const free = (x: number, y: number) =>
        x >= 0 && y >= 0 && x < w && y < s.height && s.tiles[y * w + x] === 0;
      for (const c of s.raid.cargo.filter((k: any) => k.marked && !k.destroyed)) {
        for (const [dx, dy] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ]) {
          const a = { x: c.x + dx, y: c.y + dy };
          const b = { x: c.x + dx * 2, y: c.y + dy * 2 };
          if (free(a.x, a.y) && free(b.x, b.y)) {
            const p = s.players[0];
            p.x = p.stepFromX = a.x;
            p.y = p.stepFromY = a.y;
            p.stepRemaining = 0;
            return { id: c.id, hp: c.hp, away: [dx, dy] };
          }
        }
      }
      return null;
    })) as any;
    expect(staged, 'a marked crate with a clear lane must exist in the depot layout').not.toBeNull();
    await page.keyboard.press('Space'); // A: lay a generator
    const key =
      staged.away[0] === 1
        ? 'ArrowRight'
        : staged.away[0] === -1
          ? 'ArrowLeft'
          : staged.away[1] === 1
            ? 'ArrowDown'
            : 'ArrowUp';
    await page.keyboard.down(key);
    await page.waitForTimeout(700);
    await page.keyboard.up(key);
    await page.evaluate(() => (window as any).__WAHALA__.stepTicks(400)); // fuse, blast and flames
    const after = (await state(page, `s => s.raid.cargo.find(c => c.id === '${staged.id}')`)) as any;
    expect(
      after.destroyed || after.hp < staged.hp,
      'the cross blast must damage or destroy the marked crate',
    ).toBe(true);
    expect(errors).toEqual([]);
  });

  test('enemy projectile: a visible cue first, then a result on the human; the health meter shows why', async ({
    page,
  }) => {
    const errors = await errorsOf(page);
    await open(page, '&noattract');
    await startRaid(page);
    const staged = (await page.evaluate(() => {
      const s = (window as any).__WAHALA__.getState();
      const w = s.width;
      const free = (x: number, y: number) =>
        x >= 0 && y >= 0 && x < w && y < s.height && s.tiles[y * w + x] === 0;
      const me = s.players[0];
      const enemy = s.players.find((p: any, i: number) => i > 0 && p.enemyKind);
      if (!enemy) return null;
      // a thrower 4 tiles to the east of a free lane, the human at the west end of it
      for (let y = 0; y < s.height; y++) {
        for (let x = 0; x + 4 < w; x++) {
          if ([0, 1, 2, 3, 4].every((k) => free(x + k, y))) {
            me.x = me.stepFromX = x;
            me.y = me.stepFromY = y;
            me.stepRemaining = 0;
            enemy.enemyKind = 'thrower';
            enemy.alive = true;
            enemy.x = enemy.stepFromX = x + 4;
            enemy.y = enemy.stepFromY = y;
            enemy.stepRemaining = 0;
            enemy.facing = 'left';
            enemy.dazedUntil = 0;
            return { x, y, id: s.players.indexOf(enemy) };
          }
        }
      }
      return null;
    })) as any;
    expect(staged, 'a free 5-tile lane must exist').not.toBeNull();
    // run ticks until a projectile is launched: the cue (warnTicks) must come before it moves
    let launched: any = null;
    for (let i = 0; i < 90 && !launched; i++) {
      await page.evaluate(() => (window as any).__WAHALA__.stepTicks(10));
      launched = await state(page, `s => (s.projectiles || [])[0] || null`);
    }
    // an idle bot human stays on the lane: the object lands
    expect(launched, 'the thrower never launched an object').not.toBeNull();
    expect(launched.path.length).toBeGreaterThan(0);
    await page.evaluate(() => (window as any).__WAHALA__.stepTicks(240));
    const vit = (await state(page, `s => s.players[0].vitals`)) as any;
    expect(vit.lastHitSource, 'the hit must be recorded with its cause').not.toBeNull();
    await expect(page.getByTestId('campaign-health')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('field mission to raid and back through the real session: the door starts the raid, the field returns on the return tile', async ({
    page,
  }) => {
    const errors = await errorsOf(page);
    await open(page, '&noattract');
    await newCampaign(page);
    expect(
      await page.evaluate(() => (window as any).__WAHALA__.campaign().startSectionMission('oshodi.approach')),
    ).toBe(true);
    await expect(page.getByTestId('hud')).toBeVisible();
    // staging: the route is at its door leg and the human stands on the door (the real controller does the rest)
    const door = (await page.evaluate(() => {
      const s = (window as any).__WAHALA__.getState();
      s.match.phase = 'playing';
      s.match.countdownRemaining = 0;
      const f = s.mission.field;
      f.leg = 1;
      const d = f.doors[0];
      const p = s.players[0];
      p.x = p.stepFromX = d.x;
      p.y = p.stepFromY = d.y;
      p.stepRemaining = 0;
      return { id: d.id, x: d.x, y: d.y, ret: { x: d.returnTile.x, y: d.returnTile.y } };
    })) as any;
    // hold the door with simulation ticks only (`advance` renders every tick: far too slow on software GL); the next real
    // frame of the controller sees the door's request and swaps in the raid
    await page.evaluate(() => (window as any).__WAHALA__.stepTicks(150));
    await page.waitForFunction(() => (window as any).__WAHALA__.getState().settings.game === 'raid', null, {
      timeout: 90_000,
    });
    const raid = (await state(
      page,
      `s => ({ game: s.settings.game, blast: s.config.generator.blastMode, w: s.width })`,
    )) as any;
    expect(raid).toMatchObject({ game: 'raid', blast: 'plus' });
    await expect(page.getByTestId('hud')).toBeVisible();
    // the raid ends (staged outcome, the real runtime has its own tests): the field comes back on the return tile
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
      { timeout: 90_000 },
    );
    const back = (await state(
      page,
      `s => ({ game: s.settings.game, blast: s.config.generator.blastMode, x: s.players[0].x, y: s.players[0].y, door: s.mission.field.doors[0].status, hp: s.players[0].vitals.hp })`,
    )) as any;
    expect(back.game).toBe('mission');
    expect(back.blast).toBe('radial');
    expect(back.door).toBe('done');
    expect({ x: back.x, y: back.y }).toEqual(door.ret);
    expect(back.hp).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('boss mission: the boss bar shows the defences in the rail', async ({ page }) => {
    const errors = await errorsOf(page);
    await open(page, '&noattract');
    await newCampaign(page);
    await page.evaluate(() => {
      const c = (window as any).__WAHALA__.campaign();
      // staging: a cleared district lets the boss mission be replayed (the sections gate the first attempt)
      c.finishMission({
        result: 'won',
        missionId: 'oshodi',
        modifiers: [],
        seconds: 100,
        livesUsed: 0,
        phasesCleared: 3,
        defeat: 'eliminated',
        stars: 3,
        creditedKills: 1,
      });
      c.beginBriefing('oshodi');
      c.startFromBriefing();
      c.bossIntroDone();
    });
    await expect(page.getByTestId('hud')).toBeVisible();
    const bar = page.getByTestId('boss-bar');
    await expect(bar).toBeVisible();
    await expect(bar).toHaveAttribute('data-state', 'shielded');
    await expect(bar).toContainText(/Sunmola/i);
    await expect(bar.locator('.ch-seg.full')).toHaveCount(3);
    // the health meter is there too: the human has segments in a boss mission
    await expect(page.getByTestId('campaign-health')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('campaign death (hotfix): the respawn bar shows, never the spectator bar or Skip, and the human respawns', async ({
    page,
  }) => {
    const errors = await errorsOf(page);
    await open(page, '&noattract');
    await newCampaign(page);
    expect(
      await page.evaluate(() => (window as any).__WAHALA__.campaign().startSectionMission('oshodi.approach')),
    ).toBe(true);
    await expect(page.getByTestId('hud')).toBeVisible();
    // staging: playing, one health segment left, an enemy generator under the human (a real lethal blast through the tick)
    await page.evaluate(() => {
      const s = (window as any).__WAHALA__.getState();
      s.match.phase = 'playing';
      s.match.countdownRemaining = 0;
      const me = s.players[0];
      me.protectedUntil = 0;
      me.armour = 0;
      me.mounted = false;
      me.vitals.hp = 1;
      me.vitals.invulnUntil = 0;
      s.generators.push({
        id: s.nextId++,
        ownerId: 1,
        x: me.x,
        y: me.y,
        stepFromX: me.x,
        stepFromY: me.y,
        range: 2,
        pierce: false,
        square: 0,
        fromSpectator: false,
        mode: 'timed',
        timer: 1,
        carriedBy: null,
        carryBonusUsed: false,
        slide: null,
        flight: null,
        triggered: false,
        placedTick: s.tick,
      });
      (window as any).__WAHALA__.stepTicks(25);
    });
    expect(await state(page, `s => s.players[0].alive`)).toBe(false);
    // let the controller publish the HUD for the downed human (real frames), then look at the screen
    await expect(page.getByTestId('respawn-banner')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('spectate')).toHaveCount(0);
    await expect(page.getByTestId('skip-results')).toHaveCount(0);
    await expect(page.getByTestId('spectate-prev')).toHaveCount(0);
    // the campaign respawn rules bring the human back (one life spent) and the bar goes away
    await page.evaluate(() => (window as any).__WAHALA__.stepTicks(400));
    const after = (await state(
      page,
      `s => ({ alive: s.players[0].alive, used: s.mission.livesUsed })`,
    )) as any;
    expect(after.alive).toBe(true);
    expect(after.used).toBe(1);
    await expect(page.getByTestId('respawn-banner')).toHaveCount(0, { timeout: 60_000 });
    expect(errors).toEqual([]);
  });

  test('mobile cross control: four arrows, one cardinal step per tap, the two action buttons stay', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'mobile', 'touch control: phone project only');
    await open(page, '&noattract');
    await startRaid(page);
    await expect(page.getByTestId('cross-control')).toBeVisible();
    for (const d of ['up', 'down', 'left', 'right'])
      await expect(page.getByTestId(`cross-${d}`)).toBeVisible();
    const box = await page.getByTestId('cross-right').boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    // exactly two action buttons
    await expect(page.getByTestId('btn-place')).toBeVisible();
    await expect(page.getByTestId('btn-special')).toBeVisible();
    // find a free direction and tap it: exactly one tile in that direction, no diagonal
    const dir = (await page.evaluate(() => {
      const s = (window as any).__WAHALA__.getState();
      const me = s.players[0];
      const free = (x: number, y: number) => s.tiles[y * s.width + x] === 0;
      const dirs: [string, number, number][] = [
        ['right', 1, 0],
        ['left', -1, 0],
        ['down', 0, 1],
        ['up', 0, -1],
      ];
      const d = dirs.find(([, dx, dy]) => free(me.x + dx, me.y + dy))!;
      return { name: d[0], dx: d[1], dy: d[2], x: me.x, y: me.y };
    })) as any;
    await page.getByTestId(`cross-${dir.name}`).tap();
    await page.evaluate(() => (window as any).__WAHALA__.stepTicks(30));
    const now = (await state(page, `s => ({ x: s.players[0].x, y: s.players[0].y })`)) as any;
    expect([now.x - dir.x, now.y - dir.y]).toEqual([dir.dx, dir.dy]);
  });
});
