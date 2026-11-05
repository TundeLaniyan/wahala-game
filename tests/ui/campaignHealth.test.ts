/**
 * Campaign health in the HUD (docs/CAMPAIGN_TEXT_NARRATION.md, goal C): the snapshot is read from the sim state
 * (no rules in the UI), the meter model shows 3-4 segments, protection chips that stay on the rail once used, the
 * cause line ("HIT BY BOTTLE"), the rail notices for every outcome of a hit, and the boss bar.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { buildHud } from '../../src/app/hud';
import {
  FLASH_TICKS,
  buildCampaignHud,
  buildEnemyHud,
  campaignHitNotice,
  sourceLabel,
} from '../../src/app/campaignHud';
import type { CampaignHud, EnemyHud } from '../../src/app/campaignHud';
import { DEFAULT_GAME_SETTINGS } from '../../src/app/settings';
import type { CampaignHitSource, EnemyKind, GameState, SimEvent, Vitals } from '../../src/sim';
import { campaignConfig } from '../../src/sim';
import { put, sandbox } from '../helpers';
import {
  BOSS_SEGMENTS_MAX,
  CAUSE_TICKS,
  NOTHING_SEEN,
  bossBars,
  healthModel,
  seeProtection,
} from '../../src/ui/campaignHealthModel';

vi.mock('../../src/app/session', () => ({
  commands: new Proxy({}, { get: () => () => undefined }),
  liveMatch: () => null,
}));
const { useGameStore } = await import('../../src/app/store');
const { CampaignHealth } = await import('../../src/ui/CampaignHealth');
const { HudRail } = await import('../../src/ui/HudRail');

/** The sim's "never hit" value (campaignDamage.ts). */
const NEVER = -1e9;
const vitals = (over: Partial<Vitals> = {}): Vitals => ({
  hp: 4,
  maxHp: 4,
  invulnUntil: 0,
  lastHitTick: NEVER,
  lastHitBy: null,
  lastHitSource: null,
  ...over,
});

/** Two fighters; player 0 is the campaign player. */
function campaignState(over: Partial<Vitals> = {}): GameState {
  const s = sandbox({ players: 2 });
  s.players[0]!.vitals = vitals(over);
  return s;
}

const hud = (over: Partial<CampaignHud> = {}): CampaignHud => ({
  hp: 4,
  maxHp: 4,
  armour: 0,
  okada: false,
  lives: null,
  invulnerable: false,
  invulnSeconds: 0,
  lastHit: null,
  sinceHit: null,
  flash: false,
  ...over,
});

describe('the HUD snapshot', () => {
  it('has no campaign picture without vitals: a normal match is unchanged', () => {
    const s = sandbox({ players: 2 });
    expect(buildCampaignHud(s, 0)).toBeNull();
    const snap = buildHud(s, 0, null);
    expect(snap.campaign).toBeNull();
    expect(snap.enemies).toEqual([]);
  });

  it('reads health, Armour, Okada, the recovery frames and the last hit from the sim state', () => {
    const s = campaignState({
      hp: 3,
      invulnUntil: 150,
      lastHitTick: 100,
      lastHitSource: 'bottle',
      lastHitBy: 1,
    });
    s.tick = 110;
    s.players[0]!.armour = 2;
    s.players[0]!.mounted = true;
    const c = buildHud(s, 0, null).campaign!;
    expect(c).toMatchObject({
      hp: 3,
      maxHp: 4,
      armour: 2,
      okada: true,
      invulnerable: true,
      invulnSeconds: 1,
    });
    expect(c.lastHit).toEqual({ source: 'bottle', tick: 100 });
    expect(c.sinceHit).toBe(10);
    expect(c.flash).toBe(true);
  });

  it('the flash ends after a moment and the recovery frames end', () => {
    const s = campaignState({ hp: 3, invulnUntil: 150, lastHitTick: 100, lastHitSource: 'punch' });
    s.tick = 100 + FLASH_TICKS;
    expect(buildCampaignHud(s, 0)!.flash).toBe(false);
    s.tick = 151;
    const c = buildCampaignHud(s, 0)!;
    expect(c.invulnerable).toBe(false);
    expect(c.invulnSeconds).toBe(0);
  });

  it('clamps health into 0..max and has no last hit before the first', () => {
    const s = campaignState({ hp: 9 });
    expect(buildCampaignHud(s, 0)).toMatchObject({ hp: 4, lastHit: null, sinceHit: null, flash: false });
    s.players[0]!.vitals!.hp = -2;
    expect(buildCampaignHud(s, 0)!.hp).toBe(0);
  });
});

