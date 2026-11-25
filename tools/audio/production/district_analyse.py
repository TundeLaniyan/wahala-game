#!/usr/bin/env python3
"""Measures the seven district recordings: tempo and its stability, beat/bar grid, key, loudness, stereo, structure, vocal presence.
usage: district_analyse.py WAV_DIR [MDX_DIR] OUT.json      (WAV_DIR: 44.1 kHz stereo WAVs named like the pack files;
MDX_DIR: optional '(Vocals)' / '(Instrumental)' stems from UVR-MDX-NET-Voc_FT, used only to MEASURE vocal presence)"""
import glob, json, os, re, subprocess, sys
import numpy as np, soundfile as sf, librosa
from scipy import signal

wav_dir = sys.argv[1]; mdx_dir = sys.argv[2] if len(sys.argv) > 3 else None; out = sys.argv[-1]
NAMES = "C C# D D# E F F# G G# A A# B".split()
MAJ = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]); MIN = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

def ebur(path, extra=""):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", extra + "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
    g = lambda pat: float(re.search(pat, r).group(1)) if re.search(pat, r) else None
    return dict(lufs=g(r"Integrated loudness:\s+I:\s+(-?\d+\.?\d*) LUFS"), lra=g(r"LRA:\s+(-?\d+\.?\d*) LU"), tp=g(r"True peak:\s+Peak:\s+(-?\d+\.?\d*) dBFS"))

def rms_db(x): return float(20 * np.log10(np.sqrt((x ** 2).mean()) + 1e-12))

