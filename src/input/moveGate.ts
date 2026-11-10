import type { Dir } from '../sim';
import {
  ASSIST_BUFFER_TICKS,
  BUMP_COOLDOWN_TICKS,
  PERPENDICULAR,
  TURN_INTENT_TICKS,
  TURN_REACH_TILES,
  canStep,
  planBend,
  planDiagonal,
  planSidestep,
  planTurn,
} from './moveAssist';
import { OPPOSITE } from '../sim';
import type { AssistLevel, MoveBoard, MoveStyle, TouchDiagonal } from './moveAssist';

/** A press arriving up to this long before the player can step is remembered (one move, never a queue). */
export const MOVE_BUFFER_TICKS = 10;
/** A direction must be held this long before it auto-repeats; shorter presses are single taps. */
export const MOVE_REPEAT_DELAY_TICKS = 12;
/**
 * Corner-turn buffer (decision WA2): a turn pressed one tile too early is carried for at most this many
 * tiles along the way the player was already walking, then taken as soon as it is legal.
 */
export const TURN_BUFFER_TILES = 1;
/** "Already walking": a move was handed over at most this long ago (a step is 5-13 ticks). */
export const TURN_CONTINUE_TICKS = 18;
/** A corner route's second step is handed over within this long of the first (the slowest step is 14 ticks), else the route lapses. */
export const DIAGONAL_ROUTE_TICKS = 40;
/**
 * Touchscreen only (decision MI1): a press made while the player cannot act (daze, stumble, slide, teleport arrival)
 * is kept this long from the press, newest press winning, and handed over on the first tick they can. Longer than the
 * longest daze (1.2 s), so a tap made at any point of a lock is never silently dropped.
 */
export const LOCK_BUFFER_TICKS = 90;

/**
 * Assisted movement for one `next` call (see `moveAssist.ts`). Without it the gate behaves exactly as it
 * did before assisted movement. `board` is lazy: most ticks never need it.
 */
export interface GateAssist {
  level: Exclude<AssistLevel, 'off'>;
  board(): MoveBoard;
  /**
   * Touchscreen thumbstick only (decisions MV3, AS4): the stick is what is being held and it leans diagonally. A route
   * is only planned when the stick's main direction is BLOCKED (a wall, a crate, an obstacle): in open space a diagonal
   * is just its main cardinal direction. Never set for the keyboard, a gamepad or any physical controller, nor when
   * assisted movement is Off.
   */
  diagonal?: TouchDiagonal | null;
  /**
   * The touchscreen thumb is the device in use: newest-direction priority over an owed corner step, and the rules
   * of `style`. Never set for a key, a D-pad or a gamepad stick, so they keep exactly the behaviour they had.
   */
  touch?: boolean;
  /** Touch only (decision AS4): `standard` = corner assistance only; `beginner` adds buffering and emergency replanning. */
  style?: MoveStyle;
  /** Is the player standing in danger right now (decision MI4)? Lazy; only asked while a press is settling or a route is owed. */
  emergency?(): boolean;
}

/**
 * Turns "which direction buttons are down" into the per-tick `Intent.move` the simulation expects.
 *
 * The simulation is level-triggered: while `move` is set it starts a new step the instant the previous
 * one ends. Feeding it the raw held state therefore turns every press that outlasts one step into two,
 * and any grace period after release adds another. The gate makes input edge-triggered instead:
 *
 *  - a press is one request, delivered on the first tick the player can step, then discarded whether
 *    or not it produced a step (wall, kick, ...). A later press replaces an undelivered one, so at most
 *    one move is ever buffered, and it expires after `MOVE_BUFFER_TICKS`;
 *  - a direction still held `MOVE_REPEAT_DELAY_TICKS` after its press repeats at the player's own step
 *    cadence (speed upgrades and the Okada bonus apply) until it is released;
 *  - releasing stops repeating immediately and nothing is carried over;
 *  - corner turns (when the caller passes `legal`): a perpendicular turn that is blocked right now, made
 *    while walking and still held, keeps the player walking the way they were going for at most
 *    `TURN_BUFFER_TILES` tile(s) and is taken on the first tile where it is legal. Assisted levels (decision
 *    MV1) plan up to `TURN_REACH_TILES` ahead, remember a tapped turn for `TURN_INTENT_TICKS` after release,
 *    buffer a press a little longer and guard against bumping the same wall or crate every step. Every hand-over is
 *    still exactly one step; a turn that never opens up is simply delivered (the player faces the wall
 *    and stops, as before) - never a skipped tile, never a turn the player did not ask for.
 */
