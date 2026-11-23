"""WAHALA! — Lagos City Rumble (Main Theme): original composition as data + renderers.

Key: D Dorian / D minor pentatonic centre. Tempo: 112 BPM (one tempo for every cue so
stems, stings and transitions can be beat-synced in-engine). Metre 4/4, 16 steps/bar.

Rhythm identity: a 3-3-3-3-2-2 bell cycle over a 4/4 grid (tresillo cousin), syncopated
kick, rim ghost notes, conga tumbao, talking-drum answers. Hook: the spoken cell
"wa-HA-la" = short / long-accent / short, rising on repeat, falling on answer.
"""
import numpy as np
from functools import lru_cache
from dsp import *
import instruments as I

BPM = 112
STEP = 60.0 / BPM / 4
BAR = STEP * 16


def T(bar, step=0):
    return bar * BAR + step * STEP


# ---------------------------------------------------------------- harmony
CH = {  # name: (bass root midi, stab voicing midi, riff voicing midi)
    "Dm7": (38, [62, 65, 69, 72], [62, 65, 69, 72, 74]),
    "G":   (43, [62, 67, 71, 74], [62, 67, 71, 74, 79]),
    "Am":  (45, [64, 69, 72, 76], [64, 69, 72, 76, 81]),
    "Bb":  (34, [62, 65, 70, 74], [62, 65, 70, 74, 77]),
    "C":   (36, [64, 67, 72, 76], [64, 67, 72, 76, 79]),
    "D":   (38, [62, 66, 69, 74], [62, 66, 69, 74, 78]),   # major (victory)
    "A":   (33, [64, 69, 73, 76], [64, 69, 73, 76, 81]),   # dominant turn-around
}

# ---------------------------------------------------------------- melodies
# (step, midi, length_steps) ; two-bar phrases, step counted from phrase start
HOOK_A = [  # bar 1: wa-HA-la, wa-HA-la(up) ...
    (0, 69, 1), (1, 74, 3), (4, 72, 2), (6, 69, 1), (7, 74, 3), (10, 77, 2), (12, 76, 2), (14, 74, 2),
    # bar 2: answer, falls to D4
    (16, 72, 2), (18, 74, 1), (19, 72, 3), (22, 69, 2), (24, 67, 2), (26, 69, 2), (28, 65, 2), (30, 62, 2),
]
ANSWER = [  # over G | Am
    (0, 71, 1), (1, 74, 3), (4, 71, 2), (6, 67, 1), (7, 71, 3), (10, 74, 2), (12, 79, 4),
    (16, 76, 2), (18, 72, 1), (19, 76, 3), (22, 72, 2), (24, 69, 2), (26, 72, 2), (28, 74, 2), (30, 69, 2),
]
CHORUS = [  # over Bb | C | Dm7 | Dm7  (4 bars, big & chantable)
    (0, 74, 1), (1, 77, 3), (4, 74, 2), (6, 70, 1), (7, 74, 3), (10, 77, 2), (12, 79, 4),
    (16, 76, 1), (17, 79, 3), (20, 76, 2), (22, 72, 1), (23, 76, 3), (26, 79, 2), (28, 81, 4),
    (32, 81, 2), (34, 79, 1), (35, 77, 3), (38, 74, 2), (40, 77, 2), (42, 76, 2), (44, 74, 4),
    (48, 69, 1), (49, 74, 3), (52, 72, 2), (56, 74, 6),
]
HOOK_CELL = [(0, 69, 1), (1, 74, 3), (4, 72, 2)]  # the bare "wa-HA-la"

VICTORY = [  # over D | Bb | C | D  (major lift, F#)
    (0, 69, 1), (1, 74, 3), (4, 78, 2), (6, 74, 1), (7, 78, 3), (10, 81, 2), (12, 81, 4),
    (16, 74, 1), (17, 77, 3), (20, 74, 2), (22, 70, 1), (23, 74, 3), (26, 77, 2), (28, 82, 4),
    (32, 76, 1), (33, 79, 3), (36, 76, 2), (38, 72, 1), (39, 76, 3), (42, 79, 2), (44, 84, 4),
    (48, 78, 2), (50, 81, 2), (52, 86, 12),
]


