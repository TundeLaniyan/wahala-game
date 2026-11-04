/**
 * Fighter definitions (decision FC5): one `FighterDef` per fighter, the single place that says who a fighter is -
 * look, movement, attacks, traits, voice, introduction, stage, soundtrack, costumes and finisher. `CHARACTERS`
 * (`characters.ts`) still carries the three playable characters' rendering colours and legacy `skill`; the two are
 * kept consistent by `tests/fighters.test.ts`.
 *
 * WHAT IS WIRED. Everything the simulation reads is marked `wired: 'sim'` and comes from the config (the step time,
 * the attack numbers, `rewards.contactByCharacter`); anything not read by the simulation is `wired: 'proposal'`
 * (a trait designed but not implemented) or sits under a `presentation` key (look only). No invented stat.
 *
 * EXPERIMENTAL ROSTER. Three more fighters are DATA ONLY (`status: 'experimental'`). They are not `CharacterId`s, are
 * never selectable in the default build and appear only through `fighterRoster(true)` when the `experimentalContent`
 * flag (`src/platform/flags.ts`) is on. They reuse an existing rig (`rig`). All names are fictional archetypes of
 * Lagos street life: no real person, brand or likeness.
 *
 * Text and voice: short Nigerian Pidgin lines as TEXT (subtitles / toasts). There is no audio here and no TTS: the
 * founder's approved voice clips are added only through `tools/audio/voices/import_voices.py`.
 */
import { DEFAULT_CONFIG } from '../config';
import type { AttackKind, CharacterId } from '../types';
import { CHARACTERS } from './characters';

export type ExperimentalFighterId = 'conductor' | 'marketMama' | 'jettyBoatman';
export type FighterId = CharacterId | ExperimentalFighterId;
export type FighterStatus = 'playable' | 'experimental';

/** A trait or ability. `sim` = the simulation implements it today; `proposal` = designed, not implemented. */
export interface FighterTrait {
  id: string;
  name: string;
  description: string;
  wired: 'sim' | 'proposal';
}

export interface FighterCostume {
  /** Stable id for saves / the render layer (presentation data only). */
  id: string;
  name: string;
  description: string;
}

export interface FighterDef {
  id: FighterId;
  status: FighterStatus;
  /** The playable character whose 3D rig (and, for experimental fighters, sim identity) this fighter uses. */
  rig: CharacterId;
  name: string;
  tagline: string;
  appearance: {
    /** What the fighter looks like, in one paragraph (the brief for the art pipeline). */
    description: string;
    /** The Nigerian cultural styling that informs the clothes, hair and props. */
    culturalStyling: string;
    /** Props / accessories the model should carry. */
    accessories: readonly string[];
  };
  movement: {
    /** Ticks per tile at speed level 0: read from the config, identical for every fighter (no per-fighter step stat exists). */
    baseStepTicks: number;
    wired: 'sim';
    /** PRESENTATION ONLY: how the walk cycle is drawn. Never read by the simulation. */
    presentation: { stride: string; idle: string };
  };
  primaryAttack: AttackKind;
  /** Thrown by B at range / as a follow-up when `config.skills.secondaryAttacks` is on (see actions.ts). */
  secondaryAttack: AttackKind | null;
  specialAbility: FighterTrait;
  passiveTrait: FighterTrait;
  personality: {
    archetype: string;
    /** Short Pidgin lines as TEXT only (no audio, no TTS): subtitles, toasts, the fighter screen. */
    lines: { intro: string; taunt: string; hit: string; hurt: string; win: string; lose: string };
  };
  introduction: { title: string; text: string };
  /** An existing arena id (`src/sim/arenas`). */
  stage: string;
  /** `arena:<id>` = the signature track `public/audio/music/manifest.json` assigns that arena. No music is added here. */
  soundtrack: string;
  costumes: readonly FighterCostume[];
  /** An id for the finishing sequence the render layer plays after the last elimination (art not made yet: see docs). */
  finisher: string;
}

const STEP = DEFAULT_CONFIG.movement.stepTicksBySpeedLevel[0]!;