describe('enemy bars: only the enemies that matter', () => {
  const BAR = campaignConfig(sandbox({ players: 2 }).config).bar;
  function withEnemy(kind: EnemyKind, at: [number, number], v: Partial<Vitals> = {}): GameState {
    const s = campaignState();
    put(s, 0, 1, 1);
    const e = s.players[1]!;
    e.enemyKind = kind;
    e.vitals = vitals({ hp: 2, maxHp: 2, ...v });
    put(s, 1, at[0], at[1]);
    return s;
  }

  it('a far, unhurt guard has no bar; a boss always has one', () => {
    expect(buildEnemyHud(withEnemy('guard', [12, 8]), 0)).toEqual([]);
    const boss = buildEnemyHud(withEnemy('boss', [12, 8]), 0);
    expect(boss).toHaveLength(1);
    expect(boss[0]).toMatchObject({ kind: 'boss', showBar: true, hp: 2, maxHp: 2 });
    expect(buildEnemyHud(withEnemy('lieutenant', [12, 8]), 0)).toHaveLength(1);
  });

  it('a near enemy, one the player hurt, and one hurt recently show their bar', () => {
    expect(buildEnemyHud(withEnemy('guard', [1 + BAR.nearTiles, 1]), 0)).toHaveLength(1);
    expect(buildEnemyHud(withEnemy('guard', [1 + BAR.nearTiles + 1, 1]), 0)).toHaveLength(0);
    const hurt = withEnemy('thrower', [12, 8], { lastHitTick: 50, lastHitBy: 0, hp: 1 });
    hurt.tick = 60;
    expect(buildEnemyHud(hurt, 0)).toHaveLength(1);
    const hurtByOther = withEnemy('thrower', [12, 8], { lastHitTick: 50, lastHitBy: null, hp: 1 });
    hurtByOther.tick = 50 + BAR.recentTicks;
    expect(buildEnemyHud(hurtByOther, 0)).toHaveLength(1);
    hurtByOther.tick = 50 + BAR.recentTicks + 1;
    expect(buildEnemyHud(hurtByOther, 0)).toHaveLength(0);
  });

  it('defeated enemies, the player and bot players without an enemy kind are never listed', () => {
    const s = withEnemy('boss', [12, 8]);
    s.players[1]!.alive = false;
    expect(buildEnemyHud(s, 0)).toEqual([]);
    const plain = campaignState();
    expect(buildEnemyHud(plain, 0)).toEqual([]);
  });

  it('bosses come first', () => {
    const s = sandbox({ players: 3 });
    s.players[0]!.vitals = vitals();
    put(s, 0, 1, 1);
    for (const [i, kind] of [
      [1, 'guard'],
      [2, 'boss'],
    ] as const) {
      s.players[i]!.enemyKind = kind;
      s.players[i]!.vitals = vitals({ hp: 2, maxHp: 2 });
      put(s, i, 2, 1);
    }
    expect(buildEnemyHud(s, 0).map((e) => e.kind)).toEqual(['boss', 'guard']);
  });
});

