import { describe, expect, it } from 'vitest';
import { createSave } from '../../src/campaign';
import { currentMission, STYLE_LABEL } from '../../src/ui/campaign/currentMission';

describe('Story Campaign current-mission strip', () => {
  it('names the district, the mission and its objective from the real content for a new save', () => {
    const cur = currentMission(createSave(1));
    expect(cur).not.toBeNull();
    expect(cur!.districtName).toMatch(/Oshodi/);
    expect(cur!.missionName.length).toBeGreaterThan(0);
    expect(cur!.objective.length).toBeGreaterThan(0);
    expect(cur!.finale).toBe(false);
  });

  it('distinguishes open-field 3D missions from Junction Blast raids (campaign is not Classic-only)', () => {
    expect(STYLE_LABEL.field).toMatch(/Open-field 3D/);
    expect(STYLE_LABEL.raid).toMatch(/Junction Blast/);
    expect(STYLE_LABEL.field).not.toMatch(/Classic/);
    const cur = currentMission(createSave(1))!;
    expect(cur.style).toBe(STYLE_LABEL[cur.format]);
  });
});
