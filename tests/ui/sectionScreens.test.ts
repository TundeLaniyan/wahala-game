/**
 * The campaign map lists each district's sections with status and the suggested next mission; the section result screen
 * shows what a field mission or raid won and opened. Static render with the session mocked, plus the pure model.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applySectionResult, createSave, sectionsOf } from '../../src/campaign';
import type { CampaignSave } from '../../src/campaign';
import { freshCampaignUi } from '../../src/app/campaignState';
import type { CampaignUi } from '../../src/app/campaignState';
import { DEFAULT_GAME_SETTINGS } from '../../src/app/settings';
import type { MissionOutcome } from '../../src/sim';

vi.mock('../../src/app/session', () => ({
  commands: new Proxy({}, { get: () => () => undefined }),
  liveMatch: () => null,
}));

const { useGameStore } = await import('../../src/app/store');
const { CampaignMap } = await import('../../src/ui/campaign/CampaignMap');
const { ResultScreen } = await import('../../src/ui/campaign/ResultScreen');
const { campaignScreenReady } = await import('../../src/ui/campaign/model');
const model = await import('../../src/ui/campaign/sectionModel');

const fieldWin = (fieldId: string, over: Partial<MissionOutcome> = {}): MissionOutcome => ({
  result: 'won',
  missionId: 'oshodi',
  modifiers: [],
  seconds: 95,
  livesUsed: 0,
  phasesCleared: 3,
  defeat: null,
  stars: 3,
  creditedKills: 0,
  sectionMissionId: fieldId,
  raidBonus: 0,
  ...over,
});

function render(c: () => React.JSX.Element | null, ui: CampaignUi | null): string {
  Object.assign(useGameStore.getInitialState(), {
    settings: { ...DEFAULT_GAME_SETTINGS },
    loading: null,
    campaign: ui,
  });
  return renderToStaticMarkup(createElement(c));
}

const started = (save: CampaignSave, p: Partial<CampaignUi> = {}) =>
  freshCampaignUi(save, { started: true, ...p });

beforeEach(() => Object.assign(useGameStore.getInitialState(), { campaign: null }));

describe('section model', () => {
  it('lists three sections with status, formats and the suggested next mission', () => {
    const rows = model.sectionRows(createSave(1), 'oshodi');
    expect(rows.map((r) => [r.order, r.status])).toEqual([
      [1, 'available'],
      [2, 'locked'],
      [3, 'locked'],
    ]);
    expect(rows[0]!.missions[0]).toMatchObject({
      id: 'oshodi.approach',
      format: 'field',
      suggested: true,
      doors: 1,
    });
    expect(rows[2]!.missions[0]).toMatchObject({ format: 'boss', status: 'locked' });
    expect(model.sectionsText(createSave(1), 'oshodi')).toBe('0 of 3 sections reclaimed');
    expect(model.suggestedMission(createSave(1))).toEqual({
      id: 'oshodi.approach',
      name: 'Terminal Approach',
      format: 'field',
    });
  });

  it('wording of a section result: reclaimed, rewards, what opened, and failures', () => {
    const r = applySectionResult(createSave(1), fieldWin('oshodi.approach'), 2);
    const text = model.sectionResultText({
      missionId: 'oshodi.approach',
      kind: 'field',
      outcome: fieldWin('oshodi.approach'),
      summary: r,
    });
    expect(text).toMatchObject({
      won: true,
      title: 'Terminal Approach done',
      kicker: 'Field mission',
      opened: ['Rail Edge'],
    });
    expect(text.lines.join(' ')).toContain('Section reclaimed');
    expect(text.lines.join(' ')).toContain('Terminal Regular');
    const lost = applySectionResult(
      createSave(1),
      fieldWin('oshodi.approach', { result: 'lost', stars: 0 }),
      2,
    );
    const bad = model.sectionResultText({
      missionId: 'oshodi.approach',
      kind: 'field',
      outcome: fieldWin('oshodi.approach', { result: 'lost', stars: 0 }),
      summary: lost,
    });
    expect(bad.won).toBe(false);
    expect(bad.opened).toEqual([]);
  });
});

describe('campaign map sections', () => {
  it('shows the selected district sections, the suggested mission and a locked boss', () => {
    const html = render(CampaignMap, started(createSave(1)));
    expect(html).toContain('data-testid="district-sections"');
    for (const s of sectionsOf('oshodi')) expect(html).toContain(`data-testid="section-${s.id}"`);
    expect(html).toMatch(/data-testid="section-oshodi.s1"[^>]*data-status="available"/);
    expect(html).toMatch(/data-testid="section-oshodi.s2"[^>]*data-status="locked"/);
    expect(html).toContain('Terminal Approach');
    expect(html).toContain('Walk the checkpoints, raid the depot, come back out.');
    expect(html).toMatch(/data-testid="section-start-oshodi.approach"[^>]*>Start/);
    expect(html).toMatch(/data-testid="section-start-oshodi.railEdge"[^>]*disabled/);
    expect(html).toMatch(/data-testid="section-start-oshodi.boss"[^>]*disabled/);
    expect(html).not.toContain('data-testid="campaign-briefing"'); // the boss briefing waits for the sections
  });

  it('after the sections the boss briefing is offered and the cleared sections say Replay', () => {
    let save = createSave(1);
    save = applySectionResult(save, fieldWin('oshodi.approach'), 2).save;
    save = applySectionResult(save, fieldWin('oshodi.railEdge'), 3).save;
    const html = render(CampaignMap, started(save, { selected: 'oshodi' }));
    expect(html).toMatch(/data-testid="section-oshodi.s1"[^>]*data-status="cleared"/);
    expect(html).toMatch(/data-testid="section-start-oshodi.approach"[^>]*>Replay/);
    expect(html).toMatch(/data-testid="section-start-oshodi.boss"(?![^>]*disabled)/);
    expect(html).toContain('data-testid="campaign-briefing"');
  });

  it('a locked district shows no section list', () => {
    const html = render(CampaignMap, started(createSave(1), { selected: 'lekki' }));
    expect(html).not.toContain('data-testid="district-sections"');
  });
});

describe('section result screen', () => {
  it('the result screen shows a section result, with the next mission and a replay', () => {
    const outcome = fieldWin('oshodi.approach');
    const summary = applySectionResult(createSave(1), outcome, 2);
    const ui = started(summary.save, {
      sectionResult: { missionId: 'oshodi.approach', kind: 'field', outcome, summary },
    });
    expect(campaignScreenReady('campaignResult', ui)).toBe(true);
    const html = render(ResultScreen, ui);
    expect(html).toContain('data-testid="section-result"');
    expect(html).toContain('Terminal Approach done');
    expect(html).toContain('Section reclaimed');
    expect(html).toContain('Rail Edge');
    expect(html).toMatch(/data-testid="section-result-next"[^>]*>Next: Rail Edge/);
    expect(html).toContain('data-testid="section-result-replay"');
  });

  it('a lost section mission offers Retry', () => {
    const outcome = fieldWin('oshodi.approach', { result: 'lost', stars: 0 });
    const summary = applySectionResult(createSave(1), outcome, 2);
    const ui = started(summary.save, {
      sectionResult: { missionId: 'oshodi.approach', kind: 'field', outcome, summary },
    });
    const html = render(ResultScreen, ui);
    expect(html).toContain('data-testid="section-result-retry"');
    expect(html).not.toContain('section-result-next');
  });

  it('without a result the campaign result screen is not ready', () => {
    expect(campaignScreenReady('campaignResult', started(createSave(1)))).toBe(false);
  });
});
