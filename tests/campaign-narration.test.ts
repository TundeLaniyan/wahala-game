/**
 * Campaign narration (docs/CAMPAIGN_TEXT_NARRATION.md): an optional audio provider that fails safely. No clip
 * exists, nothing is fetched, nothing throws, entitlement gating returns the free path, the Listen button is
 * disabled with its note, and Skip / Continue works while a clip is "playing".
 */
import { describe, expect, it, vi } from 'vitest';
import { cardsFrom } from '../src/campaign';
import {
  FileNarrationProvider,
  FreeEntitlements,
  NARRATION_CATALOGUE,
  NARRATION_CLIPS,
  NullNarrationProvider,
  clipAllowed,
  clipUrl,
  createCatalogue,
  safeHas,
} from '../src/campaign/narration';
import type { ClipPort, EntitlementPort, NarrationClip, NarrationProvider } from '../src/campaign/narration';
import { DEFAULT_GAME_SETTINGS, sanitizeSettings } from '../src/app/settings';
import { createElementClipPort } from '../src/app/narration';
import {
  NOT_RECORDED,
  createListenControl,
  createSceneControl,
  listenView,
  safePlay,
} from '../src/ui/campaign/listenModel';

const clip = (over: Partial<NarrationClip> = {}): NarrationClip => ({
  id: 'oshodi-brief',
  cardId: 'briefing.oshodi',
  text: 'Spoken text.',
  language: 'en-NG',
  voiceId: 'founder-1',
  source: 'recorded',
  tier: 'free',
  ...over,
});

