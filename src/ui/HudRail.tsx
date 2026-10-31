import { useLayoutEffect, useRef, useState } from 'react';
import type { StageAlert, SuddenDeathHud } from '../app/hud';
import type { Toast } from '../app/store';
import { useGameStore } from '../app/store';
import { railBox } from './hudRail';
import type { RailBox } from './hudRail';
import { RuleBanner, StageAlerts } from './StageAlerts';
import { SuddenDeathClock } from './SuddenDeath';
import './HudRail.css';

export interface HudRailProps {
  alerts: StageAlert[];
  toasts: Toast[];
  ruleBanner: string | null;
  /** Rumble sudden death: the blast clock. */
  suddenDeath?: SuddenDeathHud | null;
  /** City Rumble (follow camera): the column sits top-centre, above the followed player. */
  rumble: boolean;
}

/**
 * The only place transient text appears during play: essential notices (stage-hazard alerts, the arena rule
 * during the countdown, status toasts) and, when enabled, the subtitle of the voice line playing now. On the
 * standard arenas it is a column beside the board, sized from where the board is on screen so it never covers
 * a playable tile (see hudRail.ts); the crowd's reactions are voice clips, never text.
 */
export function HudRail({ alerts, toasts, ruleBanner, suddenDeath = null, rumble }: HudRailProps) {
  const board = useGameStore((s) => s.board);
  const subtitle = useGameStore((s) => s.subtitle);
  const mode = useGameStore((s) => s.settings.subtitles);
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<RailBox | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (rumble || !el) {
      setBox(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const next = railBox(board, r.left, r.top, window.innerHeight);
    setBox((prev) => (prev?.width === next?.width && prev?.maxHeight === next?.maxHeight ? prev : next));
  }, [board, rumble]);

  const showSubtitle = subtitle !== null && (mode === 'on' || mode === 'large');
  return (
    <div
      ref={ref}
      className={`hud-rail${rumble ? ' rail-top' : ''}`}
      data-testid="hud-rail"
      style={box ? { width: `${box.width}px`, maxHeight: `${box.maxHeight}px` } : undefined}
    >
      {suddenDeath && <SuddenDeathClock sd={suddenDeath} />}
      {ruleBanner && <RuleBanner text={ruleBanner} />}
      <StageAlerts alerts={alerts} />
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`} data-testid="toast" role="status">
          {t.text}
        </div>
      ))}
      <div className="subtitle-slot" aria-live="polite">
        {showSubtitle && (
          <p
            key={subtitle.id}
            className={`subtitle${mode === 'large' ? ' large' : ''}${subtitle.urgent ? ' urgent' : ''}${subtitle.ambient ? ' ambient' : ''}`}
            data-testid="subtitle"
          >
            {subtitle.text}
          </p>
        )}
      </div>
    </div>
  );
}
