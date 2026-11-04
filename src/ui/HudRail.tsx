import { useLayoutEffect, useRef, useState } from 'react';
import type { StageAlert, StreakHud, SuddenDeathHud } from '../app/hud';
import type { MissionView } from '../sim';
import type { Toast } from '../app/store';
import { useGameStore } from '../app/store';
import { railBox } from './hudRail';
import type { RailBox } from './hudRail';
import { KillFeed } from './KillFeed';
import { MissionPanel } from './MissionPanel';
import { RuleBanner, StageAlerts } from './StageAlerts';
import { StreakStatus } from './StreakStatus';
import { StreakIcon } from './streakIcons';
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
  /** The local fighter's kill-streak rewards (decision SK4); null when the ruleset has none. */
  streak?: StreakHud | null;
  /** The local fighter is standing (while down only the stored QUICK HANDS card shows). */
  alive?: boolean;
  /** Campaign mission picture (null in a normal match: the panel renders nothing). */
  mission?: MissionView | null;
}

/**
 * The only place transient text appears during play: essential notices (stage-hazard alerts, the arena rule
 * during the countdown, status toasts) and, when enabled, the subtitle of the voice line playing now. On the
 * standard arenas it is a column beside the board, sized from where the board is on screen so it never covers
 * a playable tile (see hudRail.ts); the crowd's reactions are voice clips, never text. Top to bottom: the sudden-death
 * status, the arena rule, stage alerts, the kill feed (decision HC1), status toasts (shield used, QUICK HANDS stored /
 * resumed ...), the mission panel (HC5), the kill-streak cards, the subtitle. See docs/HUD_COMBAT.md.
 */
export function HudRail({
  alerts,
  toasts,
  ruleBanner,
  suddenDeath = null,
  rumble,
  streak = null,
  alive = true,
  mission = null,
}: HudRailProps) {
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
      {/* City Rumble keeps the kill feed in its left panel (RumbleHud); a standard match's is the rail's first list */}
      {!rumble && <KillFeed />}
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast ${t.tone}${t.icon ? ' with-icon' : ''}`}
          data-testid="toast"
          role="status"
        >
          {t.icon && <StreakIcon kind={t.icon} size={18} />}
          {t.text}
        </div>
      ))}
      <MissionPanel mission={mission} />
      <StreakStatus streak={streak} alive={alive} />
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
