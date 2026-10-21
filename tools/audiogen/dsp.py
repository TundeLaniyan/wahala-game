"""Small numpy/scipy DSP toolkit shared by the music and ambience generators.

Everything here is deterministic (seeded generators only) so re-running a build script reproduces
the committed audio files bit-for-bit on the same library versions.

    pip install numpy scipy
"""
from __future__ import annotations

from fractions import Fraction

import numpy as np
from scipy import signal

SR = 44100


def rng(seed: int) -> np.random.Generator:
    return np.random.default_rng(seed)


# ---------------------------------------------------------------- envelopes / helpers
def secs(n: float) -> int:
    return int(round(n * SR))


def exp_env(n: int, tau: float, attack: float = 0.002) -> np.ndarray:
    """Fast linear attack, then exponential decay with time constant `tau` seconds."""
    t = np.arange(n) / SR
    e = np.exp(-t / max(tau, 1e-4))
    a = max(1, int(attack * SR))
    e[:a] *= np.linspace(0.0, 1.0, a)
    return e


def adsr(n: int, a: float, d: float, s: float, r: float) -> np.ndarray:
    """Piecewise-exponential ADSR over `n` samples (release occupies the last `r` seconds)."""
    t = np.arange(n) / SR
    na = max(1, int(a * SR))
    env = np.where(t < a, t / max(a, 1e-4), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-4)))
    nr = min(n, max(1, int(r * SR)))
    env[-nr:] *= np.linspace(1.0, 0.0, nr) ** 1.5
    env[:na] *= np.linspace(0, 1, na) if na < 2 else 1
    return env


def midi_hz(m: float) -> float:
    return 440.0 * 2.0 ** ((m - 69) / 12.0)


def db(x: float) -> float:
    return 10.0 ** (x / 20.0)


# ---------------------------------------------------------------- filters
def _sos(kind: str, fc, order: int = 2, fs: int = SR):
    return signal.butter(order, fc, btype=kind, fs=fs, output="sos")


def lowpass(x, fc, order=2):
    return signal.sosfilt(_sos("lowpass", min(fc, SR * 0.49), order), x, axis=0)


def highpass(x, fc, order=2):
    return signal.sosfilt(_sos("highpass", fc, order), x, axis=0)


def bandpass(x, lo, hi, order=2):
    return signal.sosfilt(_sos("bandpass", [lo, min(hi, SR * 0.49)], order), x, axis=0)


def peaking(x, fc, gain_db, q=1.0):
    """RBJ peaking EQ."""
    a_ = 10 ** (gain_db / 40)
    w0 = 2 * np.pi * fc / SR
    alpha = np.sin(w0) / (2 * q)
    b = [1 + alpha * a_, -2 * np.cos(w0), 1 - alpha * a_]
    a = [1 + alpha / a_, -2 * np.cos(w0), 1 - alpha / a_]
    return signal.lfilter(np.array(b) / a[0], np.array(a) / a[0], x, axis=0)


def shelf_high(x, fc, gain_db):
    a_ = 10 ** (gain_db / 40)
    w0 = 2 * np.pi * fc / SR
    cw, sw = np.cos(w0), np.sin(w0)
    alpha = sw / 2 * np.sqrt(2)
    b = [
        a_ * ((a_ + 1) + (a_ - 1) * cw + 2 * np.sqrt(a_) * alpha),
        -2 * a_ * ((a_ - 1) + (a_ + 1) * cw),
        a_ * ((a_ + 1) + (a_ - 1) * cw - 2 * np.sqrt(a_) * alpha),
    ]
    a = [
        (a_ + 1) - (a_ - 1) * cw + 2 * np.sqrt(a_) * alpha,
        2 * ((a_ - 1) - (a_ + 1) * cw),
        (a_ + 1) - (a_ - 1) * cw - 2 * np.sqrt(a_) * alpha,
    ]
    return signal.lfilter(np.array(b) / a[0], np.array(a) / a[0], x, axis=0)