# ---------------------------------------------------------------- cached voices
@lru_cache(None)
def v_kick(): return I.kick()
@lru_cache(None)
def v_clap(): return I.clap()
@lru_cache(None)
def v_rim(): return I.rim()
@lru_cache(None)
def v_hat(o=False): return I.hat(open_=o)
@lru_cache(None)
def v_shaker(k=0): return I.shaker(seed=50 + k)
@lru_cache(None)
def v_conga(f, slap): return I.conga(f, slap=slap)
@lru_cache(None)
def v_bell(f): return I.agogo(f)
@lru_cache(None)
def v_pluck(m, sec): return I.pluck(float(midi(m)), sec)


def vel_arr(sig, v): return sig * v


# ---------------------------------------------------------------- layers
KICK_GROOVE = [0, 7, 10]
KICK_DRIVE = [0, 4, 8, 12]
BELL = [(0, 880.0), (3, 587.3), (6, 587.3), (9, 880.0), (12, 587.3), (14, 880.0)]  # 3-3-3-3-2-2


def drums(tr, bar, kick_steps=KICK_GROOVE, clap=True, hats=True, shaker=True, bells=True,
          congas=True, open_hats=(14,), kick_gain=1.0, gain=1.0, drive=False, rim=True):
    for s in kick_steps:
        tr.add(v_kick(), T(bar, s), 0.95 * kick_gain * gain, 0)
    if clap:
        for s in (4, 12):
            tr.add(v_clap(), T(bar, s), 0.75 * gain, 0.05, haas_ms=6)
    if rim:
        for s in (9, 15):
            tr.add(v_rim(), T(bar, s), 0.35 * gain, -0.3)
    if hats:
        for s in range(16):
            if s in open_hats:
                tr.add(v_hat(True), T(bar, s), 0.5 * gain, 0.2)
            elif s % 2 == 0 and s not in (0, 4, 12):
                tr.add(v_hat(), T(bar, s), (0.85 if s % 4 == 2 else 0.4) * gain, 0.2)
            elif drive and s % 2 == 1:
                tr.add(v_hat(), T(bar, s), 0.3 * gain, 0.2)
    if shaker:
        for s in range(16):
            accent = s in (0, 3, 6, 9, 12, 14)
            tr.add(v_shaker(s % 4), T(bar, s), (0.9 if accent else 0.42) * gain, -0.35)
    if bells:
        for s, f in BELL:
            tr.add(v_bell(f), T(bar, s), 0.42 * gain, 0.35)
    if congas:
        for s in (2, 5, 10, 13):
            tr.add(v_conga(330.0, False), T(bar, s), 0.55 * gain, -0.45)
        for s in (0, 8):
            tr.add(v_conga(230.0, False), T(bar, s), 0.6 * gain, -0.5)
        for s in (7, 15):
            tr.add(v_conga(330.0, True), T(bar, s), 0.5 * gain, -0.45)


BASS_A = [(0, 0, 3), (3, 0, 2), (6, 7, 1), (8, 0, 2), (10, 0, 2), (12, 7, 2), (14, 5, 1), (15, 7, 1)]
BASS_SPARSE = [(0, 0, 4), (6, 0, 2), (10, 7, 3), (14, 0, 1)]


def bass(tr, bar, chord, pattern=BASS_A, gain=1.0):
    root = CH[chord][0]
    for s, off, ln in pattern:
        sec = ln * STEP * 0.92
        tr.add(I.sub_bass(float(midi(root + off)), sec), T(bar, s), 0.9 * gain, 0)


def stabs(tr, bar, chord, steps=(3, 6, 10), gain=1.0, bright=3600.0):
    for s in steps:
        tr.add(I.brass_stab([float(midi(m)) for m in CH[chord][1]], 0.2, bright=bright), T(bar, s), 0.5 * gain, 0.25, haas_ms=9)


RIFF_STEPS = [0, 3, 6, 8, 11, 14]
RIFF_IDX = [0, 2, 1, 3, 2, 4]


