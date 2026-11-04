/**
 * The five other objective mechanics (Oshodi's relays have their own file): each with a positive path and a failure
 * path, driven by ordinary state changes (a human standing on a tile, generators blasting).
 */
import { describe, expect, it } from 'vitest';
import { missionView, playerStepTicks } from '../src/sim';
import type { SimEvent } from '../src/sim';
import { MIN_STRIKE_WARN_TICKS, MIN_TRAIN_WARN_TICKS, PRESS_DROP_TICKS } from '../src/sim/mission/defs';
import { Tile } from '../src/sim/types';
import { addGenerator } from './helpers';
import { advance, jumpToPhase, newMission, of, put, standOn } from './mission-helpers';

// ------------------------------------------------------------------ Mushin

describe('Mushin supply routes: destroy stacks with blasts, runners restock', () => {
  it("the human's blast destroys a one-hit stack; the boss's blast does not", () => {
    const state = newMission({ id: 'mushin' });
    const m = state.mission!;
    const [s1, s2] = m.nodes;
    addGenerator(state, { ownerId: 1, x: s2!.x, y: s2!.y, timer: 1 }); // a crew blast: no effect
    advance(state, 60);
    expect(s2!.done).toBe(false);
    expect(s2!.hp).toBe(1);
    const ev = [] as SimEvent[];
    addGenerator(state, { ownerId: 0, x: s1!.x, y: s1!.y, timer: 1 });
    advance(state, 60, {}, ev);
    expect(s1!.done).toBe(true);
    expect(of(ev, 'missionNode').some((e) => e.nodeId === 's1' && e.state === 'done')).toBe(true);
    expect(missionView(state)!.progress).toEqual({ done: 1, goal: 2, label: 'stacks destroyed' });
  });

  it('a tougher stack takes two separate blasts (one blast counts once, however long it burns)', () => {
    const state = newMission({ id: 'mushin' });
    const m = state.mission!;
    jumpToPhase(state, 1);
    const s = m.nodes[0]!;
    expect(s.hp).toBe(2);
    addGenerator(state, { ownerId: 0, x: s.x, y: s.y, timer: 1 });
    advance(state, 90); // the flames burn for the whole stretch
    expect(s.hp).toBe(1);
    expect(s.done).toBe(false);
    expect(missionView(state)!.nodes[0]).toMatchObject({ state: 'progress', fraction: 0.5 });
    addGenerator(state, { ownerId: 0, x: s.x, y: s.y, timer: 1 });
    advance(state, 90);
    expect(s.done).toBe(true);
  });

  it('a market runner on a destroyed stack restocks it; with no runner it stays down', () => {
    const state = newMission({ id: 'mushin' });
    const m = state.mission!;
    const s = m.nodes[0]!;
    addGenerator(state, { ownerId: 0, x: s.x, y: s.y, timer: 1 });
    advance(state, 60);
    expect(s.done).toBe(true);
    put(state, 0, 40, 30);
    advance(state, 1500); // nobody on the stack
    expect(s.done).toBe(true);
    const crewTicks = m.tuning.phases[0].crewTicks;
    put(state, 2, s.x, s.y); // a runner
    advance(state, crewTicks - 5);
    expect(s.done).toBe(true);
    const ev = advance(state, 10);
    expect(s.done).toBe(false);
    expect(s.hp).toBe(1);
    expect(of(ev, 'missionNode').some((e) => e.nodeId === 's1' && e.state === 'live')).toBe(true);
  });

  it('a runner who has been eliminated cannot restock', () => {
    const state = newMission({ id: 'mushin' });
    const m = state.mission!;
    for (const id of [2, 3, 4]) state.players[id]!.alive = false;
    const s = m.nodes[0]!;
    addGenerator(state, { ownerId: 0, x: s.x, y: s.y, timer: 1 });
    advance(state, 60);
    advance(state, m.tuning.phases[0].crewTicks + 100);
    expect(s.done).toBe(true);
  });

  it('two stacks end phase one; goods-fall pressure targets the human near a live stack', () => {
    const state = newMission({ id: 'mushin' });
    const m = state.mission!;
    const ev: SimEvent[] = [];
    for (const n of m.nodes.slice(0, 2)) {
      addGenerator(state, { ownerId: 0, x: n.x, y: n.y, timer: 1 });
      advance(state, 60, {}, ev);
    }
    expect(m.phase).toBe(1);
    // near the live stack s3 of phase two the pressure finds the human
    const s = m.nodes[2]!;
    put(state, 0, s.x + 3, s.y);
    const warn = advance(state, m.tuning.phases[1].pulseTicks + 20);
    const strikes = of(warn, 'missionWarning').filter((e) => e.warning.kind === 'strike');
    expect(strikes.length).toBeGreaterThan(0);
    expect(strikes[0]!.warning.remainingTicks).toBeGreaterThanOrEqual(MIN_STRIKE_WARN_TICKS);
  });
});

