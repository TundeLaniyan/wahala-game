import { Suspense, lazy, useEffect, useRef } from 'react';
import { commands, mount } from '../app/session';
import { useGameStore } from '../app/store';
import { HowToPlay } from './HowToPlay';
import { Hud } from './Hud';
import { PauseOverlay, ResultsOverlay, RotateOverlay } from './Overlays';
import { MainMenu } from './menu/MainMenu';
import { MatchLoading } from './MatchLoading';
import { RaidBriefOverlay } from './campaign/RaidBriefOverlay';
import { TouchControls } from './TouchControls';
import { SpectatorControls } from './SpectatorControls';
import { testLabActive } from '../testlab/params';
import { useRumbleOverlay } from '../app/rumbleOverlayHost';

// TEMPORARY founder Test Lab (docs/TEST_LAB.md): its own chunk, loaded only with `?testlab=1`
const lab = {
  TestLab: lazy(() => import('./testlab').then((m) => ({ default: m.TestLab }))),
  Pause: lazy(() => import('./testlab').then((m) => ({ default: m.TestLabPause }))),
  Results: lazy(() => import('./testlab').then((m) => ({ default: m.TestLabResults }))),
};
const LAB = testLabActive();

// Online City Rumble's layer over the game screen (connection chip, reconnect banner, results): its own chunk, present only in
// a build made with the online switch, and mounted only while an online match is on screen (app/rumbleOverlayHost.ts).
const RumbleOnlineOverlay = __WAHALA_SERVER_ONLINE__
  ? lazy(() => import('./online/rumble/RumbleOnlineOverlay'))
  : null;

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const screen = useGameStore((s) => s.screen);
  const paused = useGameStore((s) => s.paused);
  const hasEntry = useGameStore((s) => !!s.hud?.entry);
  const portrait = useGameStore((s) => s.portrait);
  const touchSetting = useGameStore((s) => s.settings.touchControls);
  const touchCapable = useGameStore((s) => s.touchCapable);
  const device = useGameStore((s) => s.device);
  const fatal = useGameStore((s) => s.fatal);
  const tutorial = useGameStore((s) => s.tutorial?.mode ?? null);
  const matchLoad = useGameStore((s) => s.matchLoad);
  const raidBrief = useGameStore((s) => !!s.campaign?.raidBrief);
  const rumbleOnlineActive = useRumbleOverlay((s) => s.active);

  useEffect(() => {
    const unmount = mount(canvasRef.current!);
    if (new URLSearchParams(location.search).has('fps')) useGameStore.setState({ showStats: true });
    return unmount;
  }, []);

  const showTouch =
    touchSetting === 'on' || (touchSetting === 'auto' && (touchCapable || device === 'touch'));

  return (
    <div className={`game-root${tutorial ? ' htp-on' : ''}`}>
      <canvas
        ref={canvasRef}
        className="game-canvas"
        data-testid="game-canvas"
        onPointerDown={(e) => {
          if (hasEntry) commands.pickEntry(e.clientX, e.clientY);
        }}
      />
      <div className="vignette" aria-hidden />
      {screen !== 'title' && <Hud />}
      {screen === 'playing' && showTouch && !paused && tutorial !== 'demo' && <TouchControls />}
      {screen === 'playing' && !paused && !tutorial && <SpectatorControls touch={showTouch} />}
      {screen === 'playing' &&
        paused &&
        !tutorial &&
        (LAB ? (
          <Suspense fallback={null}>
            <lab.Pause />
          </Suspense>
        ) : (
          <PauseOverlay />
        ))}
      {/* the raid briefing at the door hand-over (decision MG3): over the held raid, after its loading screen */}
      {screen === 'playing' && !paused && !matchLoad && raidBrief && <RaidBriefOverlay />}
      {screen === 'playing' && tutorial && <HowToPlay />}
      {screen === 'results' &&
        (LAB ? (
          <Suspense fallback={null}>
            <lab.Results />
          </Suspense>
        ) : (
          <ResultsOverlay />
        ))}
      {screen === 'title' &&
        !fatal &&
        (LAB ? (
          <Suspense fallback={null}>
            <lab.TestLab />
          </Suspense>
        ) : (
          <MainMenu />
        ))}
      {fatal && (
        <div className="scrim" data-testid="fatal">
          <div className="card lose">
            <h2>Cannot start</h2>
            <p>{fatal}</p>
          </div>
        </div>
      )}
      {screen === 'playing' && portrait && !paused && !matchLoad && <RotateOverlay />}
      {/* the match loading screen, over everything while a start runs (it leads with the rotate hint when upright) */}
      {matchLoad && <MatchLoading load={matchLoad} />}
      {RumbleOnlineOverlay && rumbleOnlineActive && (
        <Suspense fallback={null}>
          <RumbleOnlineOverlay />
        </Suspense>
      )}
    </div>
  );
}
