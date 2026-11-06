/**
 * The illustrated story panels on the campaign screens (docs/STORY_VISUALS.md): the picture is there with its alt text,
 * the objective is always on the card, and the load-state helpers never leave a broken image. The "no image at all"
 * path is in storyPanelsNoImages.test.ts.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CAMPAIGN,
  DISTRICT_ORDER,
  briefingCard,
  bossIntroCard,
  createSave,
  endingCard,
  storyCard,
} from '../../src/campaign';
import { STORY_IMAGES } from '../../src/campaign/content/storyImages';
import { freshCampaignUi } from '../../src/app/campaignState';
import type { CampaignUi } from '../../src/app/campaignState';
import { DEFAULT_GAME_SETTINGS } from '../../src/app/settings';

vi.mock('../../src/app/session', () => ({
  commands: new Proxy({}, { get: () => () => undefined }),
  liveMatch: () => null,
}));

const { useGameStore } = await import('../../src/app/store');
const { BriefingScreen } = await import('../../src/ui/campaign/BriefingScreen');
const { BossIntroScreen } = await import('../../src/ui/campaign/BossIntroScreen');
const { StoryScreen } = await import('../../src/ui/campaign/StoryScreen');
const { CompleteScreen } = await import('../../src/ui/campaign/CompleteScreen');
const { CardView } = await import('../../src/ui/campaign/CardView');
const { HeroFigure, heroStateAfter } = await import('../../src/ui/campaign/StoryHero');
const { resolveStoryImage, storyFileUrl } = await import('../../src/ui/campaign/storyImageUrls');

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

describe('resolving a panel', () => {
  it('every key in the data has a bundled file and resolves to a URL with its alt text', () => {
    for (const [key, d] of Object.entries(STORY_IMAGES)) {
      expect(storyFileUrl(d.file), `${key}: ${d.file} is not bundled`).toBeTruthy();
      const img = resolveStoryImage(key);
      expect(img?.src).toBeTruthy();
      expect(img?.alt).toBe(d.alt);
    }
  });

  it('a key without an entry, an empty key or a file that is not bundled gives no panel', () => {
    expect(resolveStoryImage('nope')).toBeNull();
    expect(resolveStoryImage(null)).toBeNull();
    expect(resolveStoryImage(undefined)).toBeNull();
    expect(resolveStoryImage('prologue', () => null)).toBeNull();
    expect(
      resolveStoryImage('x', () => '/x.webp', { x: { file: 'x.webp', alt: 'A scene', position: '50% 50%' } })
        ?.src,
    ).toBe('/x.webp');
  });
});

describe('the picture element', () => {
  const image = resolveStoryImage('prologue')!;

  it('is a lazy, async-decoded 16:9 image with alt text and a focal point, over a scrim', () => {
    const html = renderToStaticMarkup(
      createElement(HeroFigure, { image, variant: 'hero', state: 'loading' }),
    );
    expect(html).toContain('data-testid="story-hero"');
    expect(html).toContain('data-state="loading"');
    expect(html).toContain(`alt="${esc(image.alt)}"`);
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    expect(html).toContain('width="960"');
    expect(html).toContain('height="540"');
    expect(html).toContain(`--hero-pos:${image.position}`);
    expect(html).toContain('cp-hero-scrim');
  });

  it('a failed picture renders nothing: no broken-image icon, no empty box', () => {
    expect(renderToStaticMarkup(createElement(HeroFigure, { image, variant: 'hero', state: 'failed' }))).toBe(
      '',
    );
  });

  it('the load state: a load makes it ready, an error removes it for good', () => {
    expect(heroStateAfter('loading', 'load')).toBe('ready');
    expect(heroStateAfter('loading', 'error')).toBe('failed');
    expect(heroStateAfter('ready', 'error')).toBe('failed');
    expect(heroStateAfter('failed', 'load')).toBe('failed');
  });

  it('a thumbnail has no scrim and no caption', () => {
    const html = renderToStaticMarkup(
      createElement(HeroFigure, {
        image: { ...image, caption: 'A caption' },
        variant: 'thumb',
        state: 'ready',
      }),
    );
    expect(html).toContain('data-testid="story-thumb"');
    expect(html).not.toContain('cp-hero-scrim');
    expect(html).not.toContain('A caption');
  });

  it('a caption is drawn only on the full panel', () => {
    const html = renderToStaticMarkup(
      createElement(HeroFigure, {
        image: { ...image, caption: 'A caption' },
        variant: 'hero',
        state: 'ready',
      }),
    );
    expect(html).toContain('data-testid="story-hero-caption"');
    expect(html).toContain('A caption');
  });
});

describe('campaign screens with their panel', () => {
  it('the briefing shows the district panel, then the summary and the objective', () => {
    for (const id of ['oshodi', 'mushin', 'fadeyiSomolu', 'ebuteMetta', 'lagosIsland', 'lekki'] as const) {
      const html = render(BriefingScreen, started({ selected: id }));
      const card = briefingCard(id);
      expect(html, id).toContain(`data-image="district.${id}.briefing"`);
      expect(html).toContain('cp-story-card has-hero');
      expect(html).toContain(esc(card.summary));
      expect(html).toContain('data-testid="card-objective"');
      expect(html).toContain(esc(card.objective));
      // the picture comes first in the card
      expect(html.indexOf('data-testid="story-hero"')).toBeLessThan(
        html.indexOf('data-testid="card-summary"'),
      );
      expect(html.indexOf('data-testid="card-summary"')).toBeLessThan(
        html.indexOf('data-testid="card-objective"'),
      );
    }
  });

  it('every boss introduction shows its panel and keeps the objective and Continue', () => {
    for (const id of ['oshodi', 'mushin', 'fadeyiSomolu', 'ebuteMetta', 'lagosIsland', 'lekki'] as const) {
      const html = render(BossIntroScreen, started({ selected: id }));
      const boss = CAMPAIGN.districts[id].boss!;
      expect(html, id).toContain(`data-image="boss.${boss.id}.intro"`);
      expect(html).toContain(esc(bossIntroCard(id)!.objective));
      expect(html).toContain('data-testid="story-next"');
    }
  });

  it('the prologue, the finale and the ending show their panels', () => {
    const p = render(StoryScreen, started({ story: 'prologue' }));
    expect(p).toContain('data-image="prologue"');
    expect(p).toContain(esc(storyCard('prologue').objective));
    const f = render(StoryScreen, started({ story: 'finale' }));
    expect(f).toContain('data-image="finale"');
    expect(f).toContain(esc(storyCard('finale').objective));
    const save = { ...createSave(1), completed: true };
    const e = render(CompleteScreen, freshCampaignUi(save, { started: true }));
    expect(e).toContain('data-image="ending"');
    expect(e).toContain(esc(endingCard().objective));
  });

  it('the picture can be switched off per card (imageKey null) and the card is then the plain text card', () => {
    const html = renderToStaticMarkup(
      createElement(CardView, { card: briefingCard('oshodi'), imageKey: null }),
    );
    expect(html).not.toContain('story-hero');
    expect(html).not.toContain('has-hero');
    expect(html).toContain('data-testid="card-objective"');
  });

  it('every district has a briefing panel (the map card uses it too)', () => {
    for (const d of DISTRICT_ORDER) expect(STORY_IMAGES[`district.${d}.briefing`], d).toBeDefined();
  });
});
