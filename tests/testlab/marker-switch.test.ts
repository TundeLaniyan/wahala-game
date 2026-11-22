/**
 * The Test Lab's player-marker switch (docs/TEST_LAB.md, decision TL8): the founder saw no obvious difference between
 * the styles. The switch itself reached the renderer (the browser run showed `__WAHALA__.playerMarker()` follow every tap
 * and the Original chevron change to the Indicator plate); the Ground style was the invisible one (a 30 % tint at 0.34-0.54
 * opacity). These tests pin the wiring: one tap on the lab's switch, the HUD button cycle and the render module all agree,
 * and the three styles are three different pictures (tests/render/player-marker.test.ts draws them headlessly; the browser
 * pixels are compared in e2e/testlab.spec.ts).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_PLAYER_MARKER, playerMarkerMode, setPlayerMarkerMode } from '../../src/render/playerMarker';
import { MARKER_MODES, setMarker } from '../../src/testlab/labActions';
import { useLab } from '../../src/testlab/labStore';

afterEach(() => {
  setPlayerMarkerMode(DEFAULT_PLAYER_MARKER);
  useLab.setState({ marker: DEFAULT_PLAYER_MARKER });
});

describe('marker switch', () => {
  it('starts on the indicator in the lab and in the renderer (the ground style is never the default)', () => {
    expect(DEFAULT_PLAYER_MARKER).toBe('indicator');
    expect(useLab.getState().marker).toBe('indicator');
    expect(playerMarkerMode()).toBe('indicator');
  });

  it('every style the switch offers reaches the render module, and the lab state agrees', () => {
    expect(MARKER_MODES.map((m) => m.mode)).toEqual(['original', 'indicator', 'indicatorGround']);
    for (const { mode } of MARKER_MODES) {
      setMarker(mode);
      expect(playerMarkerMode()).toBe(mode);
      expect(useLab.getState().marker).toBe(mode);
    }
  });
});