res = {}
for p in sorted(glob.glob(os.path.join(wav_dir, "*.wav"))):
    name = os.path.basename(p)[:-4]; x, sr = sf.read(p); mono = x.mean(axis=1); n = len(mono)
    R = dict(file=name, seconds=round(n / sr, 2))
    R.update(ebur(p))
    ph = os.path.join("/tmp", "_ph.wav"); sf.write(ph, signal.sosfilt(signal.butter(4, 150, "hp", fs=sr, output="sos"), x, axis=0).astype(np.float32), sr, subtype="FLOAT")
    R["phoneLufs"] = ebur(ph)["lufs"]
    R["samplePeakDb"] = round(float(20 * np.log10(np.abs(x).max() + 1e-12)), 2); R["clippedSamples"] = int((np.abs(x) > 0.999).sum())
    mid, side = (x[:, 0] + x[:, 1]) / 2, (x[:, 0] - x[:, 1]) / 2
    R["sideMidDb"] = round(10 * np.log10((side ** 2).sum() / (mid ** 2).sum() + 1e-12), 1); R["lrCorr"] = round(float(np.corrcoef(x[:, 0], x[:, 1])[0, 1]), 3)
    R["monoLossDb"] = round(rms_db(mid) - rms_db(x), 2)
    # leading / trailing silence and ending shape
    env = np.abs(mono); thr = 10 ** (-50 / 20); idx = np.where(env > thr)[0]
    R["leadSilence"] = round(idx[0] / sr, 2); R["tailSilence"] = round((n - idx[-1]) / sr, 2)
    last = [rms_db(mono[max(0, n - int((k + 1) * sr)):n - int(k * sr)]) for k in range(8)]
    R["lastSecondsRmsDb"] = [round(v, 1) for v in last]
    # tempo and beats
    harm, perc = librosa.effects.hpss(mono[: n])
    oenv = librosa.onset.onset_strength(y=perc, sr=sr, hop_length=512)
    tempo, beats = librosa.beat.beat_track(onset_envelope=oenv, sr=sr, hop_length=512, start_bpm=105, tightness=200)
    bt = librosa.frames_to_time(beats, sr=sr, hop_length=512); ibi = np.diff(bt)
    R["bpm"] = round(float(np.atleast_1d(tempo)[0]), 2); R["bpmMedianIbi"] = round(float(60 / np.median(ibi)), 2)
    R["ibiStdMs"] = round(float(np.std(ibi) * 1000), 1); R["beats"] = int(len(bt))
    # tempo drift: median bpm per 20 s
    per = []
    for a in range(0, int(n / sr) - 10, 20):
        m = (bt >= a) & (bt < a + 20)
        if m.sum() > 8: per.append(round(float(60 / np.median(np.diff(bt[m]))), 1))
    R["bpmPer20s"] = per
    # downbeat guess: the beat phase (mod 4) with the most low-band onset energy
    S = np.abs(librosa.stft(mono, n_fft=2048, hop_length=512)); fr = librosa.fft_frequencies(sr=sr, n_fft=2048); low = S[(fr > 35) & (fr < 150)].sum(axis=0)
    lo_on = np.maximum(np.diff(low, prepend=low[0]), 0)
    ph_e = [lo_on[beats[k::4]].mean() for k in range(4)]; R["downbeatPhase"] = int(np.argmax(ph_e)); R["downbeatScore"] = round(float(max(ph_e) / (np.mean(ph_e) + 1e-9)), 2)
    # key
    ch = librosa.feature.chroma_cqt(y=harm, sr=sr).mean(axis=1); sc = []
    for k in range(12):
        sc.append((float(np.corrcoef(ch, np.roll(MAJ, k))[0, 1]), NAMES[k] + " major")); sc.append((float(np.corrcoef(ch, np.roll(MIN, k))[0, 1]), NAMES[k] + " minor"))
    sc.sort(reverse=True); R["key"] = [(k, round(v, 2)) for v, k in sc[:3]]
    # structure: beat-synchronous chroma + MFCC self-similarity, novelty peaks (8-beat grid)
    cq = librosa.feature.chroma_cqt(y=harm, sr=sr, hop_length=512); mf = librosa.feature.mfcc(y=mono, sr=sr, hop_length=512, n_mfcc=13)
    F = np.vstack([librosa.util.normalize(librosa.util.sync(cq, beats, aggregate=np.median), axis=0), librosa.util.normalize(librosa.util.sync(mf[1:], beats, aggregate=np.mean), axis=0) * 0.6])
    Fn = librosa.util.normalize(F, axis=0); SSM = Fn.T @ Fn
    k = 16; ker = np.outer(np.r_[-np.ones(k), np.ones(k)], np.r_[-np.ones(k), np.ones(k)]) * np.sign(np.outer(np.r_[-1, 1].repeat(k), np.r_[-1, 1].repeat(k)))
    nov = np.zeros(SSM.shape[0])
    for i in range(k, SSM.shape[0] - k):
        blk = SSM[i - k:i + k, i - k:i + k]; nov[i] = (blk[:k, :k].mean() + blk[k:, k:].mean()) - (blk[:k, k:].mean() + blk[k:, :k].mean())
    pk, _ = signal.find_peaks(nov, distance=16, height=np.percentile(nov, 80)); R["sectionBoundariesSec"] = [round(float(bt[i - 1]), 1) for i in pk if i - 1 < len(bt)]
    iu = np.triu_indices(SSM.shape[0], 8); R["selfSimilarity"] = round(float(np.mean(SSM[iu] > 0.9)), 3)
    # energy per ~8-beat window
    hop = int(8 * 60 / R["bpm"] * sr); R["rms8beats"] = [round(rms_db(mono[a:a + hop]), 1) for a in range(0, n - hop, hop)]
    R["dynamicSpreadDb"] = round(float(np.percentile(R["rms8beats"], 95) - np.percentile(R["rms8beats"], 5)), 1)
    # vocals (measurement only)
    if mdx_dir:
        vp = glob.glob(os.path.join(mdx_dir, f"{name}_(Vocals)_*.wav")); ip = glob.glob(os.path.join(mdx_dir, f"{name}_(Instrumental)_*.wav"))
        if vp and ip:
            v, _ = sf.read(vp[0]); i_, _ = sf.read(ip[0]); v = v.mean(axis=1)[:n]; w = int(0.05 * sr); e = np.sqrt(np.convolve(v ** 2, np.ones(w) / w, "same"))
            R["vocalRmsDb"] = round(rms_db(v), 1); R["vocalToInstrumentalDb"] = round(rms_db(v) - rms_db(i_.mean(axis=1)), 1)
            for lab, t in (("vocalDutyMinus40", -40), ("vocalDutyMinus30", -30)): R[lab] = round(float((20 * np.log10(e + 1e-9) > t).mean()), 3)
            on = 20 * np.log10(e + 1e-9) > -35; segs = []; s = None
            for j in range(0, len(on), w):
                a_ = on[j]
                if a_ and s is None: s = j
                if (not a_) and s is not None:
                    if (j - s) / sr > 0.4: segs.append((round(s / sr, 1), round(j / sr, 1)))
                    s = None
            R["vocalSegmentsSec"] = segs[:40]; R["vocalSegmentCount"] = len(segs)
    res[name] = R
    print(f"{name[:34]:34s} {R['seconds']:6.1f}s {R['lufs']:6.1f} LUFS tp {R['tp']:5.1f} bpm {R['bpm']:6.1f}/{R['bpmMedianIbi']:6.1f} ibiStd {R['ibiStdMs']:5.1f}ms key {R['key'][0][0]:10s} dyn {R['dynamicSpreadDb']:4.1f} vocal {R.get('vocalToInstrumentalDb')}")
json.dump(res, open(out, "w"), indent=1)
