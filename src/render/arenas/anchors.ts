/**
 * Map identity: the three most recognisable visual anchors of each City Rumble area (presentation only; docs/MAP_IDENTITY.md).
 * Campaign briefings and review tools read this table, so the names are FICTIONAL / generic (no real business, brand, bank,
 * operator or private person; public street and place names are allowed as street signs).
 *
 * Every anchor is drawn by the art module named in `ANCHOR_MODULES`. Anchors built as set pieces (off the board) tag one of
 * their meshes with `userData.anchor = id` through `tagAnchor`; anchors that are part of the board cover (a facade, a plaza
 * object, a floor painting) are referenced by id in their module's source (`anchor: <id>` comment next to the code), which
 * `tests/render/map-anchors.test.ts` checks. The anchor id is stable: briefings cite it.
 */
import type { Object3D } from 'three';

export interface MapAnchor {
  /** Stable id, `<area>-<feature>`. */
  id: string;
  /** Fictional / generic display name used by briefings. */
  name: string;
  /** What it is, where it stands and how the gameplay camera sees it. */
  note: string;
}

export type MapAnchorTriple = readonly [MapAnchor, MapAnchor, MapAnchor];

export const MAP_ANCHORS: Readonly<Record<string, MapAnchorTriple>> = {
  rumbleOjuelegba: [
    {
      id: 'ojuelegba-flyover',
      name: 'Underbridge Flyover',
      note: 'The long concrete box-girder flyover on tall piers with mural panels and black-and-white footings, north of the board.',
    },
    {
      id: 'ojuelegba-link-bridges',
      name: 'Blue-Roofed Link Bridges',
      note: 'Two covered pedestrian bridges across the through-road mouths, blue roofs on concrete legs with stairs.',
    },
    {
      id: 'ojuelegba-direction-gantry',
      name: 'Direction Gantry',
      note: 'The green road-sign gantry over the flyover naming Yaba, Mushin, Surulere (place names only).',
    },
  ],
  rumbleOshodi: [
    {
      id: 'oshodi-terminal-canopy',
      name: 'Interchange Terminal Canopy',
      note: 'The deep concrete canopy on tall columns over the bus bays, a lit glass hall and the big INTERCHANGE fascia.',
    },
    {
      id: 'oshodi-skywalk',
      name: 'Covered Skywalk',
      note: 'Two covered pedestrian spans from the terminal to the station tower on round piers, over the north edge.',
    },
    {
      id: 'oshodi-rail-viaduct',
      name: 'Rail Viaduct and Railcar',
      note: 'The commuter railway leaving the board portal onto a viaduct, with the telegraphed railcar crossing.',
    },
  ],
  rumbleMushin: [
    {
      id: 'mushin-red-line-station',
      name: 'Red Line Station',
      note: 'Green flat roof over a red-and-white fascia with the MUSHIN name plate, on the viaduct with a white-and-red train, north of the board.',
    },
    {
      id: 'mushin-footbridge',
      name: 'Red Line Footbridge',
      note: 'A steel footbridge with a red-and-white fascia and stairs over the main road, beyond the west road mouth.',
    },
    {
      id: 'mushin-idi-oro-hall',
      name: 'Idi-Oro Fresh Food Hall',
      note: 'The produce hall in the transit square: green roof on columns, painted produce-mural board, green crates.',
    },
  ],
  rumbleFadeyi: [
    {
      id: 'fadeyi-footbridge',
      name: 'Highway Footbridge',
      note: 'A concrete footbridge with railed deck, stair towers and a BRT sign panel across the highway at the east mouth.',
    },
    {
      id: 'fadeyi-brt-lane',
      name: 'BRT Centreline',
      note: 'The blue BRT lane between concrete medians, painted BRT words, shelters and zebra crossings.',
    },
    {
      id: 'fadeyi-bank-frontage',
      name: 'White Frontage Block',
      note: 'The three-storey white-and-beige frontage with blue windows beside older plastered blocks.',
    },
  ],
  rumbleLagosIsland: [
    {
      id: 'lagos-cathedral',
      name: 'Old Eko Cathedral',
      note: 'A fictional grey neo-gothic cathedral: pointed-arch front, rose window, buttresses, pinnacles and a clock tower, north of the civic square.',
    },
    {
      id: 'lagos-civic-dome',
      name: 'Eko Civic Hall Dome',
      note: 'A fictional pale civic hall with a drum and copper-green dome and a columned portico, on the civic square edge.',
    },
    {
      id: 'lagos-textile-maze',
      name: 'Textile Stall Maze',
      note: 'The Balogun-style cloth stalls under coloured umbrellas and bales in the west half of the board.',
    },
  ],
  rumbleLekki: [
    {
      id: 'lekki-link-bridge',
      name: 'Lagoon Link Bridge',
      note: 'A fictional cable-stayed bridge across the lagoon: a white H pylon with fanned stay cables over a lamp-lit deck, close behind the promenade seawall.',
    },
    {
      id: 'lekki-admiralty-way',
      name: 'Admiralty Way',
      note: 'The street-name plates and painted road lettering of the north-south boulevard that ends at the plaza (public street name, no business replicas).',
    },
    {
      id: 'lekki-lit-plaza',
      name: 'Illuminated Plaza Fountain',
      note: 'A fictional lit fountain with a ring of lights and a paved light-ring medallion, centre of the paved plaza.',
    },
  ],
  rumbleEbuteMetta: [
    {
      id: 'ebute-station-sign',
      name: 'Station Name Plate',
      note: 'A large EBUTE-METTA station name plate on the station hall canopy, and the platform signs.',
    },
    {
      id: 'ebute-signal-gantry',
      name: 'Signal Gantry',
      note: 'A steel signal gantry with colour-light heads straddling the rail lines beside the board.',
    },
    {
      id: 'ebute-rail-yard',
      name: 'Working Rail Yard',
      note: 'Ballasted tracks between solid portals, freight wagons and the signal cabin.',
    },
  ],
};

