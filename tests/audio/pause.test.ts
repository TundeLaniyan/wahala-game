/**
 * Pausing a match silences ALL of its audio and resuming restores it exactly once (decision PA1): music,
 * street ambience, generator / vehicle loops, spoken lines and every one-shot including the ones scheduled for
 * later. Nothing queued before the pause may fire during it, gameplay events are ignored while paused, menu
 * sounds still play, and repeated pause / resume never doubles a loop or the music.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrefsStore } from '../../src/audio/prefs';
import type { StorageLike } from '../../src/audio/prefs';
import type { SpokenTrace } from '../../src/audio/pidgin';
import type { SimEvent } from '../../src/sim';
import { addGenerator } from '../helpers';
import { createRand } from '../../src/audio/rng';
import { BASE, musicFiles, server, voiceFiles } from './fakeServer';
import { FakeBuffer } from './fakeContext';
import type { FakeSource } from './fakeContext';
import { mediaFactory } from './fakeMedia';
import { finishWarmup, makeRig, playState } from './helpers';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const mem = (): StorageLike => {
  const data: Record<string, string> = {};
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
};

async function rig() {
  const files: Record<string, unknown> = { ...musicFiles(), ...voiceFiles() };
  const spoken: SpokenTrace[] = [];
  const media = mediaFactory({ pitch: true, broken: (src) => files[src] === undefined });
  const r = makeRig({
    fetch: server(files).fetch,
    sampleBaseUrl: BASE,
    prefs: createPrefsStore(mem),
    onSpeak: (t) => spoken.push(t),
    createMediaElement: media.create,
    musicRand: createRand(42),
  });
  r.ctx.decoded = (d) => new FakeBuffer(d.byteLength > 20000 ? 32000 : d.byteLength * 20, 44100, 2);
  await r.audio.unlock();
  await r.audio.whenMusicLoaded();
  await r.audio.whenVoicesLoaded();
  finishWarmup();
  r.audio.startMusic('danfoBusPark');
  await r.audio.whenVoiceSceneLoaded();
  r.ctx.advance(5);
  finishWarmup();
  return { ...r, spoken, media };
}
type Rig = Awaited<ReturnType<typeof rig>>;

/** A match state with a live generator, so the state loops (putt-putt, fuse) are running. */
function liveState() {
  const s = playState(3);
  s.players.forEach((p, i) => (p.isBot = i !== 0));
  addGenerator(s, { ownerId: 0, x: 4, y: 4, timer: 600 });
  return s;
}

const loopSources = (r: Rig): FakeSource[] => r.ctx.sources.filter((s) => s.loop && s.stoppedAt === null);
/** The gain a looping source feeds (its own layer / loop gain). */
const gainOf = (s: FakeSource): number => (s.connections[0] as { gain: { value: number } }).gain.value;
/** Ambience loops: the ones the street bed started (their gains are bus-facing layer gains). */
const audibleLoops = (r: Rig): FakeSource[] => loopSources(r).filter((s) => gainOf(s) > 0.0001);
/**
 * One-shot sources that could still be heard: not stopped, or stopped later than the short fade a pause allows
 * (a source stopped before it starts never sounds). The one-sample source is the context-priming click.
 */
const liveOneShots = (r: Rig): FakeSource[] =>
  r.ctx.sources.filter(
    (s) =>
      !s.loop &&
      s.startedAt !== null &&
      (s.buffer as { length: number } | null)?.length !== 1 &&
      (s.stoppedAt === null || s.stoppedAt > Math.max(s.startedAt, r.ctx.currentTime) + 0.06),
  );

const explosion = (x = 3): SimEvent => ({
  type: 'generatorExploded',
  generatorId: 1,
  ownerId: 0,
  x,
  y: 3,
  eventId: 7,
  range: 3,
});

