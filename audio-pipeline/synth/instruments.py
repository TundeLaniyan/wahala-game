"""Synthesised instruments (mono output). All original, math-generated."""
import numpy as np
from scipy import signal
from dsp import *


def kick(sec=0.42, f0=130.0, f1=44.0, punch=1.0, seed=1):
    t = tvec(sec)
    f = f1 + (f0 - f1) * np.exp(-t / 0.028)
    body = np.sin(phase_from_freq(f)) * np.exp(-t / 0.20)
    click = hp(noise(sec, seed), 2500) * np.exp(-t / 0.004) * 0.35 * punch
    return softclip(body * 1.25 + click, 1.6) * 0.95


def sub_bass(freq, sec, vel=1.0, grit=0.55):
    """Round sub + saturated upper harmonics so phone speakers still hear the line."""
    t = tvec(sec)
    e = env_adsr(sec, a=0.006, d=0.09, s=0.75, r=min(0.06, sec * 0.4))
    s = np.sin(2 * np.pi * freq * t)
    s2 = np.sin(4 * np.pi * freq * t + 0.6) * 0.45
    sw = lp(saw(freq, sec), 700) * 0.35
    x = softclip((s + s2 + sw * grit) * 1.4, 1.8)
    return x * e * vel * 0.8


def clap(sec=0.26, seed=2, vel=1.0):
    n = noise(sec, seed)
    t = tvec(sec)
    bursts = np.zeros_like(t)
    for off in (0.0, 0.011, 0.023):
        k = n_of(off)
        bursts[k:] += np.exp(-(t[: len(t) - k]) / 0.006)
    tail = np.exp(-t / 0.07) * 0.5
    x = bp(n, 900, 3200) * (bursts + tail)
    return softclip(x * 2.2, 1.2) * 0.55 * vel


def rim(vel=1.0, sec=0.1):
    t = tvec(sec)
    x = (np.sin(2 * np.pi * 1750 * t) + np.sin(2 * np.pi * 480 * t) * 0.6) * np.exp(-t / 0.012)
    x += hp(noise(sec, 3), 3000) * np.exp(-t / 0.006) * 0.4
    return x * 0.45 * vel


def hat(sec=0.07, vel=1.0, seed=4, open_=False):
    sec = 0.32 if open_ else sec
    t = tvec(sec)
    # metallic: ring-modulated square partials
    base = 320.0
    m = sum(square(base * r, sec) for r in (1.0, 1.4471, 1.7409, 1.9307, 2.5377, 2.7616))
    x = hp(m * 0.2 + noise(sec, seed) * 0.8, 7200) * np.exp(-t / (0.09 if open_ else 0.017))
    return x * 0.30 * vel


def shaker(vel=1.0, sec=0.09, seed=5, swell=True):
    t = tvec(sec)
    n = bp(noise(sec, seed), 4800, 11000)
    e = (1 - np.exp(-t / 0.006)) * np.exp(-t / 0.032) if swell else np.exp(-t / 0.03)
    return n * e * 0.55 * vel


def conga(freq=290.0, sec=0.22, slap=False, vel=1.0, seed=6):
    t = tvec(sec)
    f = freq * (1 + 0.35 * np.exp(-t / 0.012))
    x = np.sin(phase_from_freq(f)) * np.exp(-t / (0.05 if slap else 0.09))
    x += np.sin(phase_from_freq(f * 1.5)) * 0.18 * np.exp(-t / 0.04)
    x += bp(noise(sec, seed), 1500, 5200) * np.exp(-t / 0.012) * (0.55 if slap else 0.18)
    return softclip(x, 1.3) * 0.7 * vel


def talking_drum(f_start, f_end, sec=0.4, vel=1.0, bend=0.12):
    """Gangan-style pitch-bending hourglass drum (original synthesis of the idea)."""
    t = tvec(sec)
    g = np.clip(t / bend, 0, 1)
    g = 1 - (1 - g) ** 2
    f = f_start + (f_end - f_start) * g
    ph = phase_from_freq(f)
    x = np.sin(ph) + 0.35 * np.sin(2 * ph + 0.5) * np.exp(-t / 0.08) + 0.12 * np.sin(3.1 * ph)
    x *= np.exp(-t / (sec * 0.35))
    x += bp(noise(sec, 8), 800, 3000) * np.exp(-t / 0.01) * 0.3
    return softclip(x * 1.2, 1.2) * 0.65 * vel


def agogo(freq, sec=0.28, vel=1.0):
    """Two-tone agogo-style metal bell (inharmonic partials)."""
    t = tvec(sec)
    parts = [(1.0, 1.0, 0.11), (2.76, 0.55, 0.07), (5.40, 0.28, 0.04), (8.93, 0.14, 0.025)]
    x = sum(a * np.sin(2 * np.pi * freq * r * t) * np.exp(-t / d) for r, a, d in parts)
    x += hp(noise(sec, 9), 4000) * np.exp(-t / 0.004) * 0.25
    return x * 0.38 * vel


