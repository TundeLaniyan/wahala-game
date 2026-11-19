/**
 * The campaign screens the Ojuelegba finale touches (decisions FN9-FN10), rendered statically with the session mocked:
 * the map's hub node and card as the final chapter (locked, open with its sections, freed), the Lekki result leading to
 * the interim beat, the interim and finale story cards, the finale briefing and the finale boss's result.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LANDLORD, applyMissionResult, applySectionResult, createSave } from '../../src/campaign';
import type { CampaignSave } from '../../src/campaign';
import { freshCampaignUi } from '../../src/app/campaignState';
import type { CampaignUi } from '../../src/app/campaignState';
import { DEFAULT_GAME_SETTINGS } from '../../src/app/settings';
import { MISSION_IDS } from '../../src/sim';
import type { MissionId, MissionOutcome } from '../../src/sim';

vi.mock('../../src/app/session', () => ({
  commands: new Proxy({}, { get: () => () => undefined }),
  liveMatch: () => null,
}));

const { useGameStore } = await import('../../src/app/store');
const { CampaignMap } = await import('../../src/ui/campaign/CampaignMap');
const { BriefingScreen } = await import('../../src/ui/campaign/BriefingScreen');
const { BossIntroScreen } = await import('../../src/ui/campaign/BossIntroScreen');
const { ResultScreen } = await import('../../src/ui/campaign/ResultScreen');
const { StoryScreen } = await import('../../src/ui/campaign/StoryScreen');
const model = await import('../../src/ui/campaign/model');
const { liberationBadge } = await import('../../src/ui/campaign/Liberation');

const win = (missionId: MissionId, over: Partial<MissionOutcome> = {}): MissionOutcome => ({
  result: 'won',
  missionId,
  modifiers: [],
  seconds: 210,
  livesUsed: 0,
  phasesCleared: 3,
  defeat: 'eliminated',
  stars: 3,
  creditedKills: 3,
  ...over,
});
const field = (ref: string): MissionOutcome => ({
  ...win('ojuelegba'),
  defeat: null,
  sectionMissionId: ref,
  raidBonus: 0,
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

const five = (): CampaignSave =>
  MISSION_IDS.slice(0, 5).reduce((s, id) => applyMissionResult(s, win(id), 2).save, createSave(1));
const six = (): CampaignSave => applyMissionResult(five(), win('lekki'), 3).save;
const after19 = (): CampaignSave => applySectionResult(six(), field('ojuelegba.return'), 4).save;
const won = (): CampaignSave => {
  const s = applySectionResult(after19(), field('ojuelegba.junction'), 5).save;
  return applyMissionResult(s, win('ojuelegba'), 6).save;
};

beforeEach(() => Object.assign(useGameStore.getInitialState(), { campaign: null }));

describe('the map: Ojuelegba becomes the final chapter (FN10)', () => {
  it('before Lekki falls the hub says the finale is still locked; no briefing, no chapter badge', () => {
    const html = render(CampaignMap, started(five(), { selected: 'ojuelegba' }));
    expect(html).toMatch(/data-testid="map-node-ojuelegba"[^>]*data-finale="locked"/);
    expect(html).toContain('data-testid="finale-locked"');
    expect(html).not.toContain('data-testid="finale-chapter"');
    expect(html).not.toContain('data-testid="campaign-briefing"');
    expect(html).not.toContain('map-node-lib-ojuelegba');
    expect(model.mapNodes(five()).find((n) => n.id === 'ojuelegba')!.finale!.status).toBe('locked');
  });

  it('once open: the final chapter with its liberation, its three sections and the keeper by his working title', () => {
    const html = render(CampaignMap, started(after19(), { selected: 'ojuelegba' }));
    expect(html).toMatch(/data-testid="map-node-ojuelegba"[^>]*data-finale="available"/);
    expect(html).toMatch(/data-testid="map-node-lib-ojuelegba"[^>]*>Final 1\/3</);
    expect(html).toContain('data-testid="finale-chapter"');
    expect(html).toMatch(/data-testid="section-ojuelegba.s1"[^>]*data-status="cleared"/);
    expect(html).toMatch(/data-testid="section-ojuelegba.s2"[^>]*data-status="available"/);
    expect(html).toMatch(/data-testid="mission-ojuelegba.boss"[^>]*data-status="locked"/);
    expect(html).toContain('The corner gate is open'); // the Ring-lost line of mission 19
    expect(html).toContain(`<b>The Landlord</b>, Enforcer of the Locked Routes (working title)`);
    // the map's main button continues into the chapter (it is not over yet)
    expect(html).toMatch(/data-testid="campaign-continue"[^>]*>Continue</);
  });

  it('once the Landlord falls: freed, with the best stars, and the map offers the finale scene', () => {
    const html = render(CampaignMap, started(won(), { selected: 'ojuelegba' }));
    expect(html).toMatch(/data-testid="map-node-ojuelegba"[^>]*data-finale="cleared"/);
    expect(html).toMatch(/data-testid="map-node-lib-ojuelegba"[^>]*>Freed</);
    expect(html).toContain('data-testid="finale-best"');
    expect(html).toContain('Replay: open briefing');
    expect(html).toMatch(/data-testid="campaign-continue"[^>]*>Play the finale</);
    expect(liberationBadge(model.mapNodes(won()).find((n) => n.id === 'ojuelegba')!)).toEqual({
      text: 'Freed',
      tone: 'freed',
    });
  });
});

describe('results and story scenes (FN9)', () => {
  it('the Lekki result leads home to the interim beat, not to the finale scene', () => {
    const r = applyMissionResult(five(), win('lekki'), 3);
    const html = render(
      ResultScreen,
      started(r.save, {
        result: {
          outcome: win('lekki'),
          reward: {
            rewards: r.newRewards,
            unlocks: r.newUnlocks,
            unlockedDistricts: r.unlockedDistricts,
            firstClear: true,
            campaignComplete: r.campaignComplete,
            ...(r.finaleOpened ? { finaleOpened: true } : {}),
          },
        },
      }),
    );
    expect(html).toContain('data-testid="result-interim"');
    expect(html).not.toContain('data-testid="result-finale"');
    expect(html).toContain('The Ojuelegba finale is open');
    expect(html).toContain('Up next: the Ojuelegba finale, Return to Ojuelegba.');
  });

  it('the interim story card plays the estates going dark and Ojuelegba still locked', () => {
    const html = render(StoryScreen, started(six(), { story: 'interim' }));
    expect(html).toContain('data-testid="interim-player"');
    expect(html).toContain('Still Locked');
    expect(html).toContain('Home to Ojuelegba');
  });

  it('the finale briefing and the Landlord’s introduction open from the hub once the chapter is ready', () => {
    const save = applySectionResult(after19(), field('ojuelegba.junction'), 5).save;
    const ui = started(save, { selected: 'ojuelegba' });
    expect(model.campaignScreenReady('briefing', ui)).toBe(true);
    expect(model.campaignScreenReady('briefing', started(five(), { selected: 'ojuelegba' }))).toBe(false);
    const brief = render(BriefingScreen, ui);
    expect(brief).toContain('The finale · Ojuelegba');
    expect(brief).toContain('Break the Ring');
    expect(brief).toContain(LANDLORD.name);
    const intro = render(BossIntroScreen, ui);
    expect(intro).toContain('data-card="intro.ojuelegba"');
    expect(intro).toContain('Ojuelegba, night.');
    expect(intro).toContain('Enforcer of the Locked Routes (working title)');
  });

  it('the finale boss’s result: the Landlord is down, the finale scene is next', () => {
    const before = applySectionResult(after19(), field('ojuelegba.junction'), 5).save;
    const r = applyMissionResult(before, win('ojuelegba'), 6);
    const html = render(
      ResultScreen,
      started(r.save, {
        result: {
          outcome: win('ojuelegba'),
          reward: {
            rewards: r.newRewards,
            unlocks: r.newUnlocks,
            unlockedDistricts: [],
            firstClear: true,
            campaignComplete: r.campaignComplete,
          },
        },
      }),
    );
    expect(html).toContain('The Landlord is down');
    expect(html).toContain('data-testid="result-finale"');
    expect(html).not.toContain('data-testid="result-next"');
    expect(html).toContain('Open Road');
    const finale = render(StoryScreen, started(r.save, { story: 'finale' }));
    expect(finale).toContain('data-testid="finale-player"');
  });
});
