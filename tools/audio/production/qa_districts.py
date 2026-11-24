#!/usr/bin/env python3
"""Measurements for the mastered district files: decoded length, loop seam, loudness and true peak, phone-speaker loudness,
and how well each file sits on the bar grid the manifest claims (onset phase of the DECODED file against grid.first = 0).
usage: qa_districts.py DIR"""
import json, os, re, subprocess, sys
import numpy as np, soundfile as sf, librosa
from scipy import signal
SR = 44100
d = sys.argv[1]; rep = json.load(open(os.path.join(d, "report.json")))

def dec(p):
    w = p + ".qa.wav"; subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", p, "-ar", str(SR), w], check=True); x, _ = sf.read(w); os.remove(w); return x

def ebur(x, tmp="/tmp/_qa.wav"):
    sf.write(tmp, x.astype(np.float32), SR, subtype="FLOAT")
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", tmp, "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
    return float(re.search(r"Integrated loudness:\s+I:\s+(-?\d+\.?\d*) LUFS", r).group(1)), float(re.search(r"True peak:\s+Peak:\s+(-?\d+\.?\d*) dBFS", r).group(1))

def grid_phase_ms(x, bpm):
    """Offset of the strongest beat comb from t = 0, in ms (0 = the file starts on a beat), using low-band + broadband onsets."""
    m = x.mean(axis=1); hop = 128
    env = librosa.onset.onset_strength(y=m, sr=SR, hop_length=hop, n_fft=1024); fs = SR / hop; per = 60 / bpm * fs; best = None
    for ph in np.arange(0, per, 0.25):
        pos = (ph + np.arange(0, len(env), per)).astype(int); pos = pos[pos < len(env)]; v = env[pos].mean()
        if best is None or v > best[0]: best = (v, ph)
    off = best[1] / fs * 1000; beat_ms = 60 / bpm * 1000
    return float((off + beat_ms / 2) % beat_ms - beat_ms / 2), float(best[0] / (env.mean() + 1e-9))

fails = 0
print("track        file         samples  decode  wrapStep/typ  LUFS   TP    phoneLUFS  gridPhase(ms)  combStrength")
for did, r in rep.items():
    for kind, fn, want in (("loop", f"dist_{did}.mp3", r["loop"]["samples"]), ("SD", f"dist_{did}_sd.mp3", r["suddenDeath"]["samples"])):
        x = dec(os.path.join(d, fn)); step = np.abs(np.diff(x, axis=0)); typ = np.percentile(step, 99.9); jump = np.abs(x[0] - x[-1]).max()
        L, tp = ebur(x); ph = ebur(signal.sosfilt(signal.butter(4, 150, "hp", fs=SR, output="sos"), x, axis=0))[0]
        gp, cs = grid_phase_ms(x, r["bpm"])
        ok = len(x) == want and jump <= typ * 1.5 and tp <= -1.0
        fails += not ok
        print(f"{did:12s} {kind:5s} {fn[:24]:24s} {want:8d} {len(x):8d} {jump:.3f}/{typ:.3f} {L:6.1f} {tp:5.1f} {ph:8.1f} {gp:12.1f} {cs:8.2f} {'ok' if ok else 'CHECK'}")
print("FAILS", fails); sys.exit(1 if fails else 0)