def riff(tr, bar, chord, gain=1.0, octave=0):
    notes = CH[chord][2]
    for s, i in zip(RIFF_STEPS, RIFF_IDX):
        m = notes[i % len(notes)] + 12 + octave
        tr.add(v_pluck(m, 0.55), T(bar, s), 0.5 * gain, -0.2 if s % 2 else 0.2)


def melody(tr, bar0, notes, gain=1.0, pluck_dbl=True, horn=True, pan=0.0):
    for s, m, ln in notes:
        t = T(bar0) + s * STEP
        sec = max(ln * STEP * 0.97, STEP * 0.8)
        if horn:
            tr.add(I.horn_lead(float(midi(m)), sec), t, 0.62 * gain, pan, haas_ms=5)
        if pluck_dbl:
            tr.add(v_pluck(m + 12, min(sec + 0.3, 0.9)), t, 0.30 * gain, pan - 0.15)


def talking_fill(tr, bar, seq=None, gain=1.0, start_step=10):
    seq = seq or [(0, 190, 150), (2, 150, 230), (3, 260, 180), (4, 190, 300), (6, 230, 150)]
    for off, f0, f1 in seq:
        s = start_step + off
        tr.add(I.talking_drum(f0, f1, 0.3), T(bar, s), 0.7 * gain, 0.4)


def pad_chords(tr, bar, chord, bars=1, gain=1.0):
    tr.add(I.pad([float(midi(m - 12)) for m in CH[chord][1][1:]], BAR * bars + 0.2), T(bar), 0.28 * gain, 0, haas_ms=11)


# ---------------------------------------------------------------- finishing
def finish_music(tr, wet=0.16, delay=0.0, mid_pocket=False, comp=True, target_peak_db=-1.0):
    ir = make_ir(1.4)
    if delay:
        stereo_delay(tr, wet=delay)
    reverb(tr, wet=wet, ir=ir)
    if mid_pocket:  # carve a pocket where danger SFX live (2-5 kHz) so cues stay intelligible
        tr.buf = peq(tr.buf, 3200.0, -4.0, 0.8)
        tr.buf = peq(tr.buf, 1100.0, -1.5, 0.8)
    if comp:
        tr.buf = bus_compress(tr.buf, thresh_db=-17, ratio=2.8, release_ms=140)
    tr.buf = hp(tr.buf, 28, 1)
    return tr


# ================================================================ CUES
def render_menu(loop=True):
    """16-bar loopable main-menu theme (34.3 s)."""
    bars = 16
    tr = Track(bars * BAR, loop=loop, tail=2.5)
    prog = ["Dm7", "Dm7", "G", "Am"] * 2 + ["Bb", "C", "Dm7", "Dm7"] + ["Dm7", "Dm7", "G", "A"]
    for b in range(bars):
        ch = prog[b]
        section = b // 4
        pad_chords(tr, b, ch, 1, gain=0.8 if section != 2 else 1.1)
        kick = KICK_DRIVE if section == 2 else KICK_GROOVE
        if b == 15:
            drums(tr, b, kick_steps=[0, 7], hats=True, congas=True, clap=False, bells=False, open_hats=())
        else:
            drums(tr, b, kick_steps=kick, drive=(section == 2), gain=0.9 if section == 0 else 1.0,
                  hats=(b > 0), congas=(b > 1 or section > 0))
        bass(tr, b, ch, BASS_A if section != 0 or b >= 2 else BASS_SPARSE, gain=0.95)
        if section in (0, 3):
            riff(tr, b, ch, gain=0.85 if section == 0 else 0.7)
        if section == 1:
            riff(tr, b, ch, gain=0.5)
            stabs(tr, b, ch, steps=(3, 10), gain=0.8)
        if section == 2:
            stabs(tr, b, ch, steps=(0, 3, 6, 10), gain=1.0)
    # melodies
    melody(tr, 4, HOOK_A, gain=1.0)
    melody(tr, 6, ANSWER, gain=0.95)
    melody(tr, 8, CHORUS, gain=1.05)
    # bar 2-3: tease hook cell on pluck only
    for s, m, ln in HOOK_CELL:
        tr.add(v_pluck(m + 12, 0.5), T(2) + s * STEP, 0.55, 0.3)
    for s, m, ln in HOOK_CELL:
        tr.add(v_pluck(m + 12, 0.5), T(3) + (s + 6) * STEP, 0.5, -0.3)
    # bars 12-15: return, lead plays the cell, talking drum fills for loop turnaround
    for s, m, ln in HOOK_CELL:
        tr.add(I.horn_lead(float(midi(m)), max(ln * STEP * 0.97, STEP * 0.8)), T(12) + s * STEP, 0.5, 0, haas_ms=5)
    talking_fill(tr, 11, start_step=11, gain=1.0)
    talking_fill(tr, 15, start_step=8, gain=1.0, seq=[(0, 200, 150), (1, 170, 250), (2, 300, 200), (3, 180, 260), (4, 330, 190), (6, 240, 320)])
    return finish_music(tr, wet=0.17, delay=0.07)


