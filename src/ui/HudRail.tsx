import { useLayoutEffect, useRef, useState } from 'react';
import type { CampaignHud, EnemyHud, StageAlert, StreakHud, SuddenDeathHud } from '../app/hud';
import type { MissionView } from '../sim';
import type { Toast } from '../app/store';
import { useGameStore } from '../app/store';
import { RAIL_GAP, railBox, railBoxRight } from './hudRail';
import type { RailBox } from './hudRail';
import { CampaignHealth } from './CampaignHealth';
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
  /** Campaign health of the local player and the enemies with a bar on screen (null / [] in a normal match). */
  campaign?: CampaignHud | null;
  enemies?: readonly EnemyHud[];
}

/**
 * The only place transient text appears during play: essential notices (stage-hazard alerts, the arena rule
 * during the countdown, status toasts) and, when enabled, the subtitle of the voice line playing now. On the
 * standard arenas it is a column beside the board, sized from where the board is on screen so it never covers
 * a playable tile (see hudRail.ts) and ends above the touch move pad; the crowd's reactions are voice clips, never text.
 * Top to bottom: the sudden-death status, the arena rule, stage alerts, the mission panel (HC5), the kill feed (HC1),
 * status toasts (shield used, QUICK HANDS stored / resumed ...), the kill-streak cards, the subtitle. What does not
 * fit is clipped at the bottom, so the most important blocks come first. See docs/HUD_COMBAT.md.
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
  campaign = null,
  enemies = [],
}: HudRailProps) {
  const board = useGameStore((s) => s.board);
  const subtitle = useGameStore((s) => s.subtitle);
  const mode = useGameStore((s) => s.settings.subtitles);
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<RailBox | null>(null);

  // the touch move pad (phones) is an obstruction: the rail ends above it
  const [padTop, setPadTop] = useState<number | null>(null);
  useLayoutEffect(() => {
    const measure = (): void => {
      const pad = document.querySelector('[data-testid="stick-pad"]');
      const top = pad ? Math.round(pad.getBoundingClientRect().top) : null;
      setPadTop((prev) => (prev === top ? prev : top));
    };
    measure();
    const raf = requestAnimationFrame(measure); // the pad mounts beside the HUD, maybe after this effect
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
    };
  }, [board, rumble]);

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

  // the mission panel and the kill feed (the combat blocks) stop above the touch move pad; the rest of the rail keeps
  // its own height (the arena rule must fit whole). Measured every render: the block's top depends only on what is above it.
  const combatRef = useRef<HTMLDivElement>(null);
  const [combatMax, setCombatMax] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = combatRef.current;
    const next =
      !el || padTop === null
        ? null
        : Math.max(0, Math.floor(padTop - RAIL_GAP - el.getBoundingClientRect().top));
    setCombatMax((prev) => (prev === next ? prev : next));
  });

  // landscape phone with the touch controls: the kill feed moves to the strip right of the board (the left rail is a
  // short strip shared with the mission panel); it ends above the action buttons
  const [side, setSide] = useState<RailBox | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (rumble || !el || padTop === null || window.innerHeight > 520 || !board) {
      setSide(null);
      return;
    }
    const buttons = [...document.querySelectorAll('.abtn')].map((b) => b.getBoundingClientRect().top);
    const limit = buttons.length > 0 ? Math.min(...buttons) : null;
    const next = railBoxRight(
      board,
      window.innerWidth,
      10,
      el.getBoundingClientRect().top,
      window.innerHeight,
      limit,
    );
    setSide((prev) => (prev?.width === next?.width && prev?.maxHeight === next?.maxHeight ? prev : next));
  }, [board, rumble, padTop]);

  const showSubtitle = subtitle !== null && (mode === 'on' || mode === 'large');
  return (
    <>
      <div
        ref={ref}
        className={`hud-rail${rumble ? ' rail-top' : ''}`}
        data-testid="hud-rail"
        style={box ? { width: `${box.width}px`, maxHeight: `${box.maxHeight}px` } : undefined}
      >
        {suddenDeath && <SuddenDeathClock sd={suddenDeath} />}
        {ruleBanner && <RuleBanner text={ruleBanner} />}
        <StageAlerts alerts={alerts} />
        {/* a mission's panel first (its warnings must never be clipped); then the kill feed. City Rumble keeps the kill
          feed in its left panel (RumbleHud); a standard match's is the rail's own list */}
        <div
          ref={combatRef}
          className="rail-combat"
          data-testid="rail-combat"
          style={combatMax !== null ? { maxHeight: `${combatMax}px` } : undefined}
        >
          {!rumble && <CampaignHealth campaign={campaign} enemies={enemies} mission={mission} />}
          <MissionPanel mission={mission} />
          {!rumble && !side && <KillFeed />}
        </div>
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
      {side && (
        <div
          className="hud-rail-side"
          data-testid="rail-side"
          style={{ width: `${side.width}px`, maxHeight: `${side.maxHeight}px` }}
        >
          <KillFeed />
        </div>
      )}
    </>
  );
}
