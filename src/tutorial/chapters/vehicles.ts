/**
 * The vehicle lesson: collect a Vehicle Voucher, activate the signature vehicle, select a glowing
 * legal entrance, preview the route, confirm, and (Keke only) select the turn. The demo drives the
 * real vehicle-entry selector with the same commands a player uses (vehicle button, arrows / D-pad,
 * tapping a marker, confirm).
 */
import { CHARACTERS, VEHICLE_DEFS } from '../../sim';
import type { CharacterId, VehicleEntry, VehicleTurn } from '../../sim';
import { collected, eventCheck } from '../practice';
import { place, ui, untilEvent, untilNoFlames, wait, walk } from '../script';
import { PRACTICE_CONFIG, crate, pickup, scenario } from '../setup';
import type { Chapter } from '../types';

/** The demo's chosen entrance (left wall, row 4, driving right) and the Keke's turn (down at column 8). */
export const DEMO_ENTRY: VehicleEntry = { x: 0, y: 4, dir: 'right' };
export const DEMO_TURN: VehicleTurn = { atIndex: 8, dir: 'down' };

const vehicleLine = (id: CharacterId): string => {
  const c = CHARACTERS[id];
  const v = VEHICLE_DEFS[c.vehicle];
  return `${c.name}: ${v.name}. ${v.description}.`;
};

/** Waits until the launched vehicle has driven off the far edge. */
const untilVehicleGone = untilEvent('vehicleExited', () => true, 600);

export const VEHICLE: Chapter = {
  id: 'vehicle',
  title: 'Vehicle attack',
  summary: 'Voucher, entrance, route preview, launch, Keke turn.',
  facts: [
    "A Vehicle Voucher (found in crates) calls in YOUR character's own vehicle once.",
    ...(['streetBaller', 'lekkiBoy', 'campusQueen'] as CharacterId[]).map(vehicleLine),
    'Any border tile with a legal route glows as an entrance. You have 8 seconds to choose; the world keeps moving.',
    'Backing out or running out of time keeps your voucher.',
    'A 1.2 s warning (flashing lane, horn) comes before the vehicle drives. It can hit you too.',
    'Flames on its route damage a vehicle; damage adds up over separate blasts until it is wrecked.',
  ],
  controls: ['move', 'place', 'vehicle', 'entryChoose', 'entryConfirm', 'entryBack'],
  demo: {
    build() {
      const s = scenario({
        actors: [
          { name: 'YOU', characterId: 'campusQueen', at: [4, 8], facing: 'right' },
          { name: 'DUMMY', characterId: 'lekkiBoy', at: [8, 8], facing: 'left' },
          { name: 'DUMMY 2', characterId: 'streetBaller', at: [14, 0], facing: 'left' },
        ],
      });
      crate(s, 5, 8, 'voucher');
      crate(s, 2, 4);
      return s;
    },
    beats: [
      {
        step: 'Step 1 of 6',
        caption: 'Collect a Vehicle Voucher. They hide in crates, so blast one open.',
        acts: {
          0: [
            wait(30),
            place,
            walk('up', 2),
            walk('left', 1),
            untilEvent('pickupRevealed'),
            untilNoFlames,
            walk('right', 1),
            walk('down', 2),
            walk('right', 1),
          ],
        },
      },
      {
        step: 'Step 1 of 6',
        caption: "Got it! The voucher calls in your own vehicle. Campus Queen's is the Keke.",
        hold: 200,
      },
      {
        step: 'Step 2 of 6',
        caption: 'Press VEHICLE to start choosing where it comes in.',
        acts: { 0: [wait(30), ui({ kind: 'vehiclePress' }), wait(30)] },
        hold: 70,
      },
      {
        step: 'Step 3 of 6',
        caption: 'Every glowing arrow on the border is a legal entrance. Move between them.',
        acts: {
          0: [
            ui({ kind: 'nav', command: 'right' }),
            wait(30),
            ui({ kind: 'nav', command: 'down' }),
            wait(30),
          ],
        },
        hold: 90,
      },
      {
        step: 'Step 4 of 6',
        caption: "The highlighted lane previews its route. Pick an entrance that crosses your rival's path.",
        acts: { 0: [ui({ kind: 'pickEntry', entry: DEMO_ENTRY }), wait(80)] },
        hold: 90,
      },
      {
        step: 'Step 5 of 6',
        caption: 'Confirm the entrance.',
        acts: { 0: [ui({ kind: 'nav', command: 'confirm' }), wait(40)] },
        hold: 50,
      },
      {
        step: 'Step 6 of 6',
        caption: 'The Keke turns exactly once: choose the turn, then launch.',
        acts: {
          0: [
            ui({ kind: 'nav', command: 'left' }),
            wait(30),
            ui({ kind: 'pickTurn', turn: DEMO_TURN }),
            wait(50),
            ui({ kind: 'nav', command: 'confirm' }),
          ],
        },
        hold: 100,
      },
      {
        caption:
          'Launched! The lane flashes and the horn sounds for 1.2 s, then it drives. Keep off its route yourself.',
        acts: { 0: [untilEvent('vehicleLaunched'), untilVehicleGone] },
      },
      {
        caption:
          'Danfo and Yellow Cab drive straight, so they skip the turn step. Flames on the route damage a vehicle.',
        hold: 260,
      },
    ],
  },
  practice: {
    goal: 'Collect the voucher and launch your vehicle.',
    hint: 'Press VEHICLE, choose a glowing entrance, confirm (Keke: then choose the turn and confirm again).',
    characterChoice: true,
    build: (c) => {
      const s = scenario({
        actors: [
          { name: 'YOU', characterId: c, at: [0, 10], facing: 'right' },
          {
            name: 'DUMMY',
            characterId: c === 'lekkiBoy' ? 'streetBaller' : 'lekkiBoy',
            at: [8, 6],
            facing: 'left',
          },
        ],
        config: PRACTICE_CONFIG,
      });
      pickup(s, 2, 10, 'voucher');
      crate(s, 4, 4);
      crate(s, 10, 8);
      return s;
    },
    checks: (c) => [
      collected('Collect the Vehicle Voucher', 'voucher'),
      eventCheck(
        'Press VEHICLE to start choosing',
        'vehicleEntryBegan',
        (e, ctx) => e.playerId === ctx.localId,
      ),
      eventCheck(
        CHARACTERS[c].vehicle === 'keke'
          ? "Pick an entrance and the Keke's turn, then launch"
          : `Pick an entrance and launch the ${VEHICLE_DEFS[CHARACTERS[c].vehicle].name}`,
        'vehicleWarning',
        (e, ctx) => e.ownerId === ctx.localId,
      ),
    ],
  },
};
