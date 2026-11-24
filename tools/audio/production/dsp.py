"""Small DSP helpers for arranging the approved WAHALA! theme (numpy / scipy only)."""
from __future__ import annotations
import re, subprocess
import numpy as np
from scipy import signal

SR = 44100


def to_stereo(x):
    return x if x.ndim == 2 else np.stack([x, x], axis=1)


def sos_filter(x, kind, fc, order=2):
    sos = signal.butter(order, fc, kind, fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=0)


def hp(x, fc, order=2): return sos_filter(x, "hp", fc, order)
def lp(x, fc, order=2): return sos_filter(x, "lp", min(fc, SR * 0.45), order)


def bp(x, lo, hi, order=2):
    sos = signal.butter(order, [lo, min(hi, SR * 0.45)], "bp", fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=0)


def peq(x, f0, gain_db, q=1.0):
    A = 10 ** (gain_db / 40); w0 = 2 * np.pi * f0 / SR; al = np.sin(w0) / (2 * q)
    b = np.array([1 + al * A, -2 * np.cos(w0), 1 - al * A]); a = np.array([1 + al / A, -2 * np.cos(w0), 1 - al / A])
    return signal.lfilter(b / a[0], a / a[0], x, axis=0)


def shelf(x, f0, gain_db, high=True):
    A = 10 ** (gain_db / 40); w0 = 2 * np.pi * f0 / SR; al = np.sin(w0) / 2 * np.sqrt(2)
    c = np.cos(w0); sq = 2 * np.sqrt(A) * al
    if high:
        b = [A * ((A + 1) + (A - 1) * c + sq), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - sq)]
        a = [(A + 1) - (A - 1) * c + sq, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - sq]
    else:
        b = [A * ((A + 1) - (A - 1) * c + sq), 2 * A * ((A - 1) - (A + 1) * c), A * ((A + 1) - (A - 1) * c - sq)]
        a = [(A + 1) + (A - 1) * c + sq, -2 * ((A - 1) + (A + 1) * c), (A + 1) + (A - 1) * c - sq]
    return signal.lfilter(np.array(b) / a[0], np.array(a) / a[0], x, axis=0)


def db(g): return 10 ** (g / 20)


def softclip(x, drive=1.0): return np.tanh(x * drive) / np.tanh(drive)


def bass_harmonics(x, amount=0.35, split=170.0):
    """Adds upper harmonics of the low end so ordinary phone speakers (no output below ~150 Hz) still carry the bassline."""
    low = lp(x, split, 2)
    harm = hp(np.tanh(low * 4.0) - low * 0.0, split * 0.9, 2)
    return x + amount * harm


def compress(x, thresh_db=-18.0, ratio=2.5, attack_ms=10.0, release_ms=120.0, block=128, makeup_db=0.0):
    n = len(x); nb = int(np.ceil(n / block)); pad = np.pad(x, ((0, nb * block - n), (0, 0)))
    lvl = np.sqrt((pad.reshape(nb, block, -1) ** 2).mean(axis=(1, 2)) + 1e-12)
    gr = -np.maximum(20 * np.log10(lvl) - thresh_db, 0) * (1 - 1 / ratio)
    a = np.exp(-block / (attack_ms * 1e-3 * SR)); r = np.exp(-block / (release_ms * 1e-3 * SR))
    out = np.zeros(nb); cur = 0.0
    for i in range(nb):
        coef = a if gr[i] < cur else r
        cur = coef * cur + (1 - coef) * gr[i]; out[i] = cur
    g = np.repeat(10 ** ((out + makeup_db) / 20), block)[:n]
    return x * g[:, None]


def limiter(x, ceiling_db=-1.5):
    c = db(ceiling_db); y = x / c; k = 0.7
    y = np.where(np.abs(y) <= k, y, np.sign(y) * (k + (1 - k) * np.tanh((np.abs(y) - k) / (1 - k))))
    return y * c


def measure(x, path):
    import soundfile as sf
    sf.write(path, x.astype(np.float32), SR, subtype="FLOAT")
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
    i = re.search(r"Integrated loudness:\s+I:\s+(-?\d+\.?\d*) LUFS", r); tp = re.search(r"True peak:\s+Peak:\s+(-?\d+\.?\d*) dBFS", r)
    return (float(i.group(1)) if i else None), (float(tp.group(1)) if tp else None)


def normalise(x, target_lufs, tmp, ceiling_db=-2.2):
    cur, _ = measure(x, tmp)
    y = limiter(x * db(target_lufs - cur), ceiling_db)
    for _ in range(3):  # the limiter removes a little level; correction passes
        cur2, tp2 = measure(y, tmp)
        if abs(cur2 - target_lufs) < 0.25: break
        y = limiter(y * db(target_lufs - cur2), ceiling_db)
    cur2, tp2 = measure(y, tmp)
    if tp2 is not None and tp2 > -2.5:  # true-peak guard: AAC/Opus decoders can overshoot inter-sample peaks
        y = y * db(-2.5 - tp2)
    return y


