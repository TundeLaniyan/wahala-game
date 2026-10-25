import { describe, expect, it } from 'vitest';
import { MatchController } from '../src/app/MatchController';
import type { AudioPort, Bot, InputPort, RendererPort } from '../src/app/ports';
import { NULL_AUDIO } from '../src/app/ports';
import { DEFAULT_GAME_SETTINGS } from '../src/app/settings';
import type { GameSettings } from '../src/app/settings';
import { useGameStore } from '../src/app/store';
import { buildHud, FEED_MAX } from '../src/app/hud';
import { cycleSpectateTarget, killCounts, pickSpectateTarget } from '../src/app/spectate';
import { CITY_RUMBLE_ID, Tile, getArena } from '../src/sim';
import type { GameState, Intent, SimEvent } from '../src/sim';
import type { FrameInfo } from '../src/render';
import { minimapGeometry, minimapLayers, tileToMinimap, NEAR_TILES } from '../src/ui/minimapModel';
import { addGenerator, put, sandbox } from './helpers';

class FakeInput implements InputPort {
  navMode = false;
  pollDevices(): void {}
  buildIntent(): Intent {
    return {};
  }
  takeVehiclePress(): boolean {
    return false;
  }
  clear(): void {}
}

class FakeRenderer implements RendererPort {
  infos: FrameInfo[] = [];
  loadGame(): void {}
  handleEvents(): void {}
  render(_s: GameState, _a: number, _dt: number, info: FrameInfo): void {
    this.infos.push(info);
  }
  pickEntry(): null {
    return null;
  }
  setQuality(): void {}
}

class FakeAudio implements AudioPort {
  heard: SimEvent[] = [];
  listener: number | null = -1;
  unlock = NULL_AUDIO.unlock;
  setVolumes = NULL_AUDIO.setVolumes;
  setMuted = NULL_AUDIO.setMuted;
  startMusic = NULL_AUDIO.startMusic;
  stopMusic = NULL_AUDIO.stopMusic;
  setIntensity = NULL_AUDIO.setIntensity;
  playUi = NULL_AUDIO.playUi;
  handleEvents(events: readonly SimEvent[]): void {
    this.heard.push(...events);
  }
  setListener(x: number | null): void {
    this.listener = x;
  }
}

const idleBot: Bot = { decide: () => ({}) };

const rumbleSettings = (n: GameSettings['rumbleCompetitors']): GameSettings => ({
  ...DEFAULT_GAME_SETTINGS,
  arenaId: CITY_RUMBLE_ID,
  rumbleCompetitors: n,
});

function startRumble(n: GameSettings['rumbleCompetitors'] = 16) {
  const renderer = new FakeRenderer();
  const audio = new FakeAudio();
  const controller = new MatchController({
    renderer,
    input: new FakeInput(),
    botFactory: () => idleBot,
    audio,
  });
  controller.start(rumbleSettings(n), 3);
  const s = controller.state!;
  s.match.phase = 'playing';
  s.match.countdownRemaining = 0;
  return { controller, renderer, audio, s };
}

/** Knocks player `id` out as if `by` had blasted it on this tick. */
function eliminate(s: GameState, id: number, by: number | null): void {
  const p = s.players[id]!;
  p.alive = false;
  p.eliminatedTick = s.tick;
  p.elimination = by === null ? { kind: 'crush', eventId: 1 } : { kind: 'flame', ownerId: by, eventId: 1 };
  // the credit the simulation would record (attribution.ts)
  p.eliminatedBy = by;
  p.stats.deaths++;
  if (by !== null) s.players[by]!.stats.kills++;
}

describe('spectator target (City Rumble)', () => {
  it('follows the killer first, then the nearest survivor; cycling skips the fallen and wraps', () => {
    const s = sandbox({ players: 6, arenaId: CITY_RUMBLE_ID });
    put(s, 0, 10, 10);
    put(s, 1, 30, 25);
    put(s, 2, 11, 12);
    put(s, 3, 3, 3);
    put(s, 4, 40, 0);
    put(s, 5, 12, 10);
    eliminate(s, 0, 4);
    expect(pickSpectateTarget(s, 0, null)).toBe(4); // the one who knocked me out
    eliminate(s, 4, null);
    // the watched player fell to the city: nearest survivor to where it stood (40, 0) is 1 (30, 25)? no: 5 is far too
    expect(pickSpectateTarget(s, 0, 4)).toBe(1);
    expect(pickSpectateTarget(s, 0, 1)).toBe(1); // stays while alive
    expect(cycleSpectateTarget(s, 1, 1)).toBe(2);
    expect(cycleSpectateTarget(s, 3, 1)).toBe(5); // 4 is out
    expect(cycleSpectateTarget(s, 5, 1)).toBe(1); // wraps past the fallen 0
    expect(cycleSpectateTarget(s, 1, -1)).toBe(5);
    eliminate(s, 2, 5);
    expect(killCounts(s)[5]).toBe(1);
    // nearest to the local player's death spot with no killer alive: 5 at (12, 10)
    const t = sandbox({ players: 4, arenaId: CITY_RUMBLE_ID });
    put(t, 0, 10, 10);
    put(t, 1, 30, 25);
    put(t, 2, 12, 10);
    put(t, 3, 11, 13);
    eliminate(t, 0, null);
    expect(pickSpectateTarget(t, 0, null)).toBe(2);
    for (const id of [1, 2, 3]) eliminate(t, id, null);
    expect(pickSpectateTarget(t, 0, 2)).toBeNull();
  });
});

