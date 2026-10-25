/**
 * V2 generator-contact abilities. There is no button: a player who tries to MOVE into a tile holding a
 * grounded generator interacts with it through the one contact ability they have equipped:
 *
 * - kick:   the generator slides away along the move direction until it meets anything (Football Boots);
 * - punch:  the generator is struck and flies `contact.punchDistance` tiles over obstacles, landing on the
 *           first free tile from there (Mechanic Gloves). Shorter, arcing, ignores what is in between;
 * - disarm: the generator's timer / remote trigger is switched off for good (Kill Switch charges). It stays
 *           explosive to flame and vehicles (LOCKED);
 * - pass:   the player walks through the generator's tile (Generator Pass). No fire protection.
 *
 * With nothing equipped (or when the ability cannot act) Jump Sneakers still hop a single generator.
 * A short per-player cooldown stops one held direction from firing twice.
 */
import { DIR_VEC, OPPOSITE } from '../grid';
import type { Dir, GameState, Generator, Player, SimEvent } from '../types';
import { kickGenerator, punchGenerator, disarmGenerator } from './generators';
import { beginStep, canPlayerEnter } from './stepping';
import { groundedGeneratorAt, playerStepTicks } from './queries';

const cooldownOk = (state: GameState, p: Player): boolean => state.tick >= p.contactReadyTick;

function arm(state: GameState, p: Player): void {
  p.contactReadyTick = state.tick + state.config.contact.cooldownTicks;
}

/**
 * The player tried to step from their tile in `dir` onto `gen`'s tile. Returns true when something
 * happened (the move intent is spent).
 */
export function tryContact(
  state: GameState,
  p: Player,
  gen: Generator,
  dir: Dir,
  events: SimEvent[],
): boolean {
  const v = DIR_VEC[dir];
  const tx = p.x + v.dx;
  const ty = p.y + v.dy;
  if (p.contact && cooldownOk(state, p)) {
    let acted = false;
    switch (p.contact) {
      case 'kick':
        acted = kickGenerator(state, gen, dir, events);
        break;
      case 'punch':
        acted = punchGenerator(state, p, gen, dir, events);
        break;
      case 'disarm':
        acted = disarmGenerator(state, p, gen, events);
        break;
      case 'pass':
        if (canPlayerEnter(state, tx, ty, p)) {
          beginStep(p, tx, ty, playerStepTicks(state, p));
          acted = true;
        }
        break;
    }
    if (acted) {
      if (p.contact !== 'pass') arm(state, p);
      events.push({ type: 'contactUsed', playerId: p.id, ability: p.contact, generatorId: gen.id });
      return true;
    }
  }
  // Jump Sneakers: hop a single generator onto the free tile behind it.
  const lx = tx + v.dx;
  const ly = ty + v.dy;
  if (p.sneakers && state.tick >= p.jumpReadyTick && canPlayerEnter(state, lx, ly)) {
    p.jumpReadyTick = state.tick + state.config.movement.jumpCooldownTicks;
    beginStep(p, lx, ly, playerStepTicks(state, p) * 2);
    events.push({ type: 'playerJumped', playerId: p.id });
    return true;
  }
  return false;
}

/**
 * Read-only: would a move intent in `dir` do something for `p` right now - a step, or a contact /
 * jump on the generator in the way? (The inverted-controls curse is applied, as movement.ts does.)
 * The input layer's corner-turn buffer uses it to tell "blocked" from "walkable".
 */
export function moveWouldAct(state: GameState, p: Player, dir: Dir): boolean {
  const d = p.curse?.kind === 'inverted' && state.tick < p.curse.until ? OPPOSITE[dir] : dir;
  const v = DIR_VEC[d];
  const tx = p.x + v.dx;
  const ty = p.y + v.dy;
  if (canPlayerEnter(state, tx, ty, p)) return true;
  if (!groundedGeneratorAt(state, tx, ty)) return false;
  return p.contact !== null || p.sneakers;
}
