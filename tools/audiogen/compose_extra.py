"""The other original pieces: menu loop, tension stem (final-seconds layer) and the three result stings."""
from __future__ import annotations

import numpy as np

import dsp
import instruments as ins
from compose_match import CH
from songlib import Chord, Song, master

CH2 = dict(CH)
CH2["Dm7"] = Chord(38, 3, [50, 57, 60, 65, 69, 72], [50, 57, 60, 65])

PLATE = None


def _plate():
    global PLATE
    if PLATE is None:
        PLATE = {"plate": dsp.make_reverb_ir(2.2, 1.7, 0.016, 5000, seed=23)}
    return PLATE


# ============================================================================== menu loop
MENU_PROG = (
    ["Fmaj7", "Em7", "Dm7", "Cadd9", "Fmaj7", "Em7", "Dm7", "G"]
    + ["Am7", "Fmaj7", "Cadd9", "G", "Fmaj7", "Em7", "Dm7", "G"]
)
MENU_MEL = [
    [(0, 81, 2), (2, 84, 1), (3, 81, 3), (8, 79, 2), (10, 81, 4)],
    [(0, 79, 2), (2, 83, 1), (3, 79, 3), (8, 76, 2), (10, 79, 4)],
    [(0, 77, 2), (2, 81, 1), (3, 77, 3), (8, 74, 2), (10, 77, 2), (12, 79, 2)],
    [(0, 76, 4), (6, 79, 2), (8, 84, 4), (12, 79, 4)],
]


