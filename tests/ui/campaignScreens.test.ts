/**
 * The campaign screens show the real campaign content and the save's state (static render with the session
 * mocked), and the pure model behind them. The unseen broker is only ever a message card from UNKNOWN NUMBER.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CAMPAIGN,
  DISTRICT_ORDER,
  applyMissionResult,
  briefingCard,
  bossIntroCard,
  createSave,
  defeatCard,
  defeatLines,
  endingCard,
  missionResultCard,
  storyCard,
  trimObjective,
} from '../../src/campaign';
import type { CampaignSave } from '../../src/campaign';
import { freshCampaignUi } from '../../src/app/campaignState';
import type { CampaignUi } from '../../src/app/campaignState';
import { DEFAULT_GAME_SETTINGS } from '../../src/app/settings';
import { FLAG_DEFAULTS, setFlagsForTests } from '../../src/platform';
import type { MissionOutcome } from '../../src/sim';

vi.mock('../../src/app/session', () => ({
  commands: new Proxy({}, { get: () => () => undefined }),
  liveMatch: () => null,
}));

const { useGameStore } = await import('../../src/app/store');
const { HomeScreen } = await import('../../src/ui/menu/HomeScreen');
const { CampaignMap } = await import('../../src/ui/campaign/CampaignMap');
const { BriefingScreen } = await import('../../src/ui/campaign/BriefingScreen');
const { BossIntroScreen } = await import('../../src/ui/campaign/BossIntroScreen');
const { ResultScreen } = await import('../../src/ui/campaign/ResultScreen');
const { CompleteScreen } = await import('../../src/ui/campaign/CompleteScreen');
const { StoryScreen } = await import('../../src/ui/campaign/StoryScreen');
const { StoryLineView, BossCard } = await import('../../src/ui/campaign/parts');
const { CardView } = await import('../../src/ui/campaign/CardView');
const model = await import('../../src/ui/campaign/model');

const win = (over: Partial<MissionOutcome> = {}): MissionOutcome => ({
  result: 'won',
  missionId: 'oshodi',
  modifiers: [],
  seconds: 125,
  livesUsed: 1,
  phasesCleared: 3,
  defeat: 'eliminated',
  stars: 2,
  creditedKills: 3,
  ...over,
});

const esc = (t: string): string => t.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;');

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
const afterOshodi = () => applyMissionResult(createSave(1), win(), 2);

beforeEach(() => Object.assign(useGameStore.getInitialState(), { campaign: null }));

describe('campaign map', () => {
  it('shows seven nodes with their status, stars and the landmark names; Oshodi open, the rest locked', () => {
    const html = render(CampaignMap, started(createSave(1)));
    for (const id of DISTRICT_ORDER) expect(html).toContain(`data-testid="map-node-${id}"`);
    expect(html).toMatch(/data-testid="map-node-oshodi"[^>]*data-status="available"/);
    expect(html).toMatch(/data-testid="map-node-mushin"[^>]*data-status="locked"/);
    expect(html).toMatch(/data-testid="map-node-ojuelegba"[^>]*data-status="cleared"/);
    expect(html).toContain('0 of 6 districts cleared');
    // the selected district's three landmarks come from the content
    for (const l of CAMPAIGN.districts.oshodi.landmarks) expect(html).toContain(l.name);
    expect(html).toContain('data-testid="campaign-continue"');
    expect(html).toContain('Start Oshodi');
  });

  it('after a win: Mushin opens, Oshodi shows its stars and best time, Continue / progress move on', () => {
    const { save } = afterOshodi();
    const html = render(CampaignMap, started(save, { selected: 'oshodi' }));
    expect(html).toMatch(/data-testid="map-node-mushin"[^>]*data-status="available"/);
    expect(html).toMatch(/data-testid="map-node-oshodi"[^>]*data-status="cleared"/);
    expect(html).toContain('1 of 6 districts cleared');
    expect(html).toContain(model.clock(125));
    expect(html).toContain('Replay: open briefing');
    expect(html).toContain('data-testid="campaign-prologue"');
    expect(html).toContain('data-testid="campaign-new"');
    expect(html).toContain('data-testid="campaign-delete"');
  });

  it('a locked district says what to clear first and hides its keeper', () => {
    const html = render(CampaignMap, started(createSave(1), { selected: 'lekki' }));
    expect(html).toContain('data-testid="district-locked"');
    expect(html).toContain('Clear');
    expect(html).not.toContain(CAMPAIGN.districts.lekki.boss!.name);
    expect(html).not.toContain('data-testid="campaign-briefing"');
  });

  it('without a campaign it offers New campaign and no tools; a notice is shown', () => {
    const html = render(CampaignMap, freshCampaignUi(createSave(1), { notice: 'Save deleted.' }));
    expect(html).toContain('data-testid="campaign-start-new"');
    expect(html).toContain('data-testid="campaign-start-card"');
    expect(html).not.toContain('data-testid="campaign-delete"');
    expect(html).toContain('Save deleted.');
  });
});

describe('briefing and boss introduction', () => {
  it('the briefing shows a short summary and one objective line; the rest is behind Read more', () => {
    const html = render(BriefingScreen, started(createSave(1), { selected: 'oshodi' }));
    const d = CAMPAIGN.districts.oshodi;
    const card = briefingCard('oshodi');
    expect(html).toContain('data-testid="briefing-text"');
    expect(html).toContain('data-testid="card-summary"');
    expect(html).toContain(esc(card.summary));
    expect(html).toContain('data-testid="card-objective"');
    expect(html).toContain(esc(card.objective));
    expect(html).toContain('data-testid="card-readmore"');
    expect(html).toContain('aria-expanded="false"');
    // collapsed: the long text is not on screen yet
    expect(html).not.toContain('data-testid="card-readmore-body"');
    for (const t of [...d.briefing.intel, ...d.briefing.warnings]) expect(html).not.toContain(esc(t));
    expect(html).not.toContain('data-testid="story-broker"');
    // the boss: name and title up front, the details behind its own Read more
    expect(html).toContain(d.boss!.name);
    expect(html).toContain(d.boss!.title);
    expect(html).toContain(d.boss!.signatureAbility.name);
    expect(html).not.toContain('data-testid="boss-counterplay"');
    expect(html).toContain('3 lives');
    expect(html).toContain('Meet the boss'); // intro not seen yet
  });

  it('Read more reveals the objectives, intel, warnings, the unseen broker message and the full boss card', () => {
    const d = CAMPAIGN.districts.oshodi;
    const open = renderToStaticMarkup(
      createElement(CardView, { card: briefingCard('oshodi'), defaultOpen: true }),
    );
    expect(open).toContain('aria-expanded="true"');
    expect(open).toContain('data-testid="card-readmore-body"');
    for (const o of [...d.briefing.objectives, ...d.briefing.intel, ...d.briefing.warnings])
      expect(open).toContain(esc(o));
    expect(open).toContain('data-testid="story-broker"');
    expect(open).toContain('UNKNOWN NUMBER');
    const boss = renderToStaticMarkup(createElement(BossCard, { boss: d.boss!, defaultOpen: true }));
    expect(boss).toContain('Orita Park Wardens'); // the protection crew faction
    expect(boss).toContain(d.boss!.signatureAbility.description);
    expect(boss).toContain('data-testid="boss-counterplay"');
  });

  it('replay modifiers appear only once the district is cleared; the loadout reads the save, not the menu setup', () => {
    const fresh = render(BriefingScreen, started(createSave(1), { selected: 'oshodi' }));
    expect(fresh).not.toContain('data-testid="modifier-rushHourDispatch"');
    const { save } = afterOshodi();
    const html = render(
      BriefingScreen,
      started({ ...save, character: 'campusQueen' }, { selected: 'oshodi' }),
    );
    expect(html).toContain('data-testid="modifier-rushHourDispatch"');
    expect(html).toMatch(/aria-pressed="true"[^>]*data-testid="briefing-char-campusQueen"/);
    expect(html).toContain('Meet the boss');
    const seen = {
      ...save,
      districts: { ...save.districts, oshodi: { ...save.districts.oshodi, introSeen: true } },
    };
    expect(render(BriefingScreen, started(seen, { selected: 'oshodi' }))).toContain('Start mission');
  });

  it('the boss introduction is one short card with Continue in the footer; the boss lines are in Read more', () => {
    const html = render(BossIntroScreen, started(createSave(1), { selected: 'oshodi' }));
    const boss = CAMPAIGN.districts.oshodi.boss!;
    expect(html).toContain('data-testid="boss-intro-player"');
    expect(html).toContain(esc(bossIntroCard('oshodi')!.summary));
    expect(html).toContain(esc(trimObjective(boss.phases[0].objective)));
    expect(html).toContain('data-testid="story-next"');
    expect(html).toContain('Start mission');
    expect(html).not.toContain(esc(boss.introduction[1]!.text));
    const open = renderToStaticMarkup(
      createElement(CardView, { card: bossIntroCard('oshodi')!, defaultOpen: true }),
    );
    for (const l of boss.introduction) expect(open).toContain(esc(l.text));
    expect(open).toContain('data-testid="story-broker"'); // the Chairman's line is a message card
  });
});

describe('result screens', () => {
  it('victory: the defeat scene, stars, time, rewards, consequence and the opened district', () => {
    const o = win();
    const summary = applyMissionResult(createSave(1), o, 2);
    const html = render(
      ResultScreen,
      started(summary.save, {
        selected: 'oshodi',
        result: {
          outcome: o,
          reward: {
            rewards: summary.newRewards,
            unlocks: summary.newUnlocks,
            unlockedDistricts: summary.unlockedDistricts,
            firstClear: summary.firstClear,
            campaignComplete: false,
          },
        },
      }),
    );
    const boss = CAMPAIGN.districts.oshodi.boss!;
    expect(html).toContain(model.victoryTitle(boss, o));
    expect(html).toContain(model.clock(125));
    expect(html).toContain(boss.reward.name);
    expect(html).toContain('District opened: Mushin');
    expect(html).toContain('Next: Mushin is open'); // the objective line
    expect(html).toContain(esc(defeatCard(boss).summary)); // the summary is the defeat scene's
    expect(html).toContain('data-testid="result-next"');
    expect(html).not.toContain('data-testid="result-retry"');
    // the scene itself and the consequence are behind Read more
    expect(html).not.toContain(esc(defeatLines(boss, 'eliminated')[0]!.text));
    expect(html).not.toContain('data-testid="card-readmore-body"');
    const card = missionResultCard({
      boss,
      outcome: o,
      districtName: 'Oshodi',
      nextName: 'Mushin',
      finale: false,
      firstClear: true,
      rewardLines: [`${boss.reward.name}: ${boss.reward.description}`],
    });
    const open = renderToStaticMarkup(createElement(CardView, { card, defaultOpen: true }));
    expect(open).toContain(esc(defeatLines(boss, 'eliminated')[0]!.text));
    expect(open).toContain(esc(boss.consequence));
    expect(open).toContain(esc(boss.reward.description));
  });

  it('ousted bosses play their own scene', () => {
    const boss = CAMPAIGN.districts.oshodi.boss!;
    expect(defeatLines(boss, 'ousted')).not.toBe(defeatLines(boss, 'eliminated'));
    expect(model.victoryTitle(boss, win({ defeat: 'ousted' }))).toContain('is out');
  });

  it('defeat and timeout: what went wrong, a hint from the boss counterplay, and Retry (no rewards shown)', () => {
    const o = win({ result: 'lost', stars: 0, defeat: null, phasesCleared: 1, livesUsed: 3 });
    const html = render(
      ResultScreen,
      started(applyMissionResult(createSave(1), o, 2).save, {
        selected: 'oshodi',
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
    const boss = CAMPAIGN.districts.oshodi.boss!;
    expect(html).toContain('data-testid="result-retry"');
    expect(html).toContain('phase 2 of 3');
    expect(html).toContain('Next try'); // the objective label
    expect(html).toContain(esc(trimObjective(boss.phases[1]!.objective)));
    expect(html).not.toContain('data-testid="result-rewards"');
    expect(html).not.toContain(esc(boss.counterplay)); // the hint is behind Read more
    expect(model.failureText(win({ result: 'timeout' }))).toMatch(/Time ran out/);
  });

  it('the sixth clear offers the finale; the ending screen shows title, summary, teaser, stats and replays', () => {
    const o = win({ missionId: 'lekki' });
    let save = createSave(1);
    for (const id of DISTRICT_ORDER.filter((d) => d !== 'ojuelegba'))
      save = applyMissionResult(save, win({ missionId: id as 'oshodi' }), 2).save;
    const result = {
      outcome: o,
      reward: { rewards: [], unlocks: [], unlockedDistricts: [], firstClear: true, campaignComplete: true },
    };
    expect(render(ResultScreen, started(save, { selected: 'lekki', result }))).toContain(
      'data-testid="result-finale"',
    );
    const html = render(CompleteScreen, started({ ...save, completed: true }));
    expect(html).toContain(CAMPAIGN.ending.title);
    expect(html).toContain(esc(endingCard().summary));
    expect(html).not.toContain(esc(CAMPAIGN.ending.teaser)); // behind Read more
    expect(html).toContain('Long Blackout');
    const open = renderToStaticMarkup(createElement(CardView, { card: endingCard(), defaultOpen: true }));
    expect(open).toContain(esc(CAMPAIGN.ending.teaser));
    expect(open).toContain('UNKNOWN NUMBER');
    expect(html).toContain(`${model.totalStars(save).got} / 18`);
  });
});

describe('story lines', () => {
  it('the broker is a message card (no face / image); other speakers are plain lines', () => {
    const msg = renderToStaticMarkup(
      createElement(StoryLineView, { line: { speaker: 'THE CHAIRMAN', text: 'Hello.', fromBroker: true } }),
    );
    expect(msg).toContain('cp-msg');
    expect(msg).toContain('UNKNOWN NUMBER');
    expect(msg).not.toMatch(/<img|<svg|portrait|silhouette/i);
    const plain = renderToStaticMarkup(
      createElement(StoryLineView, { line: { speaker: 'MAMA PUT', text: 'Go.' } }),
    );
    expect(plain).toContain('MAMA PUT');
    expect(plain).not.toContain('cp-msg');
  });

  it('Read more open marks the card as reading (its text column scrolls beside the picture: decision PS3)', () => {
    const open = renderToStaticMarkup(
      createElement(CardView, { card: storyCard('prologue'), defaultOpen: true }),
    );
    expect(open).toMatch(/class="[^"]*cp-story-card[^"]*\breading\b/);
    const closed = renderToStaticMarkup(createElement(CardView, { card: storyCard('prologue') }));
    expect(closed).not.toMatch(/class="[^"]*cp-story-card[^"]*\breading\b/);
  });

  it('every prologue and finale broker line renders as a message card', () => {
    for (const line of [...CAMPAIGN.prologue, ...CAMPAIGN.finale].filter((l) => l.fromBroker))
      expect(renderToStaticMarkup(createElement(StoryLineView, { line }))).toContain('cp-msg');
  });

  it('the story screen is one short card for the prologue or the finale, with Continue in the footer', () => {
    const p = render(StoryScreen, started(createSave(1), { story: 'prologue' }));
    expect(p).toContain('data-testid="prologue-player"');
    expect(p).toContain(esc(storyCard('prologue').summary));
    expect(p).toContain(esc(storyCard('prologue').objective));
    expect(p).toContain('data-testid="story-next"');
    expect(p).toContain('To the map');
    expect(p).not.toContain(esc(CAMPAIGN.prologue[1]!.text)); // the scene is behind Read more
    const f = render(StoryScreen, started(createSave(1), { story: 'finale' }));
    expect(f).toContain('data-testid="finale-player"');
    expect(f).toContain('The ending');
  });
});

describe('model helpers', () => {
  it('unlock ids become readable text', () => {
    expect(model.unlockLabel('district.mushin')).toBe('District opened: Mushin');
    expect(model.unlockLabel('modifier.marketDay')).toBe('Replay modifier: Market Day');
    expect(model.unlockLabel('finale.unlocked')).toMatch(/finale/);
    expect(model.unlockLabel('costume.streetBaller.interchangeHiVis')).toBe('Costume: Interchange Hi Vis');
  });

  it('screens only render when their data exists', () => {
    const none = null;
    expect(model.campaignScreenReady('home', none)).toBe(true);
    expect(model.campaignScreenReady('campaign', none)).toBe(false);
    const ui = started(createSave(1), { selected: 'ojuelegba' });
    expect(model.campaignScreenReady('briefing', ui)).toBe(false); // the hub has no mission
    expect(model.campaignScreenReady('campaignResult', ui)).toBe(false);
    expect(model.campaignScreenReady('briefing', { ...ui, selected: 'oshodi' })).toBe(true);
  });

  it('clock formats minutes and seconds', () => {
    expect(model.clock(65)).toBe('1:05');
    expect(model.clock(-3)).toBe('0:00');
    expect(model.hexCss(0xd9a21b)).toBe('#d9a21b');
  });
});

describe('Home entry', () => {
  it('shows a Campaign entry first when the flag is on, with progress once a campaign exists', () => {
    const fresh = render(HomeScreen, freshCampaignUi(createSave(1)));
    expect(fresh).toContain('data-testid="home-campaign"');
    expect(fresh.indexOf('data-testid="home-campaign"')).toBeLessThan(
      fresh.indexOf('data-testid="home-rumble"'),
    );
    const progressed = render(HomeScreen, started(afterOshodi().save));
    expect(progressed).toMatch(/data-testid="home-campaign"[\s\S]*1 \/ 6/);
  });

  it('is absent when the campaign flag is off or the campaign has not loaded: the menu is as it was', () => {
    expect(render(HomeScreen, null)).not.toContain('home-campaign');
    setFlagsForTests({ ...FLAG_DEFAULTS, campaign: false });
    try {
      expect(render(HomeScreen, freshCampaignUi(createSave(1)))).not.toContain('home-campaign');
    } finally {
      setFlagsForTests(null);
    }
  });
});