describe('City Rumble match flow in the controller', () => {
  it('builds a rumble HUD (standard matches keep theirs), follows a survivor once out, cycles and skips', () => {
    const { controller, renderer, s } = startRumble(16);
    controller.frame(0);
    let hud = useGameStore.getState().hud!;
    expect(hud.rumble).not.toBeNull();
    expect(hud.rumble!.total).toBe(16);
    expect(hud.rumble!.alive).toBe(16);
    expect(hud.rumble!.roster).toHaveLength(16);
    expect(hud.rumble!.spectating).toBeNull();
    expect(renderer.infos.at(-1)!.focusPlayerId).toBeNull();

    eliminate(s, 0, 7);
    controller.frame(20);
    hud = useGameStore.getState().hud!;
    expect(controller.spectating).toBe(7);
    expect(hud.rumble!.spectating!.id).toBe(7);
    expect(hud.rumble!.feed[0]!.killer).toBe(s.players[7]!.name);
    expect(hud.rumble!.feed[0]!.involvesLocal).toBe(true);
    expect(hud.rumble!.local!.placement).toBe(16);
    expect(renderer.infos.at(-1)!.focusPlayerId).toBe(7);

    controller.cycleSpectate(1);
    expect(controller.spectating).toBe(8);
    controller.cycleSpectate(-1);
    controller.cycleSpectate(-1);
    expect(controller.spectating).toBe(6);

    // skipping is sliced over frames (the page keeps drawing), then the results appear
    controller.skipToResults();
    expect(controller.isSkipping).toBe(true);
    expect(useGameStore.getState().skipping).toBe(true);
    let t = 40;
    for (let i = 0; i < 2000 && useGameStore.getState().screen !== 'results'; i++)
      controller.frame((t += 16));
    expect(s.match.phase).toBe('ended');
    expect(useGameStore.getState().screen).toBe('results');
    expect(useGameStore.getState().skipping).toBe(false);
    // idle bots never fight, so the city closing in decides it (or the clock): a result, not a hang
    expect(s.match.result).not.toBeNull();
  });

  it('a standard match keeps the four-portrait HUD and the instant skip', () => {
    const controller = new MatchController({
      renderer: new FakeRenderer(),
      input: new FakeInput(),
      botFactory: () => idleBot,
    });
    controller.start({ ...DEFAULT_GAME_SETTINGS, play: 'classic', competitors: 2 }, 9);
    expect(useGameStore.getState().hud!.rumble).toBeNull();
    controller.skipToResults();
    expect(controller.state!.match.phase).toBe('ended');
    expect(useGameStore.getState().screen).toBe('results');
  });

  it('hears only what happens around the camera focus, and pans relative to it', () => {
    const { controller, audio, s } = startRumble(8);
    const me = s.players[0]!;
    put(s, 0, 5, 5);
    controller.frame(0);
    expect(audio.listener).toBe(5);
    audio.heard.length = 0;
    // events reach the controller through the simulation; feed a far and a near blast directly
    const far: SimEvent = { type: 'generatorPlaced', generatorId: 1, ownerId: 3, x: 38, y: 28 };
    const near: SimEvent = { type: 'generatorPlaced', generatorId: 2, ownerId: 3, x: me.x + 2, y: me.y };
    (controller as unknown as { afterFrame(e: SimEvent[], n: number, dt: number): void }).afterFrame(
      [far, near],
      30,
      1 / 60,
    );
    expect(audio.heard).toEqual([near]);
  });
});

