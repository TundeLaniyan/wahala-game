/**
 * The short visual mission briefing (docs/MISSION_GUIDANCE.md, decisions MG1-MG3): the picture of the actual target,
 * ONE main objective with its real count, one or two action lines ("USE GENERATOR BLASTS" only where blasts are the only
 * way), the blast pattern, the route as numbered steps and, for a raid, the legend of target / obstacle / exit and where
 * the exit opens. One component for every place it is shown: the field-mission briefing screen, the boss briefing, the
 * door-to-raid hand-over and (compact) the pause menu. `compact` is a replay: the picture and one line.
 */
import { useEffect, useState } from 'react';
import { BLASTS_ONLY } from '../../app/missionBrief';
import type { MissionBrief } from '../../app/missionBrief';
import type { PreviewModel } from '../../render/briefPreview';
import { GLYPHS } from '../../render/objectiveGlyphs';
import { GlyphIcon } from '../GlyphIcon';
import './missionBrief.css';

/** The rendered preview of the real object (null until it is ready, or for good without WebGL). */
function useTargetPreview(model: PreviewModel | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  // the model is plain data: its key decides when to render again
  const key = model ? JSON.stringify(model) : '';
  useEffect(() => {
    setUrl(null);
    if (!model) return;
    let live = true;
    void import('../../render/briefPreview')
      .then((m) => m.previewImage(model))
      .then((u) => {
        if (live) setUrl(u);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [key]);
  return url;
}

/** The target picture: the in-game object when it could be rendered, else its objective glyph (same shape as in play). */
export function TargetPicture({ brief, size }: { brief: MissionBrief; size: 'big' | 'small' }) {
  const url = useTargetPreview(brief.picture.model);
  const glyph = GLYPHS[brief.picture.glyph];
  return (
    <figure
      className={`mb-pic ${size}`}
      data-testid="mission-brief-picture"
      data-glyph={brief.picture.glyph}
      data-preview={url ? 'live' : 'glyph'}
    >
      {url ? (
        <img src={url} alt={brief.picture.label} draggable={false} />
      ) : (
        <GlyphIcon id={brief.picture.glyph} size={size === 'big' ? 72 : 40} title={glyph.name} />
      )}
      {/* the world pin the target wears in play: the same glyph on a gold tag */}
      <span className="mb-pin" aria-hidden>
        <GlyphIcon id={brief.picture.glyph} size={size === 'big' ? 18 : 12} />
      </span>
      <figcaption>{brief.picture.label}</figcaption>
    </figure>
  );
}

/** The blast pattern as a tiny grid: a cross along the row and column, or a round disc. */
function BlastDiagram({ rule }: { rule: MissionBrief['blastRule'] }) {
  const cells: { x: number; y: number; on: boolean }[] = [];
  for (let y = 0; y < 5; y++)
    for (let x = 0; x < 5; x++) {
      const dx = x - 2;
      const dy = y - 2;
      const on = rule === 'cross' ? dx === 0 || dy === 0 : dx * dx + dy * dy <= 5;
      cells.push({ x, y, on });
    }
  return (
    <svg className="mb-blast-grid" viewBox="0 0 50 50" width={34} height={34} aria-hidden data-rule={rule}>
      {cells.map((c) => (
        <rect
          key={`${c.x},${c.y}`}
          x={c.x * 10 + 1}
          y={c.y * 10 + 1}
          width={8}
          height={8}
          rx={1.5}
          className={c.x === 2 && c.y === 2 ? 'gen' : c.on ? 'on' : 'off'}
        />
      ))}
    </svg>
  );
}

export function MissionBriefCard({
  brief,
  compact = false,
  testId = 'mission-brief',
}: {
  brief: MissionBrief;
  compact?: boolean;
  testId?: string;
}) {
  if (compact)
    return (
      <section
        className="mb-card compact"
        data-testid={testId}
        data-kind={brief.kind}
        data-compact="yes"
        aria-label="Mission objective"
      >
        <TargetPicture brief={brief} size="small" />
        <div className="mb-text">
          <small className="mb-kicker">Objective</small>
          <b className="mb-objective" data-testid="mission-brief-objective">
            {brief.objective.line}
          </b>
          <span className="mb-compact" data-testid="mission-brief-compact">
            {brief.compact}
          </span>
        </div>
      </section>
    );
  return (
    <section
      className="mb-card"
      data-testid={testId}
      data-kind={brief.kind}
      data-compact="no"
      aria-label="Mission briefing"
    >
      <div className="mb-head">
        <TargetPicture brief={brief} size="big" />
        <div className="mb-text">
          <small className="mb-kicker">Objective</small>
          <b className="mb-objective" data-testid="mission-brief-objective">
            {brief.objective.line}
          </b>
          {brief.action.map((a) => (
            <p key={a} className="mb-action" data-testid="mission-brief-action">
              {a.startsWith(BLASTS_ONLY) ? (
                <>
                  <b className="mb-blasts">{BLASTS_ONLY}</b>
                  {a.slice(BLASTS_ONLY.length)}
                </>
              ) : (
                a
              )}
            </p>
          ))}
          <p className="mb-blast" data-testid="mission-brief-blast" data-rule={brief.blastRule}>
            <BlastDiagram rule={brief.blastRule} />
            <span>{brief.blast}</span>
          </p>
        </div>
      </div>
      {brief.legend.length > 0 && (
        <ul className="mb-legend" data-testid="mission-brief-legend">
          {brief.legend.map((l) => (
            <li key={l.tag} className={`mb-legend-${l.glyph}`}>
              <GlyphIcon id={l.glyph} size={20} />
              <b>{l.tag}</b>
              <span>{l.text}</span>
            </li>
          ))}
        </ul>
      )}
      {brief.exit && (
        <p className="mb-exit" data-testid="mission-brief-exit">
          <GlyphIcon id="exit" size={16} />
          {brief.exit}
        </p>
      )}
      <ol className="mb-steps" data-testid="mission-brief-steps">
        {brief.steps.map((s, i) => (
          <li key={`${i}:${s.text}`} className={s.main ? 'main' : undefined} data-blasts={s.blastsOnly ? 'yes' : 'no'}>
            <span className="mb-step-n">{i + 1}</span>
            <GlyphIcon id={s.glyph} size={14} />
            <span>{s.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
