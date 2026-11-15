/**
 * The first-visit offer on Home (app/onboarding.ts): START TUTORIAL opens the Training Academy's first beginner lesson,
 * SKIP TO MENU leaves the player on Home. Shown once; the choice is remembered locally. The runtime line reads the
 * adaptive-runtime brand from `render/perf/brand.ts` (the single place to swap in approved W-AR branding later).
 */
import { useState } from 'react';
import { commands } from '../../app/session';
import { offerOnboardingNow, writeOnboarding } from '../../app/onboarding';
import { FLOWFRAME } from '../../render/perf/brand';
import { FlowFrameMark } from '../FlowFrameMark';
import { PrimaryButton, SecondaryButton } from './Frame';

export function FirstVisitCard() {
  const [open, setOpen] = useState(offerOnboardingNow);
  if (!open) return null;
  const choose = (tutorial: boolean): void => {
    writeOnboarding(tutorial ? 'tutorial' : 'skipped');
    setOpen(false);
    if (tutorial) commands.openTutorial(0);
  };
  return (
    <div
      className="mn-firstvisit"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fv-title"
      data-testid="first-visit"
    >
      <div className="mn-panel mn-firstvisit-card">
        <small className="mn-kicker">Welcome to</small>
        <h2 id="fv-title">WAHALA!</h2>
        <p>
          New here? A short lesson in the Training Academy shows you how generators, blasts and the two
          buttons work.
        </p>
        <div className="mn-firstvisit-actions">
          <PrimaryButton testId="first-visit-tutorial" autoFocus onClick={() => choose(true)}>
            START TUTORIAL
          </PrimaryButton>
          <SecondaryButton testId="first-visit-skip" onClick={() => choose(false)}>
            SKIP TO MENU
          </SecondaryButton>
        </div>
        <p className="mn-firstvisit-note">Learn to Play is always on the Home screen.</p>
        <p className="mn-flowframe" data-testid="first-visit-runtime">
          <FlowFrameMark size={16} />
          <b>{FLOWFRAME.name}</b>
          <em>{FLOWFRAME.tagline}</em>
        </p>
      </div>
    </div>
  );
}
