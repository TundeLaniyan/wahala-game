/**
 * The boss bar of a boss mission (follow-up to docs/CAMPAIGN_EXPANSION_STATUS.md): the six district bosses are not
 * hit-point fights, so the bar shows their three defence phases. Pure model + the component, no rules in the UI.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { missionBossBar } from '../../src/ui/campaignHealthModel';
import { CampaignHealth } from '../../src/ui/CampaignHealth';
import { missionView, tick } from '../../src/sim';
import { jumpToPhase, newMission } from '../mission-helpers';

describe('missionBossBar', () => {
  it('names the boss from the real mission view and starts with all three defences up', () => {
    const state = newMission({ id: 'oshodi' });
    tick(state, {});
    const bar = missionBossBar(missionView(state))!;
    expect(bar.kindLabel).toBe('BOSS DEFENCES');
    expect(bar.name).toBe('Oga Sunmola');
    expect(bar).toMatchObject({ segments: 3, filled: 3, state: 'shielded', text: '3 OF 3 DEFENCES UP' });
  });

  it('loses one segment per cleared phase, flashes the last while exposed and is empty when down', () => {
    const state = newMission({ id: 'oshodi' });
    tick(state, {});
    jumpToPhase(state, 1);
    expect(missionBossBar(missionView(state))!.filled).toBe(2);
    jumpToPhase(state, 2);
    expect(missionBossBar(missionView(state))!.filled).toBe(1);
    const v = missionView(state)!;
    expect(missionBossBar({ ...v, boss: { ...v.boss, shielded: false, exposed: true } })).toMatchObject({
      state: 'exposed',
      filled: 1,
      text: 'EXPOSED: NOW!',
    });
    expect(
      missionBossBar({ ...v, boss: { ...v.boss, shielded: false, exposed: false, defeated: true } }),
    ).toMatchObject({
      state: 'defeated',
      filled: 0,
      text: 'DOWN',
    });
  });

  it('is absent outside a boss mission and when a hit-point boss bar already shows the boss', () => {
    expect(missionBossBar(null)).toBeNull();
    const state = newMission({ id: 'oshodi' });
    tick(state, {});
    const hp = [{ id: 1, name: 'X', kindLabel: 'BOSS' as const, segments: 4, filled: 4, text: '4 / 4' }];
    expect(missionBossBar(missionView(state), hp)).toBeNull();
  });

  it('renders as a boss bar in the rail with its state and one segment per defence', () => {
    const state = newMission({ id: 'oshodi' });
    tick(state, {});
    const html = renderToStaticMarkup(
      createElement(CampaignHealth, { campaign: null, mission: missionView(state) }),
    );
    expect(html).toContain('data-testid="boss-bar"');
    expect(html).toContain('data-state="shielded"');
    expect(html).toContain('Oga Sunmola');
    expect((html.match(/ch-seg full/g) ?? []).length).toBe(3);
  });
});