// ------------------------------------------------------------------ Fadeyi / Somolu

describe('Fadeyi junction access: hold the zone against marshals', () => {
  const clear = (state: ReturnType<typeof newMission>): void => {
    // the idle crew would stand in the zones: move it out of the way (real marshals are the contest)
    state.players.slice(2).forEach((p, i) => put(state, p.id, 3 + i, 31));
  };

  it('holding a zone for the hold time makes the junction held; leaving lets the progress drain slowly', () => {
    const state = newMission({ id: 'fadeyiSomolu' });
    const m = state.mission!;
    clear(state);
    const j = m.nodes[0]!;
    const hold = m.tuning.phases[0].holdTicks;
    standOn(state, j.x, j.y, 100);
    expect(j.progress).toBe(100);
    standOn(state, j.x + 1, j.y + 1, 50); // inside the 3 x 3 zone still counts
    expect(j.progress).toBe(150);
    standOn(state, j.x + 5, j.y, 30); // outside: drains by 1 a tick
    expect(j.progress).toBe(120);
    const ev = standOn(state, j.x, j.y, hold - 120);
    expect(j.done).toBe(true);
    expect(of(ev, 'missionNode').some((e) => e.nodeId === 'j1' && e.state === 'done')).toBe(true);
  });

  it('a marshal inside the zone contests it: no progress while they stand there', () => {
    const state = newMission({ id: 'fadeyiSomolu' });
    const m = state.mission!;
    clear(state);
    const j = m.nodes[0]!;
    put(state, 2, j.x + 1, j.y); // a marshal
    standOn(state, j.x, j.y, 200);
    expect(j.progress).toBe(0);
    expect(j.done).toBe(false);
    put(state, 2, 3, 31); // driven out
    standOn(state, j.x, j.y, 50);
    expect(j.progress).toBe(50);
  });

  it('a held junction opens its routes and stops calling marshal strikes; the others keep calling', () => {
    const state = newMission({ id: 'fadeyiSomolu' });
    const m = state.mission!;
    clear(state);
    const [j1] = m.nodes;
    const crate = (j1!.y - 4) * state.width + j1!.x;
    state.tiles[crate] = Tile.Soft;
    j1!.opens = [crate];
    standOn(state, j1!.x, j1!.y, m.tuning.phases[0].holdTicks);
    expect(j1!.done).toBe(true);
    expect(state.tiles[crate]).toBe(Tile.Empty);
    // walk away and watch who calls strikes over a minute
    const sources = new Set<string>();
    put(state, 0, 25, 28);
    for (let i = 0; i < 60 * 40; i++) {
      advance(state, 1);
      for (const s of m.strikes) sources.add(s.source);
      if (state.players[0]!.alive === false) put(state, 0, 25, 28);
    }
    expect(sources.has('j1')).toBe(false);
    expect(sources.has('j2') || sources.has('j3')).toBe(true);
  });

  it('phase three: a held junction is retaken after the window', () => {
    const state = newMission({ id: 'fadeyiSomolu' });
    const m = state.mission!;
    clear(state);
    jumpToPhase(state, 2);
    const j = m.nodes[0]!;
    standOn(state, j.x, j.y, m.tuning.phases[2].holdTicks);
    expect(j.done).toBe(true);
    put(state, 0, 25, 28);
    advance(state, m.tuning.phases[2].rearmTicks + 5);
    expect(j.done).toBe(false);
    expect(j.progress).toBe(0);
  });
});

