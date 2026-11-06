/**
 * The failure path of the story panels (docs/STORY_VISUALS.md): with no image bundled at all, every campaign screen still
 * renders its text, its objective and its Continue / Start button, and the campaign flow does not depend on the pictures.
 * The URL resolver is replaced by one that finds no file, which is exactly what a missing asset looks like at runtime.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { briefingCard, bossIntroCard, createSave, endingCard, storyCard } from '../../src/campaign';
import { freshCampaignUi } from '../../src/app/campaignState';
import type { CampaignUi } from '../../src/app/campaignState';
import { DEFAULT_GAME_SETTINGS } from '../../src/app/settings';

vi.mock('../../src/app/session', () => ({
  commands: new Proxy({}, { get: () => () => undefined }),
  liveMatch: () => null,
}));
// no file is bundled: every key resolves to nothing
vi.mock('../../src/ui/campaign/storyImageUrls', () => ({
  storyFileUrl: () => null,
  resolveStoryImage: () => null,
}));

const { useGameStore } = await import('../../src/app/store');
const { BriefingScreen } = await import('../../src/ui/campaign/BriefingScreen');
const { BossIntroScreen } = await import('../../src/ui/campaign/BossIntroScreen');
const { StoryScreen } = await import('../../src/ui/campaign/StoryScreen');
const { CompleteScreen } = await import('../../src/ui/campaign/CompleteScreen');
const { SectionList } = await import('../../src/ui/campaign/SectionList');

const esc = (t: string): string => t.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;');

function render(c: () => React.JSX.Element | null, ui: CampaignUi | null): string {
  Object.assign(useGameStore.getInitialState(), {
    settings: { ...DEFAULT_GAME_SETTINGS },
    loading: null,
    campaign: ui,
  });
  return renderToStaticMarkup(createElement(c));
}
const started = (p: Partial<CampaignUi> = {}) => freshCampaignUi(createSave(1), { started: true, ...p });

beforeEach(() => Object.assign(useGameStore.getInitialState(), { campaign: null }));

describe('no story image is available', () => {
  it('the briefing renders its summary, objective and the Meet the boss button with no picture', () => {
    const html = render(BriefingScreen, started({ selected: 'oshodi' }));
    expect(html).not.toContain('story-hero');
    expect(html).not.toContain('has-hero');
    expect(html).not.toContain('<img alt="Oshodi'); // no stray picture of any kind in the card
    expect(html).toContain(esc(briefingCard('oshodi').summary));
    expect(html).toContain('data-testid="card-objective"');
    expect(html).toContain(esc(briefingCard('oshodi').objective));
    expect(html).toContain('data-testid="briefing-start"');
  });

  it('the boss introduction, prologue, finale and ending keep their text, objective and Continue', () => {
    const intro = render(BossIntroScreen, started({ selected: 'mushin' }));
    expect(intro).not.toContain('story-hero');
    expect(intro).toContain(esc(bossIntroCard('mushin')!.objective));
    expect(intro).toContain('data-testid="story-next"');
    for (const which of ['prologue', 'finale'] as const) {
      const html = render(StoryScreen, started({ story: which }));
      expect(html).not.toContain('story-hero');
      expect(html).toContain(esc(storyCard(which).summary));
      expect(html).toContain(esc(storyCard(which).objective));
      expect(html).toContain('data-testid="story-next"');
    }
    const end = render(
      CompleteScreen,
      freshCampaignUi({ ...createSave(1), completed: true }, { started: true }),
    );
    expect(end).not.toContain('story-hero');
    expect(end).toContain(esc(endingCard().objective));
  });

  it('the section list shows no thumbnails and still lists every mission with its button', () => {
    const html = render(() => createElement(SectionList, { districtId: 'oshodi' }), started());
    expect(html).not.toContain('story-thumb');
    expect(html).toContain('data-testid="mission-oshodi.approach"');
    expect(html).toContain('data-testid="section-start-oshodi.approach"');
  });

  it('campaign progression never imports or depends on the pictures', () => {
    // the controller, the save and the rules are plain TypeScript with no image import at all
    const roots = ['src/app', 'src/sim'];
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const f of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, f.name);
        if (f.isDirectory()) walk(p);
        else if (
          /\.tsx?$/.test(f.name) &&
          /storyImages|StoryHero|assets\/story/.test(readFileSync(p, 'utf8'))
        )
          offenders.push(p);
      }
    };
    for (const r of roots) walk(join(__dirname, '..', '..', r));
    for (const f of ['save.ts', 'progress.ts', 'sectionState.ts', 'sectionProgress.ts', 'cards.ts'])
      if (
        /storyImages|assets\/story/.test(readFileSync(join(__dirname, '..', '..', 'src/campaign', f), 'utf8'))
      )
        offenders.push(f);
    expect(offenders).toEqual([]);
  });
});