describe('the health model', () => {
  it('draws one segment per health point, full then empty', () => {
    const m = healthModel(hud({ hp: 3, maxHp: 4 }));
    expect(m.segments.map((s) => s.state)).toEqual(['full', 'full', 'full', 'empty']);
    expect(m.text).toBe('3 / 4');
    expect(m.low).toBe(false);
    expect(m.aria).toBe('Health 3 of 4');
    expect(healthModel(hud({ hp: 3, maxHp: 3 })).segments).toHaveLength(3);
  });

  it('a segment lost just now flashes; later it is just empty', () => {
    expect(healthModel(hud({ hp: 2, flash: true })).segments.map((s) => s.state)).toEqual([
      'full',
      'full',
      'lost',
      'empty',
    ]);
    expect(healthModel(hud({ hp: 2, flash: true })).flash).toBe(true);
    expect(healthModel(hud({ hp: 2 })).segments[2]!.state).toBe('empty');
  });

  it('the last segment is flagged low', () => {
    expect(healthModel(hud({ hp: 1 })).low).toBe(true);
    expect(healthModel(hud({ hp: 0 })).low).toBe(false);
  });

  it('shows Armour layers, the Okada, lives and the recovery frames as chips', () => {
    const m = healthModel(
      hud({ armour: 2, okada: true, lives: { left: 2, max: 3 }, invulnerable: true, invulnSeconds: 1 }),
      { armour: 2, okada: true },
    );
    expect(m.chips.map((c) => `${c.kind}:${c.state}`)).toEqual([
      'armour:ready',
      'armour:ready',
      'okada:ready',
      'lives:ready',
      'invulnerable:active',
    ]);
    expect(m.chips.find((c) => c.kind === 'lives')!.value).toBe('2/3');
    expect(m.chips.find((c) => c.kind === 'invulnerable')!.value).toBe('1s');
    expect(m.aria).toContain('3 protection layers');
    expect(m.aria).toContain('2 lives left');
  });

  it('the last life is marked low', () => {
    expect(healthModel(hud({ lives: { left: 1, max: 3 } })).chips[0]).toMatchObject({
      kind: 'lives',
      state: 'low',
    });
  });

  it('a used layer stays on the rail, consumed', () => {
    let seen = seeProtection(NOTHING_SEEN, hud({ armour: 2, okada: true }));
    expect(seen).toEqual({ armour: 2, okada: true });
    const m = healthModel(hud({ armour: 1, okada: false }), seen);
    expect(m.chips.map((c) => `${c.kind}:${c.state}`)).toEqual(['armour:ready', 'armour:used', 'okada:used']);
    expect(m.chips[1]!.value).toBe('USED');
    // seen never decreases; a fresh pickup raises it
    seen = seeProtection(seen, hud({ armour: 0, okada: false }));
    expect(seen).toEqual({ armour: 2, okada: true });
    expect(seeProtection(seen, hud({ armour: 3 })).armour).toBe(3);
    // nothing ever held: no chips
    expect(healthModel(hud()).chips).toEqual([]);
  });

  it('says what hurt you for a few seconds', () => {
    const hit = { lastHit: { source: 'bottle' as const, tick: 100 }, sinceHit: 30 };
    expect(healthModel(hud(hit)).cause).toBe('HIT BY BOTTLE');
    expect(healthModel(hud({ ...hit, sinceHit: CAUSE_TICKS })).cause).toBeNull();
    expect(healthModel(hud()).cause).toBeNull();
  });

  it('every hit source has a word', () => {
    const sources: CampaignHitSource[] = [
      'punch',
      'bottle',
      'brick',
      'stone',
      'tool',
      'blast',
      'vehicle',
      'hazard',
      'player',
      'trap',
    ];
    for (const s of sources) expect(sourceLabel(s).length).toBeGreaterThan(2);
  });
});

describe('the boss bar', () => {
  const enemy = (over: Partial<EnemyHud>): EnemyHud => ({
    id: 1,
    name: 'Oga Sunmola',
    kind: 'boss',
    hp: 10,
    maxHp: 10,
    showBar: true,
    ...over,
  });

  it('only boss and lieutenant kinds get one, with the name and segments', () => {
    const bars = bossBars([
      enemy({}),
      enemy({ id: 2, kind: 'guard', name: 'Guard' }),
      enemy({ id: 3, kind: 'lieutenant', name: 'Runner chief', hp: 3, maxHp: 6 }),
    ]);
    expect(bars.map((b) => [b.kindLabel, b.name])).toEqual([
      ['BOSS', 'Oga Sunmola'],
      ['LIEUTENANT', 'Runner chief'],
    ]);
    expect(bars[1]).toMatchObject({ segments: 6, filled: 3, text: '3 / 6' });
  });

  it('caps the segments and never shows an empty bar for a boss with health left', () => {
    expect(bossBars([enemy({ hp: 20, maxHp: 20 })])[0]!.segments).toBe(BOSS_SEGMENTS_MAX);
    expect(bossBars([enemy({ hp: 1, maxHp: 40 })])[0]!.filled).toBe(1);
    expect(bossBars([enemy({ hp: 0, maxHp: 10 })])[0]!.filled).toBe(0);
  });
});

