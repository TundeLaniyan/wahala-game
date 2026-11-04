/**
 * Building blocks shared by the campaign screens: stars, a story line (the unseen broker is always a message /
 * phone-call card from UNKNOWN NUMBER, never a face or a portrait), the story player (typewriter optional, skip,
 * Enter / Space / tap to advance) and the boss card.
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { CAMPAIGN } from '../../campaign';
import type { BossDef, StoryLine } from '../../campaign';
import { setScreenNavHandler } from '../../app/menuNav';
import { useGameStore } from '../../app/store';
import type { CampaignUi } from '../../app/campaignState';
import { fighterArt } from '../menu/art';
import { FighterImage } from '../menu/FighterImage';
import { crewText, hexCss } from './model';
import './campaign.css';

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

/** The broker is only ever a message or a call from an unknown number: no face, no portrait, no silhouette art. */
export function StoryLineView({ line, typed }: { line: StoryLine; typed?: string }) {
  const text = typed ?? line.text;
  if (line.fromBroker)
    return (
      <div className="cp-line cp-msg" data-testid="story-broker">
        <div className="cp-msg-head">
          <span className="cp-msg-glyph" aria-hidden>
            ☎
          </span>
          <b>UNKNOWN NUMBER</b>
          <small>{line.speaker === 'UNKNOWN NUMBER' ? 'new message' : 'on the line'}</small>
        </div>
        <p>{text}</p>
      </div>
    );
  const narration = line.speaker === 'NARRATOR';
  return (
    <div className={`cp-line${narration ? ' narration' : ''}`}>
      {!narration && <b className="cp-speaker">{line.speaker}</b>}
      <p>{text}</p>
    </div>
  );
}

function reducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Plays `lines` as a log: each line types in (unless reduced motion), a tap / Enter / Space / the Next button
 * completes the line and then moves on, Skip ends the scene at once. `onDone` fires exactly once.
 */
export function StoryPlayer(props: {
  lines: readonly StoryLine[];
  onDone: () => void;
  doneLabel: string;
  testId: string;
}) {
  const { lines } = props;
  const instant = useRef(reducedMotion()).current;
  const [shown, setShown] = useState(1);
  const [chars, setChars] = useState(instant ? Number.MAX_SAFE_INTEGER : 0);
  const root = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  const current = lines[shown - 1];
  const typing = !instant && current !== undefined && chars < current.text.length;
  const last = shown >= lines.length;

  useEffect(() => {
    if (!typing) return;
    const t = setInterval(() => setChars((c) => c + 2), 22);
    return () => clearInterval(t);
  }, [shown, typing]);

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'nearest' });
  }, [shown, chars]);

  const finish = (): void => {
    if (done.current) return;
    done.current = true;
    props.onDone();
  };
  const advance = (): void => {
    if (typing) setChars(Number.MAX_SAFE_INTEGER);
    else if (!last) {
      setShown(shown + 1);
      setChars(instant ? Number.MAX_SAFE_INTEGER : 0);
    } else finish();
  };

  // Enter / Space / A advance the scene, unless another button (Skip) has the focus: then it is pressed
  useEffect(() =>
    setScreenNavHandler((command) => {
      if (command !== 'confirm') return false;
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        root.current?.contains(active) &&
        !active.hasAttribute('data-story-next')
      )
        return false;
      advance();
      return true;
    }),
  );

  return (
    <div className="cp-story" data-testid={props.testId} ref={root}>
      <div
        className="cp-log"
        role="log"
        aria-live="polite"
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest('button')) advance();
        }}
      >
        {lines.slice(0, shown).map((line, i) => (
          <StoryLineView
            key={i}
            line={line}
            typed={i === shown - 1 && !instant ? line.text.slice(0, chars) : undefined}
          />
        ))}
        <div ref={end} />
      </div>
      <div className="cp-story-bar">
        <span className="cp-story-count" data-testid="story-count">
          {shown} / {lines.length}
        </span>
        <button type="button" className="mn-btn mn-secondary small" data-testid="story-skip" onClick={finish}>
          Skip
        </button>
        <button
          type="button"
          className="mn-btn mn-primary small"
          data-testid="story-next"
          data-story-next=""
          data-autofocus=""
          onClick={advance}
        >
          {typing ? 'Show' : last ? props.doneLabel : 'Next'}
          <span className="mn-arrow" aria-hidden>
            →
          </span>
        </button>
      </div>
    </div>
  );
}

/** The boss as text and palette colours, with the base fighter's existing menu art (boss art is not drawn yet). */
export function BossCard({ boss, compact }: { boss: BossDef; compact?: boolean }) {
  const { faction, roles } = crewText(boss);
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