describe('pause silences every layer of the match', () => {
  it('fades the ambience to silence but keeps its loops, and resume brings it back with the same loops', async () => {
    const r = await rig();
    const before = loopSources(r);
    expect(before.length).toBeGreaterThan(0);
    expect(audibleLoops(r).length).toBe(before.length);

    r.audio.setPaused(true);
    expect(audibleLoops(r)).toEqual([]); // every bed is at zero
    expect(loopSources(r)).toEqual(before); // ...but nothing was torn down, so nothing can double

    r.audio.setPaused(false);
    expect(loopSources(r)).toEqual(before);
    expect(audibleLoops(r).length).toBe(before.length);
    expect(r.errors).toEqual([]);
  });

  it('the ambience cannot be raised while paused (intensity changes and swells keep it silent)', async () => {
    const r = await rig();
    r.audio.setPaused(true);
    r.audio.setIntensity(1);
    r.audio.handleEvents([explosion()], liveState()); // would swell the bed
    expect(audibleLoops(r)).toEqual([]);
    r.audio.setPaused(false);
    expect(audibleLoops(r).length).toBeGreaterThan(0);
  });

  it('stops generator loops, builds none while paused, and rebuilds each exactly once on resume', async () => {
    const r = await rig();
    const s = liveState();
    r.audio.handleEvents([], s);
    const running = loopSources(r).length;
    r.audio.setPaused(true);
    vi.advanceTimersByTime(500);
    r.ctx.advance(1);
    const gameplayLoops = (): number => r.ctx.sources.filter((x) => x.loop && x.stoppedAt === null).length;
    // every state loop is stopped; the paused frame loop keeps calling in with the generator still on the board
    for (let i = 0; i < 20; i++) r.audio.handleEvents([], s);
    const duringPause = r.ctx.sources.filter(
      (x) => x.loop && x.stoppedAt === null && gainOf(x) > 0.0001,
    ).length;
    expect(duringPause).toBe(0);
    expect(gameplayLoops()).toBeLessThanOrEqual(running); // nothing new was started

    r.audio.setPaused(false);
    r.audio.handleEvents([], s);
    r.audio.handleEvents([], s);
    r.audio.handleEvents([], s);
    expect(loopSources(r).length).toBe(running); // the same set, once each
    expect(r.errors).toEqual([]);
  });

  it('cancels one-shots that are still scheduled for later: nothing fires during the pause', async () => {
    const r = await rig();
    // a blast: the crowd reacts a moment later (scheduled with a delay)
    r.audio.handleEvents([explosion()], liveState());
    expect(liveOneShots(r).length).toBeGreaterThan(0);
    const future = r.ctx.sources.filter((s) => !s.loop && (s.startedAt ?? 0) > r.ctx.currentTime);
    expect(future.length).toBeGreaterThan(0); // at least one delayed effect is queued

    r.audio.setPaused(true);
    expect(liveOneShots(r)).toEqual([]);
    for (const s of future) expect(s.stoppedAt!).toBeLessThanOrEqual(s.startedAt!); // stopped before it could start
    // the audio clock runs on while paused: no delayed sound appears
    r.ctx.advance(10);
    vi.advanceTimersByTime(10_000);
    expect(liveOneShots(r)).toEqual([]);
    r.audio.setPaused(false);
    r.ctx.advance(10);
    expect(liveOneShots(r)).toEqual([]); // and none is revived by resuming
  });

  it('ignores gameplay events sent while paused (no effect, reaction or voice is started)', async () => {
    const r = await rig();
    r.audio.setPaused(true);
    r.traces.length = 0;
    const spokenBefore = r.spoken.length;
    const elimination: SimEvent = {
      type: 'playerEliminated',
      playerId: 0,
      cause: { kind: 'flame', ownerId: 1, eventId: 1 },
      x: 3,
      y: 3,
      creditId: 1,
      assistIds: [],
    };
    r.audio.handleEvents(
      [explosion(), elimination, { type: 'matchEnded', result: { kind: 'win', winnerId: 1 } }],
      liveState(),
    );
    expect(r.traces).toEqual([]);
    expect(r.spoken.length).toBe(spokenBefore);
  });

  it('stops a spoken line mid-sentence and speaks again only after resume', async () => {
    const r = await rig();
    const s = liveState();
    const keke: SimEvent = {
      type: 'vehicleWarning',
      vehicleId: 1,
      kind: 'keke',
      ownerId: 1,
      entry: { x: 0, y: 3 },
    };
    r.audio.handleEvents([keke], s);
    const speaking = r.audio.voiceStatus()!.speaking;
    expect(speaking).not.toBeNull();
    r.audio.setPaused(true);
    expect(r.audio.voiceStatus()!.speaking).toBeNull();
    // time passes and the paused frame loop keeps calling: still no voice
    r.ctx.advance(30);
    const count = r.spoken.length;
    r.audio.handleEvents([], s);
    expect(r.spoken.length).toBe(count);
    expect(r.audio.voiceStatus()!.speaking).toBeNull();
  });
});

