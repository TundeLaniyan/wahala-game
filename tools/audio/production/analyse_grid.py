#!/usr/bin/env python3
"""Tempo, beat grid, per-bar stem levels and section similarity of the approved recording.
usage: analyse_grid.py ORIGINAL.wav STEMS_DIR      (44.1 kHz stereo WAVs; numpy + scipy)"""
import sys
import numpy as np
from scipy.io import wavfile
from scipy import signal

def load(p):
    sr, x = wavfile.read(p); x = x.astype(np.float64)
    if abs(x).max() > 2: x /= 32768
    return sr, x
sr, orig = load(sys.argv[1]); stems = {n: load(f"{sys.argv[2]}/{n}.wav")[1] for n in ("vocals", "drums", "bass", "other")}
n = min(len(orig), *[len(v) for v in stems.values()])
rec = sum(v[:n] for v in stems.values())
print("stem sum vs original, residual dB:", round(20 * np.log10(np.sqrt(((orig[:n] - rec) ** 2).mean()) / np.sqrt((orig[:n] ** 2).mean())), 1))
d = stems["drums"][:n].mean(axis=1); h = 441
f, t, Z = signal.stft(d, sr, nperseg=2048, noverlap=2048 - h); mag = np.abs(Z)
low = mag[(f > 30) & (f < 200)].sum(axis=0); hi = mag[(f > 2000) & (f < 9000)].sum(axis=0)
fl = lambda e: np.maximum(np.diff(np.log1p(e)), 0); env = fl(low) + fl(hi) * 0.5; fs = sr / h
best = None
for bpm in np.arange(100, 120, 0.05):
    per = 60 / bpm * fs
    for ph in np.arange(0, per, 0.5):
        pos = ph + np.arange(0, len(env), per); pos = pos[pos < len(env) - 1].astype(int); sc = env[pos].sum() / len(pos)
        if best is None or sc > best[0]: best = (sc, bpm, ph / fs)
bpm, off = best[1], best[2]; bar = 240 / bpm
print(f"tempo {bpm:.2f} BPM, first beat {off:.3f} s, bar {bar:.4f} s, {int((n/sr-off)/bar)} bars")
print("bar  start   vocals drums  bass  other (dB RMS)")
for b in range(int((n / sr - off) / bar)):
    a, z = int((off + b * bar) * sr), int((off + (b + 1) * bar) * sr)
    print(f"{b:3d} {off+b*bar:6.1f}s " + " ".join(f"{20*np.log10(np.sqrt((v[a:z]**2).mean())+1e-9):6.1f}" for v in (stems['vocals'], stems['drums'], stems['bass'], stems['other'])))
