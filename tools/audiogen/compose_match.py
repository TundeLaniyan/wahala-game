"""'Lagos Lunch Rush': the in-match Afrobeats-inspired loop (original composition, 108 BPM, A minor).

32 bars (about 71 s): A groove (8) / B hook (8) / A2 variation + talking-drum fill (8) / C breakdown and build (8).
Every note below was written for this project; nothing is sampled from or modelled on an existing recording.
"""
from __future__ import annotations

import numpy as np

import dsp
import instruments as ins
from songlib import Chord, Song, n

BPM = 108

CH = {
    "Am7": Chord(45, 3, [57, 64, 67, 72, 76, 79], [57, 60, 64, 67]),
    "Fmaj7": Chord(41, 4, [53, 60, 64, 69, 72, 76], [53, 57, 60, 64]),
    "Cadd9": Chord(48, 4, [55, 60, 64, 67, 71, 74], [48, 55, 59, 64]),
    "G": Chord(43, 4, [55, 62, 67, 71, 74, 79], [55, 59, 62, 67]),
    "Em7": Chord(40, 3, [55, 59, 64, 67, 71, 74], [52, 55, 59, 62]),
}
A_PROG = ["Am7", "Fmaj7", "Cadd9", "G"] * 2
B_PROG = ["Fmaj7", "G", "Am7", "Am7", "Fmaj7", "G", "Em7", "Am7"]
C_PROG = ["Am7", "Fmaj7", "Cadd9", "G", "Fmaj7", "G", "Am7", "Am7"]
PROG = A_PROG + B_PROG + A_PROG + C_PROG

# hook H1 (A2 section, over Am7 | Fmaj7 | Cadd9 | G): (step, midi, dur_steps)
H1 = [
    [(0, 76, 3), (3, 76, 2), (6, 79, 2), (8, 81, 3), (12, 79, 2), (14, 76, 2)],
    [(0, 72, 3), (3, 72, 2), (6, 74, 2), (8, 77, 3), (12, 76, 2), (14, 72, 2)],
    [(0, 76, 3), (3, 76, 2), (6, 79, 2), (8, 84, 3), (12, 79, 2), (14, 76, 2)],
    [(0, 74, 3), (3, 74, 2), (6, 76, 1), (7, 74, 1), (8, 71, 4), (15, 76, 1)],
]
# hook H2 (B section): eight bars
H2 = [
    [(0, 84, 3), (3, 81, 2), (6, 84, 2), (8, 86, 3), (12, 84, 2), (14, 81, 2)],
    [(0, 83, 3), (3, 79, 2), (6, 83, 2), (8, 86, 3), (12, 83, 4)],
    [(0, 81, 3), (3, 76, 2), (6, 81, 2), (8, 84, 3), (12, 83, 2), (14, 81, 2)],
    [(0, 76, 4), (6, 79, 2), (8, 81, 6), (15, 76, 1)],
    [(0, 84, 3), (3, 81, 2), (6, 84, 2), (8, 86, 3), (12, 84, 2), (14, 81, 2)],
    [(0, 83, 3), (3, 86, 2), (6, 88, 2), (8, 86, 3), (12, 83, 2), (14, 79, 2)],
    [(0, 79, 3), (3, 83, 2), (6, 88, 2), (8, 86, 3), (12, 83, 4)],
    [(0, 84, 3), (3, 81, 2), (6, 76, 2), (8, 81, 8)],
]

RIFF_A = [(0, 0, 1.5, 0.9, 0.0), (3, 2, 1, 0.55, 0.7), (4, 1, 1, 0.6, 0.7), (6, 3, 1.5, 0.8, 0.0), (8, 2, 1, 0.55, 0.7),
          (10, 4, 1, 0.75, 0.3), (11, 3, 1, 0.55, 0.7), (14, 1, 2, 0.8, 0.0)]