export class MoveGate {
  private pending: { dir: Dir; pressed: number; until: number; notBefore: number } | null = null;
  /** The last direction the simulation was handed although it could do nothing (wall, crate ...). */
  private bump: { dir: Dir; tick: number } | null = null;
  private readonly since = new Map<Dir, number>();
  private last: { dir: Dir; tick: number } | null = null;
  private carried = 0;
  /**
   * A diagonal route in progress (MV3): its first step has been handed over; the second one is owed. It is
   * handed over on the first tick the player can step again, provided they stand on the intermediate tile and
   * that tile's neighbour is still a safe step, whatever the thumb does meanwhile (the route is atomic).
   */
  private route: { first: Dir; second: Dir; x: number; y: number; until: number } | null = null;
  /** Why the last `next` call answered as it did (input trace, decision MI5), and one-off notes raised between calls. */
  private why = 'idle';
  private note: string | null = null;

  /** The reason behind the last `next` answer, for the input trace. */
  get reason(): string {
    return this.why;
  }

  /**
   * A direction went down (keydown, pointer-down, D-pad edge).
   * @param settle ticks to wait before the press may be handed over (a thumb switching direction, so a swipe through the centre can still be overwritten)
   */
  press(dir: Dir, tick: number, settle = 0, touch = false): void {
    // newest direction wins (decision MI2): a touch press that is neither step of an owed diagonal route ends it
    if (touch && this.route && dir !== this.route.first && dir !== this.route.second) {
      this.route = null;
      this.note = 'route-cancelled-by-newer-press';
    }
    this.since.set(dir, tick);
    this.pending = { dir, pressed: tick, until: 0, notBefore: tick + settle };
    this.bump = null; // a fresh press is always offered to the simulation
    this.carried = 0;
  }

  /**
   * @param held   direction to repeat, or null
   * @param active every direction currently down (a held key keeps its original press time if another is released)
   * @param canMove whether the simulation will read the move this tick
   * @param legal  optional: would a move this way do anything right now (step, kick, ...)? Enables the turn buffer.
   * @param assist optional: assisted movement (see `GateAssist`); needs `legal`
   */
  next(
    tick: number,
    held: Dir | null,
    active: ReadonlySet<Dir>,
    canMove: boolean,
    legal?: (dir: Dir) => boolean,
    assist?: GateAssist,
    locked = false,
  ): Dir | null {
    const answer = this.decide(tick, held, active, canMove, legal, assist, locked);
    if (this.note && this.why === 'idle') this.why = this.note;
    this.note = null;
    return answer;
  }

