/**
 * World-state feedback and the campaign-wide Workshop on screen (decisions PR9-PR15): every section and boss result
 * shows its "what the Ring lost" line, the Parts it paid, the Parts to spend and the next reason to continue; the map
 * shows each district's liberation state (node badge and district card); the Workshop shows level 1 / level 2 cost and
 * effect text and the free refund. Static render with the session mocked, plus the pure view models.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CAMPAIGN,
  allSectionMissions,
  applyMissionResult,
  applyRaidResult,
  applySectionResult,
  buyUpgrade,
  createSave,
  partsGained,
  sectionsOf,
} from '../../src/campaign';
import type { CampaignSave } from '../../src/campaign';
import { freshCampaignUi } from '../../src/app/campaignState';
import type { CampaignUi } from '../../src/app/campaignState';
import { DEFAULT_GAME_SETTINGS } from '../../src/app/settings';
import { MISSION_IDS } from '../../src/sim';
import type { MissionId, MissionOutcome, RaidId, RaidOutcome } from '../../src/sim';

vi.mock('../../src/app/session', () => ({
  commands: new Proxy({}, { get: () => () => undefined }),
  liveMatch: () => null,
}));

const { useGameStore } = await import('../../src/app/store');
const { CampaignMap } = await import('../../src/ui/campaign/CampaignMap');
const { ResultScreen } = await import('../../src/ui/campaign/ResultScreen');
const { upgradeLevelText } = await import('../../src/ui/campaign/Workshop');
const { liberationBadge } = await import('../../src/ui/campaign/Liberation');
const model = await import('../../src/ui/campaign/sectionModel');
const { mapNodes } = await import('../../src/ui/campaign/model');

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fieldWin = (ref: string, stars: 1 | 2 | 3 = 2): MissionOutcome => ({
  result: 'won',
  missionId: ref.split('.')[0] as MissionId,
  modifiers: [],
  seconds: 95,
  livesUsed: 0,
  phasesCleared: 3,
  defeat: null,
  stars,
  creditedKills: 0,
  sectionMissionId: ref,
  raidBonus: 0,
});
const raidWin = (raidId: RaidId, stars: 1 | 2 | 3 = 2): RaidOutcome => ({
  raidId,
  result: 'completed',
  seconds: 60,
  optionalRoomsOpened: 0,
  optionalRoomsTotal: 0,
  cargoDestroyed: 3,
  cargoTotal: 3,
  hpLeft: 3,
  livesUsed: 0,
  stars,
});
const bossWin = (id: MissionId, stars: 1 | 2 | 3 = 2): MissionOutcome => ({
  result: 'won',
  missionId: id,
  modifiers: [],
  seconds: 125,
  livesUsed: 0,
  phasesCleared: 3,
  defeat: null,
  stars,
  creditedKills: 3,
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

/** Every district before `upTo` cleared at two stars. */
function clearedBefore(upTo: MissionId): CampaignSave {
  let s = createSave(1);
  for (const d of MISSION_IDS.slice(0, MISSION_IDS.indexOf(upTo)))
    for (const sec of sectionsOf(d))
      for (const m of sec.missions) {
        if (m.format === 'field') s = applySectionResult(s, fieldWin(m.missionRef), 2).save;
        else if (m.format === 'raid') s = applyRaidResult(s, m.id, raidWin(m.missionRef as RaidId), 2).save;
        else s = applyMissionResult(s, bossWin(d), 2).save;
      }
  return s;
}

beforeEach(() => Object.assign(useGameStore.getInitialState(), { campaign: null }));

describe('section results: Ring lost, Parts, up next (every district)', () => {
  const sectionMissions = allSectionMissions().filter((m) => m.format !== 'boss');

  it.each(sectionMissions.map((m) => [m.id, m] as const))('%s', (_id, m) => {
    const district = m.id.split('.')[0] as MissionId;
    let before = clearedBefore(district);
    // the earlier missions of the same district
    for (const o of sectionsOf(district).flatMap((s) => s.missions)) {
      if (o.id === m.id) break;
      before =
        o.format === 'field'
          ? applySectionResult(before, fieldWin(o.missionRef), 2).save
          : applyRaidResult(before, o.id, raidWin(o.missionRef as RaidId), 2).save;
    }
    const kind = m.format === 'raid' ? 'raid' : 'field';
    const outcome = kind === 'raid' ? raidWin(m.missionRef as RaidId) : fieldWin(m.missionRef);
    const summary =
      kind === 'raid'
        ? applyRaidResult(before, m.id, outcome as RaidOutcome, 3)
        : applySectionResult(before, outcome as MissionOutcome, 3);
    const html = render(
      ResultScreen,
      started(summary.save, {
        sectionResult: {
          missionId: m.id,
          kind,
          outcome,
          summary,
          partsGained: partsGained(before, summary.save),
        },
      }),
    );
    expect(html).toContain(`Ring weakened: ${esc(m.ringWeakened!)}`);
    expect(html).toMatch(/data-testid="result-parts"[^>]*>.*\+4 Generator Parts/);
    expect(html).toContain('data-testid="result-parts-total"');
    expect(html).toContain('data-testid="result-up-next"');
    expect(html).toContain(esc(model.upNextLine(summary.save)!));
  });
});

