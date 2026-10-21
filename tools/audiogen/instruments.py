"""Instrument voices for the WAHALA! Afrobeats generator. Every function returns a mono float array.

All voices are built from first principles (physical-modelling plucks, FM electric piano, additive
pads, membrane/noise percussion) - no samples, no third-party material.
"""
from __future__ import annotations

import numpy as np
from scipy import signal

from dsp import (
    SR,
    bandpass,
    chorus,
    exp_env,
    highpass,
    lowpass,
    midi_hz,
    peaking,
    pitch_ratio_resample,
    rng,
    secs,
    softclip,
)

_R = rng(20240607)


# ================================================================ plucked strings
def _ks(freq: float, dur: float, s: float, g: float, pick_pos: float, bright: float, seed: int) -> np.ndarray:
    """Karplus-Strong string: noise burst into a damped delay loop, tuned by resampling."""
    period = SR / freq
    n_loop = max(4, int(round(period - s)))
    f_actual = SR / (n_loop + s)
    r = rng(seed)
    exc = r.uniform(-1, 1, n_loop)
    exc = lowpass(exc, 700 + 3800 * bright, 2)
    k = max(1, int(pick_pos * n_loop))
    exc = exc - np.roll(exc, k)  # pick-position comb
    exc -= exc.mean()
    total = int(dur * SR * f_actual / freq) + n_loop * 2
    x = np.zeros(total)
    x[:n_loop] = exc
    a = np.zeros(n_loop + 2)
    a[0] = 1.0
    a[n_loop] = -g * (1 - s)
    a[n_loop + 1] = -g * s
    y = signal.lfilter([1.0], a, x)
    y = pitch_ratio_resample(y, freq / f_actual)
    y = y[: int(dur * SR)]
    return y / (np.max(np.abs(y)) + 1e-9)


def _body(y: np.ndarray, kind: str) -> np.ndarray:
    if kind == "electric":
        y = peaking(y, 250, 3.0, 0.9)
        y = peaking(y, 1500, 1.5, 0.8)
        return lowpass(y, 5000, 2)
    if kind == "nylon":
        y = peaking(y, 110, 4.0, 1.2)
        y = peaking(y, 210, 3.0, 1.5)
        return lowpass(y, 5200, 2)
    return y


def guitar(midi: float, dur: float, vel: float = 0.8, mute: float = 0.0, kind: str = "electric", seed: int = 0) -> np.ndarray:
    """Clean highlife-style guitar note. `mute` 0..1 palm-mutes it (short, thuddy)."""
    f = midi_hz(midi)
    g = 0.9985 - 0.03 * mute
    s = 0.5 - 0.12 * vel * (1 - mute)
    y = _ks(f, max(dur, 0.1) + 0.5, s, g, 0.17 + 0.05 * ((seed * 7) % 3), 0.35 + 0.6 * vel, 100 + seed)
    n = len(y)
    env = exp_env(n, (0.9 - 0.7 * mute) * (0.6 + 0.4 * vel) + 0.05, 0.001)
    rel = secs(0.12)
    cut = min(n, secs(dur))
    gate = np.ones(n)
    gate[cut:] = 0
    gate = np.convolve(gate, np.ones(rel) / rel, mode="same") if cut < n else gate
    y = y * env * gate
    y = _body(y, kind)
    if kind == "electric":
        y = softclip(y * 1.4, 1.2)
    return y * (0.35 + 0.65 * vel)


def bass(midi: float, dur: float, vel: float = 0.9, glide_from: float | None = None) -> np.ndarray:
    """Warm finger/sub hybrid: sine sub + lightly saturated 2nd/3rd harmonics + short pluck transient."""
    n = secs(dur + 0.15)
    t = np.arange(n) / SR
    f0 = midi_hz(midi)
    if glide_from is not None:
        f_inst = f0 * (midi_hz(glide_from) / f0) ** np.exp(-t / 0.05)
    else:
        f_inst = np.full(n, f0)
    # slight pitch drop at the attack gives the "boom"
    f_inst = f_inst * (1 + 0.04 * np.exp(-t / 0.02))
    ph = 2 * np.pi * np.cumsum(f_inst) / SR
    body = np.sin(ph) + 0.35 * np.sin(2 * ph + 0.3) + 0.12 * np.sin(3 * ph + 0.9)
    body = softclip(body * (0.9 + 0.5 * vel), 1.6)
    amp = np.exp(-t / (dur * 0.9 + 0.15))
    atk = min(n, secs(0.004))
    amp[:atk] *= np.linspace(0, 1, atk)
    rel = secs(0.08)
    cut = secs(dur)
    gate = np.ones(n)
    gate[cut:] = 0
    gate = np.convolve(gate, np.ones(rel) / rel, mode="same")
    y = body * amp * gate
    # finger noise
    nz = lowpass(_R.standard_normal(n), 1800, 2) * np.exp(-t / 0.012) * 0.25
    y = y + nz * gate
    return lowpass(y, 2400, 2) * (0.4 + 0.6 * vel)