describe('rumble HUD snapshot', () => {
  it('counts survivors, keeps a short newest-first feed, ranks the fallen and finds who is near', () => {
    const s = sandbox({ players: 12, arenaId: CITY_RUMBLE_ID });
    for (let i = 0; i < 6; i++) {
      s.tick = 100 + i * 10;
      eliminate(s, 6 + i, i === 5 ? null : 1);
    }
    put(s, 0, 10, 10);
    put(s, 2, 11, 10);
    put(s, 3, 13, 12);
    const r = buildHud(s, 0, null).rumble!;
    expect(r.alive).toBe(6);
    expect(r.feed.length).toBeLessThanOrEqual(FEED_MAX);
    expect(r.feed[0]!.victim).toBe('P11'); // newest first
    expect(r.feed[0]!.killer).toBeNull(); // the city got that one
    expect(r.feed[0]!.cause).toBe('crush');
    expect(r.feed[1]!.killer).toBe('P1');
    expect(r.leaders[0]!.id).toBe(1);
    expect(r.leaders[0]!.kills).toBe(5);
    const place = Object.fromEntries(r.roster.map((e) => [e.id, e.placement]));
    expect(place[11]).toBe(7); // last to fall: 6 still standing
    expect(place[6]).toBe(12);
    expect(r.roster.slice(0, 6).every((e) => e.alive)).toBe(true);
    expect(r.nearby[0]!.id).toBe(2);
    expect(r.nearby[0]!.dist).toBe(1);
    expect(r.nearby[1]!.id).toBe(3);
    expect(r.ring!.phase).toBe('open');
  });
});

describe('minimap projection', () => {
  it('fits the 41 x 31 city into the box with whole-pixel cells and maps tile centres', () => {
    const phone = minimapGeometry(41, 31, 130, 96);
    expect(phone.cell).toBe(3);
    expect(phone.width).toBe(123);
    expect(phone.height).toBe(93);
    const desk = minimapGeometry(41, 31, 230, 170);
    expect(desk.cell).toBe(5);
    expect(tileToMinimap(desk, 0, 0)).toEqual({ x: 2.5, y: 2.5 });
    expect(tileToMinimap(desk, 40, 30)).toEqual({ x: 202.5, y: 152.5 });
    expect(minimapGeometry(41, 31, 20, 20).cell).toBe(2); // never below 2 px
  });

  it('shows the board, the closing city, nearby generators and everybody standing, never pickups', () => {
    const s = sandbox({ players: 6, arenaId: CITY_RUMBLE_ID, keepSoft: true });
    const layout = getArena(CITY_RUMBLE_ID).layout;
    put(s, 0, 4, 4);
    put(s, 3, 6, 4);
    eliminate(s, 5, 0);
    addGenerator(s, { ownerId: 3, x: 6, y: 5 });
    addGenerator(s, { ownerId: 1, x: 4 + NEAR_TILES + 3, y: 4 });
    s.pickups.push({ id: 99, x: 5, y: 4, kind: 'okada', safeEventId: null });
    // a tile the city has closed
    const closed = s.crush!.order[0]!;
    s.tiles[closed] = Tile.Hard;
    const a = minimapLayers(s, layout, 0, 0);
    expect(a.players.map((p) => p.id)).not.toContain(5);
    expect(a.players.at(-1)!.kind).toBe('local'); // drawn on top
    expect(a.generators).toEqual([{ x: 6, y: 5 }]);
    expect(a.crushed).toContain(closed);
    expect(a.crushed.every((i) => layout[Math.floor(i / s.width)]![i % s.width] !== '#')).toBe(true);
    expect(JSON.stringify(a)).not.toContain('okada');
    // hidden pickups change nothing on the map
    const before = JSON.stringify(minimapLayers(s, layout, 0, 0));
    s.hidden = Object.fromEntries(Object.keys(s.hidden).map((k) => [k, 'remote' as const]));
    expect(JSON.stringify(minimapLayers(s, layout, 0, 0))).toBe(before);
    // spectating: the watched survivor is the focus
    const b = minimapLayers(s, layout, 0, 3);
    expect(b.players.find((p) => p.id === 3)!.kind).toBe('focus');
  });

  it('marks the next stretch of the ring and the core once the closing is near', () => {
    const s = sandbox({ players: 2, arenaId: CITY_RUMBLE_ID });
    const layout = getArena(CITY_RUMBLE_ID).layout;
    expect(minimapLayers(s, layout, 0, 0).core).toBeNull();
    s.match.playTicks = s.crush!.warnAt[0]!;
    const m = minimapLayers(s, layout, 0, 0);
    expect(m.core).toEqual({ x0: 15, y0: 11, w: 11, h: 9 });
    expect(m.closingSoon.length).toBeGreaterThan(5);
    expect(m.closingSoon).toContain(s.crush!.order[0]!);
  });
});
