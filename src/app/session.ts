/**
 * Composition root: the only place that knows every layer. It creates the renderer, input,
 * audio, bots and match controller, runs the animation loop, and exposes `commands` to the UI.
 */
import { createBot } from '../ai';
import { createAudio } from '../audio';
import type { SpokenTrace } from '../audio';
import { InputManager, inputTrace } from '../input';
import { GameRenderer, assets, isQualitySetting, renderCastPortraits, resolveShakeMode } from '../render';
import type { QualityEvent } from '../render';
import { registerBusts } from '../assets/portraits';
import { browserStore } from '../campaign';
import { flags } from '../platform';
import type {
  CampaignLevel,
  CharacterId,
  CombatLabLevel,
  Difficulty,
  GameState,
  MissionModifierId,
  SimEvent,
} from '../sim';
import { enterImmersiveMode } from './fullscreen';
import { AttractController } from './AttractController';
import { CampaignController } from './campaign';
import { MatchController } from './MatchController';
import type { MatchVariant } from './names';
import { TutorialController } from './TutorialController';
import { advance, back, editScreen, menuAt, openScreen } from './menu';
import type { MenuScreen, MenuState } from './menu';
import { routeMenuNav } from './menuNav';
import { NULL_AUDIO } from './ports';
import type { AudioPort, MissionHost } from './ports';
import { sanitizeSettings, saveSettings } from './settings';
import type { GameSettings } from './settings';
import { QualityNotifier } from './qualityNotice';
import { patch, useGameStore } from './store';
import type { ScreenPoint } from './store';
import { createSubtitleFeed } from './subtitles';
import { MatchLoader } from './matchLoader';
import type { MatchLoadKind } from './matchLoader';

let controller: MatchController | null = null;
let attract: AttractController | null = null;
let tutorial: TutorialController | null = null;
/** One-player campaign (null when the `campaign` flag is off). */
let campaign: CampaignController | null = null;
let renderer: GameRenderer | null = null;
let audio: AudioPort = NULL_AUDIO;
let raf = 0;
let canvasEl: HTMLCanvasElement | null = null;
let resizeObserver: ResizeObserver | null = null;
/** Rate-limits the quiet "graphics changed" notice (Auto mode). */
const qualityNotifier = new QualityNotifier();

// ---------------------------------------------------------------------------------------- match loading (ML1-ML8)
/** The boot model preload while it runs (null once it is done). */
let assetsLoading: Promise<unknown> | null = null;
/** Frames the renderer has drawn of a match (counted in `frame`), and who waits for a number of them. */
let framesDrawn = 0;
let frameWaiters: { target: number; resolve: () => void }[] = [];
/** Debug (`?debug&loadfail=n`): the next n starts throw, to see the failure screen; `loaddelay=ms` slows the start. */
let debugLoadFailures = 0;
let matchStarts = 0;

/** Resolves once the browser has painted: two animation frames, or a timer when frames are throttled. */
function afterPaint(): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      resolve();
    };
    requestAnimationFrame(() => requestAnimationFrame(finish));
    setTimeout(finish, 250);
  });
}

const loader = new MatchLoader({
  publish: (matchLoad) => patch({ matchLoad }),
  afterPaint,
  assetsPending: () => assetsLoading,
  assetCounts: () => useGameStore.getState().loading,
  framesDrawn: (n) =>
    new Promise((resolve) => {
      frameWaiters.push({ target: framesDrawn + n, resolve });
    }),
  hold: (held) => controller?.setLoadHold(held),
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
});

/**
 * Starts a match through the loader: the tap is acknowledged at once, the heavy set-up runs after the loading screen
 * painted, and the screen goes once the first frames are drawn. A second start while one runs is ignored.
 */
function loadMatch(kind: MatchLoadKind, start: () => void, back: () => void): void {
  void loader.run(
    kind,
    () => {
      matchStarts++;
      if (debugLoadFailures > 0) {
        debugLoadFailures--;
        throw new Error('debug: the start was made to fail (?loadfail)');
      }
      start();
    },
    back,
  );
}

/** Auto moved the graphics quality: refresh what Settings shows and, in a match, say so once in a while. */
function onQualityChange(e: QualityEvent): void {
  if (renderer) patch({ quality: renderer.qualityStatus() });
  // the controller's own clock (seconds), so the rate limit is the same in tests that feed it virtual time
  const notice = qualityNotifier.handle(e.change, e.change.at * 1000);
  if (notice) controller?.notice(notice.text, notice.tone);
}

