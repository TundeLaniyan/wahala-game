import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { open, startMatch } from './helpers';

/** Records every AudioContext and every started buffer source so the test can see what really played. */
const TRACK = `
  window.__audio = { contexts: 0, started: [], errors: [] };
  const Ctx = window.AudioContext;
  window.AudioContext = class extends Ctx {
    constructor(...a) { super(...a); window.__audio.contexts++; }
  };
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...a) {
    window.__audio.started.push({ loop: this.loop, frames: this.buffer ? this.buffer.length : 0, rate: this.buffer ? this.buffer.sampleRate : 0 });
    return start.apply(this, a);
  };
  window.addEventListener('error', (e) => window.__audio.errors.push(String(e.message)));
`;

interface Probe {
  contexts: number;
  started: { loop: boolean; frames: number; rate: number }[];
  errors: string[];
}
const probe = (page: Page): Promise<Probe> =>
  page.evaluate(() => (window as unknown as { __audio: Probe }).__audio);

const sliderValue = (page: Page, key: string): Promise<string> =>
  page.getByTestId(`audio-${key}`).inputValue();

test.describe('audio settings, persistence and music start', () => {
  test('four independent sliders with the requested defaults, saved between visits', async ({ page }) => {
    await open(page, '&nobots');
    await expect(page.getByTestId('audio-settings')).toBeVisible();
    expect([
      await sliderValue(page, 'master'),
      await sliderValue(page, 'music'),
      await sliderValue(page, 'ambience'),
      await sliderValue(page, 'sfx'),
    ]).toEqual(['80', '45', '65', '85']);

    await page.getByTestId('audio-music').fill('20');
    await page.getByTestId('audio-ambience').fill('90');
    // changing one leaves the others alone
    expect([await sliderValue(page, 'master'), await sliderValue(page, 'sfx')]).toEqual(['80', '85']);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('wahala.audio.v1') ?? 'null'));
    expect(saved).toEqual({ master: 0.8, music: 0.2, ambience: 0.9, sfx: 0.85, voices: true });

    await page.reload();
    await expect(page.getByTestId('title-screen')).toBeVisible();
    expect([await sliderValue(page, 'music'), await sliderValue(page, 'ambience')]).toEqual(['20', '90']);

    await page.getByTestId('toggle-voices').click();
    await expect(page.getByTestId('toggle-voices')).toContainText('off');
    await page.getByTestId('audio-reset').click();
    expect(await sliderValue(page, 'music')).toBe('45');
    await expect(page.getByTestId('toggle-voices')).toContainText('on');
  });

  test('mute is remembered and the panel is also on the pause menu', async ({ page }) => {
    await open(page, '&nobots');
    await expect(page.getByTestId('toggle-mute')).toContainText('Sound on');
    await page.getByTestId('toggle-mute').click();
    await expect(page.getByTestId('toggle-mute')).toContainText('Muted');
    await page.reload();
    await expect(page.getByTestId('toggle-mute')).toContainText('Muted');
    await page.getByTestId('toggle-mute').click();
    await startMatch(page);
    await page.keyboard.press('p');
    await expect(page.getByTestId('pause-overlay')).toBeVisible();
    await expect(page.getByTestId('pause-overlay').getByTestId('audio-settings')).toBeVisible();
  });

  test('no audio before the first gesture; the rejected music and voices are never fetched or played', async ({
    page,
  }) => {
    const audioFiles: string[] = [];
    page.on('request', (r) => {
      if (/\.(ogg|mp3|wav|m4a)(\?|$)/i.test(r.url())) audioFiles.push(r.url());
    });
    await page.addInitScript(TRACK);
    await open(page, '&nobots');
    await page.waitForTimeout(1500);
    const before = await probe(page);
    expect(before.contexts).toBe(0); // browsers block audio until a gesture, and so do we
    expect(before.started).toEqual([]);

    await page.getByTestId('audio-music').click(); // first user interaction (a click on a slider)
    await expect.poll(async () => (await probe(page)).contexts, { timeout: 10_000 }).toBe(1);

    await startMatch(page);
    await page.waitForTimeout(3000);
    const after = await probe(page);
    expect(after.errors).toEqual([]);
    expect(after.contexts).toBe(1);
    // synthesised effects and beds are fine; nothing long enough to be a music loop (> 20 s) may start
    expect(after.started.filter((s) => s.rate > 0 && s.frames / s.rate > 20)).toEqual([]);
    expect(audioFiles).toEqual([]);
  });
});