describe('rail notices: nothing is silent', () => {
  const hit = (
    result: Extract<SimEvent, { type: 'campaignHit' }>['result'],
    over: Partial<Extract<SimEvent, { type: 'campaignHit' }>> = {},
  ): Extract<SimEvent, { type: 'campaignHit' }> => ({
    type: 'campaignHit',
    victimId: 0,
    byId: 1,
    source: 'bottle',
    result,
    damage: 1,
    hpAfter: 2,
    maxHp: 4,
    dazeTicks: 0,
    x: 3,
    y: 3,
    ...over,
  });

  it('damage says what hit you and how much is left', () => {
    expect(campaignHitNotice(hit('damaged'), [], 0, 0)).toMatchObject({
      text: 'HIT BY BOTTLE · 2/4 LEFT',
      tone: 'bad',
    });
    expect(campaignHitNotice(hit('dazed', { source: 'brick' }), [], 0, 0)!.text).toBe('DAZED BY BRICK');
    expect(campaignHitNotice(hit('defeated', { source: 'punch' }), [], 0, 0)!.text).toBe('DOWN: PUNCH');
  });

  it('Armour and Okada outcomes say so, unless the protection notice for the same hit already does', () => {
    expect(campaignHitNotice(hit('blockedArmour'), [], 0, 1)!.text).toBe('ARMOUR USED · 1 LEFT');
    expect(campaignHitNotice(hit('blockedArmour'), [], 0, 0)!.text).toBe('ARMOUR USED');
    expect(campaignHitNotice(hit('blockedOkada'), [], 0, 0)!.text).toBe('OKADA SAVED YOU');
    const armourEvent: SimEvent = { type: 'protectionBroken', playerId: 0, layer: 'armour', x: 3, y: 3 };
    const okadaEvent: SimEvent = { type: 'protectionBroken', playerId: 0, layer: 'okada', x: 3, y: 3 };
    expect(campaignHitNotice(hit('blockedArmour'), [armourEvent], 0, 1)).toBeNull();
    expect(campaignHitNotice(hit('blockedOkada'), [okadaEvent], 0, 0)).toBeNull();
  });

  it('only the local player gets notices; the recovery frames stay quiet (the SAFE chip says it)', () => {
    expect(campaignHitNotice(hit('damaged', { victimId: 1 }), [], 0, 0)).toBeNull();
    expect(campaignHitNotice(hit('invulnerable'), [], 0, 0)).toBeNull();
  });
});

describe('the components', () => {
  it('render nothing outside a campaign', () => {
    expect(renderToStaticMarkup(createElement(CampaignHealth, { campaign: null }))).toBe('');
  });

  it('draw the meter, the chips and the cause in the rail', () => {
    const html = renderToStaticMarkup(
      createElement(CampaignHealth, {
        campaign: hud({
          hp: 3,
          armour: 1,
          okada: true,
          lives: { left: 2, max: 3 },
          lastHit: { source: 'bottle', tick: 5 },
          sinceHit: 10,
          flash: true,
        }),
      }),
    );
    expect(html).toContain('data-testid="campaign-health"');
    expect(html.match(/data-testid="health-seg"/g)).toHaveLength(4);
    expect(html).toContain('data-state="lost"');
    expect(html).toContain('data-testid="campaign-chip-armour"');
    expect(html).toContain('data-testid="campaign-chip-okada"');
    expect(html).toContain('data-testid="campaign-chip-lives"');
    expect(html).toContain('HIT BY BOTTLE');
    expect(html).toContain('3 / 4');
  });

  it('a boss bar shows without the player having a meter', () => {
    const html = renderToStaticMarkup(
      createElement(CampaignHealth, {
        campaign: null,
        enemies: [{ id: 1, name: 'Oga Sunmola', kind: 'boss', hp: 5, maxHp: 10, showBar: true }],
      }),
    );
    expect(html).toContain('data-testid="boss-bar"');
    expect(html).toContain('Oga Sunmola');
    expect(html).not.toContain('data-testid="campaign-health"');
  });

  it('the HUD rail carries the meter before the mission panel, in the rail and not over the board', () => {
    Object.assign(useGameStore.getInitialState(), { settings: { ...DEFAULT_GAME_SETTINGS } });
    const html = renderToStaticMarkup(
      createElement(HudRail, {
        alerts: [],
        toasts: [],
        ruleBanner: null,
        rumble: false,
        campaign: hud({ hp: 2 }),
        enemies: [],
      }),
    );
    expect(html).toContain('data-testid="hud-rail"');
    expect(html.indexOf('data-testid="campaign-health"')).toBeGreaterThan(
      html.indexOf('data-testid="rail-combat"'),
    );
    const normal = renderToStaticMarkup(
      createElement(HudRail, { alerts: [], toasts: [], ruleBanner: null, rumble: false }),
    );
    expect(normal).not.toContain('campaign-health');
  });
});