def softclip(x, drive=1.0):
    return np.tanh(x * drive) / np.tanh(drive)


def pitch_ratio_resample(y: np.ndarray, ratio: float) -> np.ndarray:
    """Plays `y` back `ratio` times faster (raises pitch by `ratio`)."""
    f = Fraction(ratio).limit_denominator(4000)
    return signal.resample_poly(y, f.denominator, f.numerator)


# ---------------------------------------------------------------- stereo / mixing
def pan_gains(pan: float) -> tuple[float, float]:
    """Equal-power pan, pan in -1..1."""
    a = (pan + 1) * np.pi / 4
    return float(np.cos(a)), float(np.sin(a))


class Mix:
    """A stereo bed of fixed length. Notes that run past the end wrap round to the start, which is
    what makes the rendered music loop seamlessly (the tail of the last bar sounds under bar 1)."""

    def __init__(self, n: int):
        self.n = n
        self.buf = np.zeros((n, 2))

    def add(self, x: np.ndarray, start: int, pan: float = 0.0, gain: float = 1.0) -> None:
        if x.ndim == 1:
            l, r = pan_gains(pan)
            x = np.stack([x * l, x * r], axis=1)
        x = x * gain
        start %= self.n
        end = start + len(x)
        if end <= self.n:
            self.buf[start:end] += x
        else:
            first = self.n - start
            self.buf[start:] += x[:first]
            rest = x[first:]
            while len(rest) > 0:  # a tail longer than the whole loop (not expected) keeps wrapping
                m = min(len(rest), self.n)
                self.buf[:m] += rest[:m]
                rest = rest[m:]


def circ_convolve(x: np.ndarray, ir: np.ndarray) -> np.ndarray:
    """Circular convolution (stereo x stereo ir), so reverb tails wrap and the loop stays seamless."""
    n = len(x)
    if len(ir) > n:
        ir = ir[:n]
    out = np.zeros_like(x)
    for ch in range(2):
        fx = np.fft.rfft(x[:, ch])
        fi = np.fft.rfft(ir[:, ch], n)
        out[:, ch] = np.fft.irfft(fx * fi, n)
    return out


def make_reverb_ir(length_s=1.8, rt60=1.4, predelay=0.012, dark=4800, seed=7, early=True) -> np.ndarray:
    """Synthetic stereo plate/room IR: decorrelated exponentially decaying noise that darkens with time."""
    r = rng(seed)
    n = secs(length_s)
    t = np.arange(n) / SR
    ir = np.zeros((n, 2))
    for ch in range(2):
        noise = r.standard_normal(n)
        env = np.exp(-6.9078 * t / rt60)
        bright = lowpass(noise, dark, 1) * env
        dull = lowpass(noise, dark / 3, 2) * env
        mixr = np.clip(t / (rt60 * 0.7), 0, 1)
        ir[:, ch] = bright * (1 - mixr) + dull * mixr
        if early:
            for k in range(7):
                d = secs(predelay + 0.004 * k + 0.003 * r.random() + 0.002 * ch)
                if d < n:
                    ir[d, ch] += (0.7 ** k) * (1 if r.random() > 0.5 else -1) * 0.6
    pre = secs(predelay)
    ir = np.concatenate([np.zeros((pre, 2)), ir])[:n]
    ir /= np.sqrt(np.sum(ir**2)) + 1e-9
    return ir


def ping_delay(x: np.ndarray, time_s: float, feedback: float, taps: int = 6, cross: bool = True) -> np.ndarray:
    """Circular ping-pong delay (wraps around the loop)."""
    out = np.zeros_like(x)
    d = secs(time_s)
    cur = x.copy()
    for k in range(taps):
        cur = np.roll(cur, d, axis=0) * feedback
        if cross:
            cur = cur[:, ::-1]
        cur = lowpass(cur, 5200 - 400 * k, 1)
        out += cur
    return out


