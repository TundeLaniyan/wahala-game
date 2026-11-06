// Capture plan for the story panels (docs/STORY_VISUALS.md). Read by scripts/story-shots.mjs; the output name of a shot is
// tools/story/masters/<id>.jpg, and tools/story/panels.py maps each shipped panel to its master and grade.
// Coordinates are board tiles [x, y, height-in-metres]; fov in degrees. `stage` moves competitors (players) for the shot:
// { id: number | 'boss' | 'crew:<k>', x, y, face, slot (outfit identity 0..31), char (character id) }; competitors that are
// not wanted in the frame are parked in a far corner with PARK().
//
// Boss panels are ARRIVAL compositions (identity shots, never a fight or a defeat): the boss stands in front of the district
// landmark with the entourage fanned around. The game has no boss costume art yet, so the boss wears the outfit identity
// (`slot`) whose colours are closest to the boss palette in `src/campaign/content/*.ts`; props the renderer cannot draw
// (kaftan, cap crest, mic, whistle) are not faked. The parameters of the three boss presentations the lead revises (Oshodi,
// Fadeyi, Ojuelegba) are the BOSS / FIGURE constants below: change them and re-run with --only to regenerate.
const DUSK = { fog: 0xc98a58, sun: 0xffb674, sunK: 1.1 };

/** Competitors that must not appear in a shot are parked in a corner far from every camera. */
const PARK = (ids, x = 2, y = 2) => ids.map((id, i) => ({ id, x: x + i * 0.4, y, face: 'down' }));
const ALL = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** The entourage offsets (tiles) around the boss: aides and followers stand in a V behind and beside him. */
const FAN = [
  [-1.9, -0.9],
  [1.9, -0.8],
  [-3.7, -1.8],
  [3.7, -1.7],
  [-0.9, -2.3],
  [1.0, -2.5],
];
/** The same people in a line along a lane (a market lane has no room to stand behind him). */
const LINE = [
  [-1.9, 0.15],
  [1.9, 0.2],
  [-3.8, 0.3],
  [3.8, 0.35],
  [-5.6, 0.4],
  [5.6, 0.45],
];
const arrival = (bx, by, slot, char, crewSlots = [], fan = FAN) => [
  { id: 'boss', x: bx, y: by + 0.8, face: 'down', slot, char },
  ...fan.map(([dx, dy], k) => ({
    id: `crew:${k}`,
    x: bx + dx,
    y: by + dy,
    face: 'down',
    slot: crewSlots[k % Math.max(1, crewSlots.length)] ?? 8 + k,
  })),
  { id: 0, x: 2, y: 2, face: 'down' },
];

// Outfit identities (src/assets/fighterIdentity.ts): slot 3 is the project's own `char_areaBoss` rig (the one boss model the
// game ships), so every boss is drawn with it; the crew wear other identities. Per-boss costumes do not exist yet (see
// docs/STORY_VISUALS.md), so the boss colour comes from the grade (panels.py), not from a faked outfit. `by` is where he stands;
// the camera sits `back` tiles south of him, low, looking a little past him.
const BOSS = {
  oshodi: { char: 'streetBaller', slot: 3, crew: [16, 9, 17, 10, 18, 11], bx: 18.6, by: 15.0, back: 4.7 },
  mushin: { char: 'campusQueen', slot: 3, crew: [10, 12, 15, 13, 21, 14], bx: 18.0, by: 31.0, back: 4.9 },
  fadeyi: {
    char: 'lekkiBoy',
    slot: 3,
    crew: [8, 12, 13, 4, 14, 20],
    bx: 25.4,
    by: 17.6,
    back: 4.4,
    h: 2.2,
    ah: 1.5,
    fov: 54,
  },
  ebute: {
    char: 'streetBaller',
    slot: 3,
    crew: [11, 19, 12, 20, 13, 21],
    bx: 33.2,
    by: 21.6,
    back: 4.8,
    h: 2.6,
    ah: 1.9,
  },
  island: {
    char: 'campusQueen',
    slot: 3,
    crew: [11, 19, 20, 12, 22, 13],
    bx: 44.8,
    by: 9.3,
    back: 5.8,
    h: 1.9,
    ah: 2.6,
    ay: -2.8,
  },
  lekki: {
    char: 'lekkiBoy',
    slot: 3,
    crew: [2, 11, 19, 20, 12, 21],
    bx: 19.0,
    by: 7.0,
    back: 6.4,
    h: 1.8,
    ah: 1.7,
  },
};
// the Ojuelegba local figure, Baba Junction: bright print shirt, two young conductors, a hawker (see district-ojuelegba)
const FIGURE = { slot: 5, crew: [1, 11, 6], bx: 24.8, by: 14.5 };

