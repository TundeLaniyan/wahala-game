/**
 * The five other objective mechanics (Oshodi's relays have their own file): each with a positive path and a failure
 * path, driven by ordinary state changes (generators blasting, a human standing on a tile). Every node is broken by the
 * human's BLASTS (decision BX4): standing on it, or a crew blast, does nothing.
 */
import { describe, expect, it } from 'vitest';
import { missionView, playerStepTicks } from '../src/sim';
import type { SimEvent } from '../src/sim';
import { MIN_STRIKE_WARN_TICKS, MIN_TRAIN_WARN_TICKS, PRESS_DROP_TICKS } from '../src/sim/mission/defs';
import { Tile } from '../src/sim/types';
import { addGenerator } from './helpers';
import { advance, blastAt, hitBoss, jumpToPhase, newMission, of, put, standOn } from './mission-helpers';

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

  it('two stacks expose the boss, a blast on him starts phase two; goods-fall pressure targets the human near a live stack', () => {
    const state = newMission({ id: 'mushin' });
    const m = state.mission!;
    const ev: SimEvent[] = [];
    for (const n of m.nodes.slice(0, 2)) {
      addGenerator(state, { ownerId: 0, x: n.x, y: n.y, timer: 1 });
      advance(state, 60, {}, ev);
    }
    expect(m.phaseState).toBe('exposed');
    // Madam Ronke restores at the stack broken last (her recipe's anchor: BX1)
    expect(m.boss.anchor).toEqual({ x: m.nodes[1]!.x, y: m.nodes[1]!.y });
    hitBoss(state, { x: 40, y: 30 });
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

describe('Fadeyi junction access: blast the toll box while no marshal shields it', () => {
  const clear = (state: ReturnType<typeof newMission>): void => {
    // the idle crew would stand in the zones: move it out of the way (real marshals are the contest)
    state.players.slice(2).forEach((p, i) => put(state, p.id, 3 + i, 31));
  };
  const away = { x: 25, y: 28 };

  it('standing in the zone does nothing; a blast of the human breaks the box and holds the junction', () => {
    const state = newMission({ id: 'fadeyiSomolu' });
    const m = state.mission!;
    clear(state);
    const j = m.nodes[0]!;
    standOn(state, j.x, j.y, 600);
    expect(j.done).toBe(false);
    expect(missionView(state)!.nodes[0]!.state).toBe('live');
    const ev = blastAt(state, j.x, j.y, away);
    expect(j.done).toBe(true);
    expect(of(ev, 'missionNode').some((e) => e.nodeId === 'j1' && e.state === 'done')).toBe(true);
    expect(missionView(state)!.progress).toEqual({ done: 1, goal: 2, label: 'toll boxes broken' });
  });

  it('a marshal inside the zone shields the box: that blast is wasted, the next one (zone clear) counts', () => {
    const state = newMission({ id: 'fadeyiSomolu' });
    const m = state.mission!;
    clear(state);
    const j = m.nodes[0]!;
    put(state, 2, j.x + 1, j.y + 1); // a marshal in the zone, out of the blast's reach of the box? no matter: shielded
    expect(missionView(state)!.nodes[0]!.state).toBe('locked');
    state.players[2]!.armour = 9; // he survives the blast and keeps shielding
    blastAt(state, j.x, j.y, away);
    expect(j.done).toBe(false);
    put(state, 2, 3, 31); // driven out
    expect(missionView(state)!.nodes[0]!.state).toBe('live');
    blastAt(state, j.x, j.y, away);
    expect(j.done).toBe(true);
  });

  it('tollSeason: every toll box takes one more blast', () => {
    const state = newMission({ id: 'fadeyiSomolu', modifiers: ['tollSeason'] });
    const m = state.mission!;
    clear(state);
    const j = m.nodes[0]!;
    expect(j.hp).toBe(2);
    blastAt(state, j.x, j.y, away);
    expect(j.done).toBe(false);
    expect(missionView(state)!.nodes[0]).toMatchObject({ state: 'progress', fraction: 0.5 });
    blastAt(state, j.x, j.y, away);
    expect(j.done).toBe(true);
  });

  it('a held junction opens its routes and stops calling marshal strikes; the others keep calling', () => {
    const state = newMission({ id: 'fadeyiSomolu' });
    const m = state.mission!;
    clear(state);
    const [j1] = m.nodes;
    const crate = (j1!.y - 4) * state.width + j1!.x;
    state.tiles[crate] = Tile.Soft;
    j1!.opens = [crate];
    blastAt(state, j1!.x, j1!.y, away);
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

  it('phase three: a broken box is rebuilt after the window', () => {
    const state = newMission({ id: 'fadeyiSomolu' });
    const m = state.mission!;
    clear(state);
    jumpToPhase(state, 2);
    const j = m.nodes[0]!;
    blastAt(state, j.x, j.y, away);
    expect(j.done).toBe(true);
    advance(state, m.tuning.phases[2].rearmTicks + 5);
    expect(j.done).toBe(false);
    expect(j.hp).toBe(m.tuning.phases[2].hp);
  });
});

// ------------------------------------------------------------------ Ebute-Metta

describe('Ebute-Metta dispatch windows: a blast throws a switch only inside the rail window', () => {
  const away = { x: 40, y: 30 };

  it('a railcar is telegraphed at least 3.5 s ahead, the arena schedules no train of its own, and the window opens after it', () => {
    const state = newMission({ id: 'ebuteMetta' }, { stage: true });
    const m = state.mission!;
    const trainIdx = state.stage.nextAt.findIndex((t) => t === Infinity);
    expect(trainIdx).toBeGreaterThanOrEqual(0);
    const events: SimEvent[] = [];
    while (!of(events, 'missionWarning').some((e) => e.warning.kind === 'window'))
      advance(state, 1, {}, events);
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

  it('a blast outside the window is wasted and standing never counts; a blast inside the window throws it', () => {
    const state = newMission({ id: 'ebuteMetta' });
    const m = state.mission!;
    const sw = m.nodes[0]!;
    // closed: a blast and a long stand on it do nothing
    advance(state, 130);
    expect(m.rail!.trainAt).toBeGreaterThan(state.tick);
    blastAt(state, sw.x, sw.y, away);
    standOn(state, sw.x, sw.y, 120);
    expect(sw.done).toBe(false);
    expect(missionView(state)!.nodes[0]!.state).toBe('locked');
    // wait for the window, stand on it (nothing), then blast it
    put(state, 0, away.x, away.y);
    advance(state, m.rail!.openAt - state.tick + 2);
    expect(m.rail!.open).toBe(true);
    expect(missionView(state)!.nodes[0]!.state).toBe('live');
    standOn(state, sw.x, sw.y, 60);
    expect(sw.done).toBe(false);
    const ev = blastAt(state, sw.x, sw.y, away);
    expect(sw.done).toBe(true);
    expect(of(ev, 'missionNode').some((e) => e.nodeId === 'd1' && e.state === 'done')).toBe(true);
    expect(missionView(state)!.progress).toEqual({ done: 1, goal: 2, label: 'switches thrown' });
  });

  it('phase three: a thrown switch resets after the reset time', () => {
    const state = newMission({ id: 'ebuteMetta' });
    const m = state.mission!;
    jumpToPhase(state, 2);
    m.rail!.nextCycleAt = state.tick + 1;
    advance(state, 5);
    advance(state, m.rail!.openAt - state.tick + 2);
    const sw = m.nodes[0]!;
    blastAt(state, sw.x, sw.y, away);
    expect(sw.done).toBe(true);
    advance(state, m.tuning.phases[2].rearmTicks + 5);
    expect(sw.done).toBe(false);
  });
});

// ------------------------------------------------------------------ Lagos Island

describe('Lagos Island evidence run: blast a cabinet open, carry slowly, deliver', () => {
  const away = { x: 30, y: 30 };
  /** Opens the cabinet with a blast and steps onto it: the ledger is carried. */
  const collect = (state: ReturnType<typeof newMission>, n: { x: number; y: number }): void => {
    blastAt(state, n.x, n.y, away);
    standOn(state, n.x, n.y, 2);
  };

  it('a locked cabinet ignores standing; a blast opens it, stepping on collects, the carrier is slower, the press takes it', () => {
    const state = newMission({ id: 'lagosIsland' });
    const m = state.mission!;
    const me = state.players[0]!;
    const base = playerStepTicks(state, me);
    const l1 = m.nodes[0]!;
    expect(missionView(state)!.nodes[0]!.state).toBe('locked');
    standOn(state, l1.x, l1.y, 300);
    expect(m.carry).toBeNull();
    blastAt(state, l1.x, l1.y, away);
    expect(missionView(state)!.nodes[0]!.state).toBe('live');
    const ev = standOn(state, l1.x, l1.y, 2);
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

  it('a daze drops the ledger: it goes back to its cabinet, which stays open', () => {
    const state = newMission({ id: 'lagosIsland' });
    const m = state.mission!;
    const l1 = m.nodes[0]!;
    collect(state, l1);
    expect(m.carry).not.toBeNull();
    put(state, 0, l1.x + 4, l1.y);
    state.players[0]!.dazedUntil = state.tick + 40;
    advance(state, 2);
    expect(m.carry).toBeNull();
    expect(l1.done).toBe(false);
    expect(l1.progress).toBe(0);
    expect(missionView(state)!.nodes[0]!.state).toBe('live'); // open: no second blast needed
    advance(state, 40);
    standOn(state, l1.x, l1.y, 2);
    expect(m.carry).not.toBeNull();
  });

  it('a fall drops the ledger too, and nothing is delivered without carrying', () => {
    const state = newMission({ id: 'lagosIsland' });
    const m = state.mission!;
    const press = m.nodes.find((n) => n.id === 'press')!;
    standOn(state, press.x, press.y, 80);
    expect(m.delivered).toBe(0);
    const l1 = m.nodes[0]!;
    collect(state, l1);
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
    collect(state, l1);
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
    collect(state, l1);
    expect(m.carry).not.toBeNull();
    put(state, 0, l1.x + 2, l1.y); // off the (open) cabinet: back on it would pick the ledger up again
    advance(state, 280);
    expect(m.carry).not.toBeNull();
    advance(state, 40);
    expect(m.carry).toBeNull();
    expect(l1.done).toBe(false);
  });
});

// ------------------------------------------------------------------ Lekki

describe('Lekki contingency grid: blast the systems in the signalled order', () => {
  const away = { x: 30, y: 30 };

  it('the order is signalled in the labels and the callout; standing does nothing; the right order clears the phase', () => {
    const state = newMission({ id: 'lekki' });
    const m = state.mission!;
    expect(m.sequence).toHaveLength(3);
    expect(m.nodes.length).toBe(4); // one decoy
    const view = missionView(state)!;
    expect(view.callout).toMatch(/order/i);
    const letters = m.sequence.map((id) => id.toUpperCase());
    expect(view.callout!).toContain(letters.join(' > '));
    m.sequence.forEach((id, i) =>
      expect(m.nodes.find((n) => n.id === id)!.label).toMatch(new RegExp(` ${i + 1}$`)),
    );
    expect(view.nodes.find((n) => n.id === m.sequence[0])!.state).toBe('live');
    const first = m.nodes.find((q) => q.id === m.sequence[0])!;
    standOn(state, first.x, first.y, 300);
    expect(first.done).toBe(false);
    for (const id of m.sequence) {
      const n = m.nodes.find((q) => q.id === id)!;
      blastAt(state, n.x, n.y, away);
      expect(n.done).toBe(true);
    }
    expect(m.phaseState).toBe('exposed');
    hitBoss(state, away);
    expect(m.phase).toBe(1);
    expect(m.sequence).toHaveLength(4);
  });

  it('a wrong blast calls a telegraphed contingency strike and resets the sequence', () => {
    const state = newMission({ id: 'lekki' });
    const m = state.mission!;
    const first = m.nodes.find((n) => n.id === m.sequence[0])!;
    blastAt(state, first.x, first.y, away);
    expect(m.seqIndex).toBe(1);
    // the third of the order is not next: wrong
    const wrong = m.nodes.find((n) => n.id === m.sequence[2])!;
    const ev = blastAt(state, wrong.x, wrong.y, away);
    expect(m.seqIndex).toBe(0);
    expect(m.nodes.every((n) => !n.done)).toBe(true);
    const warn = of(ev, 'missionWarning').filter((e) => e.warning.kind === 'contingency');
    expect(warn).toHaveLength(1);
    expect(warn[0]!.warning.remainingTicks).toBeGreaterThanOrEqual(MIN_STRIKE_WARN_TICKS);
    expect(warn[0]!.warning.tiles).toContain(wrong.y * state.width + wrong.x);
    // one blast is one decision: its flames burning on do not trigger it again
    const more = advance(state, 60);
    expect(of(more, 'missionWarning').filter((e) => e.warning.kind === 'contingency')).toHaveLength(0);
    // and the right order still works afterwards
    for (const id of m.sequence) {
      const n = m.nodes.find((q) => q.id === id)!;
      blastAt(state, n.x, n.y, away);
    }
    expect(m.phaseState).toBe('exposed');
  });

  it('a decoy switch is a wrong switch', () => {
    const state = newMission({ id: 'lekki' });
    const m = state.mission!;
    const decoy = m.nodes.find((n) => !m.sequence.includes(n.id))!;
    const ev = blastAt(state, decoy.x, decoy.y, away);
    expect(of(ev, 'missionWarning').filter((e) => e.warning.kind === 'contingency')).toHaveLength(1);
    expect(m.seqIndex).toBe(0);
  });

  it('the order comes from the seeded RNG: same seed, same order; the sequences differ between seeds', () => {
    const a = newMission({ id: 'lekki' }, { seed: 4 }).mission!.sequence;
    const b = newMission({ id: 'lekki' }, { seed: 4 }).mission!.sequence;
    expect(a).toEqual(b);
    const others = [5, 6, 7, 8, 9].map((seed) =>
      newMission({ id: 'lekki' }, { seed }).mission!.sequence.join(),
    );
    expect(new Set([...others, a.join()]).size).toBeGreaterThan(1);
  });
});