# ================================================================ keys / leads / pads
def epiano(midi: float, dur: float, vel: float = 0.7) -> np.ndarray:
    """Rhodes-like FM electric piano."""
    f = midi_hz(midi)
    n = secs(dur + 1.2)
    t = np.arange(n) / SR
    idx = (0.6 + 1.6 * vel) * np.exp(-t / 0.35) + 0.25
    mod = np.sin(2 * np.pi * f * t) * idx
    car = np.sin(2 * np.pi * f * t + mod)
    tine = np.sin(2 * np.pi * f * 14 * t) * 0.35 * vel * np.exp(-t / 0.025)
    y = car + 0.18 * np.sin(2 * np.pi * f * 2 * t + mod * 0.4) * np.exp(-t / 0.5) + tine
    amp = np.exp(-t / (0.5 + 0.35 * min(dur, 2.0)))
    amp[: secs(0.003)] *= np.linspace(0, 1, secs(0.003))
    rel = secs(0.2)
    gate = np.ones(n)
    gate[secs(dur) :] = 0
    gate = np.convolve(gate, np.ones(rel) / rel, mode="same")
    trem = 1 + 0.06 * np.sin(2 * np.pi * 5.2 * t)
    return lowpass(y * amp * gate * trem, 5200, 1) * (0.3 + 0.7 * vel)


def kalimba(midi: float, dur: float = 0.6, vel: float = 0.8) -> np.ndarray:
    """Bright, short thumb-piano / marimba-like lead pluck (inharmonic partials)."""
    f = midi_hz(midi)
    n = secs(max(dur, 0.35) + 0.6)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for ratio, level, tau in ((1.0, 1.0, 0.45), (2.76, 0.32, 0.12), (5.4, 0.16, 0.06), (8.9, 0.07, 0.03)):
        y += level * np.sin(2 * np.pi * f * ratio * t + 0.2) * np.exp(-t / tau)
    click = bandpass(_R.standard_normal(n), 2500, 7000, 1) * np.exp(-t / 0.004) * 0.12
    return (y + click) * (0.35 + 0.65 * vel) * 0.7


def pad(midis: list[float], dur: float, seed: int = 0) -> np.ndarray:
    """Soft analogue-ish pad: additive saws (band-limited), slow attack, gentle detune, stereo chorus."""
    n = secs(dur + 1.0)
    t = np.arange(n) / SR
    outs = []
    for side in range(2):
        y = np.zeros(n)
        for m in midis:
            for det in (-0.12, 0.0, 0.12):
                f = midi_hz(m + det + (0.05 if side else -0.05))
                nh = int(min(24, 2600 / f))
                for h in range(1, nh + 1):
                    y += np.sin(2 * np.pi * f * h * t + h * 1.3 * side + det) / h
        outs.append(y)
    y = np.stack(outs, axis=1)
    env = np.minimum(1, t / 0.6)
    gate = np.ones(n)
    gate[secs(dur) :] = 0
    rel = secs(0.9)
    gate = np.convolve(gate, np.ones(rel) / rel, mode="same")
    y = y * (env * gate)[:, None] / (len(midis) * 3)
    return lowpass(y, 1800, 2)