describe('boss results: Ring lost, Parts, up next (every district)', () => {
  it.each(MISSION_IDS.map((d) => [d] as const))('%s', (d) => {
    let before = clearedBefore(d);
    for (const sec of sectionsOf(d))
      for (const m of sec.missions) {
        if (m.format === 'field') before = applySectionResult(before, fieldWin(m.missionRef), 2).save;
        if (m.format === 'raid')
          before = applyRaidResult(before, m.id, raidWin(m.missionRef as RaidId), 2).save;
      }
    const o = bossWin(d, 3);
    const summary = applyMissionResult(before, o, 4);
    const html = render(
      ResultScreen,
      started(summary.save, {
        selected: d,
        result: {
          outcome: o,
          reward: {
            rewards: summary.newRewards,
            unlocks: summary.newUnlocks,
            unlockedDistricts: summary.unlockedDistricts,
            firstClear: summary.firstClear,
            campaignComplete: summary.campaignComplete,
          },
          partsGained: partsGained(before, summary.save),
        },
      }),
    );
    const line = sectionsOf(d)[2]!.missions[0]!.ringWeakened!;
    expect(html).toMatch(/data-testid="result-ring-lost"/);
    expect(html).toContain(`Ring weakened: ${esc(line)}`);
    expect(html).toMatch(/data-testid="result-parts"[^>]*>.*\+5 Generator Parts/);
    const next = model.upNextLine(summary.save)!;
    expect(html).toContain(esc(next));
    if (d === 'lekki') expect(next).toBe('Up next: the finale.');
    else {
      const nextDistrict = MISSION_IDS[MISSION_IDS.indexOf(d) + 1]!;
      expect(next).toContain(CAMPAIGN.districts[nextDistrict].name);
      expect(next).toContain(sectionsOf(nextDistrict)[0]!.missions[0]!.name);
    }
  });

  it('a lost boss mission shows no Ring line and no up-next line', () => {
    const save = clearedBefore('mushin');
    const o: MissionOutcome = { ...bossWin('oshodi'), result: 'lost', stars: 0 };
    const html = render(
      ResultScreen,
      started(save, {
        result: {
          outcome: o,
          reward: {
            rewards: [],
            unlocks: [],
            unlockedDistricts: [],
            firstClear: false,
            campaignComplete: false,
          },
        },
      }),
    );
    expect(html).not.toContain('result-ring-lost');
    expect(html).not.toContain('result-up-next');
  });

  it('the up-next line is the boss when the sections are done, and null once the campaign is complete', () => {
    let s = createSave(1);
    s = applySectionResult(s, fieldWin('oshodi.approach'), 2).save;
    s = applySectionResult(s, fieldWin('oshodi.railEdge'), 2).save;
    expect(model.upNextLine(s)).toBe(
      'Up next: Oga Sunmola, the keeper of Oshodi. Jam the relay masts, then finish Oga Sunmola.',
    );
    const done = { ...clearedBefore('lekki'), completed: true };
    const all = applyMissionResult(
      [...sectionsOf('lekki')[0]!.missions, ...sectionsOf('lekki')[1]!.missions].reduce(
        (acc, m) => applySectionResult(acc, fieldWin(m.missionRef), 2).save,
        done,
      ),
      bossWin('lekki'),
      2,
    ).save;
    expect(model.upNextLine({ ...all, completed: true })).toBeNull();
  });
});