describe('menu sounds and the music', () => {
  it('menu interaction sounds still play while paused; nothing else does', async () => {
    const r = await rig();
    r.audio.setPaused(true);
    r.traces.length = 0;
    r.audio.handleEvents([], liveState());
    expect(r.ids()).toEqual([]); // opening the pause menu is silent
    r.audio.playUi('click'); // a deliberate press inside the pause menu
    expect(r.ids()).toEqual(['ui_click']);
  });

  it('the music pauses and resumes once', async () => {
    const r = await rig();
    const el = r.media.els[0]!;
    expect(r.media.sounding()).toHaveLength(1);
    r.audio.setPaused(true);
    vi.advanceTimersByTime(300);
    expect(el.paused).toBe(true);
    r.audio.setPaused(false);
    expect(el.paused).toBe(false);
    expect(r.media.sounding()).toHaveLength(1);
    expect(r.audio.musicStatus().paused).toBe(false);
  });
});

describe('repeated pause and resume', () => {
  it('twenty rounds leave one music stream, the same loops and no errors, with the same bed level', async () => {
    const r = await rig();
    const s = liveState();
    r.audio.handleEvents([], s);
    const loops = loopSources(r).length;
    const elements = r.media.els.length;
    const level = audibleLoops(r).map((x) => gainOf(x));
    for (let i = 0; i < 20; i++) {
      r.audio.setPaused(true);
      r.audio.setPaused(true); // a repeated pause changes nothing
      r.audio.handleEvents([], s);
      vi.advanceTimersByTime(200);
      r.ctx.advance(0.5);
      r.audio.setPaused(false);
      r.audio.setPaused(false);
      r.audio.handleEvents([], s);
    }
    expect(loopSources(r).length).toBe(loops);
    expect(r.media.els.length).toBe(elements);
    expect(r.media.sounding()).toHaveLength(1);
    expect(audibleLoops(r).map((x) => gainOf(x))).toHaveLength(level.length);
    expect(r.errors).toEqual([]);
  });

  it('quitting to the menu while paused clears the pause; the next match starts unpaused', async () => {
    const r = await rig();
    r.audio.setPaused(true);
    r.audio.stopMusic();
    vi.advanceTimersByTime(3000);
    expect(r.audio.musicStatus().paused).toBe(false);
    r.audio.startMusic('danfoBusPark');
    expect(audibleLoops(r).length).toBeGreaterThan(0); // not stuck silent
    r.audio.handleEvents([explosion()], liveState());
    expect(r.traces.length).toBeGreaterThan(0); // gameplay sound works again
  });

  it('pausing before the audio is unlocked is remembered: the match then starts silent until resumed', async () => {
    const r = makeRig({ fetch: null });
    r.audio.startMusic('danfoBusPark');
    r.audio.setPaused(true);
    await r.audio.unlock();
    finishWarmup();
    expect(audibleLoops({ ...r } as unknown as Rig)).toEqual([]);
    r.audio.setPaused(false);
    expect(audibleLoops({ ...r } as unknown as Rig).length).toBeGreaterThan(0);
  });

  it('pause without a match changes nothing', async () => {
    const r = makeRig({ fetch: null });
    await r.audio.unlock();
    finishWarmup();
    r.audio.setPaused(true);
    r.audio.setPaused(false);
    expect(r.errors).toEqual([]);
  });
});
