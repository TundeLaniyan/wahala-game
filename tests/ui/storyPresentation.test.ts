/**
 * Story-line presentation (decisions PS2, PS4): who says a line decides how it is drawn, using existing approved art
 * only. The broker is a message card (never a face), the district radio a short radio card (no portrait), a PLAYABLE
 * hero speaks beside their approved menu portrait, and anyone else (Mama Put, a district boss) is a named line with no
 * picture: a boss is never given a portrait cropped from group art.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CHARACTERS, CHARACTER_IDS } from '../../src/sim';
import { CAMPAIGN } from '../../src/campaign';
import type { StoryLine } from '../../src/campaign';
import { heroForSpeaker, speakerStyle } from '../../src/ui/campaign/speakers';
import { StoryLineView } from '../../src/ui/campaign/lines';

const html = (line: StoryLine): string => renderToStaticMarkup(createElement(StoryLineView, { line }));

describe('speaker styles', () => {
  it('maps the broker, the radio and the narrator before anyone else', () => {
    expect(speakerStyle({ speaker: 'THE CHAIRMAN', fromBroker: true }).kind).toBe('broker');
    expect(speakerStyle({ speaker: 'RADIO' }).kind).toBe('radio');
    expect(speakerStyle({ speaker: 'NARRATOR' }).kind).toBe('narrator');
    expect(speakerStyle({ speaker: 'MAMA PUT' })).toEqual({ kind: 'voice', heroId: null });
  });

  it('recognises exactly the playable heroes by their registry names (any case)', () => {
    for (const id of CHARACTER_IDS) {
      expect(heroForSpeaker(CHARACTERS[id].name)).toBe(id);
      expect(heroForSpeaker(CHARACTERS[id].name.toLowerCase())).toBe(id);
      expect(speakerStyle({ speaker: CHARACTERS[id].name.toUpperCase() })).toEqual({
        kind: 'hero',
        heroId: id,
      });
    }
    expect(heroForSpeaker('MADAM RONKE')).toBeNull();
  });

  it('no line of the shipped campaign is drawn as a hero today (the heroes have no spoken lines yet)', () => {
    const lines: StoryLine[] = [...CAMPAIGN.prologue, ...CAMPAIGN.finale];
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(speakerStyle(line).kind).not.toBe('hero');
  });
});

describe('story line markup', () => {
  it('the radio is a short radio card with no picture', () => {
    const out = html({ speaker: 'RADIO', text: 'Bus held at the park gate.' });
    expect(out).toContain('data-testid="story-radio"');
    expect(out).toContain('on the radio');
    expect(out).toContain('Bus held at the park gate.');
    expect(out).not.toMatch(/<img/);
  });

  it('a playable hero speaks beside their approved menu portrait', () => {
    const out = html({ speaker: 'STREET BALLER', text: 'I go handle am.' });
    expect(out).toContain('data-testid="story-hero-line"');
    expect(out).toContain('data-hero="streetBaller"');
    expect(out).toMatch(/<img[^>]*fighter-streetBaller-(360|720)/);
  });

  it('a district boss and Mama Put are named lines with no picture; the broker keeps its message card', () => {
    for (const speaker of ['MADAM RONKE', 'MAMA PUT']) {
      const out = html({ speaker, text: 'Hmm.' });
      expect(out).toContain(speaker);
      expect(out).not.toMatch(/<img|story-hero-line|story-radio/);
    }
    const broker = html({ speaker: 'UNKNOWN NUMBER', text: 'Light is expensive.', fromBroker: true });
    expect(broker).toContain('cp-msg');
    expect(broker).not.toMatch(/<img|portrait|silhouette/i);
  });
});