def pluck(freq, sec=0.6, vel=1.0, bright=0.55, seed=11):
    """Palm-wine/highlife-guitar flavoured Karplus-Strong pluck."""
    N = max(int(SR / freq), 4)
    n = n_of(sec)
    exc = np.zeros(n)
    r = np.random.default_rng(seed).standard_normal(N)
    r = lp(r, 2000 + 6000 * bright, 1)
    exc[:N] = r
    a = np.zeros(N + 2)
    a[0] = 1.0
    damp = 0.9965 - 0.002 * (1 - bright)
    a[N] = -damp / 2
    a[N + 1] = -damp / 2
    y = signal.lfilter([1.0], a, exc)
    y /= (np.max(np.abs(y)) + 1e-9)
    y *= env_adsr(sec, a=0.001, d=0.05, s=1.0, r=min(0.08, sec / 2))
    return y * 0.8 * vel


def horn_lead(freq, sec, vel=1.0, glide_from=None, vib=0.006, bright=2800.0):
    """Synth-brass/horn lead used for the WAHALA! hook (detuned saws, filter swell)."""
    t = tvec(sec)
    if glide_from:
        g = np.clip(t / 0.05, 0, 1)
        fr = glide_from + (freq - glide_from) * g
    else:
        fr = freq * np.ones_like(t)
    vibr = 1 + vib * np.clip(t / 0.18, 0, 1) * np.sin(2 * np.pi * 5.6 * t)
    fr = fr * vibr
    x = (saw_poly(fr) + 0.8 * saw_poly(fr * 2 ** (9 / 1200)) + 0.8 * saw_poly(fr * 2 ** (-9 / 1200))) / 2.6
    x = sweep_lp(x, bright * 0.35, bright, blocks=24)
    e = env_adsr(sec, a=0.012, d=0.09, s=0.8, r=min(0.07, sec / 2))
    return x * e * 0.8 * vel


def brass_stab(freqs, sec=0.22, vel=1.0, bright=3600.0):
    out = np.zeros(n_of(sec))
    for f in freqs:
        x = (saw_poly(f * np.ones(n_of(sec))) + 0.7 * saw_poly(f * 1.006 * np.ones(n_of(sec)))) / 1.7
        out += x
    out = sweep_lp(out / max(len(freqs), 1), bright * 0.25, bright, blocks=16)
    out *= env_adsr(sec, a=0.008, d=0.07, s=0.55, r=0.07)
    return softclip(out * 1.4, 1.3) * 0.75 * vel


def pad(freqs, sec, vel=1.0):
    out = np.zeros(n_of(sec))
    for f in freqs:
        for dc in (-8, 8):
            out += saw(f, sec, detune_cents=dc, vib=0.0015, vib_hz=0.3 + (f % 7) / 20)
    out = lp(out / (len(freqs) * 2), 1800)
    out *= env_adsr(sec, a=min(0.6, sec / 3), d=0.2, s=0.8, r=min(0.9, sec / 3))
    return out * 0.5 * vel


def riser(sec, f0=300.0, f1=6000.0, seed=12, tone=True):
    n = noise(sec, seed)
    t = tvec(sec)
    x = np.zeros_like(n)
    blocks = 40
    edges = np.linspace(0, len(n), blocks + 1).astype(int)
    fcs = np.geomspace(f0, f1, blocks)
    for i in range(blocks):
        seg = bp(n[edges[i]:edges[i + 1]] if False else n, fcs[i] * 0.8, fcs[i] * 1.25, 1)[edges[i]:edges[i + 1]]
        x[edges[i]:edges[i + 1]] = seg
    x *= (t / sec) ** 2
    if tone:
        f = f0 * 0.5 * (f1 / f0) ** (t / sec * 0.75)
        x += np.sin(phase_from_freq(f)) * (t / sec) ** 2 * 0.15
    return x * 0.9


def reverse_hit(sec=1.2, seed=13):
    n = bp(noise(sec, seed), 400, 7000)
    t = tvec(sec)
    return n * (t / sec) ** 3 * 0.6


def impact(sec=1.5, vel=1.0):
    """Big cinematic boom: sub drop + noise burst + low rumble tail."""
    t = tvec(sec)
    f = 38 + 90 * np.exp(-t / 0.05)
    sub = np.sin(phase_from_freq(f)) * np.exp(-t / 0.55)
    burst = lp(noise(sec, 14), 3000) * np.exp(-t / 0.09)
    rumble = lp(noise(sec, 15), 220) * np.exp(-t / 0.4) * 1.2
    return softclip((sub * 1.2 + burst * 0.7 + rumble) * 1.2, 1.4) * 0.85 * vel


def generator_sputter(sec=1.4, seed=16, accel=True):
    """Pull-start generator: bursts that accelerate then catch (brand sound motif)."""
    n = n_of(sec)
    out = np.zeros(n)
    t = 0.0
    gap = 0.17
    k = 0
    while t < sec * 0.92:
        burst = (np.sin(2 * np.pi * (70 + 12 * (k % 3)) * tvec(0.07)) * 0.8
                 + lp(noise(0.07, seed + k), 900) * 0.8) * np.exp(-tvec(0.07) / 0.02)
        s = n_of(t)
        out[s:s + len(burst)] += burst[: max(0, min(len(burst), n - s))]
        t += gap
        gap = max(gap * (0.84 if accel else 1.0), 0.045)
        k += 1
    return softclip(out * 1.6, 1.3) * 0.7