// ------------------------------------------------------------------ Ebute-Metta

describe('Ebute-Metta dispatch windows: switches count only inside the rail window', () => {
  it('a railcar is telegraphed at least 3.5 s ahead, the arena schedules no train of its own, and the window opens after it', () => {
    const state = newMission({ id: 'ebuteMetta' }, { stage: true });
    const m = state.mission!;
    const trainIdx = state.stage.nextAt.findIndex((t) => t === Infinity);
    expect(trainIdx).toBeGreaterThanOrEqual(0);
    const events: SimEvent[] = [];
    while (!of(events, 'missionWarning').some((e) => e.warning.kind === 'window')) advance(state, 1, {}, events);
    const stage = of(events, 'stageWarning').filter((e) => e.event.style === 'train');
    expect(stage).toHaveLength(1);
    expect(stage[0]!.event.startTick - stage[0]!.event.warnTick).toBeGreaterThanOrEqual(MIN_TRAIN_WARN_TICKS);
    const win = of(events, 'missionWarning').filter((e) => e.warning.kind === 'window');
    expect(win).toHaveLength(1);
    expect(win[0]!.warning.remainingTicks).toBeGreaterThanOrEqual(MIN_TRAIN_WARN_TICKS);
    expect(missionView(state)!.warnings.some((w) => w.kind === 'window')).toBe(true);
    expect(m.rail!.open).toBe(false);
    // the lane is a real track lane of the arena
    expect(stage[0]!.event.tiles.every((t) => state.tiles[t] === Tile.Empty)).toBe(true);
    const rest = advance(state, m.rail!.openAt - state.tick + 2);
    expect(m.rail!.open).toBe(true);
    expect(of(rest, 'stageStarted').some((e) => e.event.style === 'train')).toBe(true);
  });

  it('a switch thrown inside the window counts; the same stand outside the window does not', () => {
    const state = newMission({ id: 'ebuteMetta' });
    const m = state.mission!;
    const sw = m.nodes[0]!;
    const hold = m.tuning.phases[0].holdTicks;
    // closed: the whole warning stretch
    advance(state, 130);
    expect(m.rail!.trainAt).toBeGreaterThan(state.tick);
    standOn(state, sw.x, sw.y, hold + 60);
    expect(sw.done).toBe(false);
    expect(sw.progress).toBe(0);
    expect(missionView(state)!.nodes[0]!.state).toBe('locked');
    // wait for the window, then stand on it
    put(state, 0, 40, 30);
    advance(state, m.rail!.openAt - state.tick + 2);
    expect(m.rail!.open).toBe(true);
    expect(missionView(state)!.nodes[0]!.state).toBe('live');
    const ev = standOn(state, sw.x, sw.y, hold + 2);
    expect(sw.done).toBe(true);
    expect(of(ev, 'missionNode').some((e) => e.nodeId === 'd1' && e.state === 'done')).toBe(true);
    expect(missionView(state)!.progress).toEqual({ done: 1, goal: 2, label: 'switches thrown' });
  });

  it('half a throw is lost when the window closes', () => {
    const state = newMission({ id: 'ebuteMetta' });
    const m = state.mission!;
    const sw = m.nodes[0]!;
    m.tuning.phases[0].holdTicks = 100000; // a throw that cannot finish inside any window
    advance(state, m.rail!.nextCycleAt - state.tick + 1);
    advance(state, m.rail!.openAt - state.tick + 2);
    put(state, 0, sw.x, sw.y);
    advance(state, 40);
    expect(sw.progress).toBeGreaterThan(30);
    advance(state, m.rail!.closeAt - state.tick + 2); // still standing there when it shuts
    expect(sw.progress).toBe(0);
    expect(sw.done).toBe(false);
  });

  it('phase three: a thrown switch resets after the reset time', () => {
    const state = newMission({ id: 'ebuteMetta' });
    const m = state.mission!;
    jumpToPhase(state, 2);
    m.rail!.nextCycleAt = state.tick + 1;
    advance(state, 5);
    advance(state, m.rail!.openAt - state.tick + 2);
    const sw = m.nodes[0]!;
    standOn(state, sw.x, sw.y, m.tuning.phases[2].holdTicks + 2);
    expect(sw.done).toBe(true);
    put(state, 0, 40, 30);
    advance(state, m.tuning.phases[2].rearmTicks + 5);
    expect(sw.done).toBe(false);
  });
});

