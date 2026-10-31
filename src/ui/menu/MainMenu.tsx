/**
 * The main menu (replaces the old one-page title screen): a cinematic backdrop and one screen at a time,
 * chosen by `UiState.menu` (app/menu.ts). Keyboard and gamepad move focus between the controls of the
 * screen showing (focusNav.ts); Esc / gamepad B goes back.
 */
import { useEffect, useRef } from 'react';
import { commands } from '../../app/session';
import { currentScreen } from '../../app/menu';
import type { MenuScreen } from '../../app/menu';
import { useGameStore } from '../../app/store';
import { FLOWFRAME } from '../../render/perf/brand';
import { FlowFrameMark } from '../FlowFrameMark';
import { KEY_ART } from './art';
import { useMenuNav } from './focusNav';
import { HomeScreen } from './HomeScreen';
import { ModeScreen } from './ModeScreen';
import { SetupScreen } from './SetupScreen';
import { FighterScreen } from './FighterScreen';
import { ReadyScreen } from './ReadyScreen';
import { SettingsScreen } from './SettingsScreen';
import { AcademyScreen } from './AcademyScreen';
import './menu.css';
import './flow.css';

const SCREENS: Record<MenuScreen, () => React.JSX.Element> = {
  home: HomeScreen,
  mode: ModeScreen,
  setup: SetupScreen,
  fighter: FighterScreen,
  ready: ReadyScreen,
  settings: SettingsScreen,
  academy: AcademyScreen,
};

export function MainMenu() {
  const screen = useGameStore((s) => currentScreen(s.menu));
  const loading = useGameStore((s) => s.loading);
  const root = useRef<HTMLDivElement>(null);
  useMenuNav(root, () => {
    if (useGameStore.getState().menu.stack.length <= 1) return false;
    commands.menuBack();
    return true;
  });
  // a new screen starts with nothing focused (the first D-pad press lands on its main control)
  useEffect(() => {
    const active = document.activeElement as HTMLElement | null;
    if (active && root.current?.contains(active)) active.blur();
  }, [screen]);
  const Screen = SCREENS[screen];
  const busy = loading !== null && loading.done < loading.total;
  return (
    <div className="mn" data-testid="title-screen" data-screen={screen} ref={root}>
      <div className={`mn-backdrop${screen === 'home' ? ' hero' : ''}`} aria-hidden>
        <img src={KEY_ART.src} srcSet={KEY_ART.srcSet} sizes="100vw" alt="" decoding="async" />
        <i className="mn-shade" />
        <i className="mn-grain" />
      </div>
      <div className="mn-stage" key={screen}>
        <Screen />
      </div>
      {busy && loading && (
        <div
          className="mn-loading"
          data-testid="menu-loading"
          style={{ ['--p' as string]: `${Math.round((loading.done / Math.max(1, loading.total)) * 100)}%` }}
        >
          <span>Loading 3D assets</span>
          <i />
          <p className="mn-flowframe" data-testid="flowframe-note">
            <FlowFrameMark size={18} />
            <b>{FLOWFRAME.name}</b>
            <em>{FLOWFRAME.description}</em>
          </p>
        </div>
      )}
    </div>
  );
}
