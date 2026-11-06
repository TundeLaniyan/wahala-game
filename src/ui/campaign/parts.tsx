/**
 * Building blocks shared by the campaign screens: stars, the story line (re-exported from lines.tsx: the unseen
 * broker is always a message card), the boss card (name, title and signature up front, the rest in Read more) and the
 * broker message. The short-text card and the scene player are in CardView.tsx.
 */
import { useId, useState } from 'react';
import type { CSSProperties } from 'react';
import { CAMPAIGN } from '../../campaign';
import type { BossDef, StoryLine } from '../../campaign';
import { useGameStore } from '../../app/store';
import type { CampaignUi } from '../../app/campaignState';
import { fighterArt } from '../menu/art';
import { FighterImage } from '../menu/FighterImage';
import { ReadMoreToggle } from './CardView';
import { StoryLineView } from './lines';
import { crewText, hexCss } from './model';
import './campaign.css';

export { StoryLineView } from './lines';

/** The campaign slice of the store; screens only render when it exists (the flag is on). */
export const useCampaignUi = (): CampaignUi | null => useGameStore((s) => s.campaign);

export function Stars({ n, max = 3, big }: { n: number; max?: number; big?: boolean }) {
  return (
    <span className={`cp-stars${big ? ' big' : ''}`} role="img" aria-label={`${n} of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => (
        <i key={i} className={i < n ? 'on' : ''} aria-hidden>
          ★
        </i>
      ))}
    </span>
  );
}

/**
 * The boss as text and palette colours, with the base fighter's existing menu art (boss art is not drawn yet).
 * Up front: name, title and the signature move's name; the personality, crew, system, counterplay and the rest are
 * in Read more.
 */
export function BossCard({
  boss,
  compact,
  defaultOpen,
}: {
  boss: BossDef;
  compact?: boolean;
  /** Tests: render with Read more open. */
  defaultOpen?: boolean;
}) {
  const { faction, roles } = crewText(boss);
  const [open, setOpen] = useState(!!defaultOpen);
  const bodyId = useId();
  const style = {
    ['--boss' as string]: hexCss(boss.visualDirection.palette.primary),
    ['--boss2' as string]: hexCss(boss.visualDirection.palette.accent),
  } as CSSProperties;
  const art = boss.visualDirection.characterId;
  return (
    <article className="cp-boss mn-panel" style={style} data-testid="boss-card">
      <header className="cp-boss-head">
        <span className="cp-boss-pic" aria-hidden>
          <FighterImage id={art} art={fighterArt(art)} sizes="(max-width: 700px) 22vw, 120px" />
        </span>
        <div>
          <small className="mn-kicker">{boss.title}</small>
          <h3 data-testid="boss-name">{boss.name}</h3>
          {boss.nickname && <em>&ldquo;{boss.nickname}&rdquo;</em>}
        </div>
      </header>
      <p className="cp-boss-signature" data-testid="boss-signature">
        <small>Signature</small> <b>{boss.signatureAbility.name}</b>
      </p>
      <div className="cp-card-tools">
        <ReadMoreToggle open={open} onToggle={() => setOpen(!open)} controls={bodyId} />
      </div>
      {open && (
        <div id={bodyId} className="cp-readmore-body" data-testid="boss-readmore">
          <p className="cp-boss-personality" data-testid="boss-personality">
            {boss.personality}
          </p>
          <dl className="cp-facts">
            <div>
              <dt>Protected by</dt>
              <dd data-testid="boss-crew">
                <b>{faction}</b>: {roles}
              </dd>
            </div>
            <div>
              <dt>Controls</dt>
              <dd data-testid="boss-system">{boss.systemControlled}</dd>
            </div>
            {boss.entourage && (
              <div>
                <dt>With him</dt>
                <dd data-testid="boss-entourage">{boss.entourage}</dd>
              </div>
            )}
            {boss.entrance && !compact && (
              <div>
                <dt>Arrives</dt>
                <dd data-testid="boss-entrance">{boss.entrance}</dd>
              </div>
            )}
            <div>
              <dt>Signature: {boss.signatureAbility.name}</dt>
              <dd data-testid="boss-ability">{boss.signatureAbility.description}</dd>
            </div>
            <div className="good">
              <dt>Counterplay</dt>
              <dd data-testid="boss-counterplay">{boss.counterplay}</dd>
            </div>
            {!compact && (
              <div>
                <dt>To expose him</dt>
                <dd>{boss.exposeObjective}</dd>
              </div>
            )}
          </dl>
          {!compact && (
            <p className="mn-fineprint" data-testid="boss-art-note">
              Boss costume art is still to be drawn: shown with the base fighter&rsquo;s menu art in the
              boss&rsquo;s colours.
            </p>
          )}
        </div>
      )}
    </article>
  );
}

/** A broker message card for a briefing (the content's `brokerMessage`). */
export function BrokerMessage({ line }: { line: StoryLine }) {
  return <StoryLineView line={{ ...line, fromBroker: true }} />;
}

/** District content lookup that tolerates an unknown id (a hand-edited save). */
export const districtContent = (id: string) =>
  (CAMPAIGN.districts as Record<string, (typeof CAMPAIGN.districts)['oshodi']>)[id];
