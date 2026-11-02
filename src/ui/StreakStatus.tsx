import { STREAK_REWARD_DEFS, VEHICLE_DEFS } from '../sim';
import type { StreakHud } from '../app/hud';
import { StreakIcon } from './streakIcons';

/**
 * The kill-streak reward cards in the HUD rail (decision SK4): every reward the fighter holds, with its icon, name and
 * what is left of it - QUICK HANDS with seconds and generator charges and a draining bar, VEHICLE GENERATOR with the
 * vehicle it will be, GLOBAL KNOCKDOWN ready - plus how many kills to the next one. Small, in the rail beside the
 * board, never over the board, the timer, the portraits or the controls. Renders nothing without a reward or a
 * next threshold.
 */
export function StreakStatus({ streak }: { streak: StreakHud | null }) {
  if (!streak) return null;
  const { quickHands, vehicleGenerator, knockdown, next } = streak;
  if (!quickHands && !vehicleGenerator && !knockdown && !next) return null;
  return (
    <div className="streak-status" data-testid="streak-status">
      {quickHands && (
        <div
          className="streak-card active"
          data-testid="streak-quick-hands"
          data-seconds={quickHands.seconds}
        >
          <StreakIcon kind="quickHands" />
          <span className="streak-name">{STREAK_REWARD_DEFS.quickHands.name}</span>
          <b className="streak-time">{quickHands.seconds}s</b>
          <span className="streak-bar" aria-hidden="true">
            <i style={{ width: `${Math.round(quickHands.fraction * 100)}%` }} />
          </span>
          <small className="streak-sub" data-testid="streak-charges">
            {quickHands.charges}/{quickHands.capacity} generators · hold GENERATOR
          </small>
        </div>
      )}
      {vehicleGenerator && (
        <div
          className="streak-card ready"
          data-testid="streak-vehicle-generator"
          data-vehicle={vehicleGenerator}
        >
          <StreakIcon kind="vehicleGenerator" />
          <span className="streak-name">{STREAK_REWARD_DEFS.vehicleGenerator.short}</span>
          <b className="streak-time">{VEHICLE_DEFS[vehicleGenerator].name.toUpperCase()}</b>
          <small className="streak-sub">
            ready · tap {VEHICLE_DEFS[vehicleGenerator].name.toUpperCase()}
          </small>
        </div>
      )}
      {knockdown && (
        <div className="streak-card ready" data-testid="streak-knockdown">
          <StreakIcon kind="globalKnockdown" />
          <span className="streak-name">{STREAK_REWARD_DEFS.globalKnockdown.short}</span>
          <b className="streak-time">READY</b>
          <small className="streak-sub">tap KNOCKDOWN</small>
        </div>
      )}
      {next && !quickHands && !vehicleGenerator && !knockdown && (
        <div className="streak-card next" data-testid="streak-next">
          <StreakIcon kind={next.reward} size={18} />
          <span className="streak-name">{STREAK_REWARD_DEFS[next.reward].short}</span>
          <small className="streak-sub">
            {next.toGo} {next.toGo === 1 ? 'kill' : 'kills'} to go
          </small>
        </div>
      )}
    </div>
  );
}
