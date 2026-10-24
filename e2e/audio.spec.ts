import { readFileSync } from 'node:fs';
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

/** The only audio files the game may request: the approved tracks listed in the music manifest. */
const APPROVED_FILES = new Set(
  (
    JSON.parse(readFileSync(new URL('../public/audio/music/manifest.json', import.meta.url), 'utf8')) as {
      tracks: { file: string; approved?: boolean }[];
    }
  ).tracks
    .filter((t) => t.approved === true)
    .map((t) => t.file),
);

const sliderValue = (page: Page, key: string): Promise<string> =>
  page.getByTestId(`audio-${key}`).inputValue();

test.describe('audio settings, persistence and music start', () => {
  test('four independent sliders with the music-first defaults, saved between visits', async ({ page }) => {
    await open(page, '&nobots');
    await expect(page.getByTestId('audio-settings')).toBeVisible();
    expect([
      await sliderValue(page, 'master'),
      await sliderValue(page, 'music'),
      await sliderValue(page, 'ambience'),
      await sliderValue(page, 'sfx'),
    ]).toEqual(['85', '90', '45', '50']);
    await expect(page.getByTestId('audio-reset')).toContainText('Recommended mix');

    await page.getByTestId('audio-music').fill('20');
    await page.getByTestId('audio-ambience').fill('90');
    // changing one leaves the others alone
    expect([await sliderValue(page, 'master'), await sliderValue(page, 'sfx')]).toEqual(['85', '50']);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('wahala.audio.v2') ?? 'null'));
    expect(saved).toEqual({ master: 0.85, music: 0.2, ambience: 0.9, sfx: 0.5, voices: true });
    await expect(page.getByTestId('audio-reset')).toContainText('Use recommended mix');

    await page.reload();
    await expect(page.getByTestId('title-screen')).toBeVisible();
    expect([await sliderValue(page, 'music'), await sliderValue(page, 'ambience')]).toEqual(['20', '90']);

    await page.getByTestId('toggle-voices').click();
    await expect(page.getByTestId('toggle-voices')).toContainText('off');
    await page.getByTestId('audio-reset').click();
    expect(await sliderValue(page, 'music')).toBe('90');
    expect(await sliderValue(page, 'ambience')).toBe('45');
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
    await expect(page.getByTestId('pause-overlay').getByTestId('audio-reset')).toBeVisible();
  });

  test('a browser with the old saved defaults gets the new mix; a chosen mix is kept until the player asks', async ({
    page,
  }) => {
    // an older version saved its untouched defaults
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('seeded')) {
        sessionStorage.setItem('seeded', '1');
        localStorage.setItem(
          'wahala.audio.v1',
          JSON.stringify({ master: 0.8, music: 0.45, ambience: 0.65, sfx: 0.85, voices: true }),
        );
      }
    });
    await open(page, '&nobots');
    const all = async () =>
      Promise.all(['master', 'music', 'ambience', 'sfx'].map((k) => sliderValue(page, k)));
    expect(await all()).toEqual(['85', '90', '45', '50']);

    // an older version saved a mix the player chose: it is respected (music converted to sound the same)
    await page.evaluate(() => {
      localStorage.removeItem('wahala.audio.v2');
      localStorage.setItem(
        'wahala.audio.v1',
        JSON.stringify({ master: 0.6, music: 0.3, ambience: 0.2, sfx: 1, voices: true }),
      );
    });
    await page.reload();
    await expect(page.getByTestId('title-screen')).toBeVisible();
    expect(await all()).toEqual(['60', '50', '20', '100']);
    await expect(page.getByTestId('audio-reset')).toContainText('Use recommended mix');
    // one press applies the recommended mix, and it sticks
    await page.getByTestId('audio-reset').click();
    expect(await all()).toEqual(['85', '90', '45', '50']);
    await page.reload();
    await expect(page.getByTestId('title-screen')).toBeVisible();
    expect(await all()).toEqual(['85', '90', '45', '50']);
  });

  test('no audio before the first gesture; only approved playlist files are ever requested', async ({
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
    // only the approved playlist files may be requested (probed or streamed); never a voice pack, never
    // anything generated
    expect(audioFiles.filter((u) => !/\/audio\/music\/[A-Za-z0-9_-]+\.mp3(\?|$)/.test(u))).toEqual([]);
    expect(
      audioFiles.map((u) => /([A-Za-z0-9_-]+\.mp3)(\?|$)/.exec(u)![1]).filter((f) => !APPROVED_FILES.has(f!)),
    ).toEqual([]);

    // the playlist player in the real browser: a match track only if an approved file is present,
    // otherwise silent; the pause menu reaches the music
    const music = () =>
      page.evaluate(
        () =>
          (
            window as unknown as { __WAHALA__: { music: () => Record<string, unknown> | null } }
          ).__WAHALA__.music() as {
            scene: string;
            track: string | null;
            available: string[];
            paused: boolean;
            rate: number;
          },
      );
    const m = await music();
    expect(m.scene).toBe('match');
    if (m.available.length === 0) expect(m.track).toBeNull();
    else expect(m.available).toContain(m.track);
    expect(m.rate).toBe(1);
    await page.keyboard.press('p');
    await expect(page.getByTestId('pause-overlay')).toBeVisible();
    await expect.poll(async () => (await music()).paused).toBe(true);
    await page.keyboard.press('p');
    await expect.poll(async () => (await music()).paused).toBe(false);
    expect((await probe(page)).errors).toEqual([]);
  });
});