describe('map liberation state', () => {
  it('node badges: n/3 while open, Freed once the keeper falls, nothing for the hub or a locked district', () => {
    let s = createSave(1);
    s = applySectionResult(s, fieldWin('oshodi.approach'), 2).save;
    const nodes = new Map(mapNodes(s).map((n) => [n.id, n]));
    expect(liberationBadge(nodes.get('oshodi')!)).toEqual({ text: '1/3', tone: 'open' });
    expect(liberationBadge(nodes.get('mushin')!)).toBeNull();
    expect(liberationBadge(nodes.get('ojuelegba')!)).toBeNull();
    const freed = new Map(mapNodes(clearedBefore('mushin')).map((n) => [n.id, n]));
    expect(liberationBadge(freed.get('oshodi')!)).toEqual({ text: 'Freed', tone: 'freed' });
    expect(liberationBadge(freed.get('mushin')!)).toEqual({ text: '0/3', tone: 'open' });

    const html = render(CampaignMap, started(clearedBefore('mushin'), { selected: 'mushin' }));
    expect(html).toMatch(/data-testid="map-node-lib-oshodi"[^>]*>Freed/);
    expect(html).toMatch(/data-testid="map-node-lib-mushin"[^>]*>0\/3/);
    expect(html).not.toContain('map-node-lib-fadeyiSomolu');
    expect(html).toContain('aria-label="Oshodi, freed, 2 of 3 stars');
  });

  it('the district card lists what the Ring lost there, in play order, and says Freed once cleared', () => {
    let s = clearedBefore('mushin');
    s = applySectionResult(s, fieldWin('mushin.approach'), 2).save;
    const lib = model.districtLiberation(s, 'mushin');
    expect(lib).toEqual({
      reclaimed: 1,
      total: 3,
      freed: false,
      losses: [sectionsOf('mushin')[0]!.missions[0]!.ringWeakened],
    });
    const html = render(CampaignMap, started(s, { selected: 'mushin' }));
    expect(html).toMatch(/data-testid="district-liberation"[^>]*data-reclaimed="1"[^>]*data-freed="false"/);
    expect(html).toContain('Liberation: 1 of 3 sections reclaimed');
    expect(html).toContain(esc(lib.losses[0]!));

    const oshodi = render(CampaignMap, started(s, { selected: 'oshodi' }));
    expect(oshodi).toMatch(/data-testid="district-liberation"[^>]*data-reclaimed="3"[^>]*data-freed="true"/);
    expect(oshodi).toContain('Freed from the Ring');
    for (const m of sectionsOf('oshodi').flatMap((x) => x.missions))
      expect(oshodi).toContain(esc(m.ringWeakened!));
    expect(oshodi).toContain('data-testid="district-consequence"'); // the PR8 line stays

    const fresh = model.districtLiberation(createSave(1), 'oshodi');
    expect(fresh).toEqual({ reclaimed: 0, total: 3, freed: false, losses: [] });
    expect(render(CampaignMap, started(createSave(1)))).toContain('The Ring still holds every street here.');
  });

  it('a locked district shows no liberation block', () => {
    const html = render(CampaignMap, started(createSave(1), { selected: 'lekki' }));
    expect(html).not.toContain('data-testid="district-liberation"');
  });
});

describe('the Workshop, campaign-wide with level 2', () => {
  it('shows level text, costs and the cap; offers a free refund only once something is bought', () => {
    let s = clearedBefore('lagosIsland'); // four districts at two stars: 48 Parts
    expect(upgradeLevelText(s, 'range')).toBe('Not bought yet · next: +1 blast range for 6 Parts');
    let html = render(CampaignMap, started(s, { selected: 'lagosIsland' }));
    expect(html).toContain('data-testid="campaign-workshop"'); // every district now
    expect(html).toMatch(/data-testid="workshop-parts"[^>]*>48</);
    expect(html).toContain('48 earned in the campaign');
    expect(html).toMatch(/data-testid="workshop-district-parts"[^>]*>.*0 of 15 here/);
    expect(html).not.toContain('data-testid="workshop-refund"');
    expect(html).toMatch(/data-testid="workshop-buy-range"[^>]*>Buy · 6/);

    s = buyUpgrade(s, 'range', 2);
    expect(upgradeLevelText(s, 'range')).toBe('Now +1 blast range · next: +2 blast range for 14 Parts');
    html = render(CampaignMap, started(s, { selected: 'oshodi' }));
    expect(html).toMatch(/data-testid="workshop-range"[^>]*data-level="1"/);
    expect(html).toMatch(/data-testid="workshop-buy-range"[^>]*>Buy · 14/);
    expect(html).toContain('data-testid="workshop-refund"');

    s = buyUpgrade(s, 'range', 3);
    expect(upgradeLevelText(s, 'range')).toBe('Now +2 blast range (maximum)');
    expect(upgradeLevelText(s, 'capacity')).toBe('Not bought yet · next: +1 generator at once for 6 Parts');
    html = render(CampaignMap, started(s, { selected: 'oshodi' }));
    expect(html).toMatch(/data-testid="workshop-buy-range"[^>]*disabled[^>]*>Maxed/);
    expect(html).toContain('never in raids, Classic, City Rumble or the Academy');
  });

  it('is shown on the hub card too, and not before a campaign is started', () => {
    expect(render(CampaignMap, started(createSave(1), { selected: 'ojuelegba' }))).toContain(
      'data-testid="campaign-workshop"',
    );
    expect(render(CampaignMap, freshCampaignUi(createSave(1)))).not.toContain('campaign-workshop');
  });
});