/** Which art module (file name in `src/render/arenas/`) draws each anchor: the test reads that file for the anchor id. */
export const ANCHOR_MODULES: Readonly<Record<string, string>> = {
  'ojuelegba-flyover': 'ojuelegbaLandmarks.ts',
  'ojuelegba-link-bridges': 'ojuelegbaLandmarks.ts',
  'ojuelegba-direction-gantry': 'ojuelegbaLandmarks.ts',
  'oshodi-terminal-canopy': 'oshodiMetroTerminal.ts',
  'oshodi-skywalk': 'oshodiMetroTerminal.ts',
  'oshodi-rail-viaduct': 'oshodiMetroLandmarks.ts',
  'mushin-red-line-station': 'mushinArt.ts',
  'mushin-footbridge': 'mushinArt.ts',
  'mushin-idi-oro-hall': 'mushinArt.ts',
  'fadeyi-footbridge': 'fadeyiArt.ts',
  'fadeyi-brt-lane': 'fadeyiArt.ts',
  'fadeyi-bank-frontage': 'fadeyiArt.ts',
  'lagos-cathedral': 'lagosIslandArt.ts',
  'lagos-civic-dome': 'lagosIslandArt.ts',
  'lagos-textile-maze': 'lagosIslandArt.ts',
  'lekki-link-bridge': 'lekkiBridge.ts',
  'lekki-admiralty-way': 'lekkiArt.ts',
  'lekki-lit-plaza': 'lekkiArt.ts',
  'ebute-station-sign': 'ebuteMettaArt.ts',
  'ebute-signal-gantry': 'ebuteMettaArt.ts',
  'ebute-rail-yard': 'ebuteMettaArt.ts',
};

/** Marks an Object3D as the root / a part of an anchor (set pieces only; the id must be in `MAP_ANCHORS`). */
export function tagAnchor<T extends Object3D>(o: T, id: string): T {
  o.userData.anchor = id;
  return o;
}
