import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createPrefsStore } from '../../src/audio/prefs';
import { AudioSettingsPanel, VOLUME_CONTROLS } from '../../src/ui/AudioSettings';

const render = (muted: boolean, store = createPrefsStore(() => null)) =>
  renderToStaticMarkup(createElement(AudioSettingsPanel, { muted, onMutedChange: () => undefined, store }));

describe('audio settings panel', () => {
  it('offers the four independent volumes with their saved values, a mute button and the voices switch', () => {
    const html = render(false);
    expect(VOLUME_CONTROLS.map((c) => c.key)).toEqual(['master', 'music', 'ambience', 'sfx']);
    for (const [key, label, pct] of [
      ['master', 'Master', 80],
      ['music', 'Afrobeats music', 45],
      ['ambience', 'Lagos ambience &amp; voices', 65],
      ['sfx', 'Gameplay effects', 85],
    ] as const) {
      expect(html).toContain(`data-testid="audio-${key}"`);
      expect(html).toContain(label);
      expect(html).toMatch(
        new RegExp(
          `data-testid="audio-${key}"[^>]*value="${pct}"|value="${pct}"[^>]*data-testid="audio-${key}"`,
        ),
      );
      expect(html).toContain(`${pct}%`);
    }
    expect(html).toContain('data-testid="toggle-mute"');
    expect(html).toContain('Sound on');
    expect(html).toContain('data-testid="toggle-voices"');
    expect(html).toContain('Pidgin voices on');
    expect(html).toContain('data-testid="audio-reset"');
  });

  it('reflects mute, a changed store and the voices switch', () => {
    const store = createPrefsStore(() => null);
    store.set({ music: 0.2, voices: false });
    const html = render(true, store);
    expect(html).toContain('Muted');
    expect(html).toContain('20%');
    expect(html).toContain('Pidgin voices off');
  });

  it('says plainly that the voices are synthetic placeholders', () => {
    expect(render(false)).toMatch(/synthetic placeholders/i);
  });
});