def gameplay_stems(loop=True):
    """Three beat-synced stems, 16 bars each (34.3 s): base / perc / hype."""
    bars = 16
    prog = (["Dm7", "Dm7", "Bb", "C"] * 3) + ["Dm7", "Dm7", "Bb", "A"]
    base = Track(bars * BAR, loop=loop, tail=2.0)
    perc = Track(bars * BAR, loop=loop, tail=2.0)
    hype = Track(bars * BAR, loop=loop, tail=2.0)
    for b in range(bars):
        ch = prog[b]
        # BASE: sparse kick, hats, pedal bass, quiet bell; little energy in 1-4 kHz
        for s in (0, 10):
            base.add(v_kick(), T(b, s), 0.9, 0)
        if b % 2 == 1:
            base.add(v_kick(), T(b, 14), 0.7, 0)
        for s in range(0, 16, 2):
            base.add(v_hat(), T(b, s), 0.55 if s % 4 == 2 else 0.28, 0.2)
        for s, f in BELL:
            base.add(v_bell(f), T(b, s), 0.2, 0.35)
        bass(base, b, ch, BASS_SPARSE if b % 4 in (0, 1) else BASS_A, gain=0.9)
        base.add(I.pad([float(midi(m - 12)) for m in CH[ch][1][1:]], BAR + 0.2), T(b), 0.16, 0, haas_ms=11)
        # PERC: congas, shaker, clap/rim, talking-drum fills at phrase ends
        for s in (4, 12):
            perc.add(v_clap(), T(b, s), 0.6, 0.05, haas_ms=6)
        for s in (9, 15):
            perc.add(v_rim(), T(b, s), 0.3, -0.3)
        for s in range(16):
            perc.add(v_shaker(s % 4), T(b, s), 0.85 if s in (0, 3, 6, 9, 12, 14) else 0.4, -0.35)
        for s in (2, 5, 10, 13):
            perc.add(v_conga(330.0, False), T(b, s), 0.5, -0.45)
        for s in (0, 8):
            perc.add(v_conga(230.0, False), T(b, s), 0.55, -0.5)
        for s in (7, 15):
            perc.add(v_conga(330.0, True), T(b, s), 0.45, -0.45)
        if b % 4 == 3:
            talking_fill(perc, b, gain=0.9, start_step=10)
        # HYPE: stabs on the off-beats, riff, hook-cell shout every 4 bars, riser into the loop
        stabs(hype, b, ch, steps=(3, 6, 10), gain=0.9, bright=3000.0)
        riff(hype, b, ch, gain=0.55, octave=0)
        if b % 4 == 2:
            for s, m, ln in HOOK_CELL:
                hype.add(I.horn_lead(float(midi(m)), max(ln * STEP * 0.97, STEP * 0.8), bright=2400.0), T(b) + s * STEP, 0.55, 0, haas_ms=5)
    hype.add(I.riser(BAR, 400, 5000, tone=False), T(15), 0.45, 0)
    out = {}
    for name, tr, wet, pocket in (("base", base, 0.12, True), ("perc", perc, 0.10, True), ("hype", hype, 0.15, True)):
        out[name] = finish_music(tr, wet=wet, mid_pocket=pocket, comp=True)
    return out