def xfade_join(a, b_with_preroll, n):
    """Joins `a` and `b`: the last n samples of `a` are blended (equal power) with the n samples of audio that came
    BEFORE b's start in its source (b_with_preroll[:n]); the result continues with b_with_preroll[n:]. Length = len(a)+len(b)."""
    t = np.linspace(0, np.pi / 2, n)[:, None]
    blend = a[-n:] * np.cos(t) + b_with_preroll[:n] * np.sin(t)
    return np.concatenate([a[:-n], blend, b_with_preroll[n:]])


def loop_close(x, preroll, n):
    """Makes x loop seamlessly: its last n samples fade into the audio that preceded x's start in the source."""
    t = np.linspace(0, np.pi / 2, n)[:, None]
    y = x.copy(); y[-n:] = x[-n:] * np.cos(t) + preroll[-n:] * np.sin(t)
    return y


def encode(x, path_wav, out_path, bitrate, channels=2):
    """MP3 (LAME, with the gapless header) like every other music file in the game; mono mixes are for tiny Data Saver files."""
    import soundfile as sf
    y = x if channels == 2 else x.mean(axis=1, keepdims=True)
    sf.write(path_wav, y.astype(np.float32), SR, subtype="FLOAT")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", path_wav, "-c:a", "libmp3lame", "-b:a", bitrate, "-ar", str(SR), out_path], check=True)


# ---------------------------------------------------------------- tiny synthesis for the added layers
def tvec(sec): return np.arange(int(sec * SR)) / SR


def phase(freq): return 2 * np.pi * np.cumsum(freq) / SR


def sub_tom(f0=95.0, f1=48.0, sec=0.32, decay=0.12):
    t = tvec(sec); f = f1 + (f0 - f1) * np.exp(-t / 0.03)
    return np.sin(phase(f)) * np.exp(-t / decay) * np.minimum(1, t / 0.002)


def noise_hit(sec=0.06, lo=6000, hi=16000, decay=0.02, seed=1):
    t = tvec(sec); n = np.random.default_rng(seed).standard_normal(len(t))
    return bp(n[:, None], lo, hi, 2)[:, 0] * np.exp(-t / decay)


def riser(sec, f0=300.0, f1=9000.0, seed=3):
    n = np.random.default_rng(seed).standard_normal(int(sec * SR)); t = tvec(sec)
    out = np.zeros_like(n); blocks = 32; edges = np.linspace(0, len(n), blocks + 1).astype(int); fc = np.geomspace(f0, f1, blocks)
    for i in range(blocks):
        seg = bp(n[:, None], fc[i] * 0.8, fc[i] * 1.3, 1)[:, 0]
        out[edges[i]:edges[i + 1]] = seg[edges[i]:edges[i + 1]]
    return out * (t / sec) ** 2


def impact(sec=1.4):
    t = tvec(sec); f = 40 + 90 * np.exp(-t / 0.05)
    sub = np.sin(phase(f)) * np.exp(-t / 0.5)
    burst = lp((np.random.default_rng(5).standard_normal(len(t)) * np.exp(-t / 0.08))[:, None], 3500)[:, 0]
    return np.tanh((sub * 1.2 + burst * 0.6) * 1.2)


def saw(freq, sec, detune=(0.0, 7.0, -7.0)):
    t = tvec(sec); out = np.zeros(len(t))
    for d in detune:
        ph = np.cumsum(np.full(len(t), freq * 2 ** (d / 1200))) / SR
        out += 2 * (ph % 1.0) - 1
    return out / len(detune)


def brass_stab(freqs, sec=0.34, bright=2800.0):
    out = sum(saw(f, sec) for f in freqs) / len(freqs)
    blocks = 14; edges = np.linspace(0, len(out), blocks + 1).astype(int); y = np.zeros_like(out)
    for i, fc in enumerate(np.geomspace(bright * 0.3, bright, blocks)):
        y[edges[i]:edges[i + 1]] = lp(out[:, None], fc, 2)[edges[i]:edges[i + 1], 0]
    t = tvec(sec); env = np.minimum(1, t / 0.008) * np.exp(-t / (sec * 0.5))
    return np.tanh(y * env * 1.5)


def place(buf, sig, t, gain=1.0, pan=0.0):
    k = int(round(t * SR))
    if k >= len(buf): return
    s = sig if sig.ndim == 1 else sig.mean(axis=1)
    l = np.cos((pan + 1) * np.pi / 4); r = np.sin((pan + 1) * np.pi / 4)
    end = min(len(buf), k + len(s)); m = end - k
    buf[k:end, 0] += s[:m] * gain * l; buf[k:end, 1] += s[:m] * gain * r