RIFF_B = [(0, 0, 1.5, 0.9, 0.0), (2, 1, 1, 0.55, 0.7), (3, 2, 1, 0.6, 0.7), (6, 4, 1.5, 0.8, 0.0), (8, 3, 1, 0.55, 0.7),
          (9, 2, 1, 0.5, 0.7), (11, 1, 1, 0.7, 0.3), (14, 3, 2, 0.8, 0.0)]
ARP_C = [(0, 0, 3, 0.7, 0.0), (3, 2, 3, 0.6, 0.0), (6, 3, 3, 0.65, 0.0), (9, 4, 3, 0.6, 0.0), (12, 3, 2, 0.6, 0.0), (14, 2, 2, 0.55, 0.0)]


def _drums(s: Song, bar: int, sec: str) -> None:
    b = bar
    odd = b % 2 == 1
    in_c_quiet = sec == "C" and bar - 24 < 4
    in_c_build = sec == "C" and bar - 24 >= 4
    # ---- kick
    if not in_c_quiet:
        if in_c_build and bar - 24 < 7:
            kicks = [0, 8] if bar - 24 < 6 else [0, 4, 8, 12]
        else:
            kicks = [0, 7, 10] if not odd else [0, 6, 10, 14]
            if sec == "B":
                kicks = [0, 6, 10, 13] if odd else [0, 7, 10]
        for k in kicks:
            s.put("kick", ins.kick(s.vel(0.95, 0.04)), b, k)
            s.kicks.append(s.at(b, k))
    # ---- rim / clap
    if not in_c_quiet:
        for st, v in ((4, 0.85), (12, 0.95)):
            if in_c_build and bar - 24 >= 6:
                continue
            s.put("snare", ins.rim(s.vel(v, 0.05)), b, st, pan=-0.1, human_ms=1.5)
        if sec in ("A", "A2", "B") and not (sec == "A" and bar < 2):
            s.put("snare", ins.rim(s.vel(0.3, 0.05)), b, 7 if not odd else 15, pan=0.1)
        if sec in ("B", "A2"):
            s.put("snare", ins.clap(s.vel(0.85, 0.05)), b, 12, pan=0.1)
            if sec == "B":
                s.put("snare", ins.clap(s.vel(0.4, 0.05)), b, 4, pan=-0.1)
    # ---- build: rim roll on the last two bars of C, crash entering the loop
    if in_c_build and bar - 24 >= 6:
        steps = list(range(0, 16, 2)) if bar - 24 == 6 else list(range(0, 16))
        for i, st in enumerate(steps):
            v = 0.3 + 0.65 * (i / max(1, len(steps) - 1))
            s.put("snare", ins.snare(s.vel(v, 0.03)) if i % 2 == 0 else ins.rim(s.vel(v, 0.03)), b, st, pan=(-1) ** i * 0.15)
    # ---- hats
    for st in range(16):
        if sec == "A" and bar < 2 and st % 4:
            continue
        if st % 2 == 0:
            v = 0.62 if st % 4 == 0 else 0.45
            if in_c_quiet:
                continue
            s.put("hat", ins.hat(False, s.vel(v, 0.06)), b, st, pan=0.2, human_ms=1.2, late_ms=3 if st % 4 else 0)
        elif sec in ("B", "A2") and st % 4 == 3:
            s.put("hat", ins.hat(False, s.vel(0.25, 0.04)), b, st, pan=0.25, late_ms=5)
    if sec in ("A", "A2", "B") and odd:
        s.put("hat", ins.hat(True, s.vel(0.5, 0.05)), b, 14, pan=0.25)
    # ---- shaker: 16ths with accent contour; seed-shaker throughout
    acc = [1.0, 0.35, 0.65, 0.4]
    for st in range(16):
        base = 0.58 * acc[st % 4]
        if in_c_quiet:
            base *= 0.9
        s.put("shaker", ins.shaker(s.vel(base, 0.06), long=(st % 8 == 6)), b, st, pan=-0.28 if (st // 2) % 2 == 0 else 0.28, human_ms=1.5)
    # ---- congas
    cong_a = [(2, "open", 0.55), (3, "mute", 0.4), (6, "slap", 0.6), (8, "low", 0.62), (11, "open", 0.5), (14, "mute", 0.45), (15, "heel", 0.35)]
    cong_b = [(3, "open", 0.55), (6, "mute", 0.4), (7, "slap", 0.6), (10, "low", 0.62), (12, "open", 0.5), (14, "slap", 0.55), (15, "mute", 0.4)]
    if not (sec == "A" and bar < 1):
        for st, kind, v in (cong_b if odd else cong_a):
            if in_c_quiet and st % 2 == 0 and kind in ("slap", "low"):
                v *= 0.8
            s.put("perc", ins.conga(kind, 1.0 if kind != "low" else 1.0, s.vel(v, 0.06)), b, st, pan=-0.45, human_ms=2)
    # ---- bongos + agogo + clave
    if sec in ("B", "A2"):
        bong = [(1, True), (5, False), (9, True), (13, False)] if not odd else [(2, True), (5, True), (10, False), (13, True)]
        for i, (st, hi) in enumerate(bong):
            s.put("perc", ins.bongo(hi, s.vel(0.5, 0.05)), b, st, pan=0.5, human_ms=2)
        for i, st in enumerate((0, 3, 6, 10, 12)):
            s.put("perc", ins.agogo(i % 2 == 0, s.vel(0.5 if st in (0, 6) else 0.38, 0.04)), b, st, pan=0.32)
    if sec == "A2" or (sec == "A" and bar >= 4):
        s.put("perc", ins.clave(s.vel(0.55, 0.05)), b, 3, pan=0.15)
        s.put("perc", ins.clave(s.vel(0.5, 0.05)), b, 10, pan=0.15)
    if sec in ("A2", "B") and odd:
        s.put("perc", ins.cowbell(s.vel(0.35, 0.05)), b, 14, pan=0.1)


def _bass(s: Song, bar: int, sec: str, chord: Chord) -> None:
    r, t3 = chord.root, chord.third
    odd = bar % 2 == 1
    c_quiet = sec == "C" and bar - 24 < 4
    if c_quiet:
        pat = [(0, r, 7.5, 0.8), (8, r + 7, 6, 0.65)]
    elif sec == "B":
        pat = [(0, r, 2.4, 0.95), (3, r + 12, 0.8, 0.6), (6, r + 7, 1.4, 0.8), (8, r, 1.8, 0.85), (10, r + t3, 1.2, 0.7), (12, r + 7, 1.5, 0.75), (14, r + 12, 1.5, 0.7)]
    elif odd:
        pat = [(0, r, 2.8, 0.95), (3, r, 0.8, 0.55), (6, r + 12, 1.2, 0.75), (7, r + 7, 1.8, 0.8), (10, r, 2.0, 0.85), (13, r + 7, 0.8, 0.6), (14, r + t3, 1.6, 0.7)]
    else:
        pat = [(0, r, 2.5, 0.95), (3, r + 12, 0.8, 0.6), (6, r, 1.5, 0.8), (7, r + 7, 1.2, 0.75), (10, r, 2.4, 0.85), (13, r + 12, 0.8, 0.6), (14, r + 7, 1.6, 0.7)]
    for i, (st, m, d, v) in enumerate(pat):
        glide = (m - 12) if (sec in ("A2", "B") and st == 6 and m >= r + 12 and not odd) else None
        s.put("bass", ins.bass(m, s.steps(d), s.vel(v, 0.04), glide_from=glide), bar, st)


def _guitar(s: Song, bar: int, sec: str, chord: Chord, local: int) -> None:
    if sec == "C" and bar - 24 < 4:
        pat, vel_scale = ARP_C, 0.9
    elif sec == "C":
        pat, vel_scale = RIFF_A, 1.0
    elif sec == "B":
        # lighter, upstroke chops under the hook
        pat = [(2, 1, 1, 0.5, 0.8), (6, 2, 1, 0.55, 0.7), (10, 1, 1, 0.5, 0.8), (14, 3, 1, 0.55, 0.7)]
        vel_scale = 0.9
    else:
        pat, vel_scale = (RIFF_A if local % 2 == 0 else RIFF_B), 1.0
    tones = chord.tones
    for st, idx, d, v, mute in pat:
        m = tones[idx % len(tones)]
        if sec == "B" or (sec == "C" and bar - 24 < 4):
            m = m
        pan = -0.38 + 0.08 * (st % 3)
        s.put("guitar", ins.guitar(m, s.steps(d), s.vel(v * vel_scale, 0.06), mute=mute, seed=bar * 16 + st), bar, st, pan=pan, human_ms=2)


def _keys(s: Song, bar: int, sec: str, chord: Chord) -> None:
    if sec == "B" or sec == "A2":
        stabs = [(6, 2.2, 0.55), (10, 1.5, 0.45), (14, 2.0, 0.55)]
        for st, d, v in stabs:
            for k, m in enumerate(chord.tones[1:5]):
                s.put("keys", ins.epiano(m - 0, s.steps(d), s.vel(v * (1.0 - 0.06 * k), 0.04)), bar, st + 0.04 * k, pan=0.3, human_ms=1)
    elif sec == "C" and bar - 24 < 4:
        for k, m in enumerate(chord.tones[1:5]):
            s.put("keys", ins.epiano(m, s.steps(14), s.vel(0.4, 0.03)), bar, 0.05 * k, pan=0.25)


def _pad(s: Song, bar: int, sec: str, chord: Chord) -> None:
    if sec in ("B", "C") or (sec == "A2" and bar % 2 == 0):
        dur = s.steps(16)
        s.group("pad").add(ins.pad([m for m in chord.pad], dur), s.at(bar, 0), 0.0, 0.8 if sec == "B" else 1.0)


def _lead(s: Song, bar: int, sec: str, local: int) -> None:
    if sec == "B":
        for st, m, d in H2[local]:
            s.put("lead", ins.kalimba(m, s.steps(d), s.vel(0.8, 0.04)), bar, st, pan=0.05, human_ms=1.5)
    elif sec == "A2":
        for st, m, d in H1[local % 4]:
            s.put("lead", ins.pluck_synth(m, s.steps(d), s.vel(0.75, 0.04)), bar, st, pan=0.1, human_ms=1.5)
            s.put("lead2", ins.epiano(m - 12, s.steps(d), s.vel(0.45, 0.04)), bar, st, pan=-0.2)
    elif sec == "A" and bar >= 6:
        # a teaser of the hook (first two bars of H1) before the B section arrives
        if local in (6, 7):
            for st, m, d in H1[local - 6][:3]:
                s.put("lead", ins.pluck_synth(m, s.steps(d), s.vel(0.55, 0.04)), bar, st, pan=0.1)
    elif sec == "C" and bar - 24 >= 4:
        for st, m, d in H1[(bar - 24) % 4]:
            s.put("lead", ins.pluck_synth(m, s.steps(d), s.vel(0.5 + 0.08 * (bar - 28), 0.04)), bar, st, pan=0.1)


def _fills(s: Song, bar: int, sec: str) -> None:
    # talking-drum phrases and conga fills at section ends
    if bar == 15:
        for i, (st, kind) in enumerate([(12, "slap"), (13, "open"), (14, "low"), (15, "slap")]):
            s.put("perc", ins.conga(kind, 1.1 - 0.05 * i, s.vel(0.7, 0.05)), bar, st, pan=-0.4)
    if bar == 22:
        s.put("perc", ins.talking_drum([(0, 0.8), (0.3, 1.5), (0.6, 1.1), (1, 1.7)], s.steps(3.5), 0.8), bar, 12.0, pan=0.4)
    if bar == 23:
        s.put("perc", ins.talking_drum([(0, 1.0), (0.25, 1.9), (0.5, 1.2), (0.75, 1.6), (1, 0.9)], s.steps(5), 0.85), bar, 8.0, pan=0.4)
        for i, st in enumerate((12, 13, 14, 15)):
            s.put("snare", ins.snare(s.vel(0.5 + 0.12 * i, 0.03)), bar, st)
    if bar == 7:
        s.put("perc", ins.talking_drum([(0, 0.9), (0.5, 1.6), (1, 1.2)], s.steps(3), 0.6), bar, 13.0, pan=0.4)
    if bar == 31:
        for i, st in enumerate(range(8, 16)):
            s.put("perc", ins.conga("open" if i % 2 else "slap", 1.2 - 0.04 * i, s.vel(0.5 + 0.06 * i, 0.03)), bar, st, pan=-0.4 + 0.1 * (i % 3))
        s.put("perc", ins.talking_drum([(0, 0.8), (0.4, 1.8), (0.7, 1.0), (1, 2.0)], s.steps(4), 0.8), bar, 12.0, pan=0.4)
    if bar in (0, 8, 16):
        s.put("fx", ins.crash(0.6 if bar else 0.5), bar, 0, pan=0.1)
    if bar == 30:
        s.group("fx").add(ins.riser((32 * s.step_f) / dsp.SR, 0.7), s.at(30, 0), 0.0, 1.0)


def render(seed: int = 108) -> tuple[np.ndarray, Song]:
    s = Song(BPM, 32, seed)
    for bar in range(32):
        if bar < 8:
            sec, local = "A", bar
        elif bar < 16:
            sec, local = "B", bar - 8
        elif bar < 24:
            sec, local = "A2", bar - 16
        else:
            sec, local = "C", bar - 24
        chord = CH[PROG[bar]]
        _drums(s, bar, sec)
        _bass(s, bar, sec, chord)
        if not (sec == "C" and 4 <= bar - 24 and bar - 24 >= 6):
            _guitar(s, bar, sec, chord, local)
        _keys(s, bar, sec, chord)
        _pad(s, bar, sec, chord)
        _lead(s, bar, sec, local)
        _fills(s, bar, sec)
    rev = {"plate": dsp.make_reverb_ir(2.0, 1.5, 0.014, 5200, seed=11)}
    from songlib import master

    spec = {
        "kick": {"gain": 1.05},
        "snare": {"gain": 0.82, "rev": 0.16},
        "hat": {"gain": 0.55, "hp": 400},
        "shaker": {"gain": 0.62, "hp": 900},
        "perc": {"gain": 0.78, "rev": 0.12, "hp": 120},
        "bass": {"gain": 1.0, "sc": 0.5, "lp": 3000},
        "guitar": {"gain": 0.95, "rev": 0.2, "dly": 0.25, "dly_time": 3 * s.step_f / dsp.SR, "dly_fb": 0.42, "hp": 130},
        "keys": {"gain": 0.58, "rev": 0.3, "sc": 0.15, "hp": 160},
        "pad": {"gain": 0.45, "rev": 0.45, "sc": 0.55, "width": 1.4, "hp": 140},
        "lead": {"gain": 0.62, "rev": 0.28, "dly": 0.38, "dly_time": 3 * s.step_f / dsp.SR, "dly_fb": 0.5, "hp": 220},
        "lead2": {"gain": 0.5, "rev": 0.3, "hp": 180},
        "fx": {"gain": 0.7, "rev": 0.2},
    }
    bar_gain = (
        [0.72, 0.8, 0.88, 0.9, 0.94, 0.95, 0.98, 1.0]  # A: eases in
        + [1.1] * 8  # B: the hook, fullest part
        + [1.02] * 8  # A2
        + [0.6, 0.6, 0.62, 0.66, 0.78, 0.9, 1.0, 1.06]  # C: breakdown then build
    )
    return master(s, spec, rev, -15.0, bar_gain), s