def render_sting():
    """WAHALA! logo sting, ~3.9 s: generator pull-start -> ignition boom -> hook shout."""
    tr = Track(2.6, loop=False, tail=1.8)
    tr.add(I.generator_sputter(1.35), 0.0, 0.8, 0)
    tr.add(I.riser(1.35, 300, 7000), 0.0, 0.55, 0)
    t0 = 1.35
    tr.add(I.impact(1.6), t0, 1.0, 0)
    tr.add(v_kick(), t0, 1.0, 0)
    tr.add(I.brass_stab([float(midi(m)) for m in (50, 57, 62, 65, 69)], 0.5, bright=4200), t0, 0.7, 0, haas_ms=8)
    cell = [(0, 69, 1), (1, 74, 3), (4, 77, 5)]
    for s, m, ln in cell:
        tt = t0 + 0.30 + s * STEP * 0.8
        tr.add(I.horn_lead(float(midi(m)), ln * STEP * 0.8 * 0.97 + (0.45 if s == 4 else 0), vel=1.0), tt, 0.7, 0, haas_ms=5)
        tr.add(v_pluck(m + 12, 0.9), tt, 0.35, 0.2)
    for i, f in enumerate((880.0, 1174.7, 1568.0, 1760.0)):
        tr.add(v_bell(f), t0 + 0.78 + i * 0.07, 0.3, -0.3 + 0.2 * i)
    finish_music(tr, wet=0.22, comp=True)
    return tr


def render_victory():
    """~9.5 s celebration (4 bars + tail). Hook in D major: wa-HA-la with the bright F#."""
    tr = Track(4 * BAR, loop=False, tail=2.6)
    prog = ["D", "Bb", "C", "D"]
    for b, ch in enumerate(prog):
        kick = KICK_DRIVE
        drums(tr, b, kick_steps=kick, drive=True, gain=1.0, open_hats=(6, 14))
        bass(tr, b, ch, BASS_A, gain=1.0)
        stabs(tr, b, ch, steps=(0, 3, 6, 10) if b < 3 else (0,), gain=1.1)
        pad_chords(tr, b, ch, 1, gain=1.1)
    melody(tr, 0, VICTORY, gain=1.15)
    # final: held tutti chord, bell glitter, talking-drum roll
    for i, m in enumerate((74, 78, 81, 86, 90, 93)):
        tr.add(I.agogo(float(midi(m)), 0.5), T(3, 8) + i * 0.06, 0.35, -0.5 + 0.2 * i)
    talking_fill(tr, 2, start_step=12, seq=[(0, 190, 330), (1, 220, 360), (2, 250, 380), (3, 280, 400)], gain=1.0)
    tr.add(I.impact(1.4), T(3), 0.7, 0)
    finish_music(tr, wet=0.2, delay=0.06)
    return tr


def render_defeat():
    """~3 s comic-but-not-cruel 'wahala don happen' sting; non-graphic."""
    tr = Track(1.9, loop=False, tail=1.4)
    for i, (m0, m1) in enumerate(((69, 62), (67, 60), (65, 57))):
        t0 = 0.0 + i * 0.42
        tr.add(I.horn_lead(float(midi(m1)), 0.4 + (0.5 if i == 2 else 0), glide_from=float(midi(m0)), vib=0.012, bright=1600), t0, 0.7, 0, haas_ms=6)
    tr.add(I.talking_drum(200, 90, 0.7), 1.25, 0.8, 0)
    tr.add(I.sub_bass(float(midi(38)), 1.2), 1.3, 0.6, 0)
    tr.add(I.agogo(587.3, 0.4), 1.3, 0.25, 0.3)
    finish_music(tr, wet=0.2, comp=True)
    return tr


