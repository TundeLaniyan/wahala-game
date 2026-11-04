import { STREAK_REWARD_DEFS, VEHICLE_DEFS } from '../sim';
import type { StreakHud } from '../app/hud';
import { quickHandsCard } from './combatHudModel';
import { StreakIcon } from './streakIcons';

/**
 * The kill-streak reward cards in the HUD rail (decision SK4): every reward the fighter holds, with its icon, name and
 * what is left of it - QUICK HANDS with seconds and generator charges and a draining bar, VEHICLE GENERATOR with the
 * vehicle it will be, GLOBAL KNOCKDOWN ready - plus how many kills to the next one. Small, in the rail beside the
 * board, never over the board, the timer, the portraits or the controls. Renders nothing without a reward or a
 * next threshold.
 */
export function StreakStatus({ streak, alive = true }: { streak: StreakHud | null; alive?: boolean }) {
  if (!streak) return null;
  // while down only the STORED QUICK HANDS card shows (the other rewards wait unused; nothing can be spent)
  const live = alive
    ? streak
    : { ...streak, vehicleGenerator: null, knockdown: false, localChampion: false, next: null };
  const { vehicleGenerator, knockdown, localChampion, next } = live;
  const champRun = streak.localChampionRunning;
  const hands = quickHandsCard(streak, alive);
  if (!hands && !vehicleGenerator && !knockdown && !localChampion && !champRun && !next) return null;
  return (
    <div className="streak-status" data-testid="streak-status">
      {hands && (
        <div
          className={`streak-card ${hands.state === 'running' ? 'active' : 'stored'}`}
          data-testid={hands.state === 'running' ? 'streak-quick-hands' : 'streak-quick-hands-stored'}
          data-state={hands.state}
          data-seconds={hands.seconds}
        >
          <StreakIcon kind="quickHands" />
          <span className="streak-name">{STREAK_REWARD_DEFS.quickHands.name}</span>
          <b className="streak-time">{hands.seconds}s</b>
          <span className="streak-state" data-testid="streak-state">
            {hands.tag}
          </span>
          {hands.fraction !== null && (
            <span className="streak-bar" aria-hidden="true">
              <i style={{ width: `${Math.round(hands.fraction * 100)}%` }} />
            </span>
          )}
          <small className="streak-sub" data-testid="streak-charges">
            {hands.hint}
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
      {localChampion && (
        <div className="streak-card ready" data-testid="streak-local-champion">
          <StreakIcon kind="localChampion" />
          <span className="streak-name">{STREAK_REWARD_DEFS.localChampion.short}</span>
          <b className="streak-time">READY</b>
          <small className="streak-sub">tap LOCAL CHAMP · dodgeable</small>
        </div>
      )}
      {champRun && (
        <div className="streak-card active" data-testid="streak-local-champion-running">
          <StreakIcon kind="localChampion" />
          <span className="streak-name">{STREAK_REWARD_DEFS.localChampion.short}</span>
          <b className="streak-time">{champRun.seconds}s</b>
          <small className="streak-sub">neighbours are throwing</small>
        </div>
      )}
      {next && !hands && !vehicleGenerator && !knockdown && !localChampion && (
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
