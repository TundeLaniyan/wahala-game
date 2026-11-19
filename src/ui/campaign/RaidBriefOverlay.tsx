/**
 * The raid's instructions at the SAFE door-to-raid hand-over (docs/MISSION_GUIDANCE.md, decision MG3): the field mission
 * is already held and the raid is built but HELD too (no tick runs) until START, so nothing can hurt the player while
 * this card is up. It shows the cargo picture, "DESTROY N MARKED CARGO", the cross-shaped blast, which crates are only
 * obstacles and where the exit opens; compact on a replay. Keyboard / gamepad: START is focused (Enter / A press it).
 */
import { useRef } from 'react';
import { raidBrief } from '../../app/missionBrief';
import { commands } from '../../app/session';
import { useGameStore } from '../../app/store';
import { useMenuNav } from '../menu/focusNav';
import { PrimaryButton } from '../menu/Frame';
import { MissionBriefCard } from './MissionBriefCard';

export function RaidBriefOverlay() {
  const brief = useGameStore((s) => s.campaign?.raidBrief ?? null);
  const root = useRef<HTMLDivElement>(null);
  useMenuNav(root, () => false, { enabled: brief !== null });
  if (!brief) return null;
  const b = raidBrief(brief.raidId);
  return (
    <div
      className="mn-overlay raid-brief-overlay"
      data-testid="raid-brief"
      data-raid={brief.raidId}
      ref={root}
    >
      <div className="mn-overlay-card raid-brief-card">
        <header className="raid-brief-head">
          <small className="mn-kicker">{b.district} · Classic raid</small>
          <h2>{b.title}</h2>
        </header>
        <MissionBriefCard brief={b} compact={brief.compact} testId="raid-brief-card" />
        <div className="raid-brief-actions">
          <PrimaryButton
            testId="raid-brief-start"
            autoFocus
            onClick={() => commands.campaignRaidBriefStart()}
          >
            Start raid
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