  private decide(
    tick: number,
    held: Dir | null,
    active: ReadonlySet<Dir>,
    canMove: boolean,
    legal: ((dir: Dir) => boolean) | undefined,
    assist: GateAssist | undefined,
    locked: boolean,
  ): Dir | null {
    this.why = 'idle';
    for (const dir of [...this.since.keys()]) if (!active.has(dir)) this.since.delete(dir);
    if (held && !this.since.has(held)) this.since.set(held, tick); // already down when we first saw it

    const touch = !!assist?.touch;
    // Beginner Assist (decision AS4) adds buffering and emergency replanning to the standard touch movement
    const beginner = touch && assist!.style === 'beginner';
    // the player cannot act (daze, stumble, slide, teleport arrival): nothing is handed over, an owed corner step
    // lapses, and - Beginner Assist only - the newest press waits for them (decision MI1) instead of being spent on a
    // tick that ignores it
    if (beginner && locked) {
      if (this.route) {
        this.route = null;
        this.why = 'route-lapsed-locked';
      }
      if (this.pending) {
        this.pending.until = Math.max(this.pending.until, this.pending.pressed + LOCK_BUFFER_TICKS);
        if (tick > this.pending.until) this.pending = null;
      }
      if (this.why === 'idle') this.why = this.pending ? 'buffered-while-locked' : 'locked';
      return null;
    }

    // a corner route owes its second step before anything else is handed over - but only while the thumb is still on it
    if (this.route && tick > this.route.until) this.route = null;
    // no current directional input, no step: a thumb that has lifted, or moved off both of the route's directions,
    // ends the route (the player stands on the intermediate tile and the new input decides)
    if (this.route && (!held || (held !== this.route.first && held !== this.route.second))) {
      this.route = null;
      this.why = held ? 'route-cancelled-new-direction' : 'route-cancelled-thumb-lifted';
    }
    if (this.route && canMove) {
      const second = this.finishRoute(assist, legal);
      if (second) {
        this.why = 'route-second-step';
        return this.deliver(second, tick);
      }
      this.why = 'route-second-dropped';
    }
    // a press still settling is handed over at once when the player is in danger (decision MI4; Beginner Assist)
    if (this.pending && canMove && beginner && tick < this.pending.notBefore && assist!.emergency?.()) {
      this.pending.notBefore = tick;
      this.note = 'settle-bypassed-emergency';
    }

    // a press waits `MOVE_BUFFER_TICKS` for the player to be able to step (a little longer when assisted: the
    // slowest step outlasts the plain buffer); a carried turn keeps it alive from tile to tile
    const buffer = assist && (!touch || beginner) ? ASSIST_BUFFER_TICKS : MOVE_BUFFER_TICKS;
    if (this.pending && tick > Math.max(this.pending.until, this.pending.pressed + buffer))
      this.pending = null;
    if (this.pending && canMove && tick >= this.pending.notBefore) {
      const { dir, notBefore, pressed } = this.pending;
      const diagonal = this.startRoute(dir, tick, assist, legal);
      if (diagonal) {
        this.pending = null;
        this.carried = 0;
        this.why = 'route-first-step';
        return diagonal;
      }
      const carry = legal ? this.carryFor(dir, tick, active, legal, assist, pressed) : null;
      if (carry) {
        // keep the turn for the next tile; walk on one tile the way we were going
        this.carried++;
        this.pending = { dir, pressed, until: tick + TURN_CONTINUE_TICKS, notBefore };
        this.why = 'turn-carry';
        return this.deliver(carry, tick);
      }
      // NV1: the turn is still blocked beyond the carry's reach, but the way the player walks is still held too
      const along = legal && active.has(dir) ? this.alongHeld(dir, tick, active, legal, assist) : null;
      if (along) {
        this.pending = { dir, pressed, until: tick + TURN_CONTINUE_TICKS, notBefore };
        this.why = 'turn-wait-held';
        return this.deliver(along, tick);
      }
      const delayed = this.carried > 0;
      this.pending = null;
      this.carried = 0;
      // a turn the assist waited for is not taken blindly: never into a danger that appeared meanwhile
      // (the player's own explicit hold still goes through the repeat path below)
      if (delayed && assist && !canStep(assist.board(), dir)) {
        this.why = 'turn-dropped-unsafe';
        return null;
      }
      this.why = 'press';
      return this.deliver(dir, tick);
    }
    if (held && tick - this.since.get(held)! >= MOVE_REPEAT_DELAY_TICKS) {
      if (!canMove) return held;
      const diagonal = this.startRoute(held, tick, assist, legal);
      if (diagonal) {
        this.why = 'route-first-step';
        return diagonal;
      }
      // NV1: a held turn that is blocked here, while the way the player walks is still held: walk on, retry each tile
      const along = legal ? this.alongHeld(held, tick, active, legal, assist) : null;
      if (along) {
        this.why = 'turn-wait-held';
        return this.deliver(along, tick);
      }
      const dir = assist?.level === 'full' && legal ? this.assistHold(held, legal, assist, tick) : held;
      // bump guard (assisted levels): a direction the simulation already refused is not offered again every
      // step; it is retried as soon as it would do something (the obstacle moved) or after the cooldown
      if (assist && legal && !legal(dir)) {
        const b = this.bump;
        if (b && b.dir === dir && tick - b.tick < BUMP_COOLDOWN_TICKS) {
          this.why = 'bump-guard';
          return null;
        }
        this.bump = { dir, tick };
      }
      this.why = 'repeat';
      return this.deliver(dir, tick);
    }
    return null;
  }

  /**
   * The direction to keep walking while a blocked corner turn waits, or null to deliver the turn now.
   * Before assisted movement: one tile, unconditionally (WA2). Basic adds the danger check on that tile; full
   * plans ahead and only carries when the turn really opens within `TURN_REACH_TILES`.
   */
  private carryFor(
    dir: Dir,
    tick: number,
    active: ReadonlySet<Dir>,
    legal: (d: Dir) => boolean,
    assist?: GateAssist,
    pressed = 0,
  ): Dir | null {
    const last = this.last;
    if (!last || tick - last.tick > TURN_CONTINUE_TICKS) return null; // not walking: no carrying
    if (!PERPENDICULAR[dir].includes(last.dir)) return null;
    // an assisted turn is also remembered after the finger came off (a quick tap before the corner) - except on the
    // touchscreen's standard style, where the player is only ever carried while a direction is held (decision AS4)
    const remembered =
      !!assist && !(assist.touch && assist.style !== 'beginner') && tick - pressed <= TURN_INTENT_TICKS;
    const wanted = active.has(dir) || remembered;
    if (!wanted || legal(dir) || !legal(last.dir)) return null;
    if (assist) {
      const reach = TURN_REACH_TILES - this.carried;
      return reach > 0 && planTurn(assist.board(), last.dir, dir, reach) !== null ? last.dir : null;
    }
    if (this.carried >= TURN_BUFFER_TILES) return null;
    return last.dir;
  }