def pluck_synth(midi: float, dur: float = 0.3, vel: float = 0.8) -> np.ndarray:
    """Short rounded synth pluck for counter-melodies (triangle-ish with filter snap)."""
    f = midi_hz(midi)
    n = secs(dur + 0.25)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for h in range(1, 12, 2):
        y += ((-1) ** ((h - 1) // 2)) * np.sin(2 * np.pi * f * h * t) / h**2
    cutoff = 700 + 4500 * vel * np.exp(-t / 0.06)
    # time-varying lowpass via crossfading two fixed filters
    lo, hi = lowpass(y, 900, 2), lowpass(y, 5000, 2)
    w = np.clip((cutoff - 700) / 4500, 0, 1)
    y = lo * (1 - w) + hi * w
    amp = np.exp(-t / (0.12 + dur * 0.3))
    amp[: secs(0.002)] *= np.linspace(0, 1, secs(0.002))
    return y * amp * (0.4 + 0.6 * vel)


# ================================================================ drums & percussion
def kick(vel: float = 1.0, deep: float = 1.0) -> np.ndarray:
    n = secs(0.5)
    t = np.arange(n) / SR
    f = 46 + 90 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / (0.16 * deep + 0.04))
    click = highpass(_R.standard_normal(n), 1500, 1) * np.exp(-t / 0.004) * 0.25
    return softclip((body + click) * 1.5, 1.4) * vel * 0.9


def rim(vel: float = 0.8) -> np.ndarray:
    """Cross-stick / rim click."""
    n = secs(0.18)
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * 520 * t) * np.exp(-t / 0.012) + 0.6 * np.sin(2 * np.pi * 1280 * t) * np.exp(-t / 0.006)
    y += bandpass(_R.standard_normal(n), 1800, 6000, 1) * np.exp(-t / 0.01) * 0.5
    return y * vel * 0.8


def snare(vel: float = 0.8) -> np.ndarray:
    n = secs(0.32)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * (185 + 60 * np.exp(-t / 0.02)) * t) * np.exp(-t / 0.07)
    noise = bandpass(_R.standard_normal(n), 1200, 9000, 1) * np.exp(-t / 0.085)
    return (tone * 0.6 + noise * 0.7) * vel * 0.7


def clap(vel: float = 0.8) -> np.ndarray:
    n = secs(0.35)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for off, lvl in ((0.0, 0.8), (0.011, 0.9), (0.023, 0.8), (0.038, 1.0)):
        o = secs(off)
        seg = bandpass(_R.standard_normal(n - o), 900, 3800, 1) * np.exp(-np.arange(n - o) / SR / 0.008)
        y[o:] += seg * lvl
    y += bandpass(_R.standard_normal(n), 900, 3600, 1) * np.exp(-t / 0.09) * 0.35
    return y * vel * 0.55


_HAT_FREQS = np.array([263, 400, 421, 474, 587, 845])


def hat(open_: bool = False, vel: float = 0.7) -> np.ndarray:
    n = secs(0.35 if open_ else 0.11)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for f in _HAT_FREQS * 5.0:
        y += np.sign(np.sin(2 * np.pi * f * t + f))
    y = highpass(y, 7000, 2) * 0.12 + highpass(_R.standard_normal(n), 8000, 2) * 0.25
    tau = 0.11 if open_ else 0.022
    return y * np.exp(-t / tau) * vel * 0.6


def shaker(vel: float = 0.6, long: bool = False) -> np.ndarray:
    """Seed shaker / sekere burst: band-limited noise with a soft attack ('sh-k')."""
    n = secs(0.16 if long else 0.085)
    t = np.arange(n) / SR
    y = bandpass(_R.standard_normal(n), 4800, 12000, 2)
    env = np.minimum(1.0, t / 0.012) * np.exp(-t / (0.05 if long else 0.024))
    return y * env * vel * 0.7


def conga(kind: str = "open", pitch: float = 1.0, vel: float = 0.8) -> np.ndarray:
    """Conga membrane model: damped modes with a tiny pitch drop; `slap` adds a noisy crack."""
    base = {"open": 330, "low": 235, "mute": 300, "slap": 330, "heel": 260}[kind] * pitch
    n = secs({"open": 0.42, "low": 0.5, "mute": 0.1, "slap": 0.2, "heel": 0.12}[kind])
    t = np.arange(n) / SR
    tau = {"open": 0.11, "low": 0.14, "mute": 0.022, "slap": 0.05, "heel": 0.03}[kind]
    y = np.zeros(n)
    for ratio, lvl, tt in ((1.0, 1.0, tau), (1.58, 0.45, tau * 0.6), (2.14, 0.25, tau * 0.4), (2.9, 0.12, tau * 0.3)):
        f = base * ratio * (1 + 0.06 * np.exp(-t / 0.015))
        y += lvl * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / tt)
    if kind == "slap":
        y += bandpass(_R.standard_normal(n), 1800, 6500, 1) * np.exp(-t / 0.014) * 1.2
    else:
        y += bandpass(_R.standard_normal(n), 900, 2600, 1) * np.exp(-t / 0.008) * 0.25
    return softclip(y * 0.9, 1.2) * vel * 0.8


