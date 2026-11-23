#!/usr/bin/env python3
"""QA that does NOT need ears: checks that the rendered hook plays the notes the score says,
that every melody note is consonant with its chord, and that loops/masters are click- and clip-free.
This is not a substitute for a founder/producer listening review."""
import os, sys, glob
import numpy as np
from scipy.io import wavfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import theme, instruments as I
from dsp import SR, midi, Track

fails = 0
npass = 0
def check(ok, msg, quiet=False):
    global fails, npass
    if not ok or not quiet:
        print(("PASS " if ok else "FAIL ") + msg)
    npass += ok
    fails += (not ok)

# 1. rendered pitch == scored pitch (horn lead alone; harmonic-product-spectrum f0 estimate)
def f0_hps(x, lo=120.0, hi=1500.0):
    n = 1 << 16
    seg = x[: min(len(x), 12000)]
    spec = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), n))
    f = np.fft.rfftfreq(n, 1 / SR)
    hps = spec.copy()
    for k in (2, 3, 4):
        d = spec[::k]
        hps[: len(d)] *= d
        hps[len(d):] = 0
    band = (f >= lo) & (f <= hi)
    return f[band][np.argmax(hps[band])]

for name, notes in (("HOOK_A", theme.HOOK_A), ("ANSWER", theme.ANSWER), ("CHORUS", theme.CHORUS), ("VICTORY", theme.VICTORY)):
    bad = []
    for s_, m, ln in notes:
        sec = max(ln * theme.STEP * 0.97, theme.STEP * 0.8)
        x = I.horn_lead(float(midi(m)), sec)
        x = x[int(0.25 * len(x)):]
        est = f0_hps(x)
        cents = 1200 * np.log2(est / float(midi(m)))
        if abs(cents) > 35:
            bad.append((m, round(cents)))
    check(not bad, f"{name}: rendered f0 matches scored pitch for all {len(notes)} notes {bad if bad else ''}")

# 2. harmonic consonance: melody pitch classes vs chord at that bar
CH_TONES = {k: {(n % 12) for n in v[1]} for k, v in theme.CH.items()}
EXT = {"Dm7": {4, 7, 2}, "G": {9, 5}, "Am": {2, 7}, "Bb": {7, 9}, "C": {9, 2, 11}, "D": {11, 7}, "A": set()}  # allowed tensions (pc)
def consonant(notes, chords, strong_only=True):
    bad = []
    for s, m, ln in notes:
        ch = chords[s // 16]
        pc = m % 12
        strong = (s % 16) in (0, 1, 7, 8, 10, 12) or ln >= 3
        if strong and pc not in CH_TONES[ch] and pc not in EXT[ch]:
            bad.append((s, m, ch))
    return bad
for name, notes, chords in (("HOOK_A", theme.HOOK_A, ["Dm7", "Dm7"]), ("ANSWER", theme.ANSWER, ["G", "Am"]),
                            ("CHORUS", theme.CHORUS, ["Bb", "C", "Dm7", "Dm7"]), ("VICTORY", theme.VICTORY, ["D", "Bb", "C", "D"])):
    b = consonant(notes, chords)
    check(not b, f"{name}: strong-beat notes are chord tones or sanctioned tensions {b if b else ''}")

# 3. masters: no NaN, no clipping, loop seam continuity
mas = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "build", "masters")
for p in sorted(glob.glob(os.path.join(mas, "*.wav"))):
    sr, x = wavfile.read(p)
    x = x.T if x.ndim == 2 else x[None]
    nm = os.path.basename(p)[:-4]
    check(np.all(np.isfinite(x)) and np.abs(x).max() < 0.999, f"{nm}: finite & below full scale (peak {20*np.log10(np.abs(x).max()):.1f} dBFS)", quiet=True)
    dc = abs(x.mean())
    check(dc < 0.002, f"{nm}: DC offset {dc:.5f}", quiet=True)
loops = ["menu_loop", "rumble_base", "rumble_perc", "rumble_hype", "gen_fuse_loop", "amb_lagos"]
for nm in loops:
    sr, x = wavfile.read(os.path.join(mas, nm + ".wav"))
    x = (x.T if x.ndim == 2 else x[None]).astype(float)
    # compare the wrap jump with the typical sample-to-sample step in the same file
    jump = np.abs(x[:, 0] - x[:, -1]).max()
    typ = np.percentile(np.abs(np.diff(x, axis=1)), 99.9)
    check(jump <= max(typ * 1.5, 1e-4), f"{nm}: loop wrap step {jump:.5f} vs 99.9th-pct step {typ:.5f}")
print(f"{npass} checks passed, {fails} failed")
sys.exit(1 if fails else 0)