def render_trailer():
    """~43 s optional trailer cue (20 bars). Reuses the same material as the game cues."""
    bars = 20
    tr = Track(bars * BAR, loop=False, tail=3.0)
    prog = (["Dm7", "Dm7", "Dm7", "Dm7"] + ["Dm7", "Dm7", "G", "Am"] + ["Bb", "C", "Dm7", "Dm7"] * 2 + ["Dm7"] * 4)
    # 0-3 dread: low drone, sparse congas, sputter
    tr.add(I.pad([float(midi(m)) for m in (38, 45, 50)], 4 * BAR), 0.0, 0.5, 0)
    for b in range(0, 4):
        tr.add(v_conga(230.0, False), T(b, 0), 0.5, -0.5)
        tr.add(v_conga(330.0, False), T(b, 10), 0.4, -0.45)
        for s in (0, 8):
            tr.add(I.sub_bass(float(midi(26)), STEP * 4), T(b, s), 0.7, 0)
    tr.add(I.generator_sputter(BAR * 0.95), T(3), 0.7, 0)
    tr.add(I.impact(1.5), T(4), 0.9, 0)
    # 4-7 build: hook on pluck, groove arrives, snare-ish clap roll, riser
    for b in range(4, 8):
        drums(tr, b, kick_steps=[0, 10], clap=(b >= 6), gain=0.8 + 0.05 * (b - 4), congas=True, bells=(b >= 5))
        bass(tr, b, prog[b], BASS_SPARSE if b < 6 else BASS_A, gain=0.9)
        riff(tr, b, prog[b], gain=0.7)
    for s, m, ln in HOOK_CELL:
        tr.add(v_pluck(m + 12, 0.5), T(5) + s * STEP, 0.5, 0.3)
    for k in range(8):
        tr.add(v_clap(), T(7, 8 + k), 0.25 + 0.06 * k, 0)
    tr.add(I.riser(BAR * 1.0, 400, 7500), T(7), 0.55, 0)
    # 8-15 drop
    for b in range(8, 16):
        drums(tr, b, kick_steps=KICK_DRIVE, drive=True, gain=1.0)
        bass(tr, b, prog[b], BASS_A, gain=1.0)
        stabs(tr, b, prog[b], steps=(0, 3, 6, 10), gain=1.0)
        pad_chords(tr, b, prog[b], 1, gain=1.0)
    tr.add(I.impact(1.6), T(8), 1.0, 0)
    melody(tr, 8, CHORUS, gain=1.05)
    melody(tr, 12, CHORUS, gain=1.05)
    talking_fill(tr, 11, start_step=11)
    talking_fill(tr, 15, start_step=8, seq=[(0, 200, 150), (1, 170, 250), (2, 300, 200), (3, 180, 260), (4, 330, 190)])
    # 16-17 break: stop-time hits, 18-19 title hit
    for b, ch in ((16, "Dm7"), (17, "Dm7")):
        tr.add(v_kick(), T(b, 0), 1.0, 0)
        tr.add(I.sub_bass(float(midi(26)), STEP * 6), T(b, 0), 0.9, 0)
        tr.add(I.brass_stab([float(midi(m)) for m in CH[ch][1]], 0.3), T(b, 0), 0.8, 0)
        tr.add(v_conga(230.0, False), T(b, 8), 0.6, -0.5)
    tr.add(I.riser(BAR * 1.9, 300, 8000), T(16), 0.5, 0)
    tr.add(I.impact(2.2), T(18), 1.0, 0)
    tr.add(v_kick(), T(18), 1.0, 0)
    tr.add(I.brass_stab([float(midi(m)) for m in (50, 57, 62, 65, 69)], 0.9, bright=4200), T(18), 0.8, 0, haas_ms=8)
    for s, m, ln in [(6, 69, 1), (7, 74, 3), (10, 77, 8)]:
        tr.add(I.horn_lead(float(midi(m)), ln * STEP * 0.97), T(18) + s * STEP, 0.7, 0, haas_ms=5)
        tr.add(v_pluck(m + 12, 1.0), T(18) + s * STEP, 0.35, 0.2)
    finish_music(tr, wet=0.2, delay=0.06)
    return tr