def bongo(high: bool = True, vel: float = 0.7) -> np.ndarray:
    return conga("open", 1.55 if high else 1.25, vel) * 0.7


def agogo(high: bool = True, vel: float = 0.7) -> np.ndarray:
    """Double iron bell (agogo): two inharmonic metallic partials per bell."""
    f = 880 if high else 660
    n = secs(0.3)
    t = np.arange(n) / SR
    y = (
        np.sin(2 * np.pi * f * t)
        + 0.6 * np.sin(2 * np.pi * f * 1.504 * t)
        + 0.35 * np.sin(2 * np.pi * f * 2.76 * t)
        + 0.2 * np.sin(2 * np.pi * f * 4.1 * t)
    )
    click = highpass(_R.standard_normal(n), 3000, 1) * np.exp(-t / 0.003) * 0.4
    return (y * np.exp(-t / 0.085) * 0.5 + click) * vel * 0.55


def clave(vel: float = 0.7) -> np.ndarray:
    n = secs(0.12)
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * 2350 * t) * np.exp(-t / 0.018) + 0.3 * np.sin(2 * np.pi * 4100 * t) * np.exp(-t / 0.008)
    return y * vel * 0.55


def cowbell(vel: float = 0.6) -> np.ndarray:
    n = secs(0.25)
    t = np.arange(n) / SR
    y = np.sign(np.sin(2 * np.pi * 562 * t)) * 0.5 + np.sign(np.sin(2 * np.pi * 845 * t)) * 0.5
    y = bandpass(y, 500, 3500, 1)
    return y * np.exp(-t / 0.07) * vel * 0.35


def talking_drum(glide: list[tuple[float, float]], dur: float, vel: float = 0.8) -> np.ndarray:
    """Hourglass 'talking' drum: pitch is squeezed up and down along a piecewise-linear contour of
    (time_fraction, pitch_ratio) points over a ~190 Hz base. Rough membrane sound with a strong
    fundamental and a couple of nasal partials."""
    n = secs(dur + 0.2)
    t = np.arange(n) / SR
    xs = [g[0] * dur for g in glide]
    ys = [g[1] for g in glide]
    ratio = np.interp(t, xs, ys)
    f = 190 * ratio
    ph = 2 * np.pi * np.cumsum(f) / SR
    y = np.sin(ph) + 0.4 * np.sin(2 * ph + 0.6) + 0.2 * np.sin(3.1 * ph)
    amp = np.exp(-t / (dur * 0.6 + 0.05))
    atk = secs(0.004)
    amp[:atk] *= np.linspace(0, 1, atk)
    stick = bandpass(_R.standard_normal(n), 1200, 5000, 1) * np.exp(-t / 0.01) * 0.3
    rel = secs(0.06)
    gate = np.ones(n)
    gate[secs(dur) :] = 0
    gate = np.convolve(gate, np.ones(rel) / rel, mode="same")
    return softclip((y * amp + stick) * gate * 0.9, 1.3) * vel * 0.7


def riser(dur: float, vel: float = 0.6) -> np.ndarray:
    """Filtered-noise swell used before section changes."""
    n = secs(dur)
    t = np.arange(n) / SR
    y = _R.standard_normal(n)
    lo, hi = lowpass(y, 1500, 2), highpass(y, 2500, 2)
    w = (t / dur) ** 2
    out = lo * (1 - w) * 0.5 + hi * w
    return out * (t / dur) ** 1.5 * vel * 0.4


def crash(vel: float = 0.7) -> np.ndarray:
    n = secs(2.0)
    t = np.arange(n) / SR
    y = highpass(_R.standard_normal(n), 3500, 2)
    for f in _HAT_FREQS * 7.3:
        y += 0.05 * np.sign(np.sin(2 * np.pi * f * t))
    return y * np.exp(-t / 0.55) * vel * 0.3
