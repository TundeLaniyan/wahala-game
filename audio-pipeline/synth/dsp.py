"""Minimal DSP toolkit for the WAHALA! original audio drafts.

Everything here is generated from mathematics + seeded noise. No samples, no
third-party recordings, no sound fonts. Safe from a provenance standpoint, but
the results are *synthesised drafts*, not professional recordings.
"""
from __future__ import annotations
import numpy as np
from scipy import signal

SR = 48000
_rng = np.random.default_rng(20261123)  # deterministic builds


def rng(seed=None):
    return np.random.default_rng(seed) if seed is not None else _rng


def n_of(sec):
    return int(round(sec * SR))


def tvec(sec):
    return np.arange(n_of(sec)) / SR


def midi(m):
    return 440.0 * 2 ** ((np.asarray(m, dtype=float) - 69) / 12)


# ---------- envelopes ----------
def env_exp(sec, decay, attack=0.002):
    """Fast attack, exponential decay. `decay` is the time constant (s)."""
    t = tvec(sec)
    e = np.exp(-t / max(decay, 1e-4))
    a = n_of(attack)
    if a > 1:
        e[:a] *= np.linspace(0, 1, a)
    return e


def env_adsr(sec, a=0.01, d=0.08, s=0.7, r=0.08):
    n = n_of(sec)
    a_n, d_n, r_n = n_of(a), n_of(d), n_of(r)
    sus = max(n - a_n - d_n - r_n, 0)
    e = np.concatenate([
        np.linspace(0, 1, max(a_n, 1)),
        np.linspace(1, s, max(d_n, 1)),
        np.full(sus, s),
        np.linspace(s, 0, max(r_n, 1)),
    ])
    return e[:n] if len(e) >= n else np.pad(e, (0, n - len(e)))


# ---------- filters ----------
def lp(x, fc, order=2):
    return signal.sosfilt(signal.butter(order, min(fc, SR * 0.45), "lp", fs=SR, output="sos"), x)


def hp(x, fc, order=2):
    return signal.sosfilt(signal.butter(order, fc, "hp", fs=SR, output="sos"), x)


def bp(x, lo, hi, order=2):
    return signal.sosfilt(signal.butter(order, [lo, min(hi, SR * 0.45)], "bp", fs=SR, output="sos"), x)


def sweep_lp(x, f0, f1, blocks=48):
    """Time-varying low-pass by block cross-faded filtering (cheap, smooth enough)."""
    n = len(x)
    out = np.zeros(n)
    edges = np.linspace(0, n, blocks + 1).astype(int)
    fcs = np.geomspace(f0, f1, blocks)
    zi = None
    for i in range(blocks):
        sos = signal.butter(2, min(fcs[i], SR * 0.45), "lp", fs=SR, output="sos")
        if zi is None:
            zi = np.zeros((sos.shape[0], 2))
        seg, zi = signal.sosfilt(sos, x[edges[i]:edges[i + 1]], zi=zi)
        out[edges[i]:edges[i + 1]] = seg
    return out


# ---------- oscillators ----------
def phase_from_freq(freq):
    return 2 * np.pi * np.cumsum(freq) / SR


def sine(f, sec):
    return np.sin(2 * np.pi * f * tvec(sec))


def saw_poly(freq, ):
    """Band-limited-ish saw via additive up to Nyquist guard (freq may be array)."""
    freq = np.asarray(freq)
    ph = np.cumsum(freq) / SR
    x = 2 * (ph % 1.0) - 1
    # PolyBLEP correction
    dt = freq / SR
    t = ph % 1.0
    blep = np.zeros_like(x)
    m = t < dt
    tt = t[m] / dt[m] if dt.ndim else t[m] / dt
    blep[m] = tt + tt - tt * tt - 1
    m2 = t > 1 - dt
    tt2 = (t[m2] - 1) / dt[m2] if dt.ndim else (t[m2] - 1) / dt
    blep[m2] = tt2 * tt2 + tt2 + tt2 + 1
    return x - blep


def saw(f, sec, vib=0.0, vib_hz=5.5, detune_cents=0.0):
    t = tvec(sec)
    fr = f * (1 + vib * np.sin(2 * np.pi * vib_hz * t)) * 2 ** (detune_cents / 1200)
    return saw_poly(fr * np.ones_like(t))


def square(f, sec, duty=0.5):
    t = tvec(sec)
    return signal.square(2 * np.pi * f * t, duty=duty)


def noise(sec, seed=None):
    return rng(seed).standard_normal(n_of(sec))


def softclip(x, drive=1.0):
    return np.tanh(x * drive) / np.tanh(drive)


def pan_gains(p):
    """Constant-power pan, p in [-1, 1]."""
    a = (p + 1) * np.pi / 4
    return np.cos(a), np.sin(a)