// ------------------------------------------------------------------ Lagos Island

describe('Lagos Island evidence run: collect, carry slowly, deliver', () => {
  it('collect (stand), carry (slower), deliver at the press', () => {
    const state = newMission({ id: 'lagosIsland' });
    const m = state.mission!;
    const me = state.players[0]!;
    const base = playerStepTicks(state, me);
    const l1 = m.nodes[0]!;
    standOn(state, l1.x, l1.y, 30);
    expect(m.carry).toBeNull();
    const ev = standOn(state, l1.x, l1.y, 40);
    expect(m.carry).toMatchObject({ playerId: 0, nodeId: 'l1' });
    expect(l1.done).toBe(true);
    expect(of(ev, 'missionNode').some((e) => e.nodeId === 'l1' && e.state === 'done')).toBe(true);
    expect(playerStepTicks(state, me)).toBe(base + m.tuning.carrySlowTicks);
    const press = m.nodes.find((n) => n.id === 'press')!;
    standOn(state, press.x, press.y, PRESS_DROP_TICKS - 5);
    expect(m.delivered).toBe(0);
    standOn(state, press.x, press.y, 10);
    expect(m.delivered).toBe(1);
    expect(m.carry).toBeNull();
    expect(playerStepTicks(state, me)).toBe(base);
    expect(missionView(state)!.progress).toEqual({ done: 1, goal: 2, label: 'ledgers delivered' });
  });

  it('a daze drops the ledger: it goes back where it was and can be collected again', () => {
    const state = newMission({ id: 'lagosIsland' });
    const m = state.mission!;
    const l1 = m.nodes[0]!;
    standOn(state, l1.x, l1.y, 70);
    expect(m.carry).not.toBeNull();
    put(state, 0, l1.x + 4, l1.y);
    state.players[0]!.dazedUntil = state.tick + 40;
    advance(state, 2);
    expect(m.carry).toBeNull();
    expect(l1.done).toBe(false);
    expect(l1.progress).toBe(0);
    standOn(state, l1.x, l1.y, 70);
    expect(m.carry).not.toBeNull();
  });

  it('a fall drops the ledger too, and nothing is delivered without carrying', () => {
    const state = newMission({ id: 'lagosIsland' });
    const m = state.mission!;
    const press = m.nodes.find((n) => n.id === 'press')!;
    standOn(state, press.x, press.y, 80);
    expect(m.delivered).toBe(0);
    const l1 = m.nodes[0]!;
    standOn(state, l1.x, l1.y, 70);
    expect(m.carry).not.toBeNull();
    state.players[0]!.alive = false;
    advance(state, 2);
    expect(m.carry).toBeNull();
    expect(l1.done).toBe(false);
  });

  it('while carrying, an audit strike (3 x 3, telegraphed) is called on the carrier', () => {
    const state = newMission({ id: 'lagosIsland' });
    const m = state.mission!;
    const l1 = m.nodes[0]!;
    standOn(state, l1.x, l1.y, 70);
    put(state, 0, l1.x + 3, l1.y);
    const ev = advance(state, m.tuning.phases[0].pulseTicks + 5);
    const audits = of(ev, 'missionWarning').filter((e) => e.warning.kind === 'strike');
    expect(audits.length).toBeGreaterThan(0);
    expect(audits[0]!.warning.tiles.length).toBeGreaterThanOrEqual(3);
    expect(audits[0]!.warning.remainingTicks).toBeGreaterThanOrEqual(MIN_STRIKE_WARN_TICKS);
  });

  it('phase three loses a ledger carried too long', () => {
    const state = newMission({ id: 'lagosIsland' });
    const m = state.mission!;
    jumpToPhase(state, 2);
    m.tuning.phases[2].pulseTicks = 0; // no audits in this test
    m.tuning.phases[2].carryLimitTicks = 300;
    const l1 = m.nodes[0]!;
    standOn(state, l1.x, l1.y, 70);
    expect(m.carry).not.toBeNull();
    advance(state, 280);
    expect(m.carry).not.toBeNull();
    advance(state, 40);
    expect(m.carry).toBeNull();
    expect(l1.done).toBe(false);
  });
});