const bossShot = (name, scene, tod = 'day', look = DUSK) => {
  const b = BOSS[name];
  return {
    id: `boss-${name}`,
    scene,
    tod,
    look,
    stage: arrival(b.bx, b.by, b.slot, b.char, b.crew, b.line ? LINE : FAN),
    cam: {
      from: [b.bx + 1.2, b.by + b.back, b.h ?? 1.1],
      at: [b.bx - 0.2, b.by + (b.ay ?? -1.2), b.ah ?? 1.6],
      fov: b.fov ?? 44,
    },
  };
};

export const SHOTS = [
  // ---- district briefings (rumble stages: the district's own board, nobody else in the way)
  {
    id: 'district-ojuelegba',
    scene: 'rumble:rumbleOjuelegba',
    look: DUSK,
    stage: [
      { id: 1, x: FIGURE.bx, y: FIGURE.by, face: 'down', char: 'campusQueen', slot: FIGURE.slot },
      { id: 2, x: FIGURE.bx - 1.5, y: FIGURE.by + 0.5, face: 'down', slot: FIGURE.crew[0] },
      { id: 3, x: FIGURE.bx + 1.7, y: FIGURE.by + 0.4, face: 'down', slot: FIGURE.crew[1] },
      { id: 4, x: FIGURE.bx - 2.8, y: FIGURE.by + 1.0, face: 'down', slot: FIGURE.crew[2] },
      ...PARK([0, ...ALL(5, 11)]),
    ],
    cam: { from: [18.2, 20.8, 1.6], at: [24.6, 13.8, 2.0], fov: 44 },
  },
  {
    id: 'district-oshodi',
    scene: 'boss:oshodi',
    look: DUSK,
    stage: [],
    cam: { from: [22, 20, 4.5], at: [16, 8, 1.2], fov: 46 },
  },
  {
    id: 'district-mushin',
    scene: 'boss:mushin',
    look: DUSK,
    stage: [
      { id: 0, x: 23.8, y: 4.6, face: 'up', slot: 0 },
      { id: 1, x: 25.4, y: 4.9, face: 'up', slot: 0 },
      ...PARK(ALL(2, 11)),
    ],
    cam: { from: [26.5, 11.2, 3.6], at: [24.5, 3.4, 1.5], fov: 46 },
  },
  {
    id: 'district-fadeyi',
    scene: 'boss:fadeyiSomolu',
    look: DUSK,
    stage: [
      { id: 0, x: 22.2, y: 16.8, face: 'up', slot: 0 },
      { id: 1, x: 23.6, y: 17.2, face: 'up', slot: 0 },
      ...PARK(ALL(2, 11)),
    ],
    cam: { from: [29, 24, 4.5], at: [23, 12, 1.2], fov: 46 },
  },
  {
    id: 'district-ebute',
    scene: 'boss:ebuteMetta',
    look: DUSK,
    stage: [
      { id: 0, x: 32.4, y: 21.0, face: 'up', slot: 0 },
      { id: 1, x: 34.0, y: 21.3, face: 'up', slot: 0 },
      ...PARK(ALL(2, 11)),
    ],
    cam: { from: [37.0, 25.6, 4.4], at: [31.5, 17.0, 1.9], fov: 46 },
  },
  {
    id: 'district-island',
    scene: 'boss:lagosIsland',
    look: DUSK,
    stage: [
      { id: 0, x: 36.2, y: 7.6, face: 'up', slot: 0 },
      { id: 1, x: 37.6, y: 8.0, face: 'up', slot: 0 },
      ...PARK(ALL(2, 11)),
    ],
    cam: { from: [33, 13.5, 2.6], at: [36.5, 4.0, 2.2], fov: 44 },
  },
  {
    id: 'district-lekki',
    scene: 'boss:lekki',
    look: DUSK,
    stage: [
      { id: 0, x: 21.4, y: 5.8, face: 'up', slot: 0 },
      { id: 1, x: 23.2, y: 6.1, face: 'up', slot: 0 },
      ...PARK(ALL(2, 11)),
    ],
    cam: { from: [18.0, 9.5, 2.4], at: [22.0, 2.6, 2.4], fov: 46 },
  },

  // ---- the campaign opening and ending
  {
    id: 'finale',
    scene: 'boss:lekki',
    look: DUSK,
    stage: [
      { id: 0, x: 20.6, y: 5.4, face: 'up', slot: 0 },
      { id: 1, x: 22.0, y: 5.7, face: 'up', slot: 0, char: 'lekkiBoy' },
      { id: 2, x: 23.4, y: 5.4, face: 'up', slot: 0, char: 'campusQueen' },
      ...PARK(ALL(3, 11)),
    ],
    cam: { from: [18.4, 8.8, 1.7], at: [22.2, 3.2, 2.5], fov: 50 },
  },
  {
    id: 'ending',
    scene: 'rumble:rumbleOjuelegba',
    look: { fog: 0xe4b98a, sun: 0xffd9a0, sunK: 1.25 },
    stage: [
      { id: 0, x: 22.4, y: 16.6, face: 'up', slot: 0 },
      { id: 1, x: 23.9, y: 17.0, face: 'up', slot: 0, char: 'lekkiBoy' },
      { id: 2, x: 21.0, y: 17.1, face: 'up', slot: 0 },
      ...PARK(ALL(3, 11)),
    ],
    cam: { from: [21.6, 21.0, 1.3], at: [22.6, 14.0, 2.5], fov: 52 },
  },

  // ---- the prologue: the Ojuelegba underbridge at dusk, no staging
  {
    id: 'prologue',
    scene: 'rumble:rumbleOjuelegba',
    look: DUSK,
    stage: [],
    cam: { from: [19, 21, 2.2], at: [23, 13, 1.6], fov: 40 },
  },

  // ---- field and raid sections (thumbnails in the section list)
  {
    id: 'section-oshodi-approach',
    scene: 'field:oshodi.approach',
    look: DUSK,
    stage: [{ id: 0, x: 7.0, y: 41.0, face: 'right' }],
    cam: { from: [3.0, 45.4, 4.6], at: [16.0, 39.0, 1.0], fov: 52 },
  },
  {
    id: 'raid-warehouseDispatchDepot',
    scene: 'raid:warehouseDispatchDepot',
    look: DUSK,
    stage: [],
    cam: { from: [8.5, 15.6, 5.0], at: [8.5, 6.2, 0.6], fov: 44 },
  },
  {
    id: 'section-ebuteMetta-railYard',
    scene: 'raid:railYardGoods',
    look: DUSK,
    stage: [],
    cam: { from: [1.0, 14.5, 3.4], at: [9.0, 6.0, 0.7], fov: 52 },
  },

  // ---- boss introductions: arrival compositions on each district's mission board
  bossShot('oshodi', 'boss:oshodi'),
  bossShot('mushin', 'boss:mushin'),
  bossShot('fadeyi', 'boss:fadeyiSomolu'),
  bossShot('ebute', 'boss:ebuteMetta'),
  bossShot('island', 'boss:lagosIsland'),
  bossShot('lekki', 'boss:lekki'),
];
