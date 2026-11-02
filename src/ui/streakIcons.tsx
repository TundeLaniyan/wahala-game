/**
 * Icons of the three kill-streak rewards (decision SK4), drawn inline so they follow the text colour and read on the
 * rail's dark plate in the day and at night. Simple, bold shapes: a generator with a bolt (QUICK HANDS), a bus with a
 * generator on its roof (VEHICLE GENERATOR), a bottle with an impact star (GLOBAL KNOCKDOWN).
 */
import type { StreakRewardKind } from '../sim';

export function StreakIcon({ kind, size = 22 }: { kind: StreakRewardKind; size?: number }) {
  return (
    <svg
      className={`streak-icon ${kind}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {kind === 'quickHands' && (
        <>
          <rect x="4" y="8" width="13" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M11 9 L8 14 H11 L9.5 18 L14 12.5 H11.2 L12.6 9 Z" fill="currentColor" />
          <path
            d="M19 8 H22 M19 12 H23 M19 16 H22"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </>
      )}
      {kind === 'vehicleGenerator' && (
        <>
          <rect x="2" y="10" width="19" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="7" cy="19" r="2" fill="currentColor" />
          <circle cx="16" cy="19" r="2" fill="currentColor" />
          <rect x="7" y="4" width="8" height="5" rx="1" fill="currentColor" />
          <path d="M16.5 12 H20 M4 12 H6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </>
      )}
      {kind === 'globalKnockdown' && (
        <>
          <path d="M5 3 H8 V7 L9.5 9 V16 H3.5 V9 L5 7 Z" fill="currentColor" transform="rotate(35 8 10)" />
          <path
            d="M17 12 L18.2 15 L21.4 15.2 L18.9 17.2 L19.8 20.4 L17 18.6 L14.2 20.4 L15.1 17.2 L12.6 15.2 L15.8 15 Z"
            fill="currentColor"
          />
        </>
      )}
    </svg>
  );
}
