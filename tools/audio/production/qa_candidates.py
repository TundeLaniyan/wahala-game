#!/usr/bin/env python3
"""Measurements for the candidate set (no listening involved). usage: qa_candidates.py CAND_DIR ORIGINAL.wav"""
import json, os, subprocess, sys, tempfile
import numpy as np, soundfile as sf
from scipy import signal
d, orig = sys.argv[1], sys.argv[2]
rep = json.load(open(os.path.join(d, "report.json")))
tmp = tempfile.mkdtemp()
def dec(p):
    w = os.path.join(tmp, os.path.basename(p) + ".wav"); subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", p, "-ar", "44100", w], check=True)
    x, sr = sf.read(w); return x, sr
def bands(x, sr):
    m = x.mean(axis=1) if x.ndim == 2 else x
    f, p = signal.welch(m, sr, nperseg=8192); t = p.sum()
    g = lambda lo, hi: 100 * p[(f >= lo) & (f < hi)].sum() / t
    return dict(sub150=g(0, 150), low_mid=g(150, 1000), presence=g(1000, 5000), air=g(5000, 22000), sfx_band_2k_5k=g(2000, 5000))
fails = 0
print("cue                  len(samples) ffmpeg-decode  wrapStep/p99.9   LUFS(decoded) TP(decoded)  phone-view LUFS(hp150)")
for cid, c in rep["cues"].items():
    x, sr = dec(os.path.join(d, cid + ".mp3"))
    got = len(x); want = c["samples"]
    wrap = ""
    if c["loop"]:
        step = np.abs(np.diff(x, axis=0)); typ = np.percentile(step, 99.9); jump = np.abs(x[0] - x[-1]).max()
        wrap = f"{jump:.3f}/{typ:.3f} " + ("ok" if jump <= typ * 1.5 else "CLICK?")
        if jump > typ * 1.5: fails += 1
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", os.path.join(tmp, cid + ".mp3.wav"), "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
    import re
    L = float(re.search(r"Integrated loudness:\s+I:\s+(-?\d+\.?\d*) LUFS", r).group(1)); TP = float(re.search(r"True peak:\s+Peak:\s+(-?\d+\.?\d*) dBFS", r).group(1))
    if TP > -0.3: fails += 1  # decoded AAC overshoots the encoder input by up to ~2 dB; inputs are limited to -2.5 dBTP
    from scipy.signal import butter, sosfilt
    ph = sosfilt(butter(4, 150, "hp", fs=44100, output="sos"), x, axis=0); sf.write(os.path.join(tmp, "ph.wav"), ph.astype(np.float32), 44100, subtype="FLOAT")
    r2 = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", os.path.join(tmp, "ph.wav"), "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True).stderr
    PL = float(re.search(r"Integrated loudness:\s+I:\s+(-?\d+\.?\d*) LUFS", r2).group(1))
    print(f"{cid:20s} {want:9d} {got:9d} {wrap:24s} {L:7.1f} {TP:8.1f} {PL:10.1f}")
g = {k: rep["cues"][k]["samples"] for k in rep["cues"]}
sync = [g["lnds_rumble"], g["lnds_suddendeath"], g["lnds_boss_1"], g["lnds_boss_2"], g["lnds_boss_3"]]
print("position-sync groups equal length:", len(set(sync)) == 1, sync[0]); fails += len(set(sync)) != 1
print("\nspectral balance (% of energy):   sub<150  150-1k  1-5k  >5k   | 2-5k (danger-SFX band)")
o, sr = sf.read(orig)
for name, x, s_ in [("original song", o, sr)] + [(c, *dec(os.path.join(d, c + ".mp3"))) for c in ("lnds_menu", "lnds_rumble", "lnds_suddendeath", "lnds_boss_3")]:
    b = bands(x, s_); print(f"  {name:20s} {b['sub150']:6.1f} {b['low_mid']:7.1f} {b['presence']:5.1f} {b['air']:5.1f}   | {b['sfx_band_2k_5k']:5.1f}")
print("FAILS", fails); sys.exit(1 if fails else 0)