// ------------------------------------------------------------------ Lekki

describe('Lekki contingency grid: switch off in the signalled order', () => {
  it('the order is signalled in the labels and the callout; the right order clears the phase', () => {
    const state = newMission({ id: 'lekki' });
    const m = state.mission!;
    expect(m.sequence).toHaveLength(3);
    expect(m.nodes.length).toBe(4); // one decoy
    const view = missionView(state)!;
    expect(view.callout).toMatch(/order/i);
    const letters = m.sequence.map((id) => id.toUpperCase());
    expect(view.callout!).toContain(letters.join(' > '));
    m.sequence.forEach((id, i) => expect(m.nodes.find((n) => n.id === id)!.label).toMatch(new RegExp(` ${i + 1}$`)));
    expect(view.nodes.find((n) => n.id === m.sequence[0])!.state).toBe('live');
    const hold = m.tuning.phases[0].holdTicks;
    for (const id of m.sequence) {
      const n = m.nodes.find((q) => q.id === id)!;
      standOn(state, n.x, n.y, hold + 1);
      expect(n.done).toBe(true);
    }
    expect(m.phase).toBe(1);
    expect(m.sequence).toHaveLength(4);
  });

  it('a wrong switch calls a telegraphed contingency strike and resets the sequence', () => {
    const state = newMission({ id: 'lekki' });
    const m = state.mission!;
    const hold = m.tuning.phases[0].holdTicks;
    const first = m.nodes.find((n) => n.id === m.sequence[0])!;
    standOn(state, first.x, first.y, hold + 1);
    expect(m.seqIndex).toBe(1);
    // the third of the order is not next: wrong
    const wrong = m.nodes.find((n) => n.id === m.sequence[2])!;
    const ev = standOn(state, wrong.x, wrong.y, hold + 1);
    expect(m.seqIndex).toBe(0);
    expect(m.nodes.every((n) => !n.done)).toBe(true);
    const warn = of(ev, 'missionWarning').filter((e) => e.warning.kind === 'contingency');
    expect(warn).toHaveLength(1);
    expect(warn[0]!.warning.remainingTicks).toBeGreaterThanOrEqual(MIN_STRIKE_WARN_TICKS);
    expect(warn[0]!.warning.tiles).toContain(wrong.y * state.width + wrong.x);
    // standing there does not trigger it again (the strike lands later: step off first)
    const more = advance(state, 60);
    expect(of(more, 'missionWarning').filter((e) => e.warning.kind === 'contingency')).toHaveLength(0);
    // and the right order still works afterwards
    for (const id of m.sequence) {
      const n = m.nodes.find((q) => q.id === id)!;
      standOn(state, n.x, n.y, hold + 1);
    }
    expect(m.phase).toBe(1);
  });

  it('a decoy switch is a wrong switch', () => {
    const state = newMission({ id: 'lekki' });
    const m = state.mission!;
    const decoy = m.nodes.find((n) => !m.sequence.includes(n.id))!;
    const ev = standOn(state, decoy.x, decoy.y, m.tuning.phases[0].holdTicks + 1);
    expect(of(ev, 'missionWarning').filter((e) => e.warning.kind === 'contingency')).toHaveLength(1);
    expect(m.seqIndex).toBe(0);
  });

  it('the order comes from the seeded RNG: same seed, same order; the sequences differ between seeds', () => {
    const a = newMission({ id: 'lekki' }, { seed: 4 }).mission!.sequence;
    const b = newMission({ id: 'lekki' }, { seed: 4 }).mission!.sequence;
    expect(a).toEqual(b);
    const others = [5, 6, 7, 8, 9].map((seed) => newMission({ id: 'lekki' }, { seed }).mission!.sequence.join());
    expect(new Set([...others, a.join()]).size).toBeGreaterThan(1);
  });
});
