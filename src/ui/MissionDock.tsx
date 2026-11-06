import { useLayoutEffect, useRef, useState } from 'react';
import type { CampaignHud, EnemyHud } from '../app/hud';
import type { MissionView } from '../sim';
import { CampaignHealth } from './CampaignHealth';
import { FieldGoal } from './FieldGoal';
import { RAIL_GAP } from './hudRail';
import { MissionPanel } from './MissionPanel';

/**
 * City Rumble's home of the mission panel: the right column under the minimap (the follow camera fills the whole
 * screen with the board, so the panel hangs in a corner column like the roster does on the left, never top-centre over
 * the player). On phones it ends above the touch action buttons; what does not fit is clipped at the bottom (the
 * phase and the warnings come first). Renders nothing outside a mission.
 */
export function MissionDock({
  mission,
  campaign = null,
  enemies = [],
}: {
  mission: MissionView | null;
  campaign?: CampaignHud | null;
  enemies?: readonly EnemyHud[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = (): void => {
      const buttons = [...document.querySelectorAll('.abtn')].map((b) => b.getBoundingClientRect().top);
      const limit = buttons.length > 0 ? Math.min(...buttons) : window.innerHeight - 8;
      const next = Math.max(0, Math.floor(limit - RAIL_GAP - el.getBoundingClientRect().top));
      setMaxHeight((prev) => (prev === next ? prev : next));
    };
    measure();
    const raf = requestAnimationFrame(measure); // the touch buttons may mount just after this effect
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
    };
  });
  if (!mission) return null;
  return (
    <div
      ref={ref}
      className="mission-dock"
      data-testid="mission-dock"
      style={maxHeight !== null ? { maxHeight: `${maxHeight}px` } : undefined}
    >
      {/* a field mission's objective first: on a phone the column is short and this is what matters */}
      <FieldGoal mission={mission} />
      <CampaignHealth campaign={campaign} enemies={enemies} mission={mission} />
      <MissionPanel mission={mission} />
    </div>
  );
}