const SECONDARY_NOTE =
  'Used by B only when `config.skills.secondaryAttacks` is on (off in the deployed game, decision FC5), by missions and by tests.';

const FIGHTERS_BY_ID: Readonly<Record<FighterId, FighterDef>> = {
  streetBaller: {
    id: 'streetBaller',
    status: 'playable',
    rig: 'streetBaller',
    name: CHARACTERS.streetBaller.name,
    tagline: CHARACTERS.streetBaller.tagline,
    appearance: {
      description:
        'Lean, quick teenager in a green-and-white football jersey, taped ankles, scuffed boots and a towel round the neck: the kid who plays on every dusty pitch in the estate and never lets the ball touch the ground.',
      culturalStyling:
        'Green-white-green of the national flag on the jersey (a fictional club crest, no real club), sweatband, estate-pitch dust on the shorts; a smile that says the match is already won.',
      accessories: ['sweatband', 'towel', 'taped ankles', 'worn football boots'],
    },
    movement: {
      baseStepTicks: STEP,
      wired: 'sim',
      presentation: { stride: 'bouncy toe-run', idle: 'juggles an invisible ball' },
    },
    primaryAttack: 'push',
    secondaryAttack: 'kick',
    specialAbility: {
      id: 'streetBaller.openingKick',
      name: 'Long Leg',
      description: `A rival exactly two tiles away in the faced line is met with a Kick. ${SECONDARY_NOTE}`,
      wired: 'sim',
    },
    passiveTrait: {
      id: 'streetBaller.boots',
      name: 'Football Boots',
      description:
        'When an elimination pays the contact reward and you hold no contact ability, you get Football Boots (kick generators).',
      wired: 'sim',
    },
    personality: {
      archetype: 'The quick, cheeky striker',
      lines: {
        intro: 'Ball don land, wahala don start!',
        taunt: 'You no fit catch me, oga!',
        hit: 'Take am, na penalty!',
        hurt: 'Foul! Referee!',
        win: 'Champion of the street!',
        lose: 'Next match, I go carry am.',
      },
    },
    introduction: {
      title: 'The Estate Striker',
      text: 'Street Baller came up on the dusty pitch behind the bus park. He is fast, he is cheeky, and his jab lands before you finish blinking.',
    },
    stage: 'surulerePowerYard',
    soundtrack: 'arena:surulerePowerYard',
    costumes: [
      { id: 'home', name: 'Home Kit', description: 'The green-and-white jersey (the canonical look).' },
      { id: 'away', name: 'Away Kit', description: 'A white jersey with green trim and a black sweatband.' },
      { id: 'training', name: 'Training Bib', description: 'A numbered yellow bib over a plain tee.' },
    ],
    finisher: 'finisher.streetBaller.bicycleKick',
  },
  lekkiBoy: {
    id: 'lekkiBoy',
    status: 'playable',
    rig: 'lekkiBoy',
    name: CHARACTERS.lekkiBoy.name,
    tagline: CHARACTERS.lekkiBoy.tagline,
    appearance: {
      description:
        'Broad-shouldered and unhurried, in a blue bomber jacket with pink piping, shades pushed up on a fresh fade, a gold chain and clean white sneakers: money does not run, it walks.',
      culturalStyling:
        'Island-money streetwear: a bomber with embroidered Adire-pattern cuffs, a cap-sleeve tee, a chain and a wristwatch; every outfit pressed and every shoe spotless.',
      accessories: ['sunglasses', 'gold chain', 'wristwatch', 'white sneakers'],
    },
    movement: {
      baseStepTicks: STEP,
      wired: 'sim',
      presentation: { stride: 'easy swagger', idle: 'adjusts the shades' },
    },
    primaryAttack: 'daze',
    secondaryAttack: 'bottle',
    specialAbility: {
      id: 'lekkiBoy.bottleService',
      name: 'Bottle Service',
      description: `When the Daze Punch is recovering, B next to a rival swings a Bottle Strike (once every ten seconds). ${SECONDARY_NOTE}`,
      wired: 'sim',
    },
    passiveTrait: {
      id: 'lekkiBoy.gloves',
      name: 'Mechanic Gloves',
      description:
        'When an elimination pays the contact reward and you hold no contact ability, you get Mechanic Gloves (punch generators).',
      wired: 'sim',
    },
    personality: {
      archetype: 'The calm big spender',
      lines: {
        intro: 'Relax, I don pay for this fight.',
        taunt: 'Abeg, no scatter my jacket.',
        hit: 'That one na VIP treatment.',
        hurt: 'Ehn? Who sabi do that?',
        win: 'Na so we dey do am for Lekki.',
        lose: 'Na small thing, I go return.',
      },
    },
    introduction: {
      title: 'The Island Heavy',
      text: 'Lekki Boy never rushes. His punch is slow, you see it coming, and still it flattens whoever stays to watch.',
    },
    stage: 'lekkiRoadworks',
    soundtrack: 'arena:lekkiRoadworks',
    costumes: [
      {
        id: 'bomber',
        name: 'Blue Bomber',
        description: 'The blue jacket with pink piping (the canonical look).',
      },
      {
        id: 'agbada',
        name: 'Light Agbada',
        description: 'A short, light agbada over jeans, in cream with blue embroidery.',
      },
      { id: 'weekend', name: 'Weekend Linen', description: 'A linen shirt and shorts for the beach road.' },
    ],
    finisher: 'finisher.lekkiBoy.victoryPose',
  },
  campusQueen: {
    id: 'campusQueen',
    status: 'playable',
    rig: 'campusQueen',
    name: CHARACTERS.campusQueen.name,
    tagline: CHARACTERS.campusQueen.tagline,
    appearance: {
      description:
        'Poised and quick-witted, in a purple Ankara-print jacket with gold trim, knotless braids, white sneakers and a satchel of lecture notes: the one who finishes the argument and the exam.',
      culturalStyling:
        'Campus fashion in Ankara prints, braids wrapped in a gold scarf, a faculty-colour lanyard (fictional faculty); confident, a little theatrical.',
      accessories: ['satchel', 'lanyard', 'gold hair wrap', 'white sneakers'],
    },
    movement: {
      baseStepTicks: STEP,
      wired: 'sim',
      presentation: { stride: 'quick sashay', idle: 'checks her phone, then glares' },
    },
    primaryAttack: 'shove',
    secondaryAttack: 'sweep',
    specialAbility: {
      id: 'campusQueen.cutDown',
      name: 'Cut Down To Size',
      description: `When the Shove is recovering, B next to a rival sweeps their legs: they limp for four seconds. ${SECONDARY_NOTE}`,
      wired: 'sim',
    },
    passiveTrait: {
      id: 'campusQueen.killSwitch',
      name: 'Kill Switch',
      description:
        'When an elimination pays the contact reward and you hold no contact ability, you get the Kill Switch (disarm generators).',
      wired: 'sim',
    },
    personality: {
      archetype: 'The sharp, unbothered scholar',
      lines: {
        intro: 'Class is in session.',
        taunt: 'You dey form? I get lecture.',
        hit: 'Sit down, na attendance.',
        hurt: 'Who sabi? Na ambush!',
        win: 'First class, as expected.',
        lose: 'I go resit. Watch me.',
      },
    },
    introduction: {
      title: 'The Faculty Terror',
      text: 'Campus Queen reads the board before she moves. A shove at the right moment puts you right where the fire is going.',
    },
    stage: 'yabaAfterDark',
    soundtrack: 'arena:yabaAfterDark',
    costumes: [
      {
        id: 'ankara',
        name: 'Ankara Jacket',
        description: 'The purple Ankara-print jacket (the canonical look).',
      },
      {
        id: 'convocation',
        name: 'Convocation Gown',
        description: 'A black gown with a gold sash and a mortarboard.',
      },
      { id: 'sports', name: 'Faculty Sports', description: 'A purple tracksuit with the faculty crest.' },
    ],
    finisher: 'finisher.campusQueen.curtsey',
  },

  // ------------------------------------------------------------------ experimental roster (data only)
  conductor: {
    id: 'conductor',
    status: 'experimental',
    rig: 'streetBaller',
    name: 'Danfo Conductor',
    tagline: 'Headbutt + Elbow',
    appearance: {
      description:
        'A wiry bus conductor in a faded yellow-and-black striped shirt, rolled sleeves, a wad of notes in one fist and a hoarse voice from calling the route all day.',
      culturalStyling:
        'The yellow-and-black danfo livery as clothing, a canvas money pouch, a rolled-up route list; hangs from the door of a moving bus without a thought.',
      accessories: ['money pouch', 'rolled route list', 'worn sandals'],
    },
    movement: {
      baseStepTicks: STEP,
      wired: 'sim',
      presentation: { stride: 'hurried lean', idle: 'counts notes' },
    },
    primaryAttack: 'headbutt',
    secondaryAttack: 'elbow',
    specialAbility: {
      id: 'conductor.squeeze',
      name: 'Squeeze In',
      description:
        'When the Headbutt is recovering, B next to a rival throws an Elbow Check (hard on a rival who is winding up).',
      wired: 'sim',
    },
    passiveTrait: {
      id: 'conductor.routeCaller',
      name: 'Route Caller',
      description:
        'DESIGN ONLY: the crowd cheers louder near this fighter (audio flavour). Nothing in the simulation reads it.',
      wired: 'proposal',
    },
    personality: {
      archetype: 'The loud, tireless hustler',
      lines: {
        intro: 'Oshodi! Oshodi! Enter, enter!',
        taunt: 'Chance dey, but no for you!',
        hit: 'Pay your fare!',
        hurt: 'Driver, stop for me!',
        win: 'Last stop. Everybody comot!',
        lose: 'Next bus go come.',
      },
    },
    introduction: {
      title: 'Last Seat In The Danfo',
      text: 'He fits more people in a bus than the law allows and more fight into a tile than you expect.',
    },
    stage: 'oshodiInterchange',
    soundtrack: 'arena:oshodiInterchange',
    costumes: [
      {
        id: 'stripes',
        name: 'Livery Shirt',
        description: 'The yellow-and-black stripes (the canonical look).',
      },
      { id: 'rainy', name: 'Rainy Day', description: 'A plastic poncho over the shirt.' },
    ],
    finisher: 'finisher.conductor.doorSlap',
  },
  marketMama: {
    id: 'marketMama',
    status: 'experimental',
    rig: 'campusQueen',
    name: 'Market Mama',
    tagline: 'Punch + Bottle',
    appearance: {
      description:
        'A sturdy, sharp-eyed trader in a matching wrapper and blouse, gele tied high, a coin purse at the waist and a crate of soft drinks she guards like a bank.',
      culturalStyling:
        'Iro and buba in bold Ankara with a gele headtie, a wrapper tucked tight for the market; commands a whole row of stalls with one look.',
      accessories: ['gele', 'coin purse', 'drinks crate', 'sandals'],
    },
    movement: {
      baseStepTicks: STEP,
      wired: 'sim',
      presentation: { stride: 'purposeful march', idle: 'counts change' },
    },
    primaryAttack: 'push',
    secondaryAttack: 'bottle',
    specialAbility: {
      id: 'marketMama.lastBottle',
      name: 'Last Bottle',
      description:
        'When the Punch is recovering, B next to a rival swings a Bottle Strike (once every ten seconds).',
      wired: 'sim',
    },
    passiveTrait: {
      id: 'marketMama.haggle',
      name: 'Haggle',
      description:
        'DESIGN ONLY: a pickup she walks over is worth one extra tick of effect. Nothing in the simulation reads it.',
      wired: 'proposal',
    },
    personality: {
      archetype: 'The market boss who sees everything',
      lines: {
        intro: 'You wan buy or you wan fight?',
        taunt: 'Last price, no bargain!',
        hit: 'Na my change you break!',
        hurt: 'Thief! Hold am!',
        win: 'Business closed. Go home.',
        lose: 'I go open pass before.',
      },
    },
    introduction: {
      title: 'Mama Of The Whole Row',
      text: 'Nobody has ever won an argument with her, and the ones who tried with fists are still sitting down.',
    },
    stage: 'balogunMarket',
    soundtrack: 'arena:balogunMarket',
    costumes: [
      {
        id: 'ankara',
        name: 'Wrapper And Blouse',
        description: 'The bold Ankara set with a gele (the canonical look).',
      },
      { id: 'sunday', name: 'Sunday Best', description: 'A lace set with a gold gele.' },
    ],
    finisher: 'finisher.marketMama.countCash',
  },
  jettyBoatman: {
    id: 'jettyBoatman',
    status: 'experimental',
    rig: 'lekkiBoy',
    name: 'Jetty Boatman',
    tagline: 'Shove + Kick',
    appearance: {
      description:
        'A weathered boatman in a sleeveless vest, rolled trousers and rubber boots, a long paddle across his back and a rope coiled over the shoulder.',
      culturalStyling:
        'Lagoon-side work clothes: a faded vest, a woven cap, rope bracelets, boots stained green from the water; moves like the ground is always rocking.',
      accessories: ['paddle', 'coiled rope', 'woven cap', 'rubber boots'],
    },
    movement: {
      baseStepTicks: STEP,
      wired: 'sim',
      presentation: { stride: 'rolling gait', idle: 'looks at the water' },
    },
    primaryAttack: 'shove',
    secondaryAttack: 'kick',
    specialAbility: {
      id: 'jettyBoatman.pushOff',
      name: 'Push Off',
      description:
        'A rival exactly two tiles away in the faced line is met with a Kick, like pushing a boat off the jetty.',
      wired: 'sim',
    },
    passiveTrait: {
      id: 'jettyBoatman.seaLegs',
      name: 'Sea Legs',
      description: 'DESIGN ONLY: shorter slip on oil. Nothing in the simulation reads it.',
      wired: 'proposal',
    },
    personality: {
      archetype: 'The patient, immovable boatman',
      lines: {
        intro: 'The water no dey rush.',
        taunt: 'Na the tide go carry you.',
        hit: 'Go meet the lagoon!',
        hurt: 'Boat don tilt!',
        win: 'Another one don cross.',
        lose: 'The lagoon go remember.',
      },
    },
    introduction: {
      title: 'Master Of The Jetty',
      text: 'He has pushed a thousand boats from the shore. A rival is just a lighter boat.',
    },
    stage: 'lagoonJetty',
    soundtrack: 'arena:lagoonJetty',
    costumes: [
      { id: 'vest', name: 'Work Vest', description: 'The weathered vest and boots (the canonical look).' },
      { id: 'festival', name: 'Regatta Day', description: 'A white singlet with a red sash.' },
    ],
    finisher: 'finisher.jettyBoatman.paddleSalute',
  },
};

/** The fighter definition for `id` (every `FighterId` has one). */
export function getFighter(id: FighterId): FighterDef {
  return FIGHTERS_BY_ID[id];
}

/** Whether `id` names a fighter definition (playable or experimental). */
export const isFighterId = (id: string): id is FighterId => Object.hasOwn(FIGHTERS_BY_ID, id);

/**
 * The roster in menu order: the three playable fighters, then (only when `includeExperimental`, i.e. the
 * `experimentalContent` flag is on) the experimental ones. The default build calls this with `false`.
 */
export function fighterRoster(includeExperimental = false): readonly FighterDef[] {
  const all = Object.values(FIGHTERS_BY_ID);
  return includeExperimental ? all : all.filter((f) => f.status === 'playable');
}

/** The attacks a playable character throws by default: always the primary; the secondary only when the config allows it. */
export function defaultAttacks(
  id: FighterId,
  secondaryAttacks: boolean,
): { primary: AttackKind; secondary: AttackKind | null } {
  const f = getFighter(id);
  return { primary: f.primaryAttack, secondary: secondaryAttacks ? f.secondaryAttack : null };
}
