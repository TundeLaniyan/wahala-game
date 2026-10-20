import { useEffect, useRef } from 'react';
import { commands, mount } from '../app/session';
import { useGameStore } from '../app/store';
import { Hud } from './Hud';
import { PauseOverlay, ResultsOverlay, RotateOverlay } from './Overlays';
import { TitleScreen } from './TitleScreen';
import { TouchControls } from './TouchControls';

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

  useEffect(() => {
    const unmount = mount(canvasRef.current!);
    if (new URLSearchParams(location.search).has('fps')) useGameStore.setState({ showStats: true });
    return unmount;
  }, []);

  const showTouch =
    touchSetting === 'on' || (touchSetting === 'auto' && (touchCapable || device === 'touch'));

  return (
    <div className="game-root">
      <canvas
        ref={canvasRef}
        className="game-canvas"
        data-testid="game-canvas"
        onPointerDown={(e) => {
          if (hasEntry) commands.pickEntry(e.clientX, e.clientY);
        }}
      />
      {screen !== 'title' && <Hud />}
      {screen === 'playing' && showTouch && !paused && <TouchControls />}
      {screen === 'playing' && paused && <PauseOverlay />}
      {screen === 'results' && <ResultsOverlay />}
      {screen === 'title' && !fatal && <TitleScreen />}
      {fatal && (
        <div className="scrim" data-testid="fatal">
          <div className="card lose">
            <h2>Cannot start</h2>
            <p>{fatal}</p>
          </div>
        </div>
      )}
      {screen === 'playing' && portrait && <RotateOverlay />}
    </div>
  );
}