  /**
   * NV1 (held-turn continuation, keyboard and gamepad): the player asks for a perpendicular turn `dir` that is blocked
   * on this tile while STILL holding the direction they are walking (a second key, or a second D-pad button). They
   * keep walking that way, tile after tile, and the turn is taken on the first tile where it is legal (re-checked
   * every step). Both directions are the player's own current input, so there is no reach limit and no danger veto;
   * it ends the moment either is let go, a reversal is never continued, and `off` keeps the old gate exactly.
   * The touchscreen thumb is NOT included: its lean is the approved two-step corner route (MV3 / AS4) and must never
   * become a slide along a wall; touch keeps the 2-tile early turn and the corner route.
   */
  private alongHeld(
    dir: Dir,
    tick: number,
    active: ReadonlySet<Dir>,
    legal: (d: Dir) => boolean,
    assist?: GateAssist,
  ): Dir | null {
    if (!assist || assist.touch) return null;
    const last = this.last;
    if (!last || tick - last.tick > TURN_CONTINUE_TICKS) return null; // not walking
    const along = last.dir;
    if (!PERPENDICULAR[dir].includes(along)) return null;
    if (!active.has(along) || legal(dir) || !legal(along)) return null;
    return along;
  }

  /**
   * A direction held long enough to repeat (full assistance): the player's own direction, unless it is blocked by a
   * wall and there is a way round that the thumb is not leaning against:
   *  - touchscreen Standard: none here - the lean is a corner route (`startRoute`), a straight push stays a push;
   *  - touchscreen Beginner Assist: the single opening one tile along the corridor (a sidestep) and the one bend of a
   *    narrow corridor, but never against a lean (a lean is the route's business, valid or not);
   *  - keyboard / gamepad at the full level: exactly as before (sidestep and bend following).
   * Open space never changes the player's direction.
   */
  private assistHold(held: Dir, legal: (d: Dir) => boolean, assist: GateAssist, tick: number): Dir {
    if (legal(held)) return held;
    if (assist.touch && (assist.style !== 'beginner' || assist.diagonal)) return held;
    const board = assist.board();
    const prefer = [this.last?.dir];
    const around = planSidestep(board, held, prefer);
    if (around) return around;
    // a corridor bend: the way on is round the corner, never back where the player came from
    const came = this.last && this.last.dir !== held ? OPPOSITE[this.last.dir] : null;
    const along = this.last && tick - this.last.tick <= TURN_CONTINUE_TICKS ? this.last.dir : null;
    return planBend(board, held, prefer, came, along) ?? held;
  }

  /**
   * The touchscreen thumb leans diagonally (`assist.diagonal`, whose main axis is `dir`) AND `dir` itself is blocked (a
   * wall, a crate, an obstacle): plan the complete two-step route round the corner (the two legal orders are tried, the
   * first valid one wins) and hand over its first step, owing the second. In open space `dir` is simply walked - there
   * is no staircase. Returns null (nothing owed, the ordinary cardinal behaviour carries on) when there is no diagonal,
   * `dir` is not blocked, or neither order is valid in full.
   */
  private startRoute(dir: Dir, tick: number, assist?: GateAssist, legal?: (d: Dir) => boolean): Dir | null {
    const d = assist?.diagonal;
    if (!assist || assist.level !== 'full' || !d || d.primary !== dir) return null;
    if (!legal || legal(dir)) return null; // the thumb's own direction works: just walk it
    const board = assist.board();
    const plan = planDiagonal(board, d);
    if (!plan) return null;
    const v = board.vec(plan[0]);
    this.route = {
      first: plan[0],
      second: plan[1],
      x: board.x + v.dx,
      y: board.y + v.dy,
      until: tick + DIAGONAL_ROUTE_TICKS,
    };
    this.bump = null;
    return this.deliver(plan[0], tick);
  }

  /**
   * The owed second step of a diagonal route, or null (and the route is dropped) when it can no longer be taken
   * as planned: the player is not on the intermediate tile, or its next tile has since turned solid or dangerous.
   */
  private finishRoute(assist?: GateAssist, legal?: (dir: Dir) => boolean): Dir | null {
    const r = this.route!;
    this.route = null;
    if (!assist) return null;
    const board = assist.board();
    if (board.x !== r.x || board.y !== r.y) return null;
    if (!canStep(board, r.second) || (legal && !legal(r.second))) return null;
    return r.second;
  }

  private deliver(dir: Dir, tick: number): Dir {
    this.last = { dir, tick };
    return dir;
  }

  /** Drops everything (menus, pause, new match, lost focus). */
  clear(): void {
    this.pending = null;
    this.since.clear();
    this.last = null;
    this.bump = null;
    this.carried = 0;
    this.route = null;
    this.note = null;
    this.why = 'idle';
  }
}