# ---------- track / mixing ----------
class Track:
    """Stereo accumulation buffer, optionally circular (for seamless loops)."""

    def __init__(self, sec, loop=False, tail=0.0):
        self.loop = loop
        self.n = n_of(sec)
        self.total = self.n if loop else self.n + n_of(tail)
        self.buf = np.zeros((2, self.total))

    def add(self, sig, t, gain=1.0, pan=0.0, haas_ms=0.0):
        if len(sig) == 0:
            return
        l, r = pan_gains(pan)
        start = n_of(t)
        chans = [sig * gain * l, sig * gain * r]
        if haas_ms:
            d = n_of(haas_ms / 1000)
            chans[1] = np.concatenate([np.zeros(d), chans[1]])[: len(sig)]
        for c in (0, 1):
            self._put(self.buf[c], chans[c], start)

    def _put(self, dst, src, start):
        n = len(dst)
        if self.loop:
            start %= self.n
            end = start + len(src)
            if end <= self.n:
                dst[start:end] += src
            else:
                k = self.n - start
                dst[start:self.n] += src[:k]
                rest = src[k:]
                while len(rest):
                    m = min(len(rest), self.n)
                    dst[:m] += rest[:m]
                    rest = rest[m:]
        else:
            end = min(start + len(src), n)
            if start < n:
                dst[start:end] += src[: end - start]

    def mix(self, other, gain=1.0):
        self.buf += other.buf * gain


# ---------- effects ----------
def make_ir(sec=1.3, seed=7, damp=5000.0, pre_ms=12):
    r = np.random.default_rng(seed)
    n = n_of(sec)
    t = np.arange(n) / SR
    ir = np.zeros((2, n))
    for c in (0, 1):
        x = r.standard_normal(n) * np.exp(-t / (sec / 5.5))
        x = lp(x, damp)
        x[: n_of(pre_ms / 1000)] = 0
        ir[c] = x
    ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True)) + 1e-9
    return ir


def reverb(trk: Track, wet=0.18, ir=None, lowcut=250.0):
    ir = make_ir() if ir is None else ir
    src = hp(trk.buf, lowcut, 1) if lowcut else trk.buf
    out = np.zeros_like(trk.buf)
    for c in (0, 1):
        if trk.loop:
            # circular convolution => tail wraps onto the start => seamless loop
            n = trk.n
            h = np.zeros(n)
            m = min(len(ir[c]), n)
            h[:m] = ir[c][:m]
            out[c] = np.fft.irfft(np.fft.rfft(src[c]) * np.fft.rfft(h), n)
        else:
            full = signal.fftconvolve(src[c], ir[c])[: trk.total]
            out[c] = full
    trk.buf = trk.buf + out * wet
    return trk


def stereo_delay(trk: Track, ms_l=268.0, ms_r=402.0, fb=0.28, wet=0.12, cutoff=3500.0, taps=4):
    src = trk.buf.copy()
    out = np.zeros_like(src)
    for c, ms in ((0, ms_l), (1, ms_r)):
        d = n_of(ms / 1000)
        sig = src[c]
        acc = np.zeros(trk.n if trk.loop else trk.total)
        cur = sig
        for k in range(1, taps + 1):
            cur = lp(cur, cutoff, 1) * fb
            sh = (d * k)
            if trk.loop:
                acc += np.roll(cur, sh)
            else:
                acc[sh:] += cur[: len(acc) - sh]
        out[c] = acc
    trk.buf = trk.buf + out * wet
    return trk


def bus_compress(buf, thresh_db=-16.0, ratio=3.0, attack_ms=8.0, release_ms=120.0, block=96, makeup_db=0.0):
    """Feed-forward block compressor, vectorised enough for offline use. buf: (2,N)."""
    n = buf.shape[1]
    nb = int(np.ceil(n / block))
    padded = np.pad(buf, ((0, 0), (0, nb * block - n)))
    lvl = np.sqrt((padded.reshape(2, nb, block) ** 2).mean(axis=(0, 2)) + 1e-12)
    db = 20 * np.log10(lvl)
    over = np.maximum(db - thresh_db, 0)
    gr = -over * (1 - 1 / ratio)
    a = np.exp(-block / (attack_ms * 1e-3 * SR))
    r = np.exp(-block / (release_ms * 1e-3 * SR))
    sm = np.zeros(nb)
    cur = 0.0
    for i in range(nb):
        tgt = gr[i]
        coef = a if tgt < cur else r
        cur = coef * cur + (1 - coef) * tgt
        sm[i] = cur
    g = 10 ** ((sm + makeup_db) / 20)
    gfull = np.repeat(g, block)[:n]
    return buf * gfull


def to_stereo_wide(mono, width_ms=14):
    d = n_of(width_ms / 1000)
    r = np.concatenate([np.zeros(d), mono])[: len(mono)]
    return np.stack([mono, r])


def peak_db(x):
    return 20 * np.log10(np.max(np.abs(x)) + 1e-12)


def fade_edges(buf, in_ms=2, out_ms=8):
    n = buf.shape[-1]
    a, b = n_of(in_ms / 1000), n_of(out_ms / 1000)
    if buf.ndim == 1:
        buf[:a] *= np.linspace(0, 1, a)
        buf[n - b:] *= np.linspace(1, 0, b)
    else:
        buf[:, :a] *= np.linspace(0, 1, a)
        buf[:, n - b:] *= np.linspace(1, 0, b)
    return buf


def peq(x, f0, gain_db, q=1.0):
    """RBJ peaking EQ; x is (N,) or (2,N)."""
    A = 10 ** (gain_db / 40)
    w0 = 2 * np.pi * f0 / SR
    alpha = np.sin(w0) / (2 * q)
    b = [1 + alpha * A, -2 * np.cos(w0), 1 - alpha * A]
    a = [1 + alpha / A, -2 * np.cos(w0), 1 - alpha / A]
    return signal.lfilter(np.array(b) / a[0], np.array(a) / a[0], x, axis=-1)
