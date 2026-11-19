/**
 * The briefing card (ui/campaign/MissionBriefCard.tsx, decision MG1): static render of a field mission, a raid and the
 * compact replay card. The picture falls back to the objective glyph without WebGL (as here), the blasts-only phrase is
 * marked, a raid has its legend and exit line, the compact card is the picture and one line.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { missionBrief, raidBrief } from '../../src/app/missionBrief';
import { MissionBriefCard } from '../../src/ui/campaign/MissionBriefCard';

const html = (props: Parameters<typeof MissionBriefCard>[0]): string =>
  renderToStaticMarkup(createElement(MissionBriefCard, props));

describe('MissionBriefCard', () => {
  it('a field mission: the picture, one objective, the blasts phrase, the blast pattern and the steps', () => {
    const b = missionBrief('oshodi.railEdge')!;
    const out = html({ brief: b });
    expect(out).toContain('data-compact="no"');
    expect(out).toContain('data-preview="glyph"'); // no WebGL in the test: the glyph is the picture
    expect(out).toContain('data-glyph="equipment"');
    expect(out).toContain('DESTROY 3 RELAY BOXES');
    expect(out).toContain('<b class="mb-blasts">USE GENERATOR BLASTS</b>');
    expect(out).toContain('data-rule="radial"');
    expect(out).toContain('ROUND BLASTS');
    expect((out.match(/<li /g) ?? []).length).toBe(b.steps.length);
    expect(out).not.toContain('mission-brief-legend');
  });

  it('a raid: cross blasts, the legend of target / obstacle / exit, where the exit opens', () => {
    const out = html({ brief: raidBrief('warehouseDispatchDepot') });
    expect(out).toContain('DESTROY 3 MARKED CARGO');
    expect(out).toContain('data-rule="cross"');
    expect(out).toContain('CROSS-SHAPED BLASTS');
    expect(out).toContain('data-testid="mission-brief-legend"');
    expect(out).toContain('TARGET');
    expect(out).toContain('OBSTACLE');
    expect(out).toContain('data-testid="mission-brief-exit"');
    expect(out).toContain('south-east corner');
  });

  it('compact (a replay, the pause menu): the picture and one line', () => {
    const out = html({ brief: missionBrief('oshodi.railEdge')!, compact: true, testId: 'pause-mission-brief' });
    expect(out).toContain('data-testid="pause-mission-brief"');
    expect(out).toContain('data-compact="yes"');
    expect(out).toContain('DESTROY 3 RELAY BOXES · BLASTS ONLY');
    expect(out).not.toContain('mission-brief-steps');
    expect(out).not.toContain('mission-brief-action');
  });
});