/** A port whose clips finish when the test says so. */
function fakePort() {
  const played: string[] = [];
  let finish: ((r: 'ended' | 'failed' | 'stopped') => void) | null = null;
  const port: ClipPort & { played: string[]; end(r?: 'ended' | 'failed' | 'stopped'): void; stops: number } =
    {
      played,
      stops: 0,
      play(url) {
        played.push(url);
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
      stop() {
        port.stops++;
        finish?.('stopped');
        finish = null;
      },
      end(r = 'ended') {
        finish?.(r);
        finish = null;
      },
    };
  return port;
}

describe('the shipped catalogue is empty of audio', () => {
  it('has no clips, so no card has narration and nothing is fetched', () => {
    expect(NARRATION_CLIPS).toEqual([]);
    for (const c of cardsFrom()) {
      expect(NARRATION_CATALOGUE.get(c.narrationId), c.id).toBeNull();
      expect(NARRATION_CATALOGUE.hasFile(c.narrationId)).toBe(false);
    }
  });

  it('the default provider says unavailable for every card and never touches the audio port', async () => {
    const port = fakePort();
    const provider = new FileNarrationProvider({
      catalogue: NARRATION_CATALOGUE,
      entitlements: FreeEntitlements,
      port,
    });
    for (const c of cardsFrom()) {
      expect(provider.available(c.narrationId)).toBe(false);
      expect(await provider.play(c.narrationId)).toEqual({ status: 'unavailable', reason: 'no-clip' });
    }
    expect(port.played).toEqual([]);
  });

  it('the new preferences default to off / shown, and survive a broken settings blob', () => {
    expect(DEFAULT_GAME_SETTINGS.campaignNarration).toBe(false);
    expect(DEFAULT_GAME_SETTINGS.campaignListen).toBe(true);
    expect(sanitizeSettings({ campaignNarration: 'yes', campaignListen: 3 } as never).campaignNarration).toBe(
      false,
    );
    expect(sanitizeSettings({ campaignListen: false } as never).campaignListen).toBe(false);
  });
});

describe('providers never throw', () => {
  it('the null provider is always unavailable', async () => {
    const p = new NullNarrationProvider();
    expect(p.available()).toBe(false);
    expect(await p.play()).toEqual({ status: 'unavailable', reason: 'no-clip' });
    expect(() => p.stop()).not.toThrow();
  });

  it('a recorded free clip plays through the port from audio/narration/<id>.mp3 and reports played', async () => {
    const port = fakePort();
    const p = new FileNarrationProvider({
      catalogue: createCatalogue([clip()]),
      entitlements: FreeEntitlements,
      port,
      baseUrl: '/wahala-game/',
    });
    expect(p.available('briefing.oshodi')).toBe(true);
    const done = p.play('briefing.oshodi');
    expect(port.played).toEqual(['/wahala-game/audio/narration/oshodi-brief.mp3']);
    port.end('ended');
    expect(await done).toEqual({ status: 'played' });
  });

  it('a catalogue entry with no file (source none / tts-future) is "no-file" and loads nothing', async () => {
    const port = fakePort();
    for (const source of ['none', 'tts-future'] as const) {
      const p = new FileNarrationProvider({
        catalogue: createCatalogue([clip({ source })]),
        entitlements: FreeEntitlements,
        port,
      });
      expect(p.available('briefing.oshodi')).toBe(false);
      expect(await p.play('briefing.oshodi')).toEqual({ status: 'unavailable', reason: 'no-file' });
    }
    expect(port.played).toEqual([]);
  });

  it('a failing, throwing or rejecting port resolves as failed, never throws', async () => {
    const make = (port: ClipPort) =>
      new FileNarrationProvider({
        catalogue: createCatalogue([clip()]),
        entitlements: FreeEntitlements,
        port,
      });
    expect(
      await make({ play: () => Promise.resolve('failed'), stop: () => undefined }).play('briefing.oshodi'),
    ).toMatchObject({
      status: 'failed',
    });
    expect(
      await make({
        play: () => {
          throw new Error('blocked');
        },
        stop: () => undefined,
      }).play('briefing.oshodi'),
    ).toEqual({ status: 'failed', reason: 'blocked' });
    expect(
      await make({ play: () => Promise.reject(new Error('404')), stop: () => undefined }).play(
        'briefing.oshodi',
      ),
    ).toEqual({
      status: 'failed',
      reason: '404',
    });
    const angry = make({
      play: () => Promise.resolve('ended'),
      stop: () => {
        throw new Error('no');
      },
    });
    expect(() => angry.stop()).not.toThrow();
  });

  it('a throwing catalogue or entitlement port degrades to unavailable / locked', async () => {
    const bad = {
      get: () => {
        throw new Error('boom');
      },
      hasFile: () => {
        throw new Error('boom');
      },
      all: () => [],
    };
    const p = new FileNarrationProvider({ catalogue: bad, entitlements: FreeEntitlements, port: fakePort() });
    expect(p.available('x')).toBe(false);
    expect(await p.play('x')).toEqual({ status: 'unavailable', reason: 'no-clip' });
    const angryEnt: EntitlementPort = {
      has: () => {
        throw new Error('receipt');
      },
    };
    expect(safeHas(angryEnt, 'fullNarration')).toBe(false);
  });

  it('no audio platform: every card is unavailable', async () => {
    const p = new FileNarrationProvider({
      catalogue: createCatalogue([clip()]),
      entitlements: FreeEntitlements,
      port: null,
    });
    expect(p.available('briefing.oshodi')).toBe(false);
    expect(await p.play('briefing.oshodi')).toEqual({ status: 'unavailable', reason: 'no-audio' });
  });

  it('stop() ends a playing clip with a stopped result', async () => {
    const port = fakePort();
    const p = new FileNarrationProvider({
      catalogue: createCatalogue([clip()]),
      entitlements: FreeEntitlements,
      port,
    });
    const done = p.play('briefing.oshodi');
    p.stop();
    expect(await done).toEqual({ status: 'stopped' });
    expect(port.stops).toBeGreaterThan(0);
  });

  it('the browser element port resolves ended / failed / stopped and never throws', async () => {
    const listeners = new Map<string, () => void>();
    const el = {
      volume: 1,
      play: vi.fn(() => Promise.resolve()),
      pause: vi.fn(),
      addEventListener: (n: string, f: () => void) => listeners.set(n, f),
      removeEventListener: (n: string) => listeners.delete(n),
    };
    const port = createElementClipPort(
      () => el as never,
      () => 0.5,
    );
    const done = port.play('/a.mp3');
    expect(el.volume).toBe(0.5);
    listeners.get('ended')!();
    expect(await done).toBe('ended');
    const bad = createElementClipPort(
      () => ({ ...el, play: () => Promise.reject(new Error('NotAllowed')) }) as never,
      () => 1,
    );
    expect(await bad.play('/b.mp3')).toBe('failed');
    const broken = createElementClipPort(() => {
      throw new Error('no Audio');
    });
    expect(await broken.play('/c.mp3')).toBe('failed');
    const second = port.play('/d.mp3');
    port.stop();
    expect(await second).toBe('stopped');
    expect(() => port.stop()).not.toThrow();
  });
});

describe('entitlement gating', () => {
  it('the free tier plays free clips; premium clips are locked until an entitlement says otherwise', async () => {
    expect(FreeEntitlements.has('fullNarration')).toBe(false);
    expect(FreeEntitlements.has('extendedLore')).toBe(false);
    expect(FreeEntitlements.has('altPerformance')).toBe(false);
    expect(clipAllowed({ tier: 'free' }, FreeEntitlements)).toBe(true);
    expect(clipAllowed({ tier: 'premium' }, FreeEntitlements)).toBe(false);
    const port = fakePort();
    const catalogue = createCatalogue([clip({ tier: 'premium' })]);
    const locked = new FileNarrationProvider({ catalogue, entitlements: FreeEntitlements, port });
    expect(locked.available('briefing.oshodi')).toBe(false);
    expect(await locked.play('briefing.oshodi')).toEqual({ status: 'locked' });
    expect(port.played).toEqual([]);
    const paid = new FileNarrationProvider({
      catalogue,
      entitlements: { has: (e) => e === 'fullNarration' },
      port,
    });
    expect(paid.available('briefing.oshodi')).toBe(true);
  });

  it('the core mission meaning is free: the card text never depends on an entitlement', () => {
    // entitlements only decide recordings; the summary, the objective and Read more are plain card data
    const card = cardsFrom()[0]!;
    expect(card.summary.length).toBeGreaterThan(0);
    expect(card.objective.length).toBeGreaterThan(0);
  });

  it('clip urls honour the Vite base', () => {
    expect(clipUrl({ id: 'a b' }, '/wahala-game')).toBe('/wahala-game/audio/narration/a%20b.mp3');
    expect(clipUrl({ id: 'x' })).toBe('/audio/narration/x.mp3');
  });
});

describe('the Listen button', () => {
  it('is disabled with "Narration not recorded yet" when no clip exists, and can be hidden by the setting', () => {
    const v = listenView({ show: true, available: false, playing: false, last: null });
    expect(v).toMatchObject({ visible: true, disabled: true, label: 'Listen', note: NOT_RECORDED });
    expect(NOT_RECORDED).toBe('Narration not recorded yet');
    expect(listenView({ show: false, available: false, playing: false, last: null }).visible).toBe(false);
  });

  it('is enabled when a clip exists, says Stop while playing and explains a failure without hiding the text', () => {
    expect(listenView({ show: true, available: true, playing: false, last: null })).toMatchObject({
      disabled: false,
      label: 'Listen',
      note: null,
    });
    expect(listenView({ show: true, available: true, playing: true, last: null })).toMatchObject({
      label: 'Stop',
      playing: true,
    });
    expect(
      listenView({ show: true, available: true, playing: false, last: { status: 'failed', reason: 'x' } })
        .note,
    ).toMatch(/text is all here/);
  });

  it('pressing it with no clip never errors and plays nothing', async () => {
    const provider = new NullNarrationProvider();
    const play = vi.spyOn(provider, 'play');
    const control = createListenControl(provider, 'briefing.oshodi');
    await expect(control.press()).resolves.toBeUndefined();
    expect(play).not.toHaveBeenCalled();
    expect(control.state()).toEqual({ playing: false, last: { status: 'unavailable', reason: 'no-clip' } });
  });

  it('a provider that throws or rejects becomes a failed result, the control stays usable', async () => {
    const angry: NarrationProvider = {
      available: () => true,
      play: () => {
        throw new Error('exploded');
      },
      stop: () => {
        throw new Error('exploded');
      },
    };
    expect(await safePlay(angry, 'x')).toEqual({ status: 'failed', reason: 'exploded' });
    const control = createListenControl(angry, 'x');
    await control.press();
    expect(control.state().last).toMatchObject({ status: 'failed' });
    expect(() => control.stop()).not.toThrow();
    await control.press(); // pressing again is fine
  });

  it('toggles play and stop and tells subscribers', async () => {
    const port = fakePort();
    const provider = new FileNarrationProvider({
      catalogue: createCatalogue([clip()]),
      entitlements: FreeEntitlements,
      port,
    });
    const control = createListenControl(provider, 'briefing.oshodi');
    const seen: boolean[] = [];
    control.subscribe(() => seen.push(control.state().playing));
    const first = control.press();
    expect(control.state().playing).toBe(true);
    await control.press(); // second press = Stop
    await first;
    expect(control.state()).toEqual({ playing: false, last: { status: 'stopped' } });
    expect(seen[0]).toBe(true);
    expect(seen[seen.length - 1]).toBe(false);
  });
});

describe('Skip / Continue while narration is playing', () => {
  it('ends the scene at once, exactly once, and stops the narration first', async () => {
    const port = fakePort();
    const provider = new FileNarrationProvider({
      catalogue: createCatalogue([clip()]),
      entitlements: FreeEntitlements,
      port,
    });
    const listen = createListenControl(provider, 'briefing.oshodi');
    const playing = listen.press(); // a clip that never ends on its own
    expect(listen.state().playing).toBe(true);
    const order: string[] = [];
    const scene = createSceneControl({
      stopNarration: () => {
        order.push('stop');
        provider.stop();
      },
      onDone: () => order.push('done'),
    });
    expect(scene.finish()).toBe(true);
    expect(scene.finish()).toBe(false);
    expect(order).toEqual(['stop', 'done']);
    await playing;
    expect(port.stops).toBeGreaterThan(0);
  });

  it('still ends the scene when stopping the narration throws', () => {
    const onDone = vi.fn();
    const scene = createSceneControl({
      stopNarration: () => {
        throw new Error('audio gone');
      },
      onDone,
    });
    expect(scene.finish()).toBe(true);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