def compressor(x: np.ndarray, thresh_db=-14.0, ratio=3.0, attack=0.005, release=0.12, makeup_db=0.0) -> np.ndarray:
    """Feed-forward peak compressor (stereo-linked). Wraps the signal 3x so it is loop-safe."""
    n = len(x)
    xx = np.concatenate([x, x, x])
    lvl = np.max(np.abs(xx), axis=1)
    a_att = np.exp(-1.0 / (attack * SR))
    a_rel = np.exp(-1.0 / (release * SR))
    # envelope follower via two one-pole filters (vectorised): fast max-hold then smoothing
    hold = signal.lfilter([1 - a_att], [1, -a_att], lvl)
    env = np.maximum(hold, signal.lfilter([1 - a_rel], [1, -a_rel], lvl))
    env_db = 20 * np.log10(env + 1e-9)
    over = np.maximum(0.0, env_db - thresh_db)
    gain_db = -over * (1 - 1 / ratio) + makeup_db
    g = 10 ** (gain_db / 20)
    return (xx * g[:, None])[n : 2 * n]


def sidechain(n: int, hit_samples: list[int], depth=0.6, release=0.18) -> np.ndarray:
    """Gain curve that ducks after each hit (for pumping bass/pads under the kick). Circular."""
    g = np.ones(n)
    tail = secs(release * 5)
    t = np.arange(tail) / SR
    shape = depth * np.exp(-t / release)
    for h in hit_samples:
        idx = (h + np.arange(tail)) % n
        g[idx] = np.minimum(g[idx], 1 - shape)
    return g


def stereo_widen(x: np.ndarray, amount: float) -> np.ndarray:
    mid = (x[:, 0] + x[:, 1]) * 0.5
    side = (x[:, 0] - x[:, 1]) * 0.5 * amount
    return np.stack([mid + side, mid - side], axis=1)


def chorus(x: np.ndarray, rate=0.45, depth_ms=3.0, base_ms=14.0, mix=0.5, seed=1) -> np.ndarray:
    """Mono -> stereo chorus (two LFO-modulated taps, opposite phase)."""
    n = len(x)
    t = np.arange(n) / SR
    out = np.zeros((n, 2))
    for ch, ph in enumerate((0.0, np.pi)):
        d = (base_ms + depth_ms * np.sin(2 * np.pi * rate * t + ph + seed)) * 1e-3 * SR
        pos = np.arange(n) - d
        pos = np.clip(pos, 0, n - 1)
        i0 = pos.astype(int)
        fr = pos - i0
        i1 = np.minimum(i0 + 1, n - 1)
        out[:, ch] = x * (1 - mix) + (x[i0] * (1 - fr) + x[i1] * fr) * mix
    return out


# ---------------------------------------------------------------- output
def normalise_peak(x: np.ndarray, peak_db=-1.0) -> np.ndarray:
    return x * (db(peak_db) / (np.max(np.abs(x)) + 1e-12))


def write_wav(path: str, x: np.ndarray) -> None:
    from scipy.io import wavfile

    wavfile.write(path, SR, (np.clip(x, -1, 1) * 32767).astype(np.int16))


def measure_lufs(x: np.ndarray) -> float:
    """Integrated loudness (ITU-R BS.1770 via pyloudnorm)."""
    import pyloudnorm as pyln

    return float(pyln.Meter(SR).integrated_loudness(x if x.ndim == 2 else x[:, None]))


def to_lufs(x: np.ndarray, target: float, peak_ceiling_db: float = -1.0) -> np.ndarray:
    """Scales to `target` LUFS, then soft-limits any peaks above the ceiling (without re-scaling the body)."""
    y = x * 10 ** ((target - measure_lufs(x)) / 20)
    ceil = db(peak_ceiling_db)
    peak = np.max(np.abs(y))
    if peak > ceil:
        knee = ceil * 0.7
        a = np.abs(y)
        over = a > knee
        y = np.where(over, np.sign(y) * (knee + (ceil - knee) * np.tanh((a - knee) / (ceil - knee))), y)
    return y