/** The voice line playing now, for the optional subtitles (the HUD shows it only when the setting is on). */
const subtitles = createSubtitleFeed({
  get: () => useGameStore.getState().subtitle,
  set: (subtitle) => patch({ subtitle }),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
});
/** Debug (`?debug`): the last voice lines the engine scheduled, newest last. */
const spokenLog: SpokenTrace[] = [];
const onSpeak = (t: SpokenTrace): void => {
  spokenLog.push(t);
  if (spokenLog.length > 64) spokenLog.shift();
  subtitles.push(t);
};

const input = new InputManager({
  // the menu showing (main menu, pause, results) gets menu input first; the match gets the rest
  onNav: (c) => {
    if (!routeMenuNav(c)) controller?.handleNav(c);
  },
  onDeviceChange: (device) => patch({ device }),
});

/**
 * Camera shake (decision WA6): the setting, resolved for this device. 'auto' is off on touch screens and
 * subtle with a mouse; prefers-reduced-motion always turns it off.
 */
function applyShake(s: GameSettings): void {
  const media = (q: string): boolean => window.matchMedia?.(q).matches ?? false;
  renderer?.setShake(
    resolveShakeMode(s.shake, {
      coarsePointer: media('(pointer: coarse)') || 'ontouchstart' in window,
      reducedMotion: media('(prefers-reduced-motion: reduce)'),
    }),
  );
}

function applyAudioSettings(s: GameSettings): void {
  // volumes live in the persistent audio preferences (src/audio/prefs.ts), which the engine follows itself
  audio.setMuted(s.muted);
}

function frame(now: number): void {
  raf = requestAnimationFrame(frame);
  if (!controller) return;
  if (useGameStore.getState().screen === 'title') {
    input.pollDevices(); // gamepad navigation of the main menu (the match polls it while one runs)
    attract?.frame(now);
  } else {
    controller.frame(now);
    if (useGameStore.getState().tutorial) tutorial?.frame();
    if (controller.state) {
      framesDrawn++;
      if (frameWaiters.length) {
        const ready = frameWaiters.filter((w) => framesDrawn >= w.target);
        frameWaiters = frameWaiters.filter((w) => framesDrawn < w.target);
        for (const w of ready) w.resolve();
      }
    }
  }
  if (now - lastBoardCheck > 250) {
    lastBoardCheck = now;
    publishBoard();
  }
  if (useGameStore.getState().showStats && renderer && Math.floor(now / 500) !== lastStatsTick) {
    lastStatsTick = Math.floor(now / 500);
    patch({ stats: renderer.stats(), timings: controller.timers.snapshot() });
  }
}
let lastStatsTick = 0;
let lastBoardCheck = -Infinity;

/** Publishes where the board is on screen (only when it moved by a pixel or more), for the HUD layout. */
function publishBoard(): void {
  const st = useGameStore.getState();
  // the renderer reports canvas pixels; the canvas is not always at the page origin (the Academy column
  // sits left of it), so shift them into page coordinates, which is what the HUD lays itself out in
  const at = canvasEl?.getBoundingClientRect();
  const ox = at?.left ?? 0;
  const oy = at?.top ?? 0;
  const corners: ScreenPoint[] | null =
    st.screen === 'playing' && renderer
      ? (renderer.boardScreenCorners()?.map((p) => ({ x: Math.round(p.x + ox), y: Math.round(p.y + oy) })) ??
        null)
      : null;
  const prev = st.board;
  const same =
    prev === corners ||
    (prev !== null &&
      corners !== null &&
      prev.length === corners.length &&
      prev.every((p, i) => p.x === corners[i]!.x && p.y === corners[i]!.y));
  if (!same) patch({ board: corners });
}
/** Camera view used inside How to Play (never saved). */
let tutorialView: 'action' | 'overview' = 'action';

function sizeCanvas(): void {
  if (!canvasEl || !renderer) return;
  const w = canvasEl.clientWidth;
  const h = canvasEl.clientHeight;
  renderer.resize(w, h);
  const portrait = h > w * 1.1;
  const touch = window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window;
  patch({ portrait: portrait && touch, touchCapable: touch });
  // Leave room for the HUD: phones in landscape have little vertical space.
  renderer.setInsets(h < 480 ? 0.13 : 0.1, h < 480 ? 0.03 : 0.05);
}