interface MusicState {
  scene: string;
  track: string | null;
  arenaId: string | null;
  available: string[];
  paused: boolean;
  rate: number;
  urgency: number;
  pitchPreserved: boolean;
  position: number;
  playing: boolean;
  history: string[];
}
const musicState = (page: Page): Promise<MusicState> =>
  page.evaluate(() => (window as unknown as { __WAHALA__: { music: () => MusicState } }).__WAHALA__.music());

test.describe('the approved soundtrack in a real browser', () => {
  test('all nine supplied tracks fetch and decode as real audio', async ({ page }) => {
    await open(page, '&nobots');
    const decoded = await page.evaluate(
      async (files) => {
        const ctx = new AudioContext();
        const out: { file: string; ok: boolean; seconds: number }[] = [];
        for (const f of files) {
          try {
            const res = await fetch(`audio/music/${f}`);
            const buf = await ctx.decodeAudioData(await res.arrayBuffer());
            out.push({ file: f, ok: true, seconds: buf.duration });
          } catch {
            out.push({ file: f, ok: false, seconds: 0 });
          }
        }
        await ctx.close();
        return out;
      },
      [...APPROVED_FILES],
    );
    const ok = decoded.filter((d) => d.ok);
    expect(ok.map((d) => d.file).sort()).toEqual(
      [...APPROVED_FILES].filter((f) => f !== 'pixabay_496406.mp3').sort(),
    );
    for (const d of ok) expect(d.seconds, d.file).toBeGreaterThan(90);
    // track #7 is not supplied yet: its slot stays empty
    expect(decoded.find((d) => d.file === 'pixabay_496406.mp3')?.ok).toBe(false);
  });

  test('a match plays its arena track, escalates pitch-preserved in the final 30 s, pauses and rotates', async ({
    page,
  }) => {
    test.setTimeout(420_000); // three matches on software WebGL
    await open(page, '&nobots');
    await page.getByTestId('audio-music').click(); // the first gesture unlocks audio
    await page.getByTestId('arena-danfoBusPark').click();
    await startMatch(page, { competitors: 2 });
    await expect.poll(async () => (await musicState(page)).available.length, { timeout: 30_000 }).toBe(9);
    // the first bus-park match opens with the bus park's starting track, and it really plays
    await expect.poll(async () => (await musicState(page)).track, { timeout: 30_000 }).toBe('pixabay_504898');
    await page.evaluate(() => {
      (
        window as unknown as { __WAHALA__: { controller(): { frozen: boolean } } }
      ).__WAHALA__.controller().frozen = false;
    });
    await expect
      .poll(async () => (await musicState(page)).position, { timeout: 30_000 })
      .toBeGreaterThan(0.5);
    const playing = await musicState(page);
    expect(playing.playing).toBe(true);
    expect(playing.pitchPreserved).toBe(true);
    expect(playing.rate).toBe(1);

    // fast-forward to 0:16 left, then play one second through the real audio path: tempo is up, pitch kept
    await page.evaluate(() => {
      const w = (
        window as unknown as {
          __WAHALA__: {
            controller(): { frozen: boolean };
            getState(): { config: { match: { durationTicks: number } }; match: { playTicks: number } };
            stepTicks(n: number): void;
            advance(n: number): void;
          };
        }
      ).__WAHALA__;
      w.controller().frozen = true;
      const s = w.getState();
      w.stepTicks(s.config.match.durationTicks - 16 * 60 - s.match.playTicks);
      w.advance(60);
    });
    const late = await musicState(page);
    expect(late.urgency).toBeGreaterThan(0.4);
    expect(late.rate).toBeGreaterThan(1.03);
    expect(late.rate).toBeLessThan(1.06);
    expect(late.pitchPreserved).toBe(true);

    // pause reaches the music; resume continues
    await page.keyboard.press('p');
    await expect(page.getByTestId('pause-overlay')).toBeVisible();
    await expect.poll(async () => (await musicState(page)).paused).toBe(true);
    await page.keyboard.press('p');
    await expect.poll(async () => (await musicState(page)).paused).toBe(false);

    // quit, then another arena: its own starting track; back to the bus park: a different track, tempo reset
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause-overlay')).toBeVisible();
    await page.getByTestId('quit').click();
    await expect(page.getByTestId('title-screen')).toBeVisible();
    await page.getByTestId('arena-balogunMarket').click();
    await startMatch(page, { competitors: 2 });
    await expect.poll(async () => (await musicState(page)).track, { timeout: 30_000 }).toBe('pixabay_573648');
    expect((await musicState(page)).rate).toBe(1);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause-overlay')).toBeVisible();
    await page.getByTestId('quit').click();
    await page.getByTestId('arena-danfoBusPark').click();
    await startMatch(page, { competitors: 2 });
    await expect.poll(async () => (await musicState(page)).history.length, { timeout: 30_000 }).toBe(3);
    const third = await musicState(page);
    expect(third.track).not.toBe('pixabay_573648');
    expect(['pixabay_406552', 'pixabay_491432', 'pixabay_504898']).toContain(third.track);
    expect(third.rate).toBe(1);
  });
});
