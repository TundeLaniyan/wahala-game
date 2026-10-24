import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createPrefsStore } from '../../src/audio/prefs';
import { AudioSettingsPanel, VOLUME_CONTROLS } from '../../src/ui/AudioSettings';
import { DEFAULT_GAME_SETTINGS } from '../../src/app/settings';
import type { SubtitleMode } from '../../src/app/settings';

const render = (muted: boolean, store = createPrefsStore(() => null), subtitles: SubtitleMode = 'off') =>
  renderToStaticMarkup(
    createElement(AudioSettingsPanel, {
      muted,
      onMutedChange: () => undefined,
      subtitles,
      onSubtitlesChange: () => undefined,
      store,
    }),
  );

describe('audio settings panel', () => {
  it('offers the four independent volumes with their saved values, a mute button and the voices switch', () => {
    const html = render(false);
    expect(VOLUME_CONTROLS.map((c) => c.key)).toEqual(['master', 'music', 'ambience', 'sfx']);
    for (const [key, label, pct] of [
      ['master', 'Master', 85],
      ['music', 'Music', 90],
      ['ambience', 'Ambience &amp; voices', 45],
      ['sfx', 'Gameplay effects', 50],
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
    expect(html).toContain('Voices on');
    expect(html).toContain('data-testid="audio-reset"');
  });

  it('reflects mute, a changed store and the voices switch', () => {
    const store = createPrefsStore(() => null);
    store.set({ music: 0.2, voices: false });
    const html = render(true, store);
    expect(html).toContain('Muted');
    expect(html).toContain('20%');
    expect(html).toContain('Voices off');
  });

  it('says plainly that the voices are synthetic text-to-speech clips', () => {
    expect(render(false)).toMatch(/synthetic/i);
    expect(render(false)).toMatch(/text-to-speech/i);
  });

  it('offers subtitles off (the default), on and large', () => {
    expect(DEFAULT_GAME_SETTINGS.subtitles).toBe('off');
    expect(render(false)).toMatch(/data-testid="toggle-subtitles"[^>]*>Subtitles off/);
    expect(render(false, undefined, 'on')).toMatch(
      /aria-pressed="true"[^>]*data-mode="on"|data-mode="on"[^>]*>Subtitles on/,
    );
    expect(render(false, undefined, 'large')).toContain('Subtitles large');
  });

  it('the recommended-mix button shows when the mix is the recommended one and offers it otherwise', () => {
    expect(render(false)).toMatch(/data-testid="audio-reset"[^>]*>Recommended mix/);
    const store = createPrefsStore(() => null);
    store.set({ music: 0.3 });
    expect(render(false, store)).toMatch(/data-testid="audio-reset"[^>]*>Use recommended mix/);
  });
});