/** Attaches the game to a canvas and starts the render loop. Call once. */
export function mount(canvas: HTMLCanvasElement): () => void {
  canvasEl = canvas;
  const params = new URLSearchParams(location.search);
  const forced = params.get('q');
  if (isQualitySetting(forced)) patch({ settings: { ...useGameStore.getState().settings, quality: forced } });
  const settings = useGameStore.getState().settings;
  if (params.has('debug')) {
    debugLoadFailures = Math.max(0, Number(params.get('loadfail')) || 0);
    loader.setDebugDelay(Math.max(0, Number(params.get('loaddelay')) || 0));
  }
  const cameraOverride = params.get('cam') === 'stadium' ? 'stadium' : null;
  patch({ cameraOverride });
  try {
    renderer = new GameRenderer({
      canvas,
      quality: settings.quality,
      onQualityChange,
      cameraMode: cameraOverride,
      onContextLost: () =>
        patch({
          fatal:
            'The graphics context was lost (the device may be low on memory). Reload the page to continue.',
        }),
    });
  } catch (error) {
    patch({
      fatal: `WebGL could not start (${error instanceof Error ? error.message : 'unknown error'}). Try a different browser or enable hardware acceleration.`,
    });
    return () => undefined;
  }
  patch({ quality: renderer.qualityStatus() });
  try {
    audio = createAudio({ onSpeak });
  } catch {
    audio = NULL_AUDIO;
  }
  controller = new MatchController({
    renderer: renderer as never,
    input,
    botFactory: params.has('nobots') ? () => ({ decide: () => ({}) }) : createBot,
    audio,
  });
  applyAudioSettings(settings);
  applyShake(settings);
  input.setMoveAssist(settings.moveAssist);
  input.setMoveStyle(settings.moveStyle);
  renderer.setCameraView(settings.cameraView);
  attract = new AttractController(renderer as never, createBot);
  tutorial = new TutorialController(controller, {
    stopAttract: () => attract?.stop(),
    startAttract: () => {
      if (settingsAllowAttract()) attract?.start();
    },
    menuCharacter: () => useGameStore.getState().settings.character,
    storage: () => window.localStorage,
    // Academy narration: an approved voice clip, only with the narration setting on (never synthesised here)
    cue: (trigger) => {
      if (!useGameStore.getState().settings.narration) return;
      (audio as { previewVoice?: (t: string) => boolean }).previewVoice?.(trigger);
    },
  });
  if (flags().campaign) {
    campaign = new CampaignController({
      store: browserStore(),
      host: missionHost,
      now: () => Date.now(),
      seed: () => {
        const forced = Number(params.get('seed'));
        return Number.isFinite(forced) && forced > 0 ? forced : Math.floor(Math.random() * 2 ** 31);
      },
      startingFighter: () => useGameStore.getState().settings.character,
    });
    campaign.load();
  } else patch({ campaign: null });
  // The live demo behind the menu is skipped for tests (?nobots / ?noattract) and on the lowest quality.
  // Models load once; the live demo behind the menu starts when the rigged cast is ready.
  patch({ loading: { done: 0, total: 1 } });
  assetsLoading = assets
    .preload(undefined, (done, total) => patch({ loading: { done, total } }))
    .then(() => {
      assetsLoading = null;
      try {
        registerBusts(renderCastPortraits());
      } catch {
        /* portraits fall back to the drawn versions */
      }
      patch({ loading: null, portraitsVersion: useGameStore.getState().portraitsVersion + 1 });
      if (settingsAllowAttract() && useGameStore.getState().screen === 'title') attract?.start();
    });
  resizeObserver = new ResizeObserver(sizeCanvas);
  resizeObserver.observe(canvas);
  sizeCanvas();
  patch({ touchCapable: window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window });
  raf = requestAnimationFrame(frame);

  const onVisibility = (): void => {
    if (document.hidden && useGameStore.getState().screen === 'playing') controller?.setPaused(true);
  };
  // Stadium camera toggle (O): presentation only, so it lives outside the gameplay input mapping.
  // Standard matches always show the whole arena, so the key does nothing there.
  const onCameraKey = (e: KeyboardEvent): void => {
    if (e.code !== 'KeyO' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (useGameStore.getState().screen !== 'playing' || renderer?.cameraMode() !== 'stadium') return;
    // in the tutorial the view toggles for this lesson only; the saved preference is untouched
    if (useGameStore.getState().tutorial) {
      tutorialView = tutorialView === 'overview' ? 'action' : 'overview';
      renderer.setCameraView(tutorialView);
    } else commands.toggleCameraView();
  };
  window.addEventListener('keydown', onCameraKey);
  // City Rumble spectating: cycle the survivor the camera follows (presentation only).
  const onSpectateKey = (e: KeyboardEvent): void => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (useGameStore.getState().screen !== 'playing' || !useGameStore.getState().hud?.rumble?.spectating)
      return;
    const dir = SPECTATE_KEYS[e.code];
    if (dir) commands.spectate(dir);
  };
  window.addEventListener('keydown', onSpectateKey);
  const unlock = (): void => {
    void audio.unlock().then(() => patch({ audioReady: true }));
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
  exposeDebugHandle();

  return () => {
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('keydown', onCameraKey);
    window.removeEventListener('keydown', onSpectateKey);
    resizeObserver?.disconnect();
    renderer?.dispose();
    renderer = null;
    controller = null;
    tutorial = null;
    campaign = null;
  };
}

/**
 * The live bots-only demo behind the menu. The Stitch menu (decision UI1) covers the whole screen with
 * its own cinematic backdrop, so the demo would only spend battery behind it: it runs only on request
 * (`?attract`, e.g. for an idle-screen experiment).
 */
function settingsAllowAttract(): boolean {
  const params = new URLSearchParams(location.search);
  return (
    params.has('attract') &&
    !params.has('nobots') &&
    !params.has('noattract') &&
    useGameStore.getState().settings.quality !== 'low'
  );
}

/** What the campaign controller drives: the match controller, plus the same start-of-match chores as `start`. */
const missionHost: MissionHost = {
  startMission(options, meta): void {
    void audio.unlock();
    qualityNotifier.newMatch();
    if (useGameStore.getState().touchCapable) void enterImmersiveMode();
    audio.playUi('start');
    attract?.stop();
    subtitles.clear();
    loadMatch(
      'mission',
      () => controller?.startMission(options, meta),
      () => commands.campaignMap(),
    );
  },
  stop(): void {
    subtitles.clear();
    controller?.stop();
  },
  // classic raids (field door -> raid -> back to the field): the same start-of-match chores, then the controller
  playRaid(options, meta): void {
    void audio.unlock();
    qualityNotifier.newMatch();
    if (useGameStore.getState().touchCapable) void enterImmersiveMode();
    audio.playUi('start');
    attract?.stop();
    subtitles.clear();
    loadMatch(
      'raid',
      () => controller?.playRaid(options, meta),
      () => commands.campaignMap(),
    );
  },
  resumeField: (resolve) => controller?.resumeField(resolve) ?? false,
  current: () => controller?.state ?? null,
  notice: (text) => controller?.notice(text, 'info'),
};

/** Everything the UI can ask the game to do. */
export const commands = {
  /** `variant`: a temporary local test match (the Sudden Death test, decisions SD-T); omitted for every ordinary start. */
  start(variant?: MatchVariant): void {
    if (loader.busy) return; // a start is already on its way: a second tap starts nothing
    // a match must always be able to start: repair anything an old save could hold first
    const current = useGameStore.getState().settings;
    const safe = sanitizeSettings(current);
    if (JSON.stringify(safe) !== JSON.stringify(current)) commands.updateSettings(safe);
    void audio.unlock();
    qualityNotifier.newMatch();
    if (useGameStore.getState().touchCapable) void enterImmersiveMode();
    audio.playUi('start');
    attract?.stop();
    subtitles.clear();
    const seed = Number(new URLSearchParams(location.search).get('seed'));
    const settings = useGameStore.getState().settings;
    loadMatch(
      'match',
      () => controller?.start(settings, Number.isFinite(seed) && seed > 0 ? seed : undefined, variant),
      () => commands.toTitle(),
    );
  },
  /** The temporary Sudden Death test match: one human, three bots, straight into the sudden-death round. */
  startSuddenDeathTest(): void {
    commands.start('suddenDeathTest');
  },
  rematch(): void {
    if (loader.busy) return;
    void audio.unlock();
    audio.playUi('start');
    subtitles.clear();
    loadMatch(
      'rematch',
      () => controller?.rematch(),
      () => commands.toTitle(),
    );
  },
  /** The loading screen's Retry (after a failed start). */
  loadRetry(): void {
    audio.playUi('click');
    void loader.retry();
  },
  /** The loading screen's Back (after a failed start): to the menu, or to the campaign map. */
  loadBack(): void {
    audio.playUi('back');
    loader.back();
  },
  /** Leaves the match for the main menu, at `path` below home (default: the home screen). */
  toTitle(path: readonly MenuScreen[] = []): void {
    audio.playUi('back');
    subtitles.clear();
    patch({ menu: menuAt(path), pauseSettings: false });
    campaign?.leave();
    controller?.stop();
    loader.clear(); // never a loading screen left over the menu
    if (settingsAllowAttract()) attract?.start();
  },
  // ---- main-menu navigation (app/menu.ts); the screens edit the real settings through updateSettings
  menuOpen(screen: MenuScreen): void {
    audio.playUi('click');
    setMenu(openScreen(useGameStore.getState().menu, screen));
  },
  /** Ready's Edit buttons: change one choice, then come back to Ready. */
  menuEdit(screen: MenuScreen): void {
    audio.playUi('click');
    setMenu(editScreen(useGameStore.getState().menu, screen));
  },
  menuBack(): void {
    if (useGameStore.getState().menu.stack.length <= 1) return;
    audio.playUi('back');
    setMenu(back(useGameStore.getState().menu));
  },
  menuContinue(): void {
    audio.playUi('click');
    setMenu(advance(useGameStore.getState().menu));
  },
  menuHome(): void {
    audio.playUi('back');
    setMenu(menuAt([]));
  },
  // ---- one-player campaign (app/campaign.ts); every screen goes through these, nothing else writes the save
  campaignOpen(): void {
    audio.playUi('click');
    campaign?.open();
  },
  campaignNew(level?: CampaignLevel): void {
    audio.playUi('start');
    campaign?.startNew(level);
  },
  campaignLevel(level: CampaignLevel): void {
    audio.playUi('click');
    campaign?.setLevel(level);
  },
  campaignDelete(): void {
    audio.playUi('back');
    campaign?.deleteSave();
  },
  campaignContinue(): void {
    audio.playUi('click');
    campaign?.continue();
  },
  campaignStory(kind: 'prologue' | 'finale'): void {
    audio.playUi('click');
    campaign?.playStory(kind);
  },
  campaignStoryDone(): void {
    audio.playUi('click');
    campaign?.storyDone();
  },
  campaignSelect(id: Parameters<CampaignController['selectDistrict']>[0]): void {
    audio.playUi('click');
    campaign?.selectDistrict(id);
  },
  campaignBriefing(
    id?: Parameters<CampaignController['selectDistrict']>[0],
    modifier?: MissionModifierId,
  ): void {
    audio.playUi('click');
    campaign?.beginBriefing(id, modifier ?? null);
  },
  campaignModifier(modifier: MissionModifierId | null): void {
    audio.playUi('click');
    campaign?.setModifier(modifier);
  },
  campaignLoadout(loadout: { character?: CharacterId; difficulty?: Difficulty }): void {
    campaign?.setLoadout(loadout);
  },
  campaignStart(): void {
    campaign?.startFromBriefing();
  },
  campaignBossIntroDone(): void {
    campaign?.bossIntroDone();
  },
  campaignRetry(): void {
    campaign?.retry();
  },
  /** The map's section list: start a field mission or a standalone raid (the boss goes through its briefing). */
  campaignStartSection(missionId: string): void {
    audio.playUi('start');
    campaign?.startSectionMission(missionId);
  },
  /** Pause menu inside a raid. */
  campaignRetryRaid(): void {
    audio.playUi('click');
    campaign?.retryRaid();
  },
  campaignLeaveRaid(): void {
    audio.playUi('back');
    campaign?.leaveRaid();
  },
  campaignMap(): void {
    audio.playUi('back');
    campaign?.toMap();
  },
  campaignNext(): void {
    audio.playUi('click');
    campaign?.nextDistrict();
  },
  campaignDismissNotice(): void {
    campaign?.dismissNotice();
  },
  /** The pause menu's Settings panel (the match stays paused behind it). */
  pauseSettings(open: boolean): void {
    audio.playUi(open ? 'click' : 'back');
    patch({ pauseSettings: open });
  },
  togglePause: (): void => controller?.togglePause(),
  /** Combat test lab (pause menu of a local City Rumble): may this match use it? */
  combatLabAvailable: (): boolean => controller?.combatLabAvailable() ?? false,
  /** Combat test lab: switch the running match to level 1-4, or 0 = off, without restarting. */
  setCombatLab(level: CombatLabLevel | 0): void {
    if (!controller?.setCombatLab(level)) return;
    audio.playUi('click');
    patch({ combatLab: level });
  },
  resume: (): void => controller?.setPaused(false),
  skipToResults: (): void => controller?.skipToResults(),
  /** City Rumble spectator: watch the next (1) or previous (-1) survivor. */
  spectate: (dir: 1 | -1): void => controller?.cycleSpectate(dir),
  entryConfirm: (): void => controller?.confirmEntry(),
  entryCancel: (): void => controller?.cancelEntry(),
  pickEntry: (x: number, y: number): void => controller?.pickEntry(x, y),
  click: (): void => audio.playUi('click'),
  updateSettings(p: Partial<GameSettings>): void {
    const settings = { ...useGameStore.getState().settings, ...p };
    patch({ settings });
    saveSettings(settings);
    applyAudioSettings(settings);
    if (p.quality && renderer) {
      renderer.setQuality(p.quality);
      patch({ quality: renderer.qualityStatus() });
    }
    if (p.cameraView) renderer?.setCameraView(p.cameraView);
    if (p.shake) applyShake(settings);
    if (p.moveAssist) input.setMoveAssist(settings.moveAssist);
    if (p.moveStyle) input.setMoveStyle(settings.moveStyle);
  },
  // ---- Training Academy (tutorial): isolated from competitive play, never writes the saved settings
  openTutorial(lesson?: number): void {
    void audio.unlock();
    audio.playUi('click');
    tutorialView = useGameStore.getState().settings.cameraView;
    renderer?.setCameraView(tutorialView);
    tutorial?.open(lesson);
  },
  tutorialWatch: (lesson?: number): void => tutorial?.watch(lesson),
  tutorialPractice: (lesson?: number): void => tutorial?.practice(lesson),
  tutorialReplay: (): void => tutorial?.replay(),
  tutorialNext: (): void => void tutorial?.next(),
  tutorialSkip: (): void => tutorial?.skip(),
  tutorialResetProgress: (): void => tutorial?.resetProgress(),
  tutorialPrev: (): void => tutorial?.prev(),
  tutorialPause: (): void => tutorial?.togglePause(),
  tutorialCharacter: (c: CharacterId): void => tutorial?.setCharacter(c),
  exitTutorial(): void {
    audio.playUi('back');
    renderer?.setCameraView(useGameStore.getState().settings.cameraView);
    tutorial?.exit();
  },
  toggleCameraView(): void {
    const view = useGameStore.getState().settings.cameraView === 'overview' ? 'action' : 'overview';
    commands.updateSettings({ cameraView: view });
  },
};

export { input };

function setMenu(menu: MenuState): void {
  patch({ menu });
}

/** Keys that switch the spectated survivor (the local player is out, so they move nobody). */
const SPECTATE_KEYS: Record<string, 1 | -1> = {
  ArrowLeft: -1,
  KeyA: -1,
  KeyQ: -1,
  BracketLeft: -1,
  ArrowRight: 1,
  KeyD: 1,
  KeyE: 1,
  BracketRight: 1,
};

/**
 * The running match for presentation widgets that draw the board themselves (the City Rumble
 * minimap). Read-only: never mutate the returned state.
 */
export function liveMatch(): { state: GameState; focusId: number } | null {
  const state = controller?.state;
  if (!state) return null;
  return { state, focusId: controller?.spectating ?? 0 };
}

/**
 * Where tile centres are on screen in PAGE pixels, with the canvas rectangle they can appear in (the HUD's mission
 * compass). Read-only; null outside a running match.
 */
export function projectTilesToPage(tiles: readonly { x: number; y: number }[]): {
  points: { x: number; y: number; ahead: boolean }[];
  bounds: { left: number; top: number; right: number; bottom: number };
} | null {
  if (!renderer || !canvasEl) return null;
  const projected = renderer.projectTiles(tiles);
  if (!projected) return null;
  const at = canvasEl.getBoundingClientRect();
  return {
    points: projected.map((p) => ({ x: p.x + at.left, y: p.y + at.top, ahead: p.ahead })),
    bounds: { left: at.left, top: at.top, right: at.right, bottom: at.bottom },
  };
}

/** Debug/test hook, enabled with `?debug` in the URL (used by the Playwright suite). */
function exposeDebugHandle(): void {
  const params = new URLSearchParams(location.search);
  // `?trace` records the touch -> gate -> simulation input trace on its own (decision MI5)
  if (params.has('debug') || params.has('trace')) inputTrace.enabled = true;
  if (!params.has('debug')) return;
  const w = window as unknown as { __WAHALA__?: unknown };
  w.__WAHALA__ = {
    getState: (): GameState | null => controller?.state ?? null,
    controller: () => controller,
    campaign: () => campaign,
    tutorial: () => tutorial,
    store: useGameStore,
    stats: () => renderer?.stats() ?? null,
    /** Campaign mission markers the renderer holds (nodes, boss); null outside a mission. */
    missionMarkers: () => renderer?.missionMarkerStats() ?? null,
    /** Performance report: stop drawing the mission markers (true) or draw them again (false). */
    hideMissionMarkers: (hidden: boolean) => renderer?.debugHideMissionMarkers(hidden),
    /** Smoothed ms per frame spent in sim ticks (including bots), bot decisions per tick, and render. */
    timings: () => controller?.timers.snapshot() ?? null,
    /** Graphics quality: the setting, the rung in use, the capability estimate and the controller state. */
    quality: () => renderer?.qualityStatus() ?? null,
    /** e2e: feeds synthetic frames (ms each) to Auto's controller on a virtual clock; returns what it changed. */
    feedFrames: (frameMs: number, count: number, opts?: { busy?: boolean }) =>
      renderer?.debugFeedFrames(frameMs, count, opts) ?? [],
    renderer: () => renderer,
    assets: () => ({ loaded: assets.loadedIds(), failed: assets.failedIds() }),
    music: () => (audio as { musicStatus?: () => unknown }).musicStatus?.() ?? null,
    /** Match loading: the screen's state now and how many starts actually ran (duplicate taps start nothing). */
    matchLoad: () => ({
      state: loader.state,
      starts: matchStarts,
      busy: loader.busy,
      frames: framesDrawn,
      frameWaiters: frameWaiters.length,
      screen: useGameStore.getState().screen,
      visibility: document.visibilityState,
    }),
    /** Combat test lab: the runtime (level, per-seat diagnostics) of the running match, null when off. */
    combatLab: () => controller?.state?.combatLab ?? null,
    /** Voice registry and per-match loading state, and the lines scheduled so far. */
    voices: () => (audio as { voiceStatus?: () => unknown }).voiceStatus?.() ?? null,
    voiceReport: () => (audio as { whenVoicesLoaded?: () => Promise<unknown> }).whenVoicesLoaded?.() ?? null,
    voiceSceneLoaded: () =>
      (audio as { whenVoiceSceneLoaded?: () => Promise<void> }).whenVoiceSceneLoaded?.() ?? null,
    spoken: () => spokenLog.slice(),
    /** Plays a line of this voice trigger now (stops the current line first). */
    previewVoice: (trigger: string) =>
      (audio as { previewVoice?: (t: string) => boolean }).previewVoice?.(trigger) ?? false,
    /** Feeds a batch of sim events to the audio only (voice and sound checks; the match itself is untouched). */
    hear: (events: SimEvent[]) => {
      const state = controller?.state;
      if (state) audio.handleEvents(events, state);
    },
    /** Input trace: raw touch -> quantised direction -> gate decision -> simulation result (`inputTrace().dump()`). */
    inputTrace: () => inputTrace,
    stepTicks: (n: number) => {
      for (let i = 0; i < n; i++) controller?.stepOnce();
    },
    /** Like stepTicks, but every tick's events reach the renderer, audio and HUD as in real play. */
    advance: (n: number) => controller?.debugAdvance(n),
  };
}