def render_menu(seed: int = 100) -> np.ndarray:
    s = Song(100.0, 16, seed)
    for bar in range(16):
        ch = CH2[MENU_PROG[bar]]
        odd = bar % 2 == 1
        # drums: kept low and sparse, the groove is carried by shaker, congas and bass
        for k in ([0, 10] if not odd else [0, 7, 10]):
            s.put("kick", ins.kick(s.vel(0.8, 0.04), 1.1), bar, k)
            s.kicks.append(s.at(bar, k))
        s.put("snare", ins.rim(s.vel(0.6, 0.05)), bar, 12, pan=-0.1)
        if bar >= 4:
            s.put("snare", ins.rim(s.vel(0.5, 0.05)), bar, 4, pan=-0.1)
        for st in range(16):
            s.put("shaker", ins.shaker(s.vel(0.45 * [1.0, 0.35, 0.65, 0.4][st % 4], 0.05), long=(st % 8 == 6)), bar, st, pan=-0.25 if (st // 2) % 2 == 0 else 0.25, human_ms=1.5)
        for st, kind, v in ([(2, "open", 0.45), (6, "slap", 0.5), (8, "low", 0.5), (11, "open", 0.4), (14, "mute", 0.4)] if not odd else [(3, "open", 0.45), (7, "slap", 0.5), (10, "low", 0.5), (14, "slap", 0.45)]):
            s.put("perc", ins.conga(kind, 1.0, s.vel(v, 0.05)), bar, st, pan=-0.45, human_ms=2)
        if bar >= 8:
            for i, st in enumerate((0, 3, 6, 10, 12)):
                s.put("perc", ins.agogo(i % 2 == 0, s.vel(0.3, 0.04)), bar, st, pan=0.3)
            for st in (2, 6, 10, 14):
                s.put("hat", ins.hat(False, s.vel(0.35, 0.05)), bar, st, pan=0.2, late_ms=3)
        # bass
        r, t3 = ch.root, ch.third
        pat = [(0, r, 3, 0.85), (6, r + 7, 1.8, 0.7), (10, r, 2.2, 0.75), (14, r + t3, 1.8, 0.6)] if not odd else [(0, r, 2.6, 0.85), (7, r + 12, 1.6, 0.65), (10, r + 7, 2.4, 0.72)]
        for st, m, d, v in pat:
            s.put("bass", ins.bass(m, s.steps(d), s.vel(v, 0.04)), bar, st)
        # guitar: soft rolling arpeggio, nylon colour
        arp = [(0, 0), (2, 2), (4, 3), (6, 4), (8, 2), (10, 3), (12, 4), (14, 3)]
        for st, idx in arp:
            s.put("guitar", ins.guitar(ch.tones[idx], s.steps(2.4), s.vel(0.55 if st % 4 else 0.7, 0.05), mute=0.15, kind="nylon", seed=bar * 16 + st), bar, st, pan=-0.35 + 0.05 * (st % 5), human_ms=2)
        # keys and pad
        if bar >= 2:
            for k, m in enumerate(ch.tones[1:5]):
                s.put("keys", ins.epiano(m, s.steps(8), s.vel(0.35, 0.03)), bar, 8 + 0.05 * k, pan=0.3)
        s.group("pad").add(ins.pad(ch.pad, s.steps(16)), s.at(bar, 0), 0.0, 0.7)
        # melody (kalimba) on bars 4-7 and 12-15
        if (4 <= bar < 8) or bar >= 12:
            for st, m, d in MENU_MEL[bar % 4]:
                s.put("lead", ins.kalimba(m, s.steps(d), s.vel(0.62, 0.04)), bar, st, pan=0.05, human_ms=1.5)
    spec = {
        "kick": {"gain": 0.95},
        "snare": {"gain": 0.8, "rev": 0.2},
        "hat": {"gain": 0.5, "hp": 400},
        "shaker": {"gain": 0.55, "hp": 900},
        "perc": {"gain": 0.7, "rev": 0.15, "hp": 120},
        "bass": {"gain": 0.95, "sc": 0.35, "lp": 2600},
        "guitar": {"gain": 0.95, "rev": 0.25, "dly": 0.3, "dly_time": 3 * s.step_f / dsp.SR, "dly_fb": 0.4, "hp": 130},
        "keys": {"gain": 0.55, "rev": 0.35, "hp": 160},
        "pad": {"gain": 0.5, "rev": 0.45, "sc": 0.35, "width": 1.4, "hp": 140},
        "lead": {"gain": 0.6, "rev": 0.3, "dly": 0.35, "dly_time": 3 * s.step_f / dsp.SR, "dly_fb": 0.5, "hp": 220},
    }
    bar_gain = [0.85] * 4 + [0.95] * 4 + [1.0] * 4 + [0.95] * 4
    return master(s, spec, _plate(), -17.0, bar_gain)


# ============================================================================== tension stem
def render_tension(seed: int = 54) -> np.ndarray:
    """8 bars of pure percussion that sits on top of the match loop in the last seconds. No pitch, so it
    can never clash with whatever chord the main loop is on; phase-locked because 8 bars divide 32."""
    s = Song(108.0, 8, seed)
    for bar in range(8):
        ramp = 0.75 + 0.25 * (bar / 7)
        for k in (0, 4, 8, 12):  # four on the floor, quiet: a pulse rather than a beat
            s.put("kick", ins.kick(s.vel(0.5 * ramp, 0.03), 0.8), bar, k)
        for st in range(16):
            s.put("shaker", ins.shaker(s.vel(0.5 * [1.0, 0.6, 0.85, 0.6][st % 4] * ramp, 0.05), long=False), bar, st, pan=-0.3 if st % 2 else 0.3, human_ms=1)
            if st % 2 == 1:
                s.put("hat", ins.hat(st % 4 == 3, s.vel(0.4 * ramp, 0.04)), bar, st, pan=0.2)
        for st in (2, 5, 8, 11, 14):
            s.put("perc", ins.clave(s.vel(0.5 * ramp, 0.04)), bar, st, pan=0.2)
        for st, kind in ((1, "slap"), (4, "open"), (7, "mute"), (9, "slap"), (12, "low"), (15, "slap")):
            s.put("perc", ins.conga(kind, 1.1, s.vel(0.5 * ramp, 0.05)), bar, st, pan=-0.4, human_ms=1.5)
        if bar % 2 == 1:
            for i in range(4):
                s.put("snare", ins.rim(s.vel(0.35 + 0.1 * i, 0.03)), bar, 12 + i)
    s.group("fx").add(ins.riser(4 * 16 * s.step_f / dsp.SR, 0.55), s.at(4, 0), 0.0, 1.0)
    spec = {
        "kick": {"gain": 0.7}, "shaker": {"gain": 0.75, "hp": 900}, "hat": {"gain": 0.5, "hp": 500},
        "perc": {"gain": 0.8, "rev": 0.1, "hp": 150}, "snare": {"gain": 0.7, "rev": 0.1}, "fx": {"gain": 0.6},
    }
    return master(s, spec, _plate(), -19.0)


# ============================================================================== stings
def _chord_hit(s: Song, group: str, ch: Chord, bar: int, step: float, dur: float, vel: float, kind: str = "epiano") -> None:
    for k, m in enumerate(ch.tones[:5]):
        if kind == "epiano":
            s.put(group, ins.epiano(m, s.steps(dur), vel), bar, step + 0.03 * k, pan=0.1)
        else:
            s.put(group, ins.guitar(m, s.steps(dur), vel, kind="electric", seed=int(step) + k), bar, step + 0.4 * k, pan=-0.2)


def render_win() -> np.ndarray:
    s = Song(108.0, 6, 7)
    # bar 0: pickup roll; bar 1: arrival on Cadd9 with the hook shape; bar 2-3: Fmaj7 -> Cadd9 resolution
    for i, st in enumerate(range(8, 16)):
        s.put("snare", ins.snare(s.vel(0.35 + 0.08 * i, 0.02)), 0, st)
    s.put("perc", ins.talking_drum([(0, 0.9), (0.4, 1.9), (0.7, 1.2), (1, 2.0)], s.steps(4), 0.85), 0, 12.0, pan=0.4)
    s.put("fx", ins.crash(0.9), 1, 0)
    s.put("kick", ins.kick(1.0), 1, 0)
    _chord_hit(s, "keys", CH["Cadd9"], 1, 0, 6, 0.8)
    _chord_hit(s, "guitar", CH["Cadd9"], 1, 0, 6, 0.8, "gtr")
    s.group("pad").add(ins.pad(CH["Cadd9"].pad, s.steps(30)), s.at(1, 0), 0.0, 1.0)
    for st, m, d in [(0, 84, 3), (3, 84, 2), (6, 86, 2), (8, 88, 4), (12, 84, 2), (14, 79, 2)]:
        s.put("lead", ins.kalimba(m, s.steps(d), 0.85), 1, st, pan=0.05)
    for st, m, d in [(0, 88, 3), (3, 88, 2), (6, 91, 2), (8, 93, 12)]:
        s.put("lead", ins.kalimba(m, s.steps(d), 0.8), 2, st, pan=0.05)
    for bar in (1, 2):
        for k in (0, 7, 10):
            s.put("kick", ins.kick(0.9), bar, k)
        s.put("snare", ins.clap(0.8), bar, 4)
        s.put("snare", ins.clap(0.9), bar, 12)
        for st in range(16):
            s.put("shaker", ins.shaker(0.5 * [1, .35, .65, .4][st % 4]), bar, st, pan=-0.2 if st % 2 else 0.2)
        for i, st in enumerate((0, 3, 6, 10, 12)):
            s.put("perc", ins.agogo(i % 2 == 0, 0.5), bar, st, pan=0.3)
    s.put("bass", ins.bass(48, s.steps(10), 0.95), 1, 0)
    s.put("bass", ins.bass(36, s.steps(14), 0.95), 2, 0)
    spec = {"kick": {"gain": 1.0}, "snare": {"gain": 0.8, "rev": 0.2}, "shaker": {"gain": 0.6, "hp": 900},
            "perc": {"gain": 0.8, "rev": 0.15}, "bass": {"gain": 1.0, "lp": 2800}, "guitar": {"gain": 0.9, "rev": 0.25, "hp": 130},
            "keys": {"gain": 0.7, "rev": 0.3, "hp": 150}, "pad": {"gain": 0.5, "rev": 0.5, "width": 1.4},
            "lead": {"gain": 0.7, "rev": 0.35, "dly": 0.3, "dly_time": 3 * s.step_f / dsp.SR, "dly_fb": 0.4, "hp": 220},
            "fx": {"gain": 0.7, "rev": 0.2}}
    return _trim_tail(master(s, spec, _plate(), -14.0), 8.2)


def render_lose() -> np.ndarray:
    """Wry, not tragic: a slow descending Am7 guitar line over a muted conga shuffle and one low note."""
    s = Song(96.0, 5, 8)
    ch = CH["Am7"]
    for i, (st, m) in enumerate([(0, 76), (3, 72), (6, 69), (10, 64), (14, 57)]):
        s.put("guitar", ins.guitar(m, s.steps(3.5), 0.7, kind="nylon", seed=40 + i), 0, st, pan=-0.1)
    s.group("pad").add(ins.pad(ch.pad, s.steps(26)), s.at(0, 0), 0.0, 0.9)
    _chord_hit(s, "keys", ch, 1, 0, 14, 0.5)
    s.put("bass", ins.bass(33 + 12, s.steps(16), 0.9), 1, 0)
    for st, kind in ((2, "mute"), (6, "open"), (10, "low"), (14, "mute")):
        s.put("perc", ins.conga(kind, 1.0, 0.45), 0, st, pan=-0.4)
    s.put("kick", ins.kick(0.8, 1.2), 1, 0)
    for st in (0, 2, 4, 6, 8, 10, 12, 14):
        s.put("shaker", ins.shaker(0.3), 0, st, pan=0.2)
    spec = {"kick": {"gain": 0.9}, "perc": {"gain": 0.7, "rev": 0.2}, "bass": {"gain": 0.95, "lp": 2400},
            "guitar": {"gain": 1.0, "rev": 0.35, "hp": 130}, "keys": {"gain": 0.6, "rev": 0.4}, "pad": {"gain": 0.5, "rev": 0.5, "width": 1.3},
            "shaker": {"gain": 0.5, "hp": 900}}
    return _trim_tail(master(s, spec, _plate(), -17.0), 6.5)


def render_draw() -> np.ndarray:
    """Unresolved: a bright Gsus-ish suspension that hangs, then a soft rim and shaker flourish."""
    s = Song(108.0, 5, 9)
    g = CH["G"]
    _chord_hit(s, "keys", g, 0, 0, 12, 0.7)
    _chord_hit(s, "guitar", g, 0, 0, 12, 0.7, "gtr")
    s.group("pad").add(ins.pad([55, 60, 62, 67], s.steps(30)), s.at(0, 0), 0.0, 0.9)
    s.put("bass", ins.bass(43, s.steps(12), 0.9), 0, 0)
    for st, m, d in [(0, 74, 2), (2, 79, 2), (4, 77, 3), (8, 74, 6)]:
        s.put("lead", ins.kalimba(m, s.steps(d), 0.7), 0, st, pan=0.05)
    s.put("kick", ins.kick(0.9), 0, 0)
    for st in (4, 12):
        s.put("snare", ins.rim(0.8), 0, st)
    for st in range(16):
        s.put("shaker", ins.shaker(0.4 * [1, .35, .65, .4][st % 4]), 0, st, pan=-0.2 if st % 2 else 0.2)
    for i, (kind) in enumerate(("slap", "open", "low")):
        s.put("perc", ins.conga(kind, 1.0, 0.55), 1, 8 + 2 * i, pan=-0.4)
    spec = {"kick": {"gain": 0.9}, "snare": {"gain": 0.8, "rev": 0.2}, "perc": {"gain": 0.7, "rev": 0.2},
            "bass": {"gain": 1.0, "lp": 2600}, "guitar": {"gain": 0.9, "rev": 0.3, "hp": 130}, "keys": {"gain": 0.65, "rev": 0.35},
            "pad": {"gain": 0.5, "rev": 0.5, "width": 1.4}, "shaker": {"gain": 0.5, "hp": 900},
            "lead": {"gain": 0.65, "rev": 0.35, "hp": 220}}
    return _trim_tail(master(s, spec, _plate(), -17.0), 6.5)


def _trim_tail(x: np.ndarray, seconds: float) -> np.ndarray:
    """Cuts a non-looping piece to `seconds` with a smooth fade out and fades the first 2 ms in."""
    n = int(seconds * dsp.SR)
    y = x[:n].copy()
    fade = int(1.2 * dsp.SR)
    y[-fade:] *= (np.linspace(1, 0, fade) ** 2)[:, None]
    a = int(0.002 * dsp.SR)
    y[:a] *= np.linspace(0, 1, a)[:, None]
    return y
